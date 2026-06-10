/**
 * GET/POST /api/analytics/gsc-run — pull Google Search Console metrics into
 * public.search_snapshots (one row per day, upserted).
 *
 * Replaces the Supermetrics dependency for the daily SEO monitor: the monitor
 * reads the latest snapshot from Supabase instead of polling Supermetrics.
 *
 * Auth: Bearer $CRON_SECRET, or x-internal-secret: $INTERNAL_TASK_SECRET
 * (same pattern as ga-run). Runs daily via Vercel Cron (see vercel.json).
 *
 * Uses the GSC OAuth refresh-token credentials already configured for
 * /api/admin/seo.js: GSC_OAUTH_CLIENT_ID / GSC_OAUTH_CLIENT_SECRET /
 * GSC_OAUTH_REFRESH_TOKEN (+ optional GSC_SITE, default sc-domain:veloxpeps.com).
 *
 * Windows follow GSC's ~3-day data lag: "7d" = the most recent 7 stable days.
 * Fail-safe: logs and returns 200 on error so the cron never alarms Vercel.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE         = process.env.GSC_SITE || 'sc-domain:veloxpeps.com';

const OAUTH_CLIENT_ID     = process.env.GSC_OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.GSC_OAUTH_CLIENT_SECRET;
const OAUTH_REFRESH_TOKEN = process.env.GSC_OAUTH_REFRESH_TOKEN;

function authorised(req) {
  const auth = req.headers['authorization'] || '';
  const internal = req.headers['x-internal-secret'] || '';
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (process.env.INTERNAL_TASK_SECRET && internal === process.env.INTERNAL_TASK_SECRET) return true;
  return false;
}

async function getOAuthToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      refresh_token: OAUTH_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error_description || d.error || 'token refresh failed');
  return d.access_token;
}

const ymd = (d) => new Date(d).toISOString().slice(0, 10);

async function query(token, body) {
  const r = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
  const d = await r.json();
  if (!r.ok) throw new Error((d.error && d.error.message) || 'searchAnalytics failed');
  return d.rows || [];
}

function totals(rows) {
  let clicks = 0, impressions = 0, posW = 0;
  for (const r of rows) { clicks += r.clicks; impressions += r.impressions; posW += r.position * r.impressions; }
  return {
    clicks, impressions,
    ctr: impressions ? +(clicks / impressions * 100).toFixed(2) : 0,
    position: impressions ? +(posW / impressions).toFixed(1) : 0,
  };
}
const slim = (rows, key) => rows.map((r) => ({
  [key]: r.keys[0], clicks: r.clicks, impressions: r.impressions,
  ctr: r.impressions ? +(r.clicks / r.impressions * 100).toFixed(2) : 0,
  position: +r.position.toFixed(1),
}));

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!authorised(req)) return res.status(401).json({ error: 'unauthorised' });
  if (!SUPABASE_URL || !SERVICE) return res.status(200).json({ ok: false, error: 'supabase env missing' });
  if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET || !OAUTH_REFRESH_TOKEN)
    return res.status(200).json({ ok: false, error: 'GSC_OAUTH_* env missing' });

  try {
    const token = await getOAuthToken();

    // Stable data edge: GSC lags ~3 days.
    const end = new Date(); end.setUTCDate(end.getUTCDate() - 3); end.setUTCHours(0, 0, 0, 0);
    const d = (n) => { const x = new Date(end); x.setUTCDate(x.getUTCDate() - n); return ymd(x); };
    const w7      = { startDate: d(6),  endDate: ymd(end) };
    const wPrev7  = { startDate: d(13), endDate: d(7) };
    const w28     = { startDate: d(27), endDate: ymd(end) };
    const w35     = { startDate: d(34), endDate: ymd(end) };

    const [cur, prev, series, topQ, topP, guides] = await Promise.all([
      query(token, { ...w7, rowLimit: 1 }),
      query(token, { ...wPrev7, rowLimit: 1 }),
      query(token, { ...w35, dimensions: ['date'], rowLimit: 40 }),
      query(token, { ...w7, dimensions: ['query'], rowLimit: 25 }),
      query(token, { ...w7, dimensions: ['page'], rowLimit: 25 }),
      query(token, {
        ...w28, dimensions: ['page'], rowLimit: 30,
        dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'contains', expression: '/guides/' }] }],
      }),
    ]);

    const row = {
      run_date: ymd(new Date()),
      totals_7d:     { ...totals(cur),  window: w7 },
      totals_prev7d: { ...totals(prev), window: wPrev7 },
      daily_series:  series.map((r) => ({ date: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: +r.position.toFixed(1) })),
      top_queries_7d: slim(topQ, 'query'),
      top_pages_7d:   slim(topP, 'page'),
      guides_28d:     slim(guides, 'page'),
      fetched_at: new Date().toISOString(),
    };

    const ins = await fetch(`${SUPABASE_URL}/rest/v1/search_snapshots?on_conflict=run_date`, {
      method: 'POST',
      headers: {
        apikey: SERVICE, Authorization: `Bearer ${SERVICE}`,
        'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(row),
    });
    if (!ins.ok) throw new Error(`snapshot upsert failed: ${ins.status} ${(await ins.text()).slice(0, 200)}`);

    console.log(`[gsc-run] snapshot saved for ${row.run_date}: 7d clicks=${row.totals_7d.clicks} impr=${row.totals_7d.impressions}`);
    return res.status(200).json({ ok: true, run_date: row.run_date, totals_7d: row.totals_7d });
  } catch (e) {
    console.error('[gsc-run]', e.message);
    return res.status(200).json({ ok: false, error: e.message });
  }
};
