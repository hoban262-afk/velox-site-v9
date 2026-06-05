/**
 * GET /api/admin/seo — ADMIN ONLY
 *
 * Live Google Search Console data for the admin SEO tab. Authenticates with a
 * Google service account (no external libraries — the JWT is signed with Node's
 * built-in crypto), then queries the Search Analytics API.
 *
 * Required Vercel env vars (see SETUP notes given by Claude):
 *   GSC_SA_EMAIL        the service-account email (…@….iam.gserviceaccount.com)
 *   GSC_SA_PRIVATE_KEY  the service-account private key (PEM). Paste it whole;
 *                       literal "\n" sequences are converted to real newlines.
 *   GSC_SITE            optional — defaults to "sc-domain:veloxpeps.com"
 *
 * The service account must be added as a user of the property in Search Console.
 * Read-only. Results cached 10 min at the edge to stay well within GSC quota.
 */
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON         = process.env.SUPABASE_ANON_KEY;

const SA_EMAIL = process.env.GSC_SA_EMAIL;
const SA_KEY   = (process.env.GSC_SA_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const SITE     = process.env.GSC_SITE || 'sc-domain:veloxpeps.com';

// OAuth user credentials (preferred — works even when service-account keys are
// blocked by an org policy). Set these three in Vercel to use OAuth.
const OAUTH_CLIENT_ID     = process.env.GSC_OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.GSC_OAUTH_CLIENT_SECRET;
const OAUTH_REFRESH_TOKEN = process.env.GSC_OAUTH_REFRESH_TOKEN;
const HAS_OAUTH = !!(OAUTH_CLIENT_ID && OAUTH_CLIENT_SECRET && OAUTH_REFRESH_TOKEN);
const HAS_SA    = !!(SA_EMAIL && SA_KEY);

// Exchange a stored refresh token for a short-lived access token.
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

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

// Mint a Google OAuth access token from the service account (scope: GSC read-only).
async function getAccessToken() {
  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim  = b64url(JSON.stringify({
    iss: SA_EMAIL,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: iat + 3600,
    iat,
  }));
  const signingInput = `${header}.${claim}`;
  const signature = b64url(crypto.createSign('RSA-SHA256').update(signingInput).sign(SA_KEY));
  const assertion = `${signingInput}.${signature}`;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error_description || d.error || 'token request failed');
  return d.access_token;
}

const ymd = (d) => new Date(d).toISOString().slice(0, 10);

// Resolve the requested period into a date window + a matching comparison window.
// Supported ?range=  1m | 3m | quarter | year | 28d   and  ?range=month&month=YYYY-MM
function windowFor(q) {
  q = q || {};
  const now = new Date();
  // GSC data lags ~3 days; end the window there so totals are stable.
  let end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  end.setUTCDate(end.getUTCDate() - 3);
  const key = String(q.range || '1m').toLowerCase();

  // A specific calendar month.
  if (key === 'month' && /^\d{4}-\d{2}$/.test(q.month || '')) {
    const [y, m] = q.month.split('-').map(Number);
    const s = new Date(Date.UTC(y, m - 1, 1));
    let e = new Date(Date.UTC(y, m, 0));               // last day of that month
    if (e > end) e = end;                              // cap the current month at the data edge
    const ps = new Date(Date.UTC(y, m - 2, 1));        // previous calendar month
    const pe = new Date(Date.UTC(y, m - 1, 0));
    return { range: { startDate: ymd(s), endDate: ymd(e) }, prevRange: { startDate: ymd(ps), endDate: ymd(pe) }, label: q.month };
  }

  // Current calendar quarter to date, compared to the previous full quarter.
  if (key === 'quarter') {
    const y = end.getUTCFullYear();
    const qi = Math.floor(end.getUTCMonth() / 3);
    const s = new Date(Date.UTC(y, qi * 3, 1));
    const ps = new Date(Date.UTC(y, qi * 3 - 3, 1));
    const pe = new Date(Date.UTC(y, qi * 3, 0));
    return { range: { startDate: ymd(s), endDate: ymd(end) }, prevRange: { startDate: ymd(ps), endDate: ymd(pe) }, label: 'quarter' };
  }

  // Rolling-day ranges: previous window is the equal-length span immediately before.
  const days = key === '7d' || key === '1w' ? 7 : key === '3m' ? 90 : key === 'year' ? 365 : key === '28d' ? 28 : 30;
  const s = new Date(end);  s.setUTCDate(s.getUTCDate() - (days - 1));
  const pe = new Date(s);   pe.setUTCDate(pe.getUTCDate() - 1);
  const ps = new Date(pe);  ps.setUTCDate(ps.getUTCDate() - (days - 1));
  return { range: { startDate: ymd(s), endDate: ymd(end) }, prevRange: { startDate: ymd(ps), endDate: ymd(pe) }, label: key };
}

async function query(token, body) {
  const r = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  const d = await r.json();
  if (!r.ok) throw new Error((d.error && d.error.message) || 'searchAnalytics failed');
  return d.rows || [];
}

function sumTotals(rows) {
  const t = { clicks: 0, impressions: 0, position: 0 };
  if (!rows.length) return { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  let posW = 0;
  for (const r of rows) {
    t.clicks += r.clicks || 0;
    t.impressions += r.impressions || 0;
    posW += (r.position || 0) * (r.impressions || 0);
  }
  return {
    clicks: t.clicks,
    impressions: t.impressions,
    ctr: t.impressions ? t.clicks / t.impressions : 0,
    position: t.impressions ? posW / t.impressions : 0,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'Unauthorized' });
  if (!HAS_OAUTH && !HAS_SA) {
    return res.status(200).json({ configured: false, site: SITE });
  }

  try {
    const token = HAS_OAUTH ? await getOAuthToken() : await getAccessToken();

    const win = windowFor(req.query || {});
    const range = win.range, prevRange = win.prevRange;

    const [totalRows, prevRows, queryRows, pageRows, dayRows] = await Promise.all([
      query(token, { ...range, dimensions: [], rowLimit: 1 }),
      query(token, { ...prevRange, dimensions: [], rowLimit: 1 }),
      query(token, { ...range, dimensions: ['query'], rowLimit: 20 }),
      query(token, { ...range, dimensions: ['page'],  rowLimit: 20 }),
      query(token, { ...range, dimensions: ['date'],  rowLimit: 400 }),
    ]);

    const totals = sumTotals(totalRows);
    const prev   = sumTotals(prevRows);

    const queries = queryRows.map((r) => ({
      query: r.keys[0], clicks: r.clicks || 0, impressions: r.impressions || 0,
      ctr: r.ctr || 0, position: r.position || 0,
    }));
    const pages = pageRows.map((r) => ({
      page: r.keys[0], clicks: r.clicks || 0, impressions: r.impressions || 0,
      ctr: r.ctr || 0, position: r.position || 0,
    }));
    const daily = dayRows.map((r) => ({
      date: r.keys[0], clicks: r.clicks || 0, impressions: r.impressions || 0,
    }));

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=1800');
    return res.status(200).json({
      configured: true, site: SITE, range, prevRange, label: win.label,
      totals, prev, queries, pages, daily,
    });
  } catch (e) {
    console.error('[admin/seo]', e.message);
    return res.status(200).json({ configured: true, error: e.message, site: SITE });
  }
};
