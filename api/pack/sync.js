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
const { recordRun } = require('../../lib/worker-log');

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
  if (!cd.configured()) {
    await recordRun('dispatch-sync', false, { skipped: 'click-and-drop-not-configured' });
    return res.status(200).json({ ok: true, skipped: 'click-and-drop-not-configured' });
  }

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
    await recordRun('dispatch-sync', false, { phase: 'orders_query', error: e.message });
    return res.status(502).json({ error: 'Fetch failed' });
  }
  if (!orders.length) {
    await recordRun('dispatch-sync', true, { checked: 0, dispatched: 0 });
    return res.status(200).json({ ok: true, checked: 0, dispatched: 0 });
  }

  // Look up live status in Click & Drop (batched by identifier).
  const ids = orders.map((o) => o.clickdrop_order_identifier).filter(Boolean);
  let info = [];
  let cdError = null;
  try { info = await cd.getOrdersInfo(ids); } catch (e) { info = []; cdError = e.message; }
  const byId = {};
  for (const i of info) if (i && i.orderIdentifier != null) byId[String(i.orderIdentifier)] = i;

  // Diagnostics so a stalled dispatch pipeline is visible in worker_runs:
  //   no_live            = order pushed but Click & Drop returned no matching record
  //   printed_no_track   = label printed but skipped for want of a tracking number
  //   not_printed        = label not printed yet (correct to wait)
  // The `sample` array captures the raw live fields of the first few stuck orders
  // (Click & Drop status timestamps + tracking + the key names actually returned),
  // so a renamed/emptied field shows up immediately without guessing.
  const diag = { checked: orders.length, dispatched: 0, no_live: 0, printed_no_track: 0, not_printed: 0, cd_returned: info.length };
  if (cdError) diag.cd_error = String(cdError).slice(0, 200);
  const sample = [];
  let dispatched = 0;
  const results = [];
  for (const o of orders) {
    const live = byId[String(o.clickdrop_order_identifier)];
    if (!live) {
      diag.no_live++;
      if (sample.length < 6) sample.push({ ref: o.notes, reason: 'no_live', id: o.clickdrop_order_identifier });
      continue;
    }
    const printed = live.printedOn || live.manifestedOn || live.shippedOn;
    const tracking = live.trackingNumber || '';
    if (!printed) {
      diag.not_printed++;
      if (sample.length < 6) sample.push({ ref: o.notes, reason: 'not_printed', keys: Object.keys(live) });
      continue;
    }
    // Only auto-dispatch once a label exists. Require a tracking number unless the
    // order is already manifested (handed to Royal Mail) to avoid premature emails.
    if (!tracking && !live.manifestedOn) {
      diag.printed_no_track++;
      if (sample.length < 6) sample.push({
        ref: o.notes, reason: 'printed_no_track',
        printedOn: live.printedOn || null, manifestedOn: live.manifestedOn || null,
        shippedOn: live.shippedOn || null, trackingNumber: live.trackingNumber ?? null,
        keys: Object.keys(live),
      });
      continue;
    }

    const out = await markOrderDispatched(o, tracking, { source: 'royalmail-sync' });
    if (out.ok && !out.skipped) { dispatched++; results.push({ ref: o.notes, tracking, emailed: out.emailed }); }
  }

  diag.dispatched = dispatched;
  if (sample.length) diag.sample = sample;
  await recordRun('dispatch-sync', !cdError, diag);
  return res.status(200).json({ ok: true, ...diag, results });
};
