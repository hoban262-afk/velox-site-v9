/**
 * GET/POST /api/recovery/reorder-run — reorder/replenishment cron worker
 *
 * Once a day, finds paid/dispatched orders that were placed in the reorder
 * window (28–60 days ago) and haven't had a reminder yet, then sends one
 * reorder email and stamps reorder_email_sent_at so it's never repeated.
 *
 * Skips a customer who already placed a newer order (they've effectively
 * already reordered). Auth + suppression match api/recovery/run.js.
 */

const { Resend } = require('resend');
const crypto = require('crypto');
const { REORDER_WINDOW, buildReorderEmail } = require('../../lib/reorder-email');

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

// Has this customer placed any order newer than the candidate? If so they've
// likely already reordered — skip the nudge.
async function hasNewerOrder(email, afterIso) {
  try {
    const rows = await sbGet(
      `orders?customer_email=eq.${encodeURIComponent(email)}` +
      `&created_at=gt.${encodeURIComponent(afterIso)}` +
      `&status=in.(paid,dispatched,pending)&select=id&limit=1`
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch { return false; }
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Supabase not configured' });
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorised' });
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Resend not configured' });
  const resend = new Resend(apiKey);

  const summary = { scanned: 0, sent: 0, skipped_newer: 0, skipped_unsub: 0, errors: 0 };

  const now = Date.now();
  const newest = new Date(now - REORDER_WINDOW.minDays * 864e5).toISOString(); // <= 28 days old
  const oldest = new Date(now - REORDER_WINDOW.maxDays * 864e5).toISOString(); // >= 60 days old

  let candidates = [];
  try {
    candidates = await sbGet(
      'orders?status=in.(paid,dispatched)' +
      `&created_at=lte.${encodeURIComponent(newest)}&created_at=gte.${encodeURIComponent(oldest)}` +
      '&reorder_email_sent_at=is.null' +
      '&select=id,created_at,customer_name,customer_email,items&order=created_at.asc&limit=200'
    );
  } catch (e) {
    console.error('[reorder-run] query failed:', e.message);
    return res.status(500).json({ error: 'Query failed', detail: e.message });
  }

  for (const order of candidates) {
    if (summary.sent >= MAX_PER_RUN) break;
    summary.scanned++;
    if (!order.customer_email) continue;

    const stamp = () => sbPatch(`orders?id=eq.${encodeURIComponent(order.id)}`, { reorder_email_sent_at: new Date().toISOString() }).catch(() => {});

    if (await hasNewerOrder(order.customer_email, order.created_at)) { summary.skipped_newer++; await stamp(); continue; }
    if (await isUnsubscribed(order.customer_email))                 { summary.skipped_unsub++; await stamp(); continue; }

    const links = {
      reorderUrl:     `${SITE}/api/recovery/reorder?token=${encodeURIComponent(signReorderToken(order.id))}`,
      unsubscribeUrl: `${SITE}/api/newsletter/unsubscribe?token=${encodeURIComponent(signEmailToken(order.customer_email))}`,
    };

    let email;
    try { email = buildReorderEmail(order, links); }
    catch (e) { console.error('[reorder-run] build failed', order.id, e.message); summary.errors++; continue; }

    try {
      await resend.emails.send({ from: 'Velox Peptides <newsletter@veloxpeps.com>', to: order.customer_email, subject: email.subject, html: email.html });
      await stamp();
      summary.sent++;
      console.log(`[reorder-run] order ${order.id} -> ${order.customer_email}`);
    } catch (e) {
      console.error('[reorder-run] send failed', order.id, e.message);
      summary.errors++;
    }
  }

  console.log('[reorder-run] done', JSON.stringify(summary));
  return res.status(200).json({ ok: true, ...summary });
};
