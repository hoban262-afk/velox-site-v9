/**
 * GET/POST /api/recovery/run — checkout-recovery cron worker
 *
 * Finds 'pending' Fena orders that never advanced to 'paid' and sends the
 * next due email in the recovery sequence, then bumps recovery_stage so the
 * same email is never sent twice. Designed to be run by Vercel Cron every
 * 15 minutes (see vercel.json).
 *
 * Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically
 * when CRON_SECRET is set in the project env. We also accept the existing
 * `x-internal-secret: $INTERNAL_TASK_SECRET` header for manual/admin triggers.
 *
 * Stage timing (hours after the pending order was created):
 *   stage 1 → 30 min   stage 2 → 3h   stage 3 → 12h (+ a unique 15% code)
 * Only status=pending orders are emailed, so a customer whose payment settled
 * is already flipped to 'paid' by the webhook and excluded from the sequence.
 */

const crypto = require('crypto');
const { sendMail } = require('../../lib/mail');
const { STAGES, buildRecoveryEmail } = require('../../lib/recovery-emails');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE         = process.env.NEXT_PUBLIC_SITE_URL || 'https://veloxpeps.com';
const MAX_PER_RUN  = 50; // safety cap so a backlog can't time the function out

function authorised(req) {
  const auth = req.headers['authorization'] || '';
  const internal = req.headers['x-internal-secret'] || '';
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (process.env.INTERNAL_TASK_SECRET && internal === process.env.INTERNAL_TASK_SECRET) return true;
  return false;
}

const sbHeaders = {
  apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json',
};

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders });
  if (!r.ok) throw new Error(`Supabase GET ${path} -> ${r.status}`);
  return r.json();
}

async function sbPatch(path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase PATCH ${path} -> ${r.status} ${(await r.text()).slice(0, 160)}`);
}

// ── Live Fena payment verification (self-heal stranded paid orders) ───────────
// A 'pending' Fena order can be genuinely PAID yet stuck: the settlement webhook
// can fire too early (Fena status still 'sent') and the customer may never land
// back on /checkout/payment-complete/. Before nagging a pending order as an
// abandoned cart, ask Fena's own public status endpoint whether it settled — the
// SAME contract confirm-fena-payment.js and fena-webhook.js use:
//   GET /public/payment-flow/single/{id}/data -> { data: { status: 'paid' | 'sent' | ... } }
const PAID_STATUSES = new Set(['paid', 'completed', 'settled', 'captured', 'complete', 'success']);
async function fenaPaymentPaid(paymentId) {
  if (!paymentId) return false;
  try {
    const r = await fetch(`https://epos.api.prod-gcp.fena.co/public/payment-flow/single/${encodeURIComponent(paymentId)}/data`);
    if (!r.ok) return false;                       // 404 / error → cannot confirm, treat as unpaid
    const j = await r.json().catch(() => null);
    const stts = j && j.data && j.data.status ? String(j.data.status).toLowerCase() : '';
    return PAID_STATUSES.has(stts);
  } catch { return false; }
}

// Flip a stranded-but-paid order to 'paid' and fire the SAME fulfilment the
// webhook / browser-confirm paths do (Click & Drop label, Xero invoice, order
// emails). Idempotent: caller only passes still-pending orders, and each trigger
// endpoint is individually safe to re-run.
async function reconcilePaidOrder(order) {
  await sbPatch(`orders?id=eq.${encodeURIComponent(order.id)}`, { status: 'paid' });
  const INTERNAL_SECRET = process.env.INTERNAL_TASK_SECRET;
  if (INTERNAL_SECRET) {
    const trigger = (path) => fetch(`${SITE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
      body: JSON.stringify({ order_id: order.id }),
    }).catch((e) => console.error(`[recovery/run] ${path} trigger failed:`, e.message));
    await Promise.allSettled([
      trigger('/api/clickdrop/push'),
      trigger('/api/xero/create-invoice'),
      trigger('/api/send-order'),
    ]);
  }
  console.log(`[recovery/run] RECONCILED order ${order.id} pending → paid (Fena confirmed settled)`);
}

// Same HMAC scheme as api/newsletter/unsubscribe.js
function signEmailToken(email) {
  const e = String(email).toLowerCase();
  const sig = crypto.createHmac('sha256', SERVICE).update(e).digest('hex').slice(0, 32);
  return `${Buffer.from(e, 'utf-8').toString('base64url')}.${sig}`;
}
function signOrderToken(orderId) {
  const id = String(orderId);
  const sig = crypto.createHmac('sha256', SERVICE).update(`recover:${id}`).digest('hex').slice(0, 32);
  return `${Buffer.from(id, 'utf-8').toString('base64url')}.${sig}`;
}

// ── Stage-3 unique 15% code ──────────────────────────────────────────────────
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
function genCode() {
  let s = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return 'VELOX-' + s;
}

// Returns a unique, single-use 15% code bound to this order's email, stored in
// recovery_codes (validated at checkout, expires in 7 days). Reuses the code if
// one already exists for the order so re-runs never mint duplicates.
async function recoveryCodeFor(order) {
  const oid = encodeURIComponent(String(order.id));
  try {
    const existing = await sbGet(`recovery_codes?order_id=eq.${oid}&select=code&limit=1`);
    if (Array.isArray(existing) && existing.length && existing[0].code) return existing[0].code;
  } catch {}
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const body = {
    email: String(order.customer_email).toLowerCase(), code: genCode(),
    order_id: String(order.id), discount_pct: 15, expires_at: expires,
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/recovery_codes`, {
      method: 'POST', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(body),
    });
    if (r.ok) return body.code;
    if (r.status === 409) { body.code = genCode(); continue; } // rare code collision — retry once
    throw new Error(`recovery_codes insert -> ${r.status}`);
  }
  throw new Error('recovery_codes insert failed after retry');
}

