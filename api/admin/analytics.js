/**
 * GET /api/admin/analytics — ADMIN ONLY — return stored GA4 daily metrics (last 30 days).
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

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'Unauthorized' });
  const sb = (path) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
  try {
    // Prefer Google Analytics if it's ever connected; otherwise use first-party visit data.
    let rows = [];
    let source = 'first-party';
    const ga = await sb('analytics_daily?select=date,sessions,active_users,new_users,pageviews,conversions&order=date.asc');
    const gaRows = ga.ok ? await ga.json() : [];
    if (gaRows.length) { rows = gaRows; source = 'ga'; }
    else {
      const fp = await sb('analytics_visits_daily?select=date,sessions,pageviews&order=date.asc');
      rows = fp.ok ? await fp.json() : [];
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ rows, connected: rows.length > 0, source });
  } catch (e) {
    console.error('[admin/analytics]', e.message);
    return res.status(500).json({ error: 'Analytics query failed' });
  }
};
