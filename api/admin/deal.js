/**
 * /api/admin/deal — ADMIN ONLY
 *   GET  → { deal }  (the current row, or null)
 *   POST { slug, size, discount_pct, headline?, ends_at?, active, apply? } → upsert the single deal
 *   DELETE → clear the deal
 *
 * When `apply` is true the deal also drops the REAL price at checkout:
 * product_variants.sale_price is set to the discounted price, and we remember
 * the previous sale_price so it is restored exactly when the deal changes,
 * is cleared, or its countdown expires.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON         = process.env.SUPABASE_ANON_KEY;
const { setSalePrice, getSalePrice, restorePrice } = require('../../lib/deal-price');

const KNOWN_ADMIN_EMAILS = new Set([
  (process.env.ADMIN_EMAIL || '').toLowerCase(),
  'support@veloxpeps.com', 'veloxpeps@gmail.com',
].filter(Boolean));

async function isAdmin(req) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token || !SUPABASE_URL) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: ANON || SERVICE || '' },
    });
    if (!r.ok) return false;
    const u = await r.json();
    return !!u && KNOWN_ADMIN_EMAILS.has((u.email || '').toLowerCase());
  } catch { return false; }
}

const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

async function fetchCurrentDeal() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/deal_of_day?select=*&order=updated_at.desc&limit=1`, { headers: sbHeaders });
  const rows = r.ok ? await r.json() : [];
  return (Array.isArray(rows) && rows[0]) || null;
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    return res.status(200).json({ deal: await fetchCurrentDeal() });
  }

  if (req.method === 'DELETE') {
    // Revert any applied price before clearing.
    const existing = await fetchCurrentDeal();
    if (existing) await restorePrice(SUPABASE_URL, SERVICE, existing);
    await fetch(`${SUPABASE_URL}/rest/v1/deal_of_day?id=not.is.null`, { method: 'DELETE', headers: sbHeaders });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    const slug = String(b.slug || '').trim().toLowerCase();
    const size = String(b.size || '').trim();
    const pct  = n(b.discount_pct);
    const apply = b.apply === true || b.apply === 'true';
    const active = b.active !== false;
    if (!slug || !size) return res.status(400).json({ error: 'Pick a product.' });
    if (!(pct > 0 && pct <= 95)) return res.status(400).json({ error: 'Discount must be between 1 and 95%.' });

    try {
      // 1) Revert the previous applied deal first, so prices never compound.
      const existing = await fetchCurrentDeal();
      if (existing) await restorePrice(SUPABASE_URL, SERVICE, existing);

      // 2) Work out the discounted price from the variant's base price.
      const pr = await fetch(
        `${SUPABASE_URL}/rest/v1/product_variants?slug=eq.${encodeURIComponent(slug)}&size=eq.${encodeURIComponent(size)}&select=base_price,in_stock&limit=1`,
        { headers: sbHeaders }
      );
      const pv = pr.ok ? await pr.json() : [];
      const variant = Array.isArray(pv) ? pv[0] : null;
      if (!variant) return res.status(400).json({ error: 'Product not found.' });
      // Out-of-stock is allowed: an admin may deliberately feature anything.
      // The row is pinned below so the public /api/deal "out-of-stock self-heal"
      // won't force-rotate this deliberate pick away.
      const base = n(variant.base_price);
      const dealPrice = Math.round(base * (1 - pct / 100) * 100) / 100;

      // 3) If applying, remember the current sale_price (post-revert) then set the deal price.
      let prevSale = null;
      let applied = false;
      if (apply && active) {
        prevSale = await getSalePrice(SUPABASE_URL, SERVICE, slug, size);
        const setRes = await setSalePrice(SUPABASE_URL, SERVICE, slug, size, dealPrice);
        if (!setRes.ok) return res.status(502).json({ error: 'Could not set sale price', detail: (await setRes.text()).slice(0, 200) });
        applied = true;
      }

      const row = {
        slug, size, discount_pct: Math.round(pct * 100) / 100,
        headline: b.headline ? String(b.headline).slice(0, 120) : null,
        ends_at: b.ends_at ? new Date(b.ends_at).toISOString() : null,
        active,
        applied,
        prev_sale_price: applied ? prevSale : null,
        // Admin-chosen deals are pinned: /api/deal must respect the pick even
        // when the variant is out of stock, instead of force-rotating it away.
        pinned: true,
        updated_at: new Date().toISOString(),
      };

      // 4) Single featured deal: clear any existing, then insert the new one.
      await fetch(`${SUPABASE_URL}/rest/v1/deal_of_day?id=not.is.null`, { method: 'DELETE', headers: sbHeaders });
      const ins = await fetch(`${SUPABASE_URL}/rest/v1/deal_of_day`, {
        method: 'POST', headers: { ...sbHeaders, Prefer: 'return=representation' }, body: JSON.stringify(row),
      });
      if (!ins.ok) {
        // Roll back the price change if the row insert failed.
        if (applied) await setSalePrice(SUPABASE_URL, SERVICE, slug, size, prevSale);
        return res.status(502).json({ error: 'Save failed', detail: (await ins.text()).slice(0, 200) });
      }
      const data = await ins.json().catch(() => null);
      return res.status(200).json({ ok: true, deal: Array.isArray(data) ? data[0] : data });
    } catch (e) {
      console.error('[admin/deal]', e.message);
      return res.status(500).json({ error: 'Save failed' });
    }
  }

  return res.status(405).end();
};
