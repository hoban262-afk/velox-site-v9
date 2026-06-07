/**
 * GET /api/command/home — ADMIN ONLY.
 *
 * The Command Centre home aggregation: business-at-a-glance in one call.
 * Read-only, service-role. Mirrors the admin's revenue rule (isPaid =
 * status 'paid' | 'dispatched') so the numbers match /admin exactly.
 *
 * Returns money, top SKUs, repeat-vs-new, latest sale, recurring revenue (MRR),
 * out-of-stock, to-fulfil queue, pending approvals (with detail), live/visitors,
 * a live-site check, and a computed `alerts` feed for the home strip.
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
const itemName = (it) => it.name || it.title || it.product || it.sku || it.variant || 'Item';
const itemQty  = (it) => Number(it.qty || it.quantity) || 1;
function itemLineRevenue(it) {
  const price = num(it.price != null ? it.price : it.unit_price);
  return price > 0 ? price * itemQty(it) : 0;
}
function maskEmail(e) {
  if (!e || !e.includes('@')) return '—';
  const [u, d] = e.split('@');
  return (u.length <= 2 ? u[0] + '*' : u.slice(0, 2) + '***') + '@' + d;
}
// Normalise a subscription frequency to a monthly multiplier for MRR.
function monthlyFactor(freq) {
  freq = (freq || '').toLowerCase();
  if (/year|annual/.test(freq)) return 1 / 12;
  if (/quarter/.test(freq))     return 1 / 3;
  if (/fortnight|biweek/.test(freq)) return 2.17;
  if (/week/.test(freq))        return /4/.test(freq) ? 1 : 4.345; // "4weeks" ≈ monthly
  return 1; // default monthly
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
  const pull = new Date(d14).toISOString();

  const out = {
    money: null, topSkus: [], repeat: null, latest: null,
    recurring: null, outOfStock: [], toFulfil: null, approvals: [],
    approvalsPending: null, liveNow: null, visitorsToday: null, site: null,
    alerts: [], generated_at: now.toISOString(),
  };

  // ── Orders (last 14d for windows) + MTD ──────────────────────────────────
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

    const skuRev = {}, skuQty = {}; let anyPrice = false;
    for (const o of last7) for (const it of orderItems(o)) {
      const n = itemName(it);
      skuQty[n] = (skuQty[n] || 0) + itemQty(it);
      const r = itemLineRevenue(it);
      if (r > 0) { skuRev[n] = (skuRev[n] || 0) + r; anyPrice = true; }
    }
    out.topSkus = Object.keys(skuQty).map((n) => ({ name: n, qty: skuQty[n], revenue: skuRev[n] || 0 }))
      .sort((a, b) => anyPrice ? (b.revenue - a.revenue) : (b.qty - a.qty)).slice(0, 5);

    const before = new Set(paid.filter((o) => ms(new Date(o.created_at)) < d7).map((o) => (o.customer_email || '').toLowerCase()));
    let repeat = 0, fresh = 0;
    for (const o of last7) { const e = (o.customer_email || '').toLowerCase(); if (e && before.has(e)) repeat++; else fresh++; }
    out.repeat = { repeat, fresh };

    if (paid.length) { const l = paid[0]; out.latest = { email: maskEmail(l.customer_email), total: num(l.total), at: l.created_at }; }
  } catch (e) { out.moneyError = 'orders query failed'; }

  // ── Recurring revenue (MRR) ──────────────────────────────────────────────
  try {
    const r = await sb('subscriptions?select=amount_pence,frequency,status,next_expected_date&status=eq.active&limit=1000');
    const subs = r.ok ? await r.json() : [];
    let mrrPence = 0;
    for (const s of subs) mrrPence += num(s.amount_pence) * monthlyFactor(s.frequency);
    out.recurring = { active: subs.length, mrr: mrrPence / 100 };
  } catch {}

  // ── Out of stock ─────────────────────────────────────────────────────────
  try {
    const r = await sb('stock_state?select=slug&in_stock=eq.false&limit=200');
    out.outOfStock = r.ok ? (await r.json()).map((x) => x.slug) : [];
  } catch {}

  // ── To-fulfil queue (paid, not yet dispatched) ───────────────────────────
  try {
    const r = await sb('orders?select=id,customer_name,total,created_at&status=eq.paid&order=created_at.asc&limit=50');
    const rows = r.ok ? await r.json() : [];
    out.toFulfil = { count: rows.length, orders: rows.slice(0, 8) };
  } catch {}

  // ── Pending approvals (with detail for inline approve/dismiss) ───────────
  try {
    const r = await sb('agent_actions?select=id,type,title,summary,created_at&status=eq.pending&order=created_at.desc&limit=12');
    out.approvals = r.ok ? await r.json() : [];
    out.approvalsPending = out.approvals.length;
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

  // ── Worker health (recent failures) ──────────────────────────────────────
  let workerFails = 0;
  try {
    const r = await sb('worker_runs?select=worker,ok,ran_at&order=ran_at.desc&limit=40');
    const rows = r.ok ? await r.json() : [];
    const latest = {};
    for (const w of rows) if (!latest[w.worker]) latest[w.worker] = w;
    workerFails = Object.values(latest).filter((w) => w && w.ok === false).length;
  } catch {}

  // ── Live-site status check ───────────────────────────────────────────────
  try {
    const sig = AbortSignal.timeout ? AbortSignal.timeout(4000) : undefined;
    const r = await fetch('https://veloxpeps.com', { signal: sig });
    out.site = { ok: r.ok, status: r.status };
  } catch { out.site = { ok: false, status: 0 }; }

  // ── Build the alerts feed (most urgent first) ────────────────────────────
  const A = [];
  if (out.site && !out.site.ok) A.push({ level: 'bad', text: 'Live site is not responding', href: '/admin' });
  if (out.approvalsPending > 0) A.push({ level: 'warn', text: out.approvalsPending + ' draft' + (out.approvalsPending === 1 ? '' : 's') + ' waiting for your approval', href: '#needs-you' });
  if (out.toFulfil && out.toFulfil.count > 0) A.push({ level: 'warn', text: out.toFulfil.count + ' paid order' + (out.toFulfil.count === 1 ? '' : 's') + ' to dispatch', href: '#needs-you' });
  if (out.outOfStock.length > 0) A.push({ level: 'warn', text: out.outOfStock.length + ' product' + (out.outOfStock.length === 1 ? '' : 's') + ' out of stock', href: '#needs-you' });
  if (workerFails > 0) A.push({ level: 'bad', text: workerFails + ' automation(s) failing — check health', href: '/admin' });
  if (out.money && out.money.todayOrders > 0) A.push({ level: 'good', text: out.money.todayOrders + ' order' + (out.money.todayOrders === 1 ? '' : 's') + ' today (£' + Math.round(out.money.todayRevenue) + ')', href: null });
  out.alerts = A;

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(out);
};
