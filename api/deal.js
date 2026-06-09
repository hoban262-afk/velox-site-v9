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
const { restorePrice, setSalePrice } = require('../lib/deal-price');
const { rotateDeal } = require('../lib/deal-rotate');

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const round2 = (x) => Math.round(x * 100) / 100;

// Shape a deal_of_day row + its product into the public payload.
//
// The badge percentage is ALWAYS derived from the real prices (base vs the price
// checkout will actually charge), never trusted from the stored discount_pct —
// so the homepage can never show a phantom "X% OFF" when no money actually comes
// off (e.g. after a price reseed wipes the applied sale_price back to base).
async function shape(SUPABASE_URL, SERVICE, sb, sbHeaders, deal) {
  const pr = await sb(`product_variants?slug=eq.${encodeURIComponent(deal.slug)}&size=eq.${encodeURIComponent(deal.size)}&select=name,base_price,sale_price,in_stock&limit=1`);
  const pv = pr.ok ? await pr.json() : [];
  const prod = Array.isArray(pv) ? pv[0] : null;
  if (!prod) return null;

  const base = n(prod.base_price), pct = n(deal.discount_pct);
  let sale = prod.sale_price == null ? null : n(prod.sale_price);
  const target = pct > 0 ? round2(base * (1 - pct / 100)) : base;

  // Self-heal: an applied deal whose sale_price is no longer below base (a reseed
  // reset it) is broken — re-apply the discount so display AND checkout agree,
  // and remember the true pre-deal price (base) for a correct restore on expiry.
  if (deal.applied && pct > 0 && target < base && (sale == null || sale >= base)) {
    try {
      await setSalePrice(SUPABASE_URL, SERVICE, deal.slug, deal.size, target);
      await fetch(`${SUPABASE_URL}/rest/v1/deal_of_day?id=eq.${encodeURIComponent(deal.id)}`, {
        method: 'PATCH', headers: sbHeaders, body: JSON.stringify({ prev_sale_price: base }),
      });
      sale = target;
    } catch (e) { console.error('[deal] self-heal failed', e && e.message); }
  }

  const dealPrice = deal.applied && sale != null ? sale : target;
  const realPct = base > 0 && dealPrice < base ? Math.round((1 - dealPrice / base) * 100) : 0;
  return {
    slug: deal.slug, size: deal.size, name: prod.name, headline: deal.headline || null,
    base_price: base, deal_price: dealPrice, discount_pct: realPct, applied: !!deal.applied,
    ends_at: deal.ends_at || null, url: `/compounds/${deal.slug}/`, image: `/assets/images/${deal.slug}.png`,
  };
}

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
    let deal = Array.isArray(rows) ? rows[0] : null;

    // No deal, or countdown passed → rotate to a fresh random weekly deal so the
    // homepage always shows one (also runs from the /api/deal-rotate cron).
    const expired = deal && deal.ends_at && new Date(deal.ends_at).getTime() <= Date.now();
    if (!deal || expired) {
      deal = await rotateDeal(SUPABASE_URL, SERVICE).catch(() => null);
      if (!deal) return res.status(200).json({ deal: null });
    }

    res.setHeader('Cache-Control', 'no-store');
    const shaped = await shape(SUPABASE_URL, SERVICE, sb, sbHeaders, deal);
    return res.status(200).json({ deal: shaped });
  } catch (e) {
    console.error('[deal]', e.message);
    return res.status(200).json({ deal: null });
  }
};
