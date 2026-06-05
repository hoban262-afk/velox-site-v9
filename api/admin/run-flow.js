/**
 * POST /api/admin/run-flow — ADMIN ONLY. Manually fire a marketing/recovery
 * worker on demand (so you can test without waiting for the cron).
 *
 * Body: { flow: 'welcome'|'restock'|'abandoned'|'reorder'|'review' }
 * Runs the worker in-process with the cron secret and returns its summary.
 *
 * NOTE: these are the LIVE workers — they can send real emails. 'restock' is the
 * safe one to try first (its first run only seeds the stock snapshot).
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON         = process.env.SUPABASE_ANON_KEY;

const KNOWN_ADMIN_EMAILS = new Set([
  (process.env.ADMIN_EMAIL || '').toLowerCase(),
  'support@veloxpeps.com', 'veloxpeps@gmail.com',
].filter(Boolean));

// Static requires (literal paths) so Vercel's dependency tracer bundles every
// worker file into this function. A dynamic require(variable) is invisible to
// the bundler and fails at runtime with "Cannot find module".
const WORKERS = {
  welcome:   require('../recovery/welcome-run'),
  restock:   require('../recovery/restock-run'),
  abandoned: require('../recovery/run'),
  reorder:   require('../recovery/reorder-run'),
  review:    require('../recovery/review-run'),
};

async function isAdmin(req) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token || !SUPABASE_URL) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: ANON || SERVICE || '' } });
    if (!r.ok) return false;
    const u = await r.json();
    return !!u && KNOWN_ADMIN_EMAILS.has((u.email || '').toLowerCase());
  } catch { return false; }
}

// Build a request the worker's authorised() guard will accept.
function workerReq() {
  const headers = {};
  if (process.env.INTERNAL_TASK_SECRET) headers['x-internal-secret'] = process.env.INTERNAL_TASK_SECRET;
  else if (process.env.CRON_SECRET) headers['authorization'] = `Bearer ${process.env.CRON_SECRET}`;
  return { method: 'POST', headers, query: {}, body: {} };
}
// Minimal res mock that captures the worker's JSON output.
function captureRes() {
  const r = { _status: 200, _json: null, statusCode: 200 };
  r.status = (c) => { r._status = c; r.statusCode = c; return r; };
  r.json = (o) => { r._json = o; return r; };
  r.send = (o) => { r._json = o; return r; };
  r.end = () => r;
  r.setHeader = () => {};
  r.writeHead = () => r;
  return r;
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  const flow = String((req.body || {}).flow || '').trim();
  const worker = WORKERS[flow];
  if (!worker) return res.status(400).json({ error: 'Unknown flow' });
  if (!process.env.CRON_SECRET && !process.env.INTERNAL_TASK_SECRET) {
    return res.status(400).json({ error: 'No CRON_SECRET or INTERNAL_TASK_SECRET set in Vercel — cannot trigger workers.' });
  }

  try {
    const fres = captureRes();
    await worker(workerReq(), fres);
    return res.status(200).json({ ok: fres._status < 400, flow, status: fres._status, result: fres._json });
  } catch (e) {
    console.error('[admin/run-flow]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
