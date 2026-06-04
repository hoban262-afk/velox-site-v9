/**
 * GET /api/deal — public. Returns the current Deal of the Day for the homepage,
 * or { deal: null } if none is active/within its countdown.
 *
 * If the deal was "applied", product_variants.sale_price already holds the real
 * discounted price (charged at checkout). When the countdown expires this
 * endpoint restores the previous price and marks the deal inactive, so the
 * promo self-cleans even without an admin action.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const { restorePrice } = require('../lib/deal-price');

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://veloxpeps.com');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).end();
  if (!SUPABASE_URL || !SERVICE) return res.status(200).json({ deal: null });

  const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
  const sb = (path) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders });

  try {
    const dr = await sb('deal_of_day?active=eq.true&select=*&order=updated_at.desc&limit=1');
    const rows = dr.ok ? await dr.json() : [];
    const deal = Array.isArray(rows) ? rows[0] : null;
    if (!deal) return res.status(200).json({ deal: null });

    // Auto-expire: countdown passed → restore price, mark inactive, no deal.
    if (deal.ends_at && new Date(deal.ends_at).getTime() <= Date.now()) {
      await restorePrice(SUPABASE_URL, SERVICE, deal);
      if (deal.id) {
        await fetch(`${SUPABASE_URL}/rest/v1/deal_of_day?id=eq.${encodeURIComponent(deal.id)}`, {
          method: 'PATCH', headers: sbHeaders,
          body: JSON.stringify({ active: false, applied: false }),
        }).catch(() => {});
      }
      return res.status(200).json({ deal: null });
    }

    // Join the product for its name + prices.
    const pr = await sb(`product_variants?slug=eq.${encodeURIComponent(deal.slug)}&size=eq.${encodeURIComponent(deal.size)}&select=name,base_price,sale_price,in_stock&limit=1`);
    const pv = pr.ok ? await pr.json() : [];
    const prod = Array.isArray(pv) ? pv[0] : null;
    if (!prod) return res.status(200).json({ deal: null });

    const base = n(prod.base_price);
    const pct = n(deal.discount_pct);
    // If the deal is applied, the live sale_price IS the deal price; otherwise compute it.
    const dealPrice = deal.applied && prod.sale_price != null
      ? n(prod.sale_price)
      : Math.round(base * (1 - pct / 100) * 100) / 100;

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      deal: {
        slug: deal.slug,
        size: deal.size,
        name: prod.name,
        headline: deal.headline || null,
        base_price: base,
        deal_price: dealPrice,
        discount_pct: pct,
        applied: !!deal.applied,
        ends_at: deal.ends_at || null,
        url: `/compounds/${deal.slug}/`,
        image: `/assets/images/${deal.slug}.png`,
      },
    });
  } catch (e) {
    console.error('[deal]', e.message);
    return res.status(200).json({ deal: null });
  }
};
