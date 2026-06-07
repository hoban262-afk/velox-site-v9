/**
 * GET/POST /api/pack/sync — automatic Royal Mail despatch sync.
 *
 * For every paid order that has been pushed to Click & Drop but not yet
 * dispatched, this asks Click & Drop whether a label has been printed and a
 * tracking number assigned. When it has, the order is marked dispatched and the
 * customer's dispatch email fires automatically — so the packer only has to
 * print the label, nothing else.
 *
 * Trigger field: printedOn (label printed) with a trackingNumber. Falls back to
 * manifestedOn / shippedOn. Idempotent (only touches orders with dispatched_at
 * still null). Runs on a short cron in vercel.json.
 *
 * Auth matches the other cron workers (CRON_SECRET / INTERNAL_TASK_SECRET).
 */
const cd = require('../../lib/clickdrop');
const { markOrderDispatched } = require('../../lib/dispatch');

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

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!cd.configured()) return res.status(200).json({ ok: true, skipped: 'click-and-drop-not-configured' });

  // Paid, label pushed, not yet dispatched.
  let orders = [];
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?status=eq.paid&dispatched_at=is.null` +
      `&clickdrop_order_identifier=not.is.null&select=*&limit=200`,
      { headers: sbHeaders }
    );
    orders = r.ok ? await r.json() : [];
  } catch (e) {
    return res.status(502).json({ error: 'Fetch failed' });
  }
  if (!orders.length) return res.status(200).json({ ok: true, checked: 0, dispatched: 0 });

  // Look up live status in Click & Drop (batched by identifier).
  const ids = orders.map((o) => o.clickdrop_order_identifier).filter(Boolean);
  let info = [];
  try { info = await cd.getOrdersInfo(ids); } catch (e) { info = []; }
  const byId = {};
  for (const i of info) if (i && i.orderIdentifier != null) byId[String(i.orderIdentifier)] = i;

  let dispatched = 0;
  const results = [];
  for (const o of orders) {
    const live = byId[String(o.clickdrop_order_identifier)];
    if (!live) continue;
    const printed = live.printedOn || live.manifestedOn || live.shippedOn;
    const tracking = live.trackingNumber || '';
    // Only auto-dispatch once a label exists. Require a tracking number unless the
    // order is already manifested (handed to Royal Mail) to avoid premature emails.
    if (!printed) continue;
    if (!tracking && !live.manifestedOn) continue;

    const out = await markOrderDispatched(o, tracking, { source: 'royalmail-sync' });
    if (out.ok && !out.skipped) { dispatched++; results.push({ ref: o.notes, tracking, emailed: out.emailed }); }
  }

  return res.status(200).json({ ok: true, checked: orders.length, dispatched, results });
};
