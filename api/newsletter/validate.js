/**
 * POST /api/newsletter/validate  — validate a VELOX-XXXXXX welcome code at checkout
 *
 * Body: { code, email }
 * Checks: exists, not unsubscribed, not expired, not already used, email matches.
 * Returns: { valid: true, type:'percentage', value:20 } | { valid:false, reason }
 *
 * (The code is only MARKED used when the order is completed/paid — handled by the
 * order status trigger via orders.welcome_code — so abandoned checkouts don't burn it.)
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ valid: false, reason: 'not_configured' });

  var body  = req.body || {};
  var code  = (body.code  || '').toString().trim().toUpperCase();
  var email = (body.email || '').toString().trim().toLowerCase();
  if (!code) return res.status(400).json({ valid: false, reason: 'missing_code' });

  try {
    var r = await fetch(
      SUPABASE_URL + '/rest/v1/newsletter_codes?code=eq.' + encodeURIComponent(code) +
      '&select=email,expires_at,used_at,unsubscribed_at',
      { headers: { apikey: SERVICE, Authorization: 'Bearer ' + SERVICE } }
    );
    var rows = await r.json();
    var rec = Array.isArray(rows) && rows[0];

    if (!rec)                                        return res.status(200).json({ valid: false, reason: 'not_found' });
    if (rec.unsubscribed_at)                         return res.status(200).json({ valid: false, reason: 'inactive' });
    if (rec.used_at)                                 return res.status(200).json({ valid: false, reason: 'already_used' });
    if (new Date(rec.expires_at) < new Date())       return res.status(200).json({ valid: false, reason: 'expired' });
    if (email && rec.email.toLowerCase() !== email)  return res.status(200).json({ valid: false, reason: 'email_mismatch' });

    return res.status(200).json({ valid: true, type: 'percentage', value: 20, code: code });
  } catch (e) {
    console.error('[newsletter/validate]', e.message);
    return res.status(500).json({ valid: false, reason: 'error' });
  }
};
