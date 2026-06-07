/**
 * GET /api/command/home — ADMIN ONLY.
 *
 * The Command Centre home aggregation: business-at-a-glance in one call.
 * Read-only, service-role. Mirrors the admin's revenue rule (isPaid =
 * status 'paid' | 'dispatched') so the numbers match /admin exactly.
 *
 * Returns money (today / 7d vs prior 7d / MTD / AOV), top SKUs (7d),
 * repeat-vs-new (7d), the latest sale, pending approvals, live visitors,
 * visitors today, and a live-site status check.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON         = process.env.SUPABASE_ANON_KEY;

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

const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
const sb = (path) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders });

const isPaid = (o) => o.status === 'paid' || o.status === 'dispatched';
const num = (v) => parseFloat(v) || 0;

function orderItems(o) {
  const it = o.items;
  if (Array.isArray(it)) return it;
  if (typeof it === 'string') { try { const p = JSON.parse(it); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}
function itemName(it) {
  return it.name || it.title || it.product || it.sku || it.variant || 'Item';
}
function itemQty(it) { return Number(it.qty || it.quantity) || 1; }
function itemLineRevenue(it) {
  const price = num(it.price != null ? it.price : it.unit_price);
  return price > 0 ? price * itemQty(it) : 0;
}

function maskEmail(e) {
  if (!e || !e.includes('@')) return '—';
  const [u, d] = e.split('@');
  return (u.length <= 2 ? u[0] + '*' : u.slice(0, 2) + '***') + '@' + d;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'Unauthorized' });

  const now = new Date();
  const ms = (d) => d.getTime();
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const d7  = ms(now) - 7 * 86400e3;
  const d14 = ms(now) - 14 * 86400e3;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const pull = new Date(d14).toISOString(); // 14 days covers today / 7d / prior-7d; MTD pulled separately if needed

  const out = {
    money: null, topSkus: [], repeat: null, latest: null,
    approvalsPending: null, liveNow: null, visitorsToday: null, site: null,
    generated_at: now.toISOString(),
  };

  // ── Orders (last 14d for windows) + MTD orders ───────────────────────────
  try {
    const [recentRes, mtdRes] = await Promise.all([
      sb(`orders?select=created_at,total,customer_email,items,status&created_at=gte.${encodeURIComponent(pull)}&order=created_at.desc&limit=2000`),
      sb(`orders?select=total,status&created_at=gte.${encodeURIComponent(startOfMonth.toISOString())}&limit=5000`),
    ]);
    const recent = recentRes.ok ? await recentRes.json() : [];
    const mtd    = mtdRes.ok ? await mtdRes.json() : [];

    const paid = recent.filter(isPaid);

    const win = (from, to) => paid.filter((o) => { const t = ms(new Date(o.created_at)); return t >= from && t < to; });
    const sum = (arr) => arr.reduce((s, o) => s + num(o.total), 0);

    const today = paid.filter((o) => ms(new Date(o.created_at)) >= ms(startOfToday));
    const last7 = win(d7, ms(now) + 1);
    const prev7 = win(d14, d7);
    const mtdPaid = mtd.filter(isPaid);

    const rev7 = sum(last7), revPrev7 = sum(prev7);
    out.money = {
      todayRevenue: sum(today), todayOrders: today.length,
      revenue7: rev7, orders7: last7.length,
      revenuePrev7: revPrev7, ordersPrev7: prev7.length,
      revenueWoWPct: revPrev7 > 0 ? Math.round(((rev7 - revPrev7) / revPrev7) * 100) : null,
      mtdRevenue: sum(mtdPaid), mtdOrders: mtdPaid.length,
      aov7: last7.length ? rev7 / last7.length : 0,
    };

    // Top SKUs last 7d (by revenue if priced, else by units)
    const skuRev = {}, skuQty = {}; let anyPrice = false;
    for (const o of last7) for (const it of orderItems(o)) {
      const n = itemName(it), q = itemQty(it), r = itemLineRevenue(it);
      skuQty[n] = (skuQty[n] || 0) + q;
      if (r > 0) { skuRev[n] = (skuRev[n] || 0) + r; anyPrice = true; }
    }
    out.topSkus = Object.keys(skuQty).map((n) => ({ name: n, qty: skuQty[n], revenue: skuRev[n] || 0 }))
      .sort((a, b) => anyPrice ? (b.revenue - a.revenue) : (b.qty - a.qty)).slice(0, 5);
    out._skuByRevenue = anyPrice;

    // Repeat vs new (7d): emails seen before this 7d window vs first-timers
    const before = new Set(paid.filter((o) => ms(new Date(o.created_at)) < d7).map((o) => (o.customer_email || '').toLowerCase()));
    let repeat = 0, fresh = 0;
    for (const o of last7) {
      const e = (o.customer_email || '').toLowerCase();
      if (e && before.has(e)) repeat++; else fresh++;
    }
    out.repeat = { repeat, fresh };

    // Latest sale
    if (paid.length) {
      const l = paid[0];
      out.latest = { email: maskEmail(l.customer_email), total: num(l.total), at: l.created_at };
    }
  } catch (e) { out.moneyError = 'orders query failed'; }

  // ── Pending approvals ────────────────────────────────────────────────────
  try {
    const r = await sb('agent_actions?select=id&status=eq.pending&limit=500');
    out.approvalsPending = r.ok ? (await r.json()).length : null;
  } catch {}

  // ── Live now + visitors today ────────────────────────────────────────────
  try {
    const since5 = new Date(ms(now) - 5 * 60000).toISOString();
    const r = await sb(`site_presence?select=sid&last_seen=gte.${encodeURIComponent(since5)}&limit=2000`);
    out.liveNow = r.ok ? (await r.json()).length : null;
  } catch {}
  try {
    const r = await sb(`visits?select=sid&created_at=gte.${encodeURIComponent(startOfToday.toISOString())}&limit=50000`);
    if (r.ok) { const v = await r.json(); out.visitorsToday = new Set(v.map((x) => x.sid)).size; }
  } catch {}

  // ── Live-site status check ───────────────────────────────────────────────
  try {
    const ctrl = AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined;
    const r = await fetch('https://veloxpeps.com', { signal: ctrl });
    out.site = { ok: r.ok, status: r.status };
  } catch { out.site = { ok: false, status: 0 }; }

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(out);
};
