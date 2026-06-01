/**
 * POST /api/newsletter/broadcast  — send a campaign to all subscribers (ADMIN ONLY)
 *
 * Auth: Authorization: Bearer <admin access token> (must be the owner email).
 * Body: { subject, message }   (message = plain text; blank lines = paragraphs)
 * Sends via Resend in batches of 100, each with a per-recipient unsubscribe link.
 * Returns: { sent, total }
 */
const crypto = require('crypto');
const { Resend } = require('resend');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON         = process.env.SUPABASE_ANON_KEY;
const ADMIN_EMAIL  = 'support@veloxpeps.com';
const FROM         = 'Velox Peptides <orders@veloxpeps.com>';

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function unsubToken(email) {
  var sig = crypto.createHmac('sha256', SERVICE).update(email.toLowerCase()).digest('hex').slice(0, 32);
  return Buffer.from(email.toLowerCase()).toString('base64url') + '.' + sig;
}
// Plain-text message → safe HTML paragraphs
function bodyToHtml(message) {
  return String(message || '').trim().split(/\n{2,}/).map(function (para) {
    return '<p style="font-size:14px;color:#9CA3AF;line-height:1.65;margin:0 0 16px">' +
      esc(para).replace(/\n/g, '<br>') + '</p>';
  }).join('');
}
function wrap(bodyHtml, email) {
  var base = 'https://veloxpeps.com';
  var unsub = base + '/api/newsletter/unsubscribe?token=' + encodeURIComponent(unsubToken(email));
  return '<div style="margin:0;padding:0;background:#030407;font-family:Arial,Helvetica,sans-serif">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#030407"><tr><td style="padding:32px 16px">' +
    '<table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#0d1117;border:1px solid rgba(1,211,160,.2);border-radius:12px;overflow:hidden">' +
      '<tr><td style="background:#01D3A0;height:4px;font-size:0;line-height:0">&nbsp;</td></tr>' +
      '<tr><td style="padding:30px 32px 8px"><div style="font-size:20px;font-weight:800;color:#fff;letter-spacing:.04em">VELOX PEPTIDES</div>' +
        '<div style="font-size:11px;color:#01D3A0;letter-spacing:.14em;text-transform:uppercase;margin-top:4px">Research Bulletin</div></td></tr>' +
      '<tr><td style="padding:16px 32px 8px">' + bodyHtml + '</td></tr>' +
      '<tr><td style="padding:8px 32px 28px"><a href="' + base + '/research/" style="display:inline-block;background:#01D3A0;color:#021;text-decoration:none;font-weight:700;font-size:14px;padding:12px 26px;border-radius:8px">Read the research library</a></td></tr>' +
      '<tr><td style="border-top:1px solid #1a1a1a;padding:18px 32px">' +
        '<p style="font-size:11px;color:#6B7280;line-height:1.6;margin:0">Velox Peptides &middot; CRP Labs Ltd, Northern Ireland. For research use only. Not for human or veterinary consumption. ' +
        'You receive this because you subscribed at veloxpeps.com. <a href="' + unsub + '" style="color:#6B7280;text-decoration:underline">Unsubscribe</a>.</p></td></tr>' +
    '</table></td></tr></table></div>';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'Email service not configured' });

  // ── Admin auth ──────────────────────────────────────────────────────────
  var token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Not signed in' });
  var ures = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { Authorization: 'Bearer ' + token, apikey: ANON || SERVICE } });
  if (!ures.ok) return res.status(401).json({ error: 'Invalid session' });
  var user = await ures.json();
  if (!user || (user.email || '').toLowerCase() !== ADMIN_EMAIL) return res.status(403).json({ error: 'Admin only' });

  var subject = ((req.body || {}).subject || '').toString().trim();
  var message = ((req.body || {}).message || '').toString().trim();
  if (!subject || !message) return res.status(400).json({ error: 'Subject and message are required' });

  try {
    // ── Recipients: subscribers not unsubscribed ────────────────────────────
    var r = await fetch(SUPABASE_URL + '/rest/v1/subscribers?unsubscribed_at=is.null&select=email', {
      headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE } });
    var rows = await r.json();
    var emails = Array.from(new Set((rows || []).map(function (x) { return (x.email || '').toLowerCase().trim(); }).filter(Boolean)));
    if (!emails.length) return res.status(200).json({ sent: 0, total: 0, message: 'No subscribers to send to.' });

    var bodyHtml = bodyToHtml(message);
    var resend = new Resend(process.env.RESEND_API_KEY);
    var sent = 0;

    // Send in batches of 100 (Resend batch limit)
    for (var i = 0; i < emails.length; i += 100) {
      var chunk = emails.slice(i, i + 100).map(function (email) {
        var unsub = 'https://veloxpeps.com/api/newsletter/unsubscribe?token=' + encodeURIComponent(unsubToken(email));
        return {
          from: FROM, to: email, replyTo: 'support@veloxpeps.com', subject: subject,
          html: wrap(bodyHtml, email),
          text: (req.body.message || '').toString().trim() + '\n\n— Velox Peptides\nFor research use only. Not for human or veterinary consumption.\nUnsubscribe: ' + unsub,
          headers: {
            'List-Unsubscribe': '<' + unsub + '>',
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        };
      });
      try {
        var resp = await resend.batch.send(chunk);
        if (!resp.error) sent += chunk.length;
        else console.error('[broadcast] batch error:', resp.error);
      } catch (e) { console.error('[broadcast] batch threw:', e.message); }
    }

    return res.status(200).json({ sent: sent, total: emails.length });
  } catch (e) {
    console.error('[broadcast]', e.message);
    return res.status(500).json({ error: 'Send failed' });
  }
};
