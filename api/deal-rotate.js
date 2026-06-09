/**
 * /api/deal-rotate — cron. Rotates the Deal of the Week to a random eligible
 * peptide when the current one has expired (or seeds one if none exists).
 * Self-cleaning: reverts the outgoing deal's price before applying the new one.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const { rotateDeal } = require('../lib/deal-rotate');

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(200).json({ ok: false, reason: 'not configured' });
  try {
    const deal = await rotateDeal(SUPABASE_URL, SERVICE);
    return res.status(200).json({ ok: true, deal: deal ? { slug: deal.slug, size: deal.size, discount_pct: deal.discount_pct, ends_at: deal.ends_at } : null });
  } catch (e) {
    console.error('[deal-rotate]', e.message);
    return res.status(200).json({ ok: false, error: e.message });
  }
};
