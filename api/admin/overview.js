/**
 * GET /api/admin/overview — ADMIN ONLY
 *
 * Powers the extra Overview + Traffic dashboards in the admin app with data the
 * browser can't read directly under RLS:
 *   - traffic: first-party visits (visitors/pageviews per day, top pages,
 *     top referrers, period totals) from the `visits` table
 *   - loyalty: customer loyalty-tier breakdown + points from `profiles`
 *
 * Orders, products, affiliates etc. are read client-side from Supabase; this
 * endpoint only returns the service-role-only aggregates. Read-only.
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

const ymd = (d) => new Date(d).toISOString().slice(0, 10);

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
  } catch {
    return String(ref).slice(0, 40);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'Unauthorized' });

  const sb = (path) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });

  try {
    const now = new Date();
    const since30 = new Date(now); since30.setDate(since30.getDate() - 30);
    const sinceISO = since30.toISOString();

    const [vRes, pRes] = await Promise.all([
      sb(`visits?select=sid,path,ref,created_at&created_at=gte.${encodeURIComponent(sinceISO)}&order=created_at.desc&limit=20000`),
      sb('profiles?select=loyalty_tier,lifetime_points,loyalty_points&deleted_at=is.null'),
    ]);

    const visits   = vRes.ok ? await vRes.json() : [];
    const profiles = pRes.ok ? await pRes.json() : [];

    // ── Traffic aggregation ──────────────────────────────────────────────
    const todayStr = ymd(now);
    const d7 = new Date(now); d7.setDate(d7.getDate() - 6); const d7str = ymd(d7);
    const dayMap = {};            // date -> { visitors:Set, views:n }
    const pageMap = {};           // path -> views
    const pageVisitors = {};      // path -> Set(sid)
    const refMap = {};            // source -> count
    let views7 = 0, views30 = 0;
    const vis7 = new Set(), vis30 = new Set(), visToday = new Set();

    for (const v of visits) {
      const day = ymd(v.created_at);
      if (!dayMap[day]) dayMap[day] = { visitors: new Set(), views: 0 };
      dayMap[day].visitors.add(v.sid);
      dayMap[day].views++;
      views30++;
      vis30.add(v.sid);
      const path = (v.path || '/').split('?')[0];
      pageMap[path] = (pageMap[path] || 0) + 1;
      (pageVisitors[path] = pageVisitors[path] || new Set()).add(v.sid);
      const src = refSource(v.ref);
      refMap[src] = (refMap[src] || 0) + 1;
      if (day >= d7str) { views7++; vis7.add(v.sid); }
      if (day === todayStr) visToday.add(v.sid);
    }

    // Fill a continuous 30-day daily series (so the chart has no gaps).
    const daily = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i);
      const key = ymd(d);
      const e = dayMap[key];
      daily.push({ date: key, visitors: e ? e.visitors.size : 0, pageviews: e ? e.views : 0 });
    }

    const topPages = Object.keys(pageMap)
      .map((p) => ({ path: p, views: pageMap[p], visitors: pageVisitors[p].size }))
      .sort((a, b) => b.views - a.views).slice(0, 12);

    const topReferrers = Object.keys(refMap)
      .map((s) => ({ source: s, count: refMap[s] }))
      .sort((a, b) => b.count - a.count).slice(0, 10);

    // ── Loyalty aggregation ──────────────────────────────────────────────
    const tiers = { Bronze: 0, Silver: 0, Gold: 0, Platinum: 0 };
    let pointsLive = 0, pointsLifetime = 0;
    for (const p of profiles) {
      const t = p.loyalty_tier || 'Bronze';
      if (tiers[t] == null) tiers[t] = 0;
      tiers[t]++;
      pointsLive     += Number(p.loyalty_points || 0);
      pointsLifetime += Number(p.lifetime_points || 0);
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      traffic: {
        daily, topPages, topReferrers,
        totals: {
          visitorsToday: visToday.size,
          visitors7: vis7.size, visitors30: vis30.size,
          pageviews7: views7,  pageviews30: views30,
        },
        tracked: visits.length > 0,
      },
      loyalty: { members: profiles.length, tiers, pointsLive, pointsLifetime },
      generated_at: now.toISOString(),
    });
  } catch (e) {
    console.error('[admin/overview]', e.message);
    return res.status(500).json({ error: 'Overview query failed' });
  }
};
