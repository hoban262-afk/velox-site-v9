/**
 * GET/POST /api/recovery/reorder-run — cadence-driven restock cron
 *
 * Once a day, finds research-register cadences (from the Protocol Scheduler) whose
 * cycle-end is ~LEAD_DAYS away, confirms the customer actually PURCHASED that
 * compound (the order check), then sends one restock email carrying a bound,
 * single-use discount code and stamps the cadence so it's never repeated.
 *
 * Auth + suppression match api/recovery/run.js.
 */

const crypto = require('crypto');
const { sendMail } = require('../../lib/mail');
const { buildReorderEmail, REORDER_WINDOW } = require('../../lib/reorder-email');
const {
  cadenceDue, findPurchaseOrder, restockCodeFor,
  LEAD_DAYS, GRACE_DAYS, CODE_PCT, CODE_TTL_DAYS,
} = require('../../lib/restock');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE         = process.env.NEXT_PUBLIC_SITE_URL || 'https://veloxpeps.com';
const MAX_PER_RUN  = 50;

function authorised(req) {
  const auth = req.headers['authorization'] || '';
  const internal = req.headers['x-internal-secret'] || '';
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (process.env.INTERNAL_TASK_SECRET && internal === process.env.INTERNAL_TASK_SECRET) return true;
  return false;
}

