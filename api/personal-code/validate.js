/**
 * POST /api/personal-code/validate — validate a personal / per-email discount code.
 *
 * Backs the `personal_codes` table: a flexible store for one-off codes that the
 * public DISCOUNT_CODES list and the newsletter/first-order validators can't
 * express. Fields per row:
 *   code       text  — the string the customer types (stored UPPER-CASE, unique)
 *   email      text  — if set, the code ONLY works when the checkout email matches
 *   kind       text  — 'percentage' | 'fixed'
 *   value      num   — 40 (= 40% off) or a £ amount for 'fixed'
 *   basis      text  — 'current' (off the price shown) | 'base' (off full/base price)
 *   priority   bool  — true = overrides other item discounts (sale/volume/member)
 *   applies_to text  — 'all' | 'full_price_only'
 *   max_uses   int   — null = unlimited
 *   used_count int   — redemptions so far (not incremented here; validate is read-only)
 *   active     bool
 *   expires_at ts    — null = persistent / never expires
 *
 * Body: { code, email }
 * Returns: { valid:true, code, kind, value, basis, priority, applies_to } | { valid:false, reason }
 *
 * The table is RLS-locked (no anon/authenticated policies); this endpoint reads it
 * with the service-role key, so the discount rules are never exposed to the client
 * except through this deliberate, code-gated lookup. Fails safe — never throws.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
  if (!code) return res.status(200).json({ valid: false, reason: 'not_found' });

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/personal_codes?code=eq.${encodeURIComponent(code)}&select=*&limit=1`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }
    );
    const rows = r.ok ? await r.json() : [];
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return res.status(200).json({ valid: false, reason: 'not_found' });
    if (row.active === false) return res.status(200).json({ valid: false, reason: 'inactive' });
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(200).json({ valid: false, reason: 'expired' });
    }
    if (row.max_uses != null && Number(row.used_count || 0) >= Number(row.max_uses)) {
      return res.status(200).json({ valid: false, reason: 'used_up' });
    }
    // Email-locked codes: require a matching checkout email.
    if (row.email) {
      if (!email || !EMAIL_RE.test(email)) return res.status(200).json({ valid: false, reason: 'email_required' });
      if (email !== String(row.email).trim().toLowerCase()) {
        return res.status(200).json({ valid: false, reason: 'email_mismatch' });
      }
    }
    return res.status(200).json({
      valid: true,
      code: row.code,
      kind: row.kind || 'percentage',
      value: Number(row.value) || 0,
      basis: row.basis || 'current',
      priority: row.priority === true,
      applies_to: row.applies_to || 'all',
    });
  } catch (e) {
    console.error('[personal-code/validate]', e.message);
    return res.status(502).json({ valid: false, reason: 'error' });
  }
};
