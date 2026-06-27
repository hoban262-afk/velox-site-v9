/**
 * POST /api/admin/push-test — ADMIN ONLY — send a test push to all subscribed devices.
 */
const { sendPush } = require('../../lib/notify-push');

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
  if (req.method !== 'POST') return res.status(405).end();
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const r = await sendPush({ title: 'Velox Admin — test alert', body: 'Push notifications are working. 🎉', url: '/admin/', category: 'test' });
    if (r && r.skipped) return res.status(500).json({ error: 'Push not configured (VAPID_PRIVATE_KEY missing on the server).' });
    return res.status(200).json({ ok: true, sent: (r && r.sent) || 0 });
  } catch (e) {
    console.error('[push-test]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
