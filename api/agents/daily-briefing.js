/**
 * GET/POST /api/agents/daily-briefing — your morning shop summary, to your phone.
 *
 * Each morning it computes yesterday's + this-week's takings from real orders and
 * what needs you today (orders to pack, low stock, approvals waiting), and posts a
 * plain-English "briefing" card to the Approvals inbox + a phone push.
 *
 * No AI, no external dependency — pure arithmetic over your orders. Acknowledge-only.
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
  if (!process.env.CRON_SECRET && !process.env.INTERNAL_TASK_SECRET) return false; // fail closed
  return false;
}

async function sbJson(path) {
  try { const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders }); return r.ok ? await r.json() : []; }
  catch { return []; }
}
const gbp = (n) => '£' + (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorized' });

  const now = new Date();
  const startToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startYesterday = new Date(startToday.getTime() - 86400000);
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  const [recent, awaiting, lows, pending] = await Promise.all([
    sbJson(`orders?status=in.(paid,dispatched,delivered)&created_at=gte.${weekAgo.toISOString()}&select=created_at,total`),
    sbJson(`orders?status=eq.paid&dispatched_at=is.null&select=id`),
    sbJson(`product_variants?low_stock=eq.true&select=slug`),
    sbJson(`agent_actions?status=eq.pending&select=id`),
  ]);

  let yOrders = 0, yRev = 0, wOrders = 0, wRev = 0;
  for (const o of (recent || [])) {
    const t = new Date(o.created_at).getTime();
    wOrders++; wRev += n(o.total);
    if (t >= startYesterday.getTime() && t < startToday.getTime()) { yOrders++; yRev += n(o.total); }
  }
  const toPack = (awaiting || []).length;
  const lowCount = (lows || []).length;
  const pend = (pending || []).length;

  const dateStr = startToday.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  const needs = [];
  if (toPack) needs.push(`• ${toPack} order${toPack === 1 ? '' : 's'} paid and waiting to be packed.`);
  if (lowCount) needs.push(`• ${lowCount} product${lowCount === 1 ? '' : 's'} low on stock (reorder cards in Approvals).`);
  if (pend) needs.push(`• ${pend} item${pend === 1 ? '' : 's'} waiting for your approval.`);

  const body =
`Good morning. Here's Velox for ${dateStr}:

Yesterday: ${yOrders} order${yOrders === 1 ? '' : 's'}, ${gbp(yRev)} taken.
Last 7 days: ${wOrders} order${wOrders === 1 ? '' : 's'}, ${gbp(wRev)} taken.

${needs.length ? 'Needs you today:\n' + needs.join('\n') : 'Nothing needs you right now — all caught up. 🎉'}`;

  await proposeAction({
    agent: 'daily-briefing',
    type: 'briefing',
    title: `Morning briefing — ${yOrders} order${yOrders === 1 ? '' : 's'} yesterday, ${gbp(yRev)}`,
    summary: needs.length ? needs.join(' ') : 'All caught up.',
    payload: { body, yesterday_orders: yOrders, yesterday_revenue: yRev, week_orders: wOrders, week_revenue: wRev, to_pack: toPack, low_stock: lowCount, pending_approvals: pend },
    notify: true,
    notifyTitle: 'Velox morning briefing',
  });

  return res.status(200).json({ ok: true, yOrders, yRev, wOrders, wRev, toPack, lowCount, pend });
};
