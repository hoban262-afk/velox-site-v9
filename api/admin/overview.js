/**
 * GET /api/admin/overview — ADMIN ONLY
 *
 * Traffic + loyalty aggregates for the admin dashboards, for an arbitrary time
 * window passed as ?minutes=N (omit for "all time"). Returns:
 *   - traffic: visitors/pageviews for the window + the previous equal window
 *     (for deltas), an adaptive ~24-bucket time series, top pages, top referrers
 *   - loyalty: tier breakdown + points (window-independent)
 *
 * Orders/products/affiliates are read client-side from Supabase; this endpoint
 * only returns the service-role-only data (visits, profiles). Read-only.
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

// Label a bucket's start time at a resolution appropriate to the bucket size.
function bucketLabel(ms, stepMs) {
  const d = new Date(ms);
  if (stepMs < 6 * 3600e3) {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  }
  if (stepMs < 3 * 86400e3) {
    return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', timeZone: 'UTC' });
  }
  if (stepMs < 32 * 86400e3) {
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  }
  return d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'Unauthorized' });

  const sb = (path) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });

  try {
    const minutes = parseInt((req.query || {}).minutes, 10);
    const hasWin  = Number.isFinite(minutes) && minutes > 0;
    const nowMs   = Date.now();
    const lenMs   = hasWin ? minutes * 60000 : null;
    const sinceCur  = hasWin ? nowMs - lenMs : 0;          // window start
    const sincePull = hasWin ? nowMs - 2 * lenMs : 0;      // also pull the previous window for deltas
    const sinceISO  = new Date(sincePull).toISOString();

    const [vRes, pRes] = await Promise.all([
      sb(`visits?select=sid,path,ref,created_at&created_at=gte.${encodeURIComponent(sinceISO)}&order=created_at.desc&limit=50000`),
      sb('profiles?select=loyalty_tier,lifetime_points,loyalty_points&deleted_at=is.null'),
    ]);
    const visits   = vRes.ok ? await vRes.json() : [];
    const profiles = pRes.ok ? await pRes.json() : [];

    // ── window bounds for the time series ────────────────────────────────
    let earliest = nowMs;
    for (const v of visits) { const t = new Date(v.created_at).getTime(); if (t < earliest) earliest = t; }
    const winStart = hasWin ? sinceCur : (visits.length ? earliest : nowMs - 86400e3);
    const N = 24;
    const stepMs = Math.max(60000, (nowMs - winStart) / N);
    const series = [];
    for (let i = 0; i < N; i++) {
      const bs = winStart + i * stepMs;
      series.push({ label: bucketLabel(bs, stepMs), visitors: 0, pageviews: 0, _sids: new Set() });
    }

    const curVis = new Set(), prevVis = new Set();
    let curViews = 0, prevViews = 0;
    const pageMap = {}, pageVis = {}, refMap = {};

    for (const v of visits) {
      const t = new Date(v.created_at).getTime();
      const inCur = t >= sinceCur && t <= nowMs;
      if (inCur) {
        curVis.add(v.sid); curViews++;
        const path = (v.path || '/').split('?')[0];
        pageMap[path] = (pageMap[path] || 0) + 1;
        (pageVis[path] = pageVis[path] || new Set()).add(v.sid);
        const src = refSource(v.ref);
        refMap[src] = (refMap[src] || 0) + 1;
        let idx = Math.floor((t - winStart) / stepMs);
        if (idx < 0) idx = 0; if (idx > N - 1) idx = N - 1;
        series[idx]._sids.add(v.sid); series[idx].pageviews++;
      } else if (hasWin && t >= sincePull && t < sinceCur) {
        prevVis.add(v.sid); prevViews++;
      }
    }
    series.forEach((b) => { b.visitors = b._sids.size; delete b._sids; });

    const topPages = Object.keys(pageMap)
      .map((p) => ({ path: p, views: pageMap[p], visitors: pageVis[p].size }))
      .sort((a, b) => b.views - a.views).slice(0, 12);
    const topReferrers = Object.keys(refMap)
      .map((s) => ({ source: s, count: refMap[s] }))
      .sort((a, b) => b.count - a.count).slice(0, 10);

    // ── loyalty (window-independent) ─────────────────────────────────────
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
        window: { minutes: hasWin ? minutes : null },
        totals: {
          visitors: curVis.size, pageviews: curViews,
          visitorsPrev: hasWin ? prevVis.size : null,
          pageviewsPrev: hasWin ? prevViews : null,
        },
        series, topPages, topReferrers,
        tracked: visits.length > 0,
      },
      loyalty: { members: profiles.length, tiers, pointsLive, pointsLifetime },
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[admin/overview]', e.message);
    return res.status(500).json({ error: 'Overview query failed' });
  }
};
