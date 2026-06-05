/**
 * GET /api/admin/live — ADMIN ONLY — count of devices active on the site right now.
 * "Live" = a presence heartbeat in the last 90 seconds.
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
  try {
    const cutoff = new Date(Date.now() - 90 * 1000).toISOString();
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/site_presence?last_seen=gte.${encodeURIComponent(cutoff)}&select=sid`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, Prefer: 'count=exact', Range: '0-0' } }
    );
    const cr = r.headers.get('content-range') || '*/0';
    const live = parseInt(cr.split('/')[1], 10) || 0;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ live });
  } catch (e) {
    console.error('[admin/live]', e.message);
    return res.status(500).json({ error: 'Live query failed' });
  }
};
