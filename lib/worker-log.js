/**
 * lib/worker-log.js — record a cron/worker run so the admin health panel can
 * show last-run time, status and summary for each background worker.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function recordRun(worker, ok, summary) {
  if (!SUPABASE_URL || !SERVICE) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/worker_runs`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ worker, ok: !!ok, summary: summary || {} }),
    });
  } catch (e) { console.error('[worker-log]', e.message); }
}

module.exports = { recordRun };
