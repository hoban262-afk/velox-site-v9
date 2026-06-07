/**
 * GET/POST /api/agents/health-monitor — uptime + database health watchdog.
 *
 * Every few minutes it checks the two things that mean "the shop is broken":
 *   1. the website responds, and
 *   2. the database is reachable.
 * On a state CHANGE (healthy→down or down→recovered) it fires a phone push +
 * WhatsApp and posts a card to the Approvals inbox. It de-dupes via monitor_state
 * so a sustained outage doesn't spam you every run.
 *
 * The push/WhatsApp alerts are sent DIRECTLY (not via the DB), so you're still
 * notified even when the database itself is the thing that's down.
 *
 * Auth matches the other cron workers (CRON_SECRET / INTERNAL_TASK_SECRET).
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE         = process.env.NEXT_PUBLIC_SITE_URL || 'https://veloxpeps.com';
const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

let sendPush = null, sendWhatsApp = null;
try { ({ sendPush } = require('../../lib/notify-push')); } catch (e) {}
try { ({ sendWhatsApp } = require('../../lib/notify-whatsapp')); } catch (e) {}
let proposeAction = null;
try { ({ proposeAction } = require('../../lib/agent-actions')); } catch (e) {}

function authorised(req) {
  const auth = req.headers['authorization'] || '';
  const internal = req.headers['x-internal-secret'] || '';
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (process.env.INTERNAL_TASK_SECRET && internal === process.env.INTERNAL_TASK_SECRET) return true;
  if (!process.env.CRON_SECRET && !process.env.INTERNAL_TASK_SECRET) return false; // fail closed
  return false;
}

async function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

async function checkSite() {
  try { const r = await withTimeout(fetch(SITE, { method: 'GET' }), 8000); return r.ok; }
  catch { return false; }
}
async function checkDb() {
  try { const r = await withTimeout(fetch(`${SUPABASE_URL}/rest/v1/orders?select=id&limit=1`, { headers: sbHeaders }), 8000); return r.ok; }
  catch { return false; }
}

async function loadState() {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/monitor_state?key=eq.system&select=*&limit=1`, { headers: sbHeaders });
    const rows = r.ok ? await r.json() : [];
    return Array.isArray(rows) ? rows[0] : null;
  } catch { return undefined; } // undefined = couldn't read (DB likely down)
}
async function saveState(status, detail) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/monitor_state?on_conflict=key`, {
      method: 'POST', headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ key: 'system', status, detail: detail || null, since: new Date().toISOString(), last_alert_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
    });
  } catch (e) { /* best-effort */ }
}

async function alert(title, body, url) {
  try { if (sendPush) await sendPush({ title, body, url: url || `${SITE}/admin/` }); } catch (e) {}
  try { if (sendWhatsApp) await sendWhatsApp(`${title}\n${body}`); } catch (e) {}
  try { if (proposeAction) await proposeAction({ agent: 'health-monitor', type: 'anomaly', title, summary: body, payload: { body }, notify: false, notifyTitle: 'Velox system alert' }); } catch (e) {}
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorized' });

  const [siteOk, dbOk] = await Promise.all([checkSite(), checkDb()]);
  const failures = [];
  if (!siteOk) failures.push('website');
  if (!dbOk) failures.push('database');
  const status = failures.length ? 'down' : 'up';
  const detail = failures.join(' + ');

  const prev = await loadState();
  const prevStatus = prev === undefined ? null : (prev ? prev.status : 'up');

  if (status === 'down') {
    if (prevStatus !== 'down') {
      await alert('⚠️ Velox is DOWN', `${detail || 'systems'} not responding. Check Vercel & Supabase.`);
      if (dbOk) await saveState('down', detail); // can only persist if DB is up
    }
  } else if (prevStatus === 'down') {
    await alert('✅ Velox recovered', 'Website and database are responding normally again.');
    await saveState('up', null);
  } else if (prev === null && dbOk) {
    await saveState('up', null); // seed first run
  }

  return res.status(200).json({ ok: true, siteOk, dbOk, status, alerted: status === 'down' ? prevStatus !== 'down' : prevStatus === 'down' });
};
