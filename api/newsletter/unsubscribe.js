/**
 * GET/POST /api/newsletter/unsubscribe?token=<base64url(email)>.<hmac>
 *
 * Verifies the HMAC token (signed with the service-role key), then marks the
 * subscriber unsubscribed. Renders a small confirmation page.
 */
const crypto = require('crypto');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;

function verify(token) {
  try {
    var parts = (token || '').split('.');
    if (parts.length !== 2) return null;
    var email = Buffer.from(parts[0], 'base64url').toString('utf-8').toLowerCase();
    var expected = crypto.createHmac('sha256', SERVICE).update(email).digest('hex').slice(0, 32);
    if (expected !== parts[1]) return null;
    return email;
  } catch (e) { return null; }
}

function page(msg) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Unsubscribe — Velox Peptides</title></head>' +
    '<body style="margin:0;background:#030407;color:#9CA3AF;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">' +
    '<div style="max-width:420px;text-align:center;padding:40px">' +
    '<div style="font-size:18px;font-weight:800;color:#fff;letter-spacing:.04em;margin-bottom:16px">VELOX PEPTIDES</div>' +
    '<p style="font-size:15px;line-height:1.6">' + msg + '</p>' +
    '<a href="https://veloxpeps.com" style="color:#01D3A0;text-decoration:none;font-size:14px">Return to site →</a>' +
    '</div></body></html>';
}

module.exports = async function handler(req, res) {
  var token = (req.query && req.query.token) || '';
  var email = verify(token);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!email) return res.status(400).send(page('This unsubscribe link is invalid or has expired.'));
  if (!SUPABASE_URL || !SERVICE) return res.status(500).send(page('Service unavailable. Please try again later.'));

  try {
    var ts = new Date().toISOString();
    var hdrs = { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
    // Mark unsubscribed in both stores (welcome-code holders + general subscribers)
    await Promise.all([
      fetch(SUPABASE_URL + '/rest/v1/newsletter_codes?email=eq.' + encodeURIComponent(email), {
        method: 'PATCH', headers: hdrs, body: JSON.stringify({ unsubscribed_at: ts }) }),
      fetch(SUPABASE_URL + '/rest/v1/subscribers?email=eq.' + encodeURIComponent(email), {
        method: 'PATCH', headers: hdrs, body: JSON.stringify({ unsubscribed_at: ts }) }),
    ]);
    return res.status(200).send(page("You've been unsubscribed. You won't receive further emails from us."));
  } catch (e) {
    console.error('[newsletter/unsubscribe]', e.message);
    return res.status(500).send(page('Something went wrong. Please contact support@veloxpeps.com.'));
  }
};
