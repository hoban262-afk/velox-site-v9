/**
 * POST /api/admin/push-subscribe — ADMIN ONLY — register a device for order push alerts.
 * Body: { subscription: { endpoint, keys: { p256dh, auth } }, label? }
 * DELETE /api/admin/push-subscribe — body { endpoint } — remove this device.
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

const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'Unauthorized' });

  const b = req.body || {};

  if (req.method === 'DELETE') {
    const ep = b.endpoint;
    if (!ep) return res.status(400).json({ error: 'Missing endpoint' });
    await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(ep)}`, {
      method: 'DELETE', headers: sbHeaders,
    });
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') return res.status(405).end();

  const sub = b.subscription || {};
  const endpoint = sub.endpoint;
  const p256dh = sub.keys && sub.keys.p256dh;
  const auth   = sub.keys && sub.keys.auth;
  if (!endpoint || !p256dh || !auth) return res.status(400).json({ error: 'Invalid subscription' });

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?on_conflict=endpoint`, {
      method: 'POST',
      headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ endpoint, p256dh, auth, label: (b.label || '').slice(0, 80) || null }),
    });
    if (!r.ok) return res.status(502).json({ error: 'Save failed', detail: (await r.text()).slice(0, 200) });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[push-subscribe]', e.message);
    return res.status(500).json({ error: 'Save failed' });
  }
};
