/**
 * GET/POST /api/recovery/review-run — post-dispatch review-request cron worker
 *
 * Once a day, finds dispatched orders placed in the review window (10–40 days
 * ago) that haven't been asked for a review yet, and sends one review-request
 * email, then stamps review_request_sent_at so it's never repeated.
 *
 * Auth + unsubscribe suppression match the other recovery cron workers.
 */

const crypto = require('crypto');
const { sendMail } = require('../../lib/mail');
const { recordRun } = require('../../lib/worker-log');
const { REVIEW_WINDOW, buildReviewRequestEmail } = require('../../lib/review-request-email');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

  const summary = { scanned: 0, sent: 0, skipped_unsub: 0, errors: 0 };

  const now = Date.now();
  const newest = new Date(now - REVIEW_WINDOW.minDays * 864e5).toISOString(); // <= 10 days ago
  const oldest = new Date(now - REVIEW_WINDOW.maxDays * 864e5).toISOString(); // >= 40 days ago

  let candidates = [];
  try {
    candidates = await sbGet(
      'orders?status=eq.dispatched' +
      `&created_at=lte.${encodeURIComponent(newest)}&created_at=gte.${encodeURIComponent(oldest)}` +
      '&review_request_sent_at=is.null' +
      '&select=id,created_at,customer_name,customer_email,items&order=created_at.asc&limit=200'
    );
  } catch (e) {
    console.error('[review-run] query failed:', e.message);
    return res.status(500).json({ error: 'Query failed', detail: e.message });
  }

  for (const order of candidates) {
    if (summary.sent >= MAX_PER_RUN) break;
    summary.scanned++;
    if (!order.customer_email) continue;

    const stamp = () => sbPatch(`orders?id=eq.${encodeURIComponent(order.id)}`, { review_request_sent_at: new Date().toISOString() }).catch(() => {});

    if (await isUnsubscribed(order.customer_email)) { summary.skipped_unsub++; await stamp(); continue; }

    const links = { unsubscribeUrl: `https://veloxpeps.com/api/newsletter/unsubscribe?token=${encodeURIComponent(signEmailToken(order.customer_email))}` };

    let email;
    try { email = buildReviewRequestEmail(order, links); }
    catch (e) { console.error('[review-run] build failed', order.id, e.message); summary.errors++; continue; }

    try {
      const sendRes = await sendMail({
        to: order.customer_email, subject: email.subject, html: email.html,
        flow: 'review', orderId: order.id,
        headers: {
          'List-Unsubscribe': `<${links.unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });
      if (!sendRes.ok) { summary.errors++; continue; }
      await stamp();
      summary.sent++;
      console.log(`[review-run] order ${order.id} -> ${order.customer_email}`);
    } catch (e) {
      console.error('[review-run] send failed', order.id, e.message);
      summary.errors++;
    }
  }

  console.log('[review-run] done', JSON.stringify(summary));
  await recordRun('review', summary.errors === 0, summary);
  return res.status(200).json({ ok: true, ...summary });
};
