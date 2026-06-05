/**
 * Deal-of-the-Day real-price helpers.
 *
 * When a deal is "applied", we set product_variants.sale_price to the discounted
 * price so the deal is actually charged at checkout. We remember whatever
 * sale_price was there before (prev_sale_price) so we can put it back exactly
 * when the deal changes, is cleared, or its countdown expires.
 */

const sbHeaders = (SERVICE) => ({
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  'Content-Type': 'application/json',
});

const q = (v) => encodeURIComponent(String(v));

/**
 * Set product_variants.sale_price for one variant. Pass null to clear it.
 */
async function setSalePrice(SUPABASE_URL, SERVICE, slug, size, price) {
  const url =
    `${SUPABASE_URL}/rest/v1/product_variants` +
    `?slug=eq.${q(slug)}&size=eq.${q(size)}`;
  return fetch(url, {
    method: 'PATCH',
    headers: sbHeaders(SERVICE),
    body: JSON.stringify({ sale_price: price }),
  });
}

/**
 * Read the current sale_price for one variant (number or null).
 */
async function getSalePrice(SUPABASE_URL, SERVICE, slug, size) {
  const url =
    `${SUPABASE_URL}/rest/v1/product_variants` +
    `?slug=eq.${q(slug)}&size=eq.${q(size)}&select=sale_price&limit=1`;
  const r = await fetch(url, { headers: sbHeaders(SERVICE) });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  const v = row.sale_price;
  return v === null || v === undefined ? null : Number(v);
}

/**
 * Revert a previously-applied deal: put prev_sale_price back on the variant.
 * Safe to call on any deal object; no-ops unless deal.applied is true.
 */
async function restorePrice(SUPABASE_URL, SERVICE, deal) {
  if (!deal || !deal.applied) return;
  const prev =
    deal.prev_sale_price === null || deal.prev_sale_price === undefined
      ? null
      : Number(deal.prev_sale_price);
  try {
    await setSalePrice(SUPABASE_URL, SERVICE, deal.slug, deal.size, prev);
  } catch (e) {
    console.error('[deal-price] restore failed', e && e.message);
  }
}

module.exports = { setSalePrice, getSalePrice, restorePrice };
