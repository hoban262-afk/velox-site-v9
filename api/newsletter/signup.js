/**
 * POST /api/newsletter/signup  — issue (or return) a unique 20%-off welcome code
 *
 * Body: { email }
 * - Validates email, IP rate-limits (20 new signups/IP/hour).
 * - If the email already has a code, returns it (no second code, no re-send).
 * - Otherwise generates VELOX-XXXXXX, stores it (30-day expiry), emails it via Resend.
 * Returns: { success, already, codeHint }
 */
const crypto = require('crypto');
const { Resend } = require('resend');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FROM         = 'Velox Peptides <orders@veloxpeps.com>';
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
  return '' +
  '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><style>:root{color-scheme:dark;supported-color-schemes:dark}</style></head><body style="margin:0;padding:0">' +
  '<div style="margin:0;padding:0;background:#030407;font-family:Arial,Helvetica,sans-serif">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#030407"><tr><td style="padding:32px 16px">' +
    '<table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#0d1117;border:1px solid rgba(1,211,160,.2);border-radius:12px;overflow:hidden">' +
      '<tr><td style="background:#01D3A0;height:4px;font-size:0;line-height:0">&nbsp;</td></tr>' +
      '<tr><td style="padding:32px 32px 8px">' +
        '<div style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:.04em">VELOX PEPTIDES</div>' +
        '<div style="font-size:11px;color:#01D3A0;letter-spacing:.14em;text-transform:uppercase;margin-top:4px">Research Community</div>' +
      '</td></tr>' +
      '<tr><td style="padding:16px 32px 0">' +
        '<h1 style="font-size:22px;color:#ffffff;margin:0 0 10px">Welcome to the Velox research community.</h1>' +
        '<p style="font-size:14px;color:#9CA3AF;line-height:1.6;margin:0 0 24px">Here is your one-time discount code for <strong style="color:#fff">20% off your first order</strong>.</p>' +
      '</td></tr>' +
      '<tr><td style="padding:0 32px">' +
        '<div style="background:#030407;border:1px solid rgba(1,211,160,.35);border-radius:10px;padding:22px;text-align:center">' +
          '<div style="font-size:11px;color:#6B7280;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px">YOUR CODE</div>' +
          '<div style="font-family:\'Courier New\',monospace;font-size:30px;font-weight:700;color:#01D3A0;letter-spacing:.08em">' + code + '</div>' +
        '</div>' +
        '<p style="font-size:14px;color:#9CA3AF;line-height:1.6;margin:20px 0 4px">Apply it at checkout for 20% off your first order.</p>' +
        '<p style="font-size:13px;color:#6B7280;margin:0 0 24px">Valid for 30 days.</p>' +
      '</td></tr>' +
      '<tr><td style="padding:0 32px 28px"><a href="' + base + '/compounds/" style="display:inline-block;background:#01D3A0;color:#021;text-decoration:none;font-weight:700;font-size:14px;padding:13px 28px;border-radius:8px">Shop now</a></td></tr>' +
      '<tr><td style="border-top:1px solid #1a1a1a;padding:20px 32px">' +
        '<p style="font-size:11px;color:#6B7280;line-height:1.6;margin:0">For research use only. Not for human or veterinary consumption. ' +
        'You are receiving this because you subscribed at veloxpeps.com. ' +
        '<a href="' + unsub + '" style="color:#6B7280;text-decoration:underline">Unsubscribe</a>.</p>' +
      '</td></tr>' +
    '</table></td></tr></table>' +
  '</div>' +
  '</body></html>';
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
        message: "You're already on the list — check your inbox for your code." });
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

    // Add to the general subscriber list too (ignore duplicates)
    sb('subscribers', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({ email: email, source: 'popup' }) }).catch(function () {});

    // ── Send the welcome email ──────────────────────────────────────────────
    if (process.env.RESEND_API_KEY) {
      try {
        var resend = new Resend(process.env.RESEND_API_KEY);
        var unsub = 'https://veloxpeps.com/api/newsletter/unsubscribe?token=' + encodeURIComponent(unsubToken(email));
        await resend.emails.send({
          from: FROM, to: email,
          replyTo: 'support@veloxpeps.com',
          subject: 'Your 20% off code is inside — Velox Peptides',
          html: welcomeEmailHtml(code, email),
          // Plain-text alternative improves inbox placement (HTML-only scores worse)
          text: 'Welcome to the Velox research community.\n\n' +
                'Your one-time discount code for 20% off your first order:\n\n' +
                '    ' + code + '\n\n' +
                'Apply it at checkout. Valid for 30 days.\n\n' +
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

    return res.status(200).json({ success: true, already: false, codeHint: 'VELOX-',
      message: 'Code sent to your inbox' });
  } catch (e) {
    console.error('[newsletter/signup]', e.message);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
