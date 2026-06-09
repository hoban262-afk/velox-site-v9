/**
 * Deal of the Week — auto-rotation.
 *
 * Every 7 days (or when the current deal's countdown expires) we revert the old
 * deal's price, pick a RANDOM eligible product variant, apply a discount and set
 * a fresh 7-day countdown. Eligible = deal_flag + in_stock (falls back to any
 * discountable in-stock variant). Discount is chosen from a small safe set.
 *
 * Used by the /api/deal-rotate cron and read-triggered by /api/deal on expiry.
 */
const { setSalePrice, getSalePrice, restorePrice } = require('./deal-price');

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DEAL_PCTS = [30];                   // fixed: Deal of the Week is always 30% off
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

function sbHeaders(SERVICE) {
  return { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
}

async function fetchCurrentDeal(SUPABASE_URL, SERVICE) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/deal_of_day?select=*&order=updated_at.desc&limit=1`, { headers: sbHeaders(SERVICE) });
  const rows = r.ok ? await r.json() : [];
  return (Array.isArray(rows) && rows[0]) || null;
}

// True when there's no active deal or the current one has expired.
function needsRotation(deal) {
  if (!deal || !deal.active) return true;
  if (deal.ends_at && new Date(deal.ends_at).getTime() <= Date.now()) return true;
  return false;
}

async function eligibleVariants(SUPABASE_URL, SERVICE) {
  const h = sbHeaders(SERVICE);
  // Prefer admin-flagged deal-eligible, in-stock variants.
  let r = await fetch(`${SUPABASE_URL}/rest/v1/product_variants?deal_flag=eq.true&in_stock=eq.true&select=slug,size,base_price`, { headers: h });
  let rows = r.ok ? await r.json() : [];
  if (Array.isArray(rows) && rows.length) return rows;
  // Fallback: any discountable, in-stock variant.
  r = await fetch(`${SUPABASE_URL}/rest/v1/product_variants?discountable=eq.true&in_stock=eq.true&select=slug,size,base_price`, { headers: h });
  rows = r.ok ? await r.json() : [];
  return Array.isArray(rows) ? rows : [];
}

/**
 * Rotate to a new random Deal of the Week. Returns the new deal row (or null).
 * Pass { force:true } to rotate regardless of countdown.
 */
async function rotateDeal(SUPABASE_URL, SERVICE, opts = {}) {
  const h = sbHeaders(SERVICE);
  const current = await fetchCurrentDeal(SUPABASE_URL, SERVICE);
  if (!opts.force && !needsRotation(current)) return current; // nothing to do

  // 1) Revert any applied price from the outgoing deal.
  if (current) await restorePrice(SUPABASE_URL, SERVICE, current);

  // 2) Pick a random eligible variant, avoiding an immediate repeat where possible.
  let variants = await eligibleVariants(SUPABASE_URL, SERVICE);
  if (!variants.length) return null;
  if (variants.length > 1 && current) {
    const filtered = variants.filter((v) => !(v.slug === current.slug && v.size === current.size));
    if (filtered.length) variants = filtered;
  }
  const pick = variants[Math.floor(Math.random() * variants.length)];
  const pct = DEAL_PCTS[Math.floor(Math.random() * DEAL_PCTS.length)];
  const base = n(pick.base_price);
  const dealPrice = Math.round(base * (1 - pct / 100) * 100) / 100;

  // 3) Remember the live sale_price (post-revert) then apply the deal price.
  const prevSale = await getSalePrice(SUPABASE_URL, SERVICE, pick.slug, pick.size);
  const setRes = await setSalePrice(SUPABASE_URL, SERVICE, pick.slug, pick.size, dealPrice);
  if (!setRes.ok) { console.error('[deal-rotate] setSalePrice failed'); return null; }

  // 4) Replace the single featured deal row.
  const row = {
    slug: pick.slug, size: pick.size, discount_pct: pct,
    headline: null, ends_at: new Date(Date.now() + WEEK_MS).toISOString(),
    active: true, applied: true, prev_sale_price: prevSale,
    updated_at: new Date().toISOString(),
  };
  await fetch(`${SUPABASE_URL}/rest/v1/deal_of_day?id=not.is.null`, { method: 'DELETE', headers: h }).catch(() => {});
  const ins = await fetch(`${SUPABASE_URL}/rest/v1/deal_of_day`, {
    method: 'POST', headers: { ...h, Prefer: 'return=representation' }, body: JSON.stringify(row),
  });
  if (!ins.ok) {
    await setSalePrice(SUPABASE_URL, SERVICE, pick.slug, pick.size, prevSale).catch(() => {}); // roll back
    console.error('[deal-rotate] insert failed');
    return null;
  }
  const data = await ins.json().catch(() => null);
  return Array.isArray(data) ? data[0] : data;
}

module.exports = { rotateDeal, needsRotation, fetchCurrentDeal };