// Which stage (if any) is due for an order, given its age and current stage.
function dueStage(order) {
  const ageHrs = (Date.now() - new Date(order.created_at).getTime()) / 3.6e6;
  const current = Number(order.recovery_stage || 0);
  let target = 0;
  if (ageHrs >= STAGES[1]) target = 1;
  if (ageHrs >= STAGES[2]) target = 2;
  if (ageHrs >= STAGES[3]) target = 3;
  return target > current ? target : 0; // 0 = nothing due
}

async function isUnsubscribed(email) {
  const e = encodeURIComponent(String(email).toLowerCase());
  try {
    const [a, b] = await Promise.all([
      sbGet(`subscribers?email=eq.${e}&unsubscribed_at=not.is.null&select=email&limit=1`).catch(() => []),
      sbGet(`newsletter_codes?email=eq.${e}&unsubscribed_at=not.is.null&select=email&limit=1`).catch(() => []),
    ]);
    return (Array.isArray(a) && a.length > 0) || (Array.isArray(b) && b.length > 0);
  } catch { return false; }
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Supabase not configured' });
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorised' });

  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'Resend not configured' });

  const summary = { scanned: 0, reconciled: 0, sent: 0, skipped_unsub: 0, errors: 0, by_stage: { 1: 0, 2: 0, 3: 0 } };

  let candidates = [];
  try {
    // Only Fena pending orders older than the earliest threshold, with a real
    // email and a positive total. Oldest first so the backlog drains fairly.
    const cutoff = new Date(Date.now() - STAGES[1] * 3.6e6).toISOString();
    candidates = await sbGet(
      'orders?status=eq.pending&payment_method=eq.fena' +
      `&total=gt.0&created_at=lt.${encodeURIComponent(cutoff)}` +
      '&select=id,created_at,customer_name,customer_email,items,total,recovery_stage,fena_payment_id' +
      '&order=created_at.asc&limit=200'
    );
  } catch (e) {
    console.error('[recovery/run] query failed:', e.message);
    return res.status(500).json({ error: 'Query failed', detail: e.message });
  }

  for (const order of candidates) {
    if (summary.sent >= MAX_PER_RUN) break;
    summary.scanned++;

    // ── Self-heal: if Fena says this 'pending' order actually settled, flip it to
    // paid + fulfil instead of emailing an abandoned-cart reminder to someone who
    // already paid. Only fulfils on Fena's own confirmation, so a never-completed
    // attempt (e.g. a redirect-and-abandon) still correctly enters the sequence.
    if (order.fena_payment_id && await fenaPaymentPaid(order.fena_payment_id)) {
      try {
        await reconcilePaidOrder(order);
        summary.reconciled++;
      } catch (e) {
        console.error('[recovery/run] reconcile failed for', order.id, e.message);
        summary.errors++;
      }
      continue; // never nag a paid customer
    }

    const stage = dueStage(order);
    if (!stage) continue;
    if (!order.customer_email) continue;

    if (await isUnsubscribed(order.customer_email)) {
      // Park the stage so we don't re-check this order every run.
      try { await sbPatch(`orders?id=eq.${encodeURIComponent(order.id)}`, { recovery_stage: stage }); } catch {}
      summary.skipped_unsub++;
      continue;
    }

    const links = {
      resumeUrl:      `${SITE}/api/recovery/resume?token=${encodeURIComponent(signOrderToken(order.id))}`,
      unsubscribeUrl: `${SITE}/api/newsletter/unsubscribe?token=${encodeURIComponent(signEmailToken(order.customer_email))}`,
    };

    // Stage 3 carries a unique 15% code. If minting fails, the email still
    // sends (the template falls back to the no-code "final reminder" copy).
    if (stage === 3) {
      try { links.discountCode = await recoveryCodeFor(order); }
      catch (e) { console.error('[recovery/run] code gen failed for', order.id, e.message); }
    }

    let email;
    try { email = buildRecoveryEmail(stage, order, links); }
    catch (e) { console.error('[recovery/run] build failed for', order.id, e.message); summary.errors++; continue; }

    try {
      const sendRes = await sendMail({
        to: order.customer_email,
        subject: email.subject,
        html: email.html,
        flow: 'abandoned', stage, orderId: order.id,
        headers: {
          'List-Unsubscribe': `<${links.unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });
      if (!sendRes.ok) { summary.errors++; continue; }
      await sbPatch(`orders?id=eq.${encodeURIComponent(order.id)}`, {
        recovery_stage: stage,
        last_recovery_email_at: new Date().toISOString(),
      });
      summary.sent++;
      summary.by_stage[stage]++;
      console.log(`[recovery/run] order ${order.id} stage ${stage} -> ${order.customer_email}`);
    } catch (e) {
      console.error('[recovery/run] send/patch failed for', order.id, e.message);
      summary.errors++;
    }
  }

  console.log('[recovery/run] done', JSON.stringify(summary));
  return res.status(200).json({ ok: true, ...summary });
};
