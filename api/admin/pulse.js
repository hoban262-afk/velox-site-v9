/**
 * /api/admin/pulse — ADMIN ONLY. The "Daily Pulse" snapshot for the admin overview.
 *
 *  GET → the numbers a business owner checks first thing:
 *    - sales:   today / yesterday / last-7d / prior-7d (orders + revenue), WoW %
 *    - ops:     orders awaiting dispatch, orders pending payment
 *    - stock:   OUT and LOW variants (the things that lose sales today)
 *    - traffic: today's sessions vs the trailing 7-day average
 *    - audience:active subscribers + net new yesterday
 *
 * Aggregation is done in JS over REST reads (no SQL/RPC), using the service-role
 * key from the Vercel env. All dates are bucketed in Europe/London.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON         = process.env.SUPABASE_ANON_KEY;

const KNOWN_ADMIN_EMAILS = new Set([
  (process.env.ADMIN_EMAIL || '').toLowerCase(),
  'support@veloxpeps.com', 'veloxpeps@gmail.com',
].filter(Boolean));

const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

async function isAdmin(req) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token || !SUPABASE_URL) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: ANON || SERVICE || '' } });
    if (!r.ok) return false;
    const u = await r.json();
    return !!u && KNOWN_ADMIN_EMAILS.has((u.email || '').toLowerCase());
  } catch { return false; }
}

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders });
  return r.ok ? r.json() : [];
}

// London calendar date (YYYY-MM-DD) for an instant. Handles BST/GMT via Intl.
function londonDate(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}
function addDays(iso, delta) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return londonDate(d);
}

module.exports = async (req, res) => {
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'unauthorized' });

  try {
    const now = new Date();
    const today = londonDate(now);
    const yesterday = addDays(today, -1);
    const d7 = addDays(today, -6);     // last 7 days inclusive of today
    const d14 = addDays(today, -13);   // prior 7-day window start
    const since14ISO = new Date(d14 + 'T00:00:00Z').toISOString(); // wide enough for TZ edges

    const [orders, variants, analytics, subs] = await Promise.all([
      // All orders in the last ~15 days — enough for today/yesterday/7d/prior-7d buckets.
      sbGet(`orders?created_at=gte.${encodeURIComponent(since14ISO)}&select=id,total,status,created_at,dispatched_at,discount_code&order=created_at.desc&limit=5000`),
      sbGet('product_variants?select=slug,size,stock_qty,in_stock,low_stock_threshold&limit=100000'),
      sbGet('analytics_daily?select=date,sessions&order=date.desc&limit=30'),
      sbGet('subscribers?select=created_at,unsubscribed_at&limit=100000'),
    ]);

    // ---- Sales buckets (paid + dispatched = real money) ----
    const isRevenue = (o) => o.status === 'paid' || o.status === 'dispatched';
    const bucket = (from, to) => {
      let count = 0, revenue = 0;
      for (const o of orders) {
        if (!isRevenue(o)) continue;
        const day = londonDate(new Date(o.created_at));
        if (day >= from && day <= to) { count++; revenue += n(o.total); }
      }
      return { orders: count, revenue: Math.round(revenue * 100) / 100 };
    };
    const salesToday = bucket(today, today);
    const salesYesterday = bucket(yesterday, yesterday);
    const sales7 = bucket(d7, today);
    const salesPrior7 = bucket(d14, addDays(d7, -1));
    const wow = salesPrior7.revenue > 0
      ? Math.round(((sales7.revenue - salesPrior7.revenue) / salesPrior7.revenue) * 100)
      : null;

    // ---- Ops ----
    const toDispatch = orders.filter((o) => o.status === 'paid' && !o.dispatched_at).length;
    const pending = orders.filter((o) => o.status === 'pending').length;

    // ---- Stock alerts ----
    const out = [], low = [];
    for (const v of variants) {
      const qty = n(v.stock_qty);
      const threshold = n(v.low_stock_threshold) || 5;
      const label = `${(v.slug || '').replace(/-/g, ' ')} ${v.size || ''}`.trim();
      if (v.in_stock === false || qty <= 0) out.push({ label, qty });
      else if (qty <= threshold) low.push({ label, qty });
    }
    out.sort((a, b) => a.label.localeCompare(b.label));
    low.sort((a, b) => a.qty - b.qty);

    // ---- Traffic ----
    const todaySessions = n((analytics.find((a) => a.date === today) || {}).sessions);
    const yesterdaySessions = n((analytics.find((a) => a.date === yesterday) || {}).sessions);
    const recent = analytics.filter((a) => a.date >= d7 && a.date < today);
    const avg7 = recent.length ? Math.round(recent.reduce((s, a) => s + n(a.sessions), 0) / recent.length) : 0;

    // ---- Audience ----
    const activeSubs = subs.filter((s) => !s.unsubscribed_at).length;
    const newSubsYesterday = subs.filter((s) => s.created_at && londonDate(new Date(s.created_at)) === yesterday && !s.unsubscribed_at).length;

    return res.status(200).json({
      generatedAt: now.toISOString(),
      today,
      sales: { today: salesToday, yesterday: salesYesterday, last7: sales7, prior7: salesPrior7, wowPct: wow },
      ops: { toDispatch, pending },
      stock: { out, low, outCount: out.length, lowCount: low.length },
      traffic: { today: todaySessions, yesterday: yesterdaySessions, avg7 },
      audience: { activeSubs, newYesterday: newSubsYesterday },
    });
  } catch (e) {
    console.error('[pulse] failed', e && e.message);
    return res.status(500).json({ error: 'pulse_failed' });
  }
};
