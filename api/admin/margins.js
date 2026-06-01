/**
 * GET /api/admin/margins  — ADMIN ONLY
 *
 * Returns per-line margin rows for the live margin dashboard:
 *   { lines: [ { id, created_at, payment_method, total, subtotal,
 *                name, slug, size, qty, price, cost_price } ] }
 *
 * Costs come from the private `product_costs` table (service-role only), so this
 * endpoint is the ONLY way the figures reach the browser — and it's gated to a
 * signed-in admin. Never expose product_costs to anon/authenticated directly.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON         = process.env.SUPABASE_ANON_KEY;

const KNOWN_ADMIN_EMAILS = new Set([
  (process.env.ADMIN_EMAIL || '').toLowerCase(),
  'support@veloxpeps.com',
  'veloxpeps@gmail.com',
].filter(Boolean));

async function isAdmin(req) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token || !SUPABASE_URL) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: ANON || SERVICE || '' },
    });
    if (!r.ok) return false;
    const user = await r.json();
    return !!user && KNOWN_ADMIN_EMAILS.has((user.email || '').toLowerCase());
  } catch { return false; }
}

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'Unauthorized' });

  const sb = (path) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });

  try {
    const [oRes, cRes, ovRes, inRes] = await Promise.all([
      sb('orders?status=in.(paid,dispatched,delivered)&select=id,created_at,payment_method,total,subtotal,items&order=created_at.asc'),
      sb('product_costs?select=slug,size,cost_price'),
      sb('business_overheads?active=eq.true&select=id,name,monthly_cost,note&order=monthly_cost.desc'),
      sb('margin_insights?select=content,generated_at,model&order=generated_at.desc&limit=1'),
    ]);
    if (!oRes.ok) return res.status(502).json({ error: 'orders fetch failed' });
    if (!cRes.ok) return res.status(502).json({ error: 'costs fetch failed' });

    const orders    = await oRes.json();
    const costs     = await cRes.json();
    const overheads = ovRes.ok ? await ovRes.json() : [];
    const insightRows = inRes.ok ? await inRes.json() : [];
    const insight = Array.isArray(insightRows) && insightRows[0] ? insightRows[0] : null;

    const costMap = {};
    for (const c of (costs || [])) costMap[`${c.slug}|${c.size || ''}`] = n(c.cost_price);

    const lines = [];
    for (const o of (orders || [])) {
      let items = o.items;
      if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
      if (!Array.isArray(items)) items = [];
      for (const it of items) {
        if (!it || typeof it !== 'object') continue;
        const slug = it.slug || '';
        const size = it.size || '';
        const key  = `${slug}|${size}`;
        const cost = Object.prototype.hasOwnProperty.call(costMap, key) ? costMap[key] : null;
        lines.push({
          id: o.id,
          created_at: o.created_at,
          payment_method: o.payment_method || '',
          total: n(o.total),
          subtotal: n(o.subtotal),
          name: it.name || slug || 'Item',
          slug, size,
          qty: n(it.qty || it.quantity) || 1,
          price: n(it.price),
          cost_price: cost,
        });
      }
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ lines, overheads: overheads || [], insight, generated_at: new Date().toISOString() });
  } catch (e) {
    console.error('[admin/margins]', e.message);
    return res.status(500).json({ error: 'Margins query failed' });
  }
};
