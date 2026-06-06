/**
 * GET/POST /api/agents/run-approved — executes PRE-APPROVED approval-inbox actions.
 *
 * Most cards are executed the instant you tap Approve (api/admin/action). But an
 * automation can also queue an action that should run WITHOUT a human tap — by
 * inserting it with status='approved'. The support-triage task does this for
 * "where's my order?" replies, which you chose to auto-send.
 *
 * This cron picks up any status='approved' rows, runs the executor, and marks
 * them executed/failed. Idempotent via the status filter; claims each row before
 * sending so overlapping runs can't double-send.
 *
 * Auth matches the other cron workers (CRON_SECRET / INTERNAL_TASK_SECRET).
 */
const executors = require('../../lib/action-executors');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

function authorised(req) {
  const auth = req.headers['authorization'] || '';
  const internal = req.headers['x-internal-secret'] || '';
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (process.env.INTERNAL_TASK_SECRET && internal === process.env.INTERNAL_TASK_SECRET) return true;
  if (!process.env.CRON_SECRET && !process.env.INTERNAL_TASK_SECRET) return true;
  return false;
}

async function patch(id, fields) {
  return fetch(`${SUPABASE_URL}/rest/v1/agent_actions?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(fields),
  });
}

// Atomically move one row approved -> executing. Returns true only if THIS call
// won the row (so overlapping cron runs can never double-send).
async function claim(id) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/agent_actions?id=eq.${encodeURIComponent(id)}&status=eq.approved`,
    { method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=representation' }, body: JSON.stringify({ status: 'executing' }) }
  );
  if (!r.ok) return false;
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorized' });

  let rows = [];
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/agent_actions?status=eq.approved&select=*&order=created_at.asc&limit=50`,
      { headers: sbHeaders }
    );
    rows = r.ok ? await r.json() : [];
  } catch (e) { return res.status(502).json({ error: 'Fetch failed' }); }

  let executed = 0, failed = 0;
  for (const a of rows) {
    // Claim the row first (approved -> executing) so a concurrent run skips it.
    let claim;
    try {
      claim = await patch(`${a.id}&status=eq.approved`, { status: 'executing' });
    } catch (e) { continue; }
    const claimed = claim && claim.ok ? await claim.json().catch(() => []) : [];
    if (!Array.isArray(claimed) || !claimed.length) continue; // someone else got it

    const exec = await executors.run(a.type, a.payload || {});
    await patch(a.id, {
      status: exec.ok ? 'executed' : 'failed',
      reviewed_by: 'auto',
      reviewed_at: new Date().toISOString(),
      result: exec.result || {},
    });
    if (exec.ok) executed++; else failed++;
  }

  return res.status(200).json({ ok: true, picked: rows.length, executed, failed });
};
