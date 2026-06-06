/**
 * GET/POST /api/agents/anomaly-watch — daily "something's unusual" detector.
 *
 * Compares today against the trailing 30 days and flags only clear, actionable
 * signals (thresholds are deliberately conservative for a low-volume shop so it
 * doesn't cry wolf): an unusually busy day, a cancellation spike, a product
 * selling unusually fast (restock cue), or a traffic spike. Posts ONE anomaly
 * card to the Approvals inbox only when something fires — silent otherwise.
 *
 * Auth matches the other cron workers (CRON_SECRET / INTERNAL_TASK_SECRET).
 */
const { proposeAction } = require('../../lib/agent-actions');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

function authorised(req) {
  const auth = req.headers['authorization'] || '';
  const internal = req.headers['x-internal-secret'] || '';
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (process.env.INTERNAL_TASK_SECRET && internal === process.env.INTERNAL_TASK_SECRET) return true;
  if (!process.env.CRON_SECRET && !process.env.INTERNAL_TASK_SECRET) return true;
  return false;
}
async function sbJson(p) { try { const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { headers: sbHeaders }); return r.ok ? await r.json() : []; } catch { return []; } }
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorized' });

  const now = new Date();
  const startToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const since30 = new Date(now.getTime() - 30 * 86400000);
  const flags = [];

  // ── Orders (last 30d) ──
  const orders = await sbJson(`orders?created_at=gte.${since30.toISOString()}&select=created_at,status,items`);
  const paid = (orders || []).filter((o) => ['paid', 'dispatched', 'delivered'].includes(o.status));
  const todayPaid = paid.filter((o) => new Date(o.created_at) >= startToday);
  const dailyAvg = paid.length / 30;

  // Unusually busy day
  if (todayPaid.length >= 5 && todayPaid.length >= 3 * Math.max(dailyAvg, 0.3)) {
    flags.push(`📈 Busy day: ${todayPaid.length} orders today vs a ~${dailyAvg.toFixed(1)}/day average.`);
  }
  // Cancellation spike
  const todayCancelled = (orders || []).filter((o) => o.status === 'cancelled' && new Date(o.created_at) >= startToday).length;
  if (todayCancelled >= 3) flags.push(`⚠️ ${todayCancelled} orders cancelled today — worth checking checkout/payments.`);

  // Fast-selling SKU (today's qty vs its 30-day daily average)
  const qtyAll = {}, qtyToday = {};
  for (const o of paid) {
    let items = o.items; if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
    const today = new Date(o.created_at) >= startToday;
    for (const it of (Array.isArray(items) ? items : [])) {
      const k = it.name || it.slug || 'item'; const q = n(it.qty || it.quantity || 1);
      qtyAll[k] = (qtyAll[k] || 0) + q;
      if (today) qtyToday[k] = (qtyToday[k] || 0) + q;
    }
  }
  for (const k of Object.keys(qtyToday)) {
    const avg = (qtyAll[k] || 0) / 30;
    if (qtyToday[k] >= 5 && qtyToday[k] >= 3 * Math.max(avg, 0.2)) {
      flags.push(`🔥 ${k}: ${qtyToday[k]} sold today (avg ~${avg.toFixed(1)}/day) — consider restocking.`);
    }
  }

  // ── Traffic spike (visits, last 14d) ──
  try {
    const visits = await sbJson(`visits?created_at=gte.${new Date(now.getTime() - 14 * 86400000).toISOString()}&select=sid,created_at`);
    const byDay = {};
    for (const v of (visits || [])) { const d = String(v.created_at).slice(0, 10); (byDay[d] = byDay[d] || new Set()).add(v.sid); }
    const today = byDay[now.toISOString().slice(0, 10)] ? byDay[now.toISOString().slice(0, 10)].size : 0;
    const days = Object.keys(byDay).filter((d) => d !== now.toISOString().slice(0, 10));
    const avg = days.length ? days.reduce((s, d) => s + byDay[d].size, 0) / days.length : 0;
    if (today >= 100 && today >= 3 * Math.max(avg, 10)) {
      flags.push(`🚀 Traffic spike: ${today} visitors today vs ~${Math.round(avg)}/day average. Capitalise while it's hot.`);
    }
  } catch (e) { /* visits optional */ }

  if (flags.length) {
    await proposeAction({
      agent: 'anomaly-watch',
      type: 'anomaly',
      title: `Heads up: ${flags.length} unusual signal${flags.length === 1 ? '' : 's'} today`,
      summary: flags.join(' '),
      payload: { body: 'Anomaly watch spotted:\n\n' + flags.map((f) => '• ' + f).join('\n') },
      notify: true,
      notifyTitle: 'Velox anomaly watch',
    });
  }

  return res.status(200).json({ ok: true, flags });
};
