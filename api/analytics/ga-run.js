/**
 * GET/POST /api/analytics/ga-run — pull GA4 daily metrics into analytics_daily.
 *
 * Runs daily via Vercel Cron (see vercel.json). Auth: Bearer $CRON_SECRET, or
 * x-internal-secret: $INTERNAL_TASK_SECRET. Fail-safe — never throws on the cron.
 *
 * Env (one-time Google setup — see admin Settings note):
 *   GA4_PROPERTY_ID   numeric GA4 property id (e.g. 123456789)
 *   GA_CLIENT_EMAIL   service-account email (…@…iam.gserviceaccount.com)
 *   GA_PRIVATE_KEY    service-account private key (PEM; \n escaped is fine)
 */
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;

function authorised(req) {
  const auth = req.headers['authorization'] || '';
  const internal = req.headers['x-internal-secret'] || '';
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (process.env.INTERNAL_TASK_SECRET && internal === process.env.INTERNAL_TASK_SECRET) return true;
  return false;
}

function b64url(obj) { return Buffer.from(JSON.stringify(obj)).toString('base64url'); }

async function getAccessToken() {
  const clientEmail = process.env.GA_CLIENT_EMAIL;
  const privateKey = (process.env.GA_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!clientEmail || !privateKey) throw new Error('GA_CLIENT_EMAIL / GA_PRIVATE_KEY not set');
  const now = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: 'RS256', typ: 'JWT' });
  const claim = b64url({
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  });
  const signingInput = `${header}.${claim}`;
  const sig = crypto.createSign('RSA-SHA256').update(signingInput).sign(privateKey).toString('base64url');
  const jwt = `${signingInput}.${sig}`;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }).toString(),
  });
  const d = await r.json();
  if (!r.ok || !d.access_token) throw new Error('Token exchange failed: ' + JSON.stringify(d).slice(0, 200));
  return d.access_token;
}

module.exports = async function handler(req, res) {
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId) return res.status(500).json({ error: 'GA4_PROPERTY_ID not set' });

  try {
    const token = await getAccessToken();
    const rr = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'date' }],
        metrics: [
          { name: 'sessions' }, { name: 'activeUsers' }, { name: 'newUsers' },
          { name: 'screenPageViews' }, { name: 'conversions' },
        ],
        orderBys: [{ dimension: { dimensionName: 'date' } }],
        limit: 60,
      }),
    });
    const rep = await rr.json();
    if (!rr.ok) return res.status(502).json({ error: 'GA report failed', detail: JSON.stringify(rep).slice(0, 300) });

    const rows = (rep.rows || []).map((row) => {
      const d = row.dimensionValues[0].value; // YYYYMMDD
      const m = row.metricValues.map((x) => Number(x.value) || 0);
      return {
        date: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
        sessions: m[0], active_users: m[1], new_users: m[2], pageviews: m[3], conversions: m[4],
        updated_at: new Date().toISOString(),
      };
    });
    if (!rows.length) return res.status(200).json({ ok: true, rows: 0, note: 'GA returned no rows' });

    const up = await fetch(`${SUPABASE_URL}/rest/v1/analytics_daily?on_conflict=date`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows),
    });
    if (!up.ok) return res.status(502).json({ error: 'Upsert failed', detail: (await up.text()).slice(0, 200) });
    return res.status(200).json({ ok: true, rows: rows.length });
  } catch (e) {
    console.error('[ga-run]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
