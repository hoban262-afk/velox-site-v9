/**
 * GET /api/admin/stats?days=30 — ADMIN ONLY
 *
 * One call that powers the "Visual overview" charts on /admin:
 *   - revenueSeries: per-day { date, revenue, orders } for completed orders (paid|dispatched)
 *   - trafficSeries: per-day { date, visitors } unique sessions from first-party visits
 *   - topProducts:   [{ name, units, revenue }] (top 8) parsed from order items
 *   - funnel:        { visitors, reachedCart, orders, rate } over the window
 *   - totals:        { revenue, orders, aov, visitors }
 *
 * Read-only, service-role aggregates. Window = ?days=N (default 30, max 365).
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
    const u = await r.json();
    return !!u && KNOWN_ADMIN_EMAILS.has((u.email || '').toLowerCase());
  } catch { return false; }
}

function parseItems(o) {
  let it = o.items;
  if (typeof it === 'string') { try { it = JSON.parse(it); } catch (e) { it = []; } }
  return Array.isArray(it) ? it : [];
}
// Normalise a referrer into a readable source bucket.
function refSource(ref) {
  if (!ref) return 'Direct / none';
  try {
    const u = new URL(ref);
    const h = u.hostname.replace(/^www\./, '');
    if (/google\./.test(h))            return 'Google';
    if (/bing\./.test(h))              return 'Bing';
    if (/duckduckgo\./.test(h))        return 'DuckDuckGo';
    if (/instagram\./.test(h))         return 'Instagram';
    if (/t\.co|twitter\.|x\.com/.test(h)) return 'X / Twitter';
    if (/facebook\.|fb\./.test(h))     return 'Facebook';
    if (/reddit\./.test(h))            return 'Reddit';
    if (/t\.me|telegram\./.test(h))    return 'Telegram';
    if (/discord\./.test(h))           return 'Discord';
    if (/veloxpeps\.com/.test(h))      return 'Internal';
    return h;
  } catch { return String(ref).slice(0, 40); }
}
// "YYYY-MM-DD" (UTC) → display label "DD Mon"
function dayKey(ms) { return new Date(ms).toISOString().slice(0, 10); }
function dayLabel(key) {
  const d = new Date(key + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'Unauthorized' });

  const sb = (path) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });

  try {
    let days = parseInt((req.query || {}).days, 10);
    if (!Number.isFinite(days) || days < 1) days = 30;
    if (days > 365) days = 365;
    const sinceMs  = Date.now() - days * 86400e3;
    const sinceISO = new Date(sinceMs).toISOString();

    const [oRes, vRes, eRes] = await Promise.all([
      sb(`orders?select=created_at,total,status,items,customer_email&status=in.(paid,dispatched)&created_at=gte.${encodeURIComponent(sinceISO)}&order=created_at.asc&limit=20000`),
      sb(`visits?select=sid,path,created_at&created_at=gte.${encodeURIComponent(sinceISO)}&order=created_at.desc&limit=80000`),
      sb(`events?select=sid,event,created_at&created_at=gte.${encodeURIComponent(sinceISO)}&order=created_at.desc&limit=80000`),
    ]);
    const orders = oRes.ok ? await oRes.json() : [];
    const visits = vRes.ok ? await vRes.json() : [];
    const events = eRes.ok ? await eRes.json() : [];

    // ── Build ordered list of day buckets ────────────────────────────────────
    const keys = [];
    const startKey = dayKey(sinceMs);
    for (let t = new Date(startKey + 'T00:00:00Z').getTime(); t <= Date.now(); t += 86400e3) keys.push(dayKey(t));
    const revByDay = {}, ordByDay = {}, visByDay = {};
    keys.forEach((k) => { revByDay[k] = 0; ordByDay[k] = 0; visByDay[k] = new Set(); });

    // ── Orders → revenue/orders per day + top products + totals + repeat rate ─
    let totalRevenue = 0, totalOrders = 0;
    const prod = {};
    const emailOrders = {};
    for (const o of orders) {
      const k = dayKey(new Date(o.created_at).getTime());
      if (revByDay[k] === undefined) continue;
      const tot = Number(o.total) || 0;
      revByDay[k] += tot; ordByDay[k] += 1;
      totalRevenue += tot; totalOrders += 1;
      const em = (o.customer_email || '').toLowerCase();
      if (em) emailOrders[em] = (emailOrders[em] || 0) + 1;
      for (const it of parseItems(o)) {
        const key = it.slug || it.name || 'item';
        const q = Number(it.qty || it.quantity) || 1;
        const rev = q * (Number(it.price) || 0);
        if (!prod[key]) prod[key] = { name: it.name || it.slug || 'Item', units: 0, revenue: 0 };
        prod[key].units += q; prod[key].revenue += rev;
      }
    }
    const buyers = Object.keys(emailOrders).length;
    const repeatBuyers = Object.values(emailOrders).filter((n) => n > 1).length;
    const repeatRate = buyers ? Math.round((repeatBuyers / buyers) * 1000) / 10 : 0;

    // ── Visits → unique visitors per day + traffic sources ───────────────────
    const allVisitors = new Set();
    const srcMap = {};
    for (const v of visits) {
      const k = dayKey(new Date(v.created_at).getTime());
      if (visByDay[k] !== undefined) visByDay[k].add(v.sid);
      allVisitors.add(v.sid);
      const s = refSource(v.ref);
      srcMap[s] = (srcMap[s] || 0) + 1;
    }
    const trafficSources = Object.keys(srcMap)
      .map((s) => ({ source: s, count: srcMap[s] }))
      .sort((a, b) => b.count - a.count).slice(0, 6);

    // ── Events → accurate funnel (Visited → Added to cart → Checkout → Ordered)
    const addedSids = new Set(), checkoutSids = new Set();
    for (const ev of events) {
      if (ev.event === 'add_to_cart') addedSids.add(ev.sid);
      else if (ev.event === 'begin_checkout') checkoutSids.add(ev.sid);
    }

    const revenueSeries = keys.map((k) => ({ date: dayLabel(k), revenue: Math.round(revByDay[k] * 100) / 100, orders: ordByDay[k] }));
    const trafficSeries = keys.map((k) => ({ date: dayLabel(k), visitors: visByDay[k].size }));
    const topProducts = Object.values(prod)
      .map((p) => ({ name: p.name, units: p.units, revenue: Math.round(p.revenue * 100) / 100 }))
      .sort((a, b) => b.revenue - a.revenue).slice(0, 8);

    const visitors = allVisitors.size;
    const funnel = {
      visitors,
      addedToCart: addedSids.size,
      startedCheckout: checkoutSids.size,
      orders: totalOrders,
      rate: visitors ? Math.round((totalOrders / visitors) * 1000) / 10 : 0, // %
      tracked: events.length > 0,
    };

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      days,
      tracked: visits.length > 0,
      totals: {
        revenue: Math.round(totalRevenue * 100) / 100,
        orders: totalOrders,
        aov: totalOrders ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0,
        visitors,
        buyers,
        repeatRate,
      },
      revenueSeries, trafficSeries, topProducts, funnel, trafficSources,
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[admin/stats]', e.message);
    return res.status(500).json({ error: 'Stats query failed' });
  }
};
