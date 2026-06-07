/**
 * POST /api/first-order/validate  — validate the Design Lab first-order code.
 *
 * Body: { code, email }
 * Returns: { valid:true, value } when the code matches AND the email has no prior
 * paid/dispatched order; otherwise { valid:false, reason }. This is what makes the
 * first-order incentive genuinely first-order-only instead of a reusable code.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CODE  = (process.env.FIRST_ORDER_CODE || 'DESIGN10').toUpperCase();
const VALUE = Number(process.env.FIRST_ORDER_PCT || 10);
const ALLOWED_ORIGIN = 'https://veloxpeps.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ valid: false, reason: 'method' });
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ valid: false, reason: 'not_configured' });

  const b = req.body || {};
  const code  = String(b.code || '').trim().toUpperCase();
  const email = String(b.email || '').trim().toLowerCase();

  if (code !== CODE) return res.status(200).json({ valid: false, reason: 'not_found' });
  if (!email || !EMAIL_RE.test(email)) return res.status(200).json({ valid: false, reason: 'email_required' });

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?customer_email=eq.${encodeURIComponent(email)}&status=in.(paid,dispatched)&select=id&limit=1`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }
    );
    const rows = r.ok ? await r.json() : [];
    if (Array.isArray(rows) && rows.length > 0) {
      return res.status(200).json({ valid: false, reason: 'not_first_order' });
    }
    return res.status(200).json({ valid: true, value: VALUE, type: 'percentage' });
  } catch (e) {
    console.error('[first-order/validate]', e.message);
    return res.status(502).json({ valid: false, reason: 'error' });
  }
};
