/**
 * /api/admin/action — ADMIN ONLY. The "Approve / Dismiss" handler for the
 * Approval Inbox (agent_actions).
 *
 *   POST { id, decision: 'approve' | 'dismiss' }
 *
 * On approve: load the row, run its typed executor (lib/action-executors), then
 * mark it 'executed' (or 'failed') and store the executor result on the row.
 * On dismiss: mark it 'dismissed'. No execution.
 *
 * Why server-side (not a client table update): executing an action needs the
 * service role + secrets (Resend, etc.). The admin UI used to flip the status
 * column directly, which could never actually *do* anything. This endpoint is
 * what makes Approve mean something.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON         = process.env.SUPABASE_ANON_KEY;
const executors    = require('../../lib/action-executors');

const KNOWN_ADMIN_EMAILS = new Set([
  (process.env.ADMIN_EMAIL || '').toLowerCase(),
  'support@veloxpeps.com', 'veloxpeps@gmail.com',
].filter(Boolean));

const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

async function adminEmail(req) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token || !SUPABASE_URL) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: ANON || SERVICE || '' },
    });
    if (!r.ok) return null;
    const u = await r.json();
    const email = (u && u.email || '').toLowerCase();
    return KNOWN_ADMIN_EMAILS.has(email) ? email : null;
  } catch { return null; }
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (req.method !== 'POST') return res.status(405).end();

  const who = await adminEmail(req);
  if (!who) return res.status(401).json({ error: 'Unauthorized' });

  const b = req.body || {};
  const id = String(b.id || '').trim();
  const decision = String(b.decision || '').trim().toLowerCase();
  if (!id) return res.status(400).json({ error: 'Missing id' });
  if (decision !== 'approve' && decision !== 'dismiss') return res.status(400).json({ error: 'decision must be approve or dismiss' });

  // Load the action.
  let action = null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/agent_actions?id=eq.${encodeURIComponent(id)}&select=*&limit=1`, { headers: sbHeaders });
    const rows = r.ok ? await r.json() : [];
    action = Array.isArray(rows) ? rows[0] : null;
  } catch (e) { return res.status(500).json({ error: 'Load failed' }); }
  if (!action) return res.status(404).json({ error: 'Action not found' });
  if (action.status !== 'pending') return res.status(409).json({ error: `Already ${action.status}` });

  const nowIso = new Date().toISOString();

  if (decision === 'dismiss') {
    await patch(id, { status: 'dismissed', reviewed_at: nowIso, reviewed_by: who });
    return res.status(200).json({ ok: true, status: 'dismissed' });
  }

  // approve → execute
  const exec = await executors.run(action.type, action.payload || {});
  const status = exec.ok ? 'executed' : 'failed';
  await patch(id, { status, reviewed_at: nowIso, reviewed_by: who, result: exec.result || {} });
  return res.status(200).json({ ok: exec.ok, status, result: exec.result || {} });
};

async function patch(id, fields) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/agent_actions?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(fields),
    });
  } catch (e) { console.error('[admin/action] patch failed', e.message); }
}
