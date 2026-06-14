/**
 * POST /api/newsletter/signup  — issue (or return) a unique 10%-off welcome code + handbook
 *
 * Body: { email }
 * - Validates email, IP rate-limits (20 new signups/IP/hour).
 * - If the email already has a code, returns it (no second code, no re-send).
 * - Otherwise generates VELOX-XXXXXX, stores it (30-day expiry), emails it via Resend.
 * Returns: { success, already, codeHint }
 */
const crypto = require('crypto');
const { Resend } = require('resend');
const { sendWhatsApp } = require('../../lib/notify-whatsapp');
const { renderEmail, emailParagraph, emailCodeBox } = require('../../lib/email-layout');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FROM         = 'Velox Peptides <newsletter@veloxpeps.com>';
const ALPHABET     = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I

function genCode() {
  var s = '';
  var bytes = crypto.randomBytes(6);
  for (var i = 0; i < 6; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return 'VELOX-' + s;
}

function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

function unsubToken(email) {
  var sig = crypto.createHmac('sha256', SERVICE).update(email.toLowerCase()).digest('hex').slice(0, 32);
  return Buffer.from(email.toLowerCase()).toString('base64url') + '.' + sig;
}

function sb(path, opts) {
  opts = opts || {};
  return fetch(SUPABASE_URL + '/rest/v1/' + path, Object.assign({}, opts, {
    headers: Object.assign({
      apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json',
    }, opts.headers || {}),
  }));
}

function welcomeEmailHtml(code, email) {
  var base = 'https://veloxpeps.com';
  var unsub = base + '/api/newsletter/unsubscribe?token=' + encodeURIComponent(unsubToken(email));
  var body =
    emailParagraph('Your free <strong style="color:#fff">Researcher&rsquo;s Handbook</strong> is below, along with a one-time code for <strong style="color:#fff">10% off your first order</strong>.') +
    emailCodeBox(code, 'Apply it at checkout for 10% off your first order. Valid for 30 days.') +
    '<div style="background:#030407;border:1px solid #1a1a1a;border-radius:10px;padding:18px 20px;margin:0 0 8px">' +
      '<div style="font-size:13px;font-weight:700;color:#ffffff;margin-bottom:4px">Your free Researcher&rsquo;s Handbook</div>' +
      '<div style="font-size:13px;color:#9CA3AF;line-height:1.6;margin-bottom:14px">A practical PDF reference: reconstitution, storage &amp; handling, and how to read a Certificate of Analysis.</div>' +
      '<a href="' + base + '/assets/velox-researchers-handbook.pdf" style="display:inline-block;background:transparent;color:#01D3A0;border:1px solid rgba(1,211,160,.5);text-decoration:none;font-weight:700;font-size:13px;padding:10px 20px;border-radius:8px">Download the handbook (PDF)</a>' +
    '</div>';
  return renderEmail({
    kicker: 'Research Community',
    heading: 'Welcome to the Velox research community',
    bodyHtml: body,
    cta: { href: base + '/compounds/', label: 'SHOP NOW →' },
    unsubscribeUrl: unsub,
    preheader: 'Your 10% welcome code + free Researcher’s Handbook inside.',
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Newsletter not configured' });

  var email = ((req.body || {}).email || '').toString().trim().toLowerCase();
  if (!validEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });

  var ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';

  try {
    // ── IP rate limit: max 20 new signups per IP per hour ──────────────────
    var sinceISO = new Date(Date.now() - 3600 * 1000).toISOString();
    var ipRes = await sb('newsletter_codes?ip=eq.' + encodeURIComponent(ip) +
      '&issued_at=gte.' + encodeURIComponent(sinceISO) + '&select=id', { headers: { Prefer: 'count=exact' } });
    var ipCount = parseInt((ipRes.headers.get('content-range') || '0-0/0').split('/')[1], 10) || 0;
    if (ipCount >= 20) return res.status(429).json({ error: 'Too many signups from this network. Please try later.' });

    // ── Already subscribed? return existing code, do not re-send ────────────
    var exRes = await sb('newsletter_codes?email=eq.' + encodeURIComponent(email) + '&select=code,unsubscribed_at');
    var existing = await exRes.json();
    if (Array.isArray(existing) && existing.length) {
      return res.status(200).json({ success: true, already: true, codeHint: 'VELOX-',
        message: "You're already on the list. Check your inbox for your code." });
    }

    // ── Generate a unique code (retry once on the rare collision) ───────────
    var code = genCode();
    var ins = await sb('newsletter_codes', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ email: email, code: code, ip: ip }),
    });
    if (ins.status === 409) { // unique conflict (email or code)
      code = genCode();
      ins = await sb('newsletter_codes', { method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ email: email, code: code, ip: ip }) });
    }
    if (!ins.ok) {
      var insErr = await ins.text().catch(function () { return ''; });
      // If email already existed (race), fetch + return it
      var re = await sb('newsletter_codes?email=eq.' + encodeURIComponent(email) + '&select=code');
      var rows = await re.json().catch(function () { return null; });
      if (Array.isArray(rows) && rows.length) return res.status(200).json({ success: true, already: true, codeHint: 'VELOX-', message: "You're already on the list." });
      console.error('[newsletter/signup] insert failed', ins.status, insErr);
      return res.status(500).json({ error: 'Could not create your code. Please try again.' });
    }

    // Add to the general subscriber list too (ignore duplicates). welcome_stage=1
    // marks that the stage-1 (code + handbook) email below has been sent, so the
    // welcome-run worker continues from stage 2.
    sb('subscribers', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({ email: email, source: 'popup', welcome_stage: 1, welcome_last_at: new Date().toISOString() }) }).catch(function () {});

    // ── Send the welcome email ──────────────────────────────────────────────
    if (process.env.RESEND_API_KEY) {
      try {
        var resend = new Resend(process.env.RESEND_API_KEY);
        var unsub = 'https://veloxpeps.com/api/newsletter/unsubscribe?token=' + encodeURIComponent(unsubToken(email));
        await resend.emails.send({
          from: FROM, to: email,
          replyTo: 'support@veloxpeps.com',
          subject: 'Your handbook + 10% off code from Velox Peptides',
          html: welcomeEmailHtml(code, email),
          // Plain-text alternative improves inbox placement (HTML-only scores worse)
          text: 'Welcome to the Velox research community.\n\n' +
                'Your one-time discount code for 10% off your first order:\n\n' +
                '    ' + code + '\n\n' +
                'Apply it at checkout. Valid for 30 days.\n\n' +
                'Download your free Researcher\'s Handbook (PDF):\n' +
                'https://veloxpeps.com/assets/velox-researchers-handbook.pdf\n\n' +
                'Shop: https://veloxpeps.com/compounds/\n\n' +
                'For research use only. Not for human or veterinary consumption.\n' +
                'Unsubscribe: ' + unsub,
          // List-Unsubscribe header — required by Gmail/Apple for good placement
          headers: {
            'List-Unsubscribe': '<' + unsub + '>',
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        });
      } catch (e) { console.error('[newsletter/signup] email send failed:', e.message); }
    }

    // WhatsApp alert to the team (owner + Luke) — best-effort.
    try { await sendWhatsApp(`✉️ Newsletter signup\n${email}`); }
    catch (e) { console.error('[newsletter/signup] whatsapp failed:', e.message); }

    return res.status(200).json({ success: true, already: false, codeHint: 'VELOX-',
      message: 'Code sent to your inbox' });
  } catch (e) {
    console.error('[newsletter/signup]', e.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
