/**
 * POST /api/admin/redeploy — ADMIN ONLY
 *
 * Fires the Vercel Deploy Hook so the site rebuilds and scripts/sync-prices.mjs
 * bakes the latest product_variants prices into the static HTML. Called by the
 * admin Pricing tab (debounced) after a price save.
 *
 * Requires env: VERCEL_DEPLOY_HOOK_URL (Vercel → Settings → Git → Deploy Hooks).
 * Server-side rate-limit: at most one hook fire per 5 minutes — repeated saves
 * inside the window return ok:true, queued:false and rely on the earlier build
 * (which reads variants at build time, so it picks those edits up anyway).
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON         = process.env.SUPABASE_ANON_KEY;
const HOOK         = process.env.VERCEL_DEPLOY_HOOK_URL;

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

// Simple cross-invocation throttle via api_rate_limits (best-effort; if the
// table read fails we still fire — a spare deploy is harmless).
const WINDOW_MS = 5 * 60 * 1000;
const KEY = 'redeploy-hook';

async function throttled() {
  try {
    const h = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/api_rate_limits?bucket=eq.${KEY}&select=bucket,window_start`, { headers: h });
    const rows = r.ok ? await r.json() : [];
    const last = rows[0] && rows[0].window_start ? +new Date(rows[0].window_start) : 0;
    if (Date.now() - last < WINDOW_MS) return true;
    await fetch(`${SUPABASE_URL}/rest/v1/api_rate_limits?on_conflict=bucket`, {
      method: 'POST',
      headers: { ...h, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ bucket: KEY, count: 1, window_start: new Date().toISOString() }),
    });
    return false;
  } catch { return false; }
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'unauthorised' });
  if (!HOOK) return res.status(200).json({ ok: false, error: 'VERCEL_DEPLOY_HOOK_URL not configured' });

  if (await throttled()) return res.status(200).json({ ok: true, queued: false, note: 'recent deploy already in flight' });

  try {
    const r = await fetch(HOOK, { method: 'POST' });
    return res.status(200).json({ ok: r.ok, queued: r.ok });
  } catch (e) {
    return res.status(200).json({ ok: false, error: e.message });
  }
};