const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders });
  if (!r.ok) throw new Error(`Supabase GET ${path} -> ${r.status}`);
  return r.json();
}
async function sbPatch(path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase PATCH ${path} -> ${r.status}`);
}

function signEmailToken(email) {
  const e = String(email).toLowerCase();
  const sig = crypto.createHmac('sha256', SERVICE).update(e).digest('hex').slice(0, 32);
  return `${Buffer.from(e, 'utf-8').toString('base64url')}.${sig}`;
}
function signReorderToken(orderId) {
  const id = String(orderId);
  const sig = crypto.createHmac('sha256', SERVICE).update(`reorder:${id}`).digest('hex').slice(0, 32);
  return `${Buffer.from(id, 'utf-8').toString('base64url')}.${sig}`;
}

async function isUnsubscribed(email) {
  const e = encodeURIComponent(String(email).toLowerCase());
  try {
    const [a, b] = await Promise.all([
      sbGet(`subscribers?email=eq.${e}&unsubscribed_at=not.is.null&select=email&limit=1`).catch(() => []),
      sbGet(`newsletter_codes?email=eq.${e}&unsubscribed_at=not.is.null&select=email&limit=1`).catch(() => []),
    ]);
    return (Array.isArray(a) && a.length) || (Array.isArray(b) && b.length);
  } catch { return false; }
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Supabase not configured' });
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorised' });
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'Resend not configured' });

  const summary = { scanned: 0, sent: 0, skipped_nopurchase: 0, skipped_unsub: 0, errors: 0 };

  // Order ids emailed in THIS run (either pass) so the purchase-based pass below
  // never double-touches an order the cadence pass already nudged today.
  const emailedThisRun = new Set();

  const now = Date.now();
  const upper = new Date(now + LEAD_DAYS * 864e5).toISOString();   // cycle-end at most LEAD_DAYS away
  const lower = new Date(now - GRACE_DAYS * 864e5).toISOString();  // and not more than GRACE_DAYS past

  let cadences = [];
  try {
    cadences = await sbGet(
      'research_cadence?nudge_sent_at=is.null' +
      `&cycle_end=lte.${encodeURIComponent(upper)}&cycle_end=gte.${encodeURIComponent(lower)}` +
      '&select=id,email,compound_key,compound_name,cycle_end&order=cycle_end.asc&limit=200'
    );
  } catch (e) {
    console.error('[reorder-run] query failed:', e.message);
    return res.status(500).json({ error: 'Query failed', detail: e.message });
  }

  for (const row of cadences) {
    if (summary.sent >= MAX_PER_RUN) break;
    summary.scanned++;
    if (!row.email || !cadenceDue(row, now)) continue;

    const stamp = (extra) => sbPatch(
      `research_cadence?id=eq.${encodeURIComponent(row.id)}`,
      Object.assign({ nudge_sent_at: new Date().toISOString() }, extra || {})
    ).catch(() => {});

    if (await isUnsubscribed(row.email)) { summary.skipped_unsub++; await stamp(); continue; }

    // ── ORDER CHECK ── only nudge for a compound they actually bought.
    let order = null;
    try { order = await findPurchaseOrder(row.email, row.compound_key); }
    catch (e) { summary.errors++; continue; }
    if (!order) { summary.skipped_nopurchase++; continue; }   // no stamp — they may buy within the window

    // The purchase-based pass may have already nudged this exact order on a prior
    // day. If so, stamp the cadence and skip so the customer isn't emailed twice.
    if (order.reorder_nudged_at) { await stamp(); continue; }

    let code = '';
    try { code = await restockCodeFor(order); }
    catch (e) { console.error('[reorder-run] code mint failed', row.id, e.message); summary.errors++; continue; }

    const links = {
      reorderUrl:     `${SITE}/api/recovery/reorder?token=${encodeURIComponent(signReorderToken(order.id))}`,
      unsubscribeUrl: `${SITE}/api/newsletter/unsubscribe?token=${encodeURIComponent(signEmailToken(row.email))}`,
    };

    let email;
    try { email = buildReorderEmail(order, links, { code: code, pct: CODE_PCT, expiresLabel: CODE_TTL_DAYS + ' days' }); }
    catch (e) { console.error('[reorder-run] build failed', row.id, e.message); summary.errors++; continue; }

    try {
      const sendRes = await sendMail({
        to: row.email, subject: email.subject, html: email.html,
        flow: 'reorder', orderId: order.id,
        headers: {
          'List-Unsubscribe': `<${links.unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });
      if (!sendRes.ok) { summary.errors++; continue; }
      await stamp({ code: code });
      // Mark the underlying order nudged too, so the purchase-based pass never
      // re-touches it on a later day (symmetric dedupe with that pass).
      await sbPatch(`orders?id=eq.${encodeURIComponent(order.id)}`, { reorder_nudged_at: new Date().toISOString() }).catch(() => {});
      emailedThisRun.add(order.id);
      summary.sent++;
      console.log(`[reorder-run] cadence ${row.id} (${row.compound_key}) -> ${row.email}`);
    } catch (e) {
      console.error('[reorder-run] send failed', row.id, e.message);
      summary.errors++;
    }
  }

  // ── Purchase-based pass ───────────────────────────────────────────────────────
  // The cadence pass above only reaches customers who entered a cycle in the
  // Protocol Scheduler (research_cadence). This pass nudges EVERY past buyer once,
  // ~REORDER_WINDOW after their order was DISPATCHED, whether or not they set a
  // cadence. It is deliberately code-LESS (current catalogue pricing, no discount)
  // so we don't train buyers to wait for a coupon — the incentive stays on the
  // opt-in cadence path. Exactly one nudge per order, ever (orders.reorder_nudged_at).
  const pSummary = { scanned: 0, sent: 0, skipped_reordered: 0, skipped_cadence: 0, skipped_unsub: 0, errors: 0 };
  try {
    const hi = new Date(now - REORDER_WINDOW.minDays * 864e5).toISOString(); // dispatched at least minDays ago
    const lo = new Date(now - REORDER_WINDOW.maxDays * 864e5).toISOString(); // but no more than maxDays ago
    const pOrders = await sbGet(
      'orders?status=eq.dispatched&reorder_nudged_at=is.null' +
      `&total=gt.0&dispatched_at=lte.${encodeURIComponent(hi)}&dispatched_at=gte.${encodeURIComponent(lo)}` +
      '&select=id,created_at,dispatched_at,customer_name,customer_email,items,total' +
      '&order=dispatched_at.asc&limit=200'
    );

    for (const order of pOrders) {
      if (pSummary.sent >= MAX_PER_RUN) break;
      pSummary.scanned++;
      if (!order.customer_email) continue;
      if (emailedThisRun.has(order.id)) continue; // cadence pass already emailed it this run

      const pStamp = () => sbPatch(
        `orders?id=eq.${encodeURIComponent(order.id)}`,
        { reorder_nudged_at: new Date().toISOString() }
      ).catch(() => {});

      // Already reordered? A newer paid/dispatched order for this email means the
      // customer came back on their own — don't nudge, just stamp so we skip it.
      try {
        const newer = await sbGet(
          `orders?customer_email=eq.${encodeURIComponent(String(order.customer_email).toLowerCase())}` +
          `&status=in.(paid,dispatched)&created_at=gt.${encodeURIComponent(order.dispatched_at)}` +
          '&select=id&limit=1'
        );
        if (Array.isArray(newer) && newer.length) { pSummary.skipped_reordered++; await pStamp(); continue; }
      } catch (e) { pSummary.errors++; continue; }

      // A recovery_code already bound to this order means the cadence path (or an
      // abandoned-cart stage 3) already offered this buyer a code — skip to avoid
      // a double touch, and stamp so we never reconsider it.
      try {
        const existingCode = await sbGet(`recovery_codes?order_id=eq.${encodeURIComponent(order.id)}&select=code&limit=1`);
        if (Array.isArray(existingCode) && existingCode.length) { pSummary.skipped_cadence++; await pStamp(); continue; }
      } catch { /* non-fatal — proceed to send */ }

      if (await isUnsubscribed(order.customer_email)) { pSummary.skipped_unsub++; await pStamp(); continue; }

      const links = {
        reorderUrl:     `${SITE}/api/recovery/reorder?token=${encodeURIComponent(signReorderToken(order.id))}`,
        unsubscribeUrl: `${SITE}/api/newsletter/unsubscribe?token=${encodeURIComponent(signEmailToken(order.customer_email))}`,
      };

      let email;
      try { email = buildReorderEmail(order, links, {}); } // code-less variant (no discount)
      catch (e) { console.error('[reorder-run] purchase build failed', order.id, e.message); pSummary.errors++; continue; }

      try {
        const sendRes = await sendMail({
          to: order.customer_email, subject: email.subject, html: email.html,
          flow: 'reorder', orderId: order.id,
          headers: {
            'List-Unsubscribe': `<${links.unsubscribeUrl}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        });
        if (!sendRes.ok) { pSummary.errors++; continue; }
        await pStamp();
        emailedThisRun.add(order.id);
        pSummary.sent++;
        console.log(`[reorder-run] purchase nudge order ${order.id} -> ${order.customer_email}`);
      } catch (e) {
        console.error('[reorder-run] purchase send failed', order.id, e.message);
        pSummary.errors++;
      }
    }
  } catch (e) {
    console.error('[reorder-run] purchase pass query failed:', e.message);
    pSummary.errors++;
  }
  summary.purchase = pSummary;

  console.log('[reorder-run] done', JSON.stringify(summary));
  return res.status(200).json({ ok: true, ...summary });
};
