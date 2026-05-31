/**
 * POST /api/affiliate/validate
 *
 * Validates an affiliate ref code and returns the customer discount percentage.
 * Called by checkout.js when a discount code doesn't match static codes or
 * newsletter codes — the last fallback before showing "invalid".
 *
 * Body:    { code: string }
 * Returns: { valid: true,  affiliate_id, name, discount_pct, commission_pct }
 *       or { valid: false, reason: string }
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!SUPABASE_URL || !SERVICE) {
    console.error('[affiliate/validate] Missing Supabase env');
    return res.status(500).json({ valid: false, reason: 'not_configured' });
  }

  const code = String((req.body || {}).code || '').trim().toUpperCase();
  if (!code) return res.status(400).json({ valid: false, reason: 'missing_code' });

  try {
    const url = `${SUPABASE_URL}/rest/v1/affiliates` +
      `?ref_code=eq.${encodeURIComponent(code)}` +
      `&status=eq.active` +
      `&select=id,name,discount_pct,commission_pct` +
      `&limit=1`;

    const r = await fetch(url, {
      headers: {
        apikey:        SERVICE,
        Authorization: `Bearer ${SERVICE}`,
      },
    });

    if (!r.ok) {
      console.error('[affiliate/validate] Supabase lookup failed:', r.status);
      return res.status(200).json({ valid: false, reason: 'lookup_failed' });
    }

    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) {
      return res.status(200).json({ valid: false, reason: 'not_found' });
    }

    const aff = rows[0];
    return res.status(200).json({
      valid:          true,
      affiliate_id:   aff.id,
      name:           aff.name,
      discount_pct:   Number(aff.discount_pct)   || 10,
      commission_pct: Number(aff.commission_pct) || 10,
    });
  } catch (e) {
    console.error('[affiliate/validate]', e.message);
    return res.status(200).json({ valid: false, reason: 'error' });
  }
};
