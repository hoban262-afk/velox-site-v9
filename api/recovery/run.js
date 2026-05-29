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
 *   stage 1 → 1h   stage 2 → 24h   stage 3 → 72h
 * The 1h floor on stage 1 also clears any payment-settlement lag, so a
 * customer who actually paid is flipped to 'paid' by the webhook before any
 * recovery email could go out.
 */

const { Resend } = require('resend');
const crypto = require('crypto');
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

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Resend not configured' });
  const resend = new Resend(apiKey);

  const summary = { scanned: 0, sent: 0, skipped_unsub: 0, errors: 0, by_stage: { 1: 0, 2: 0, 3: 0 } };

  let candidates = [];
  try {
    // Only Fena pending orders older than the earliest threshold, with a real
    // email and a positive total. Oldest first so the backlog drains fairly.
    const cutoff = new Date(Date.now() - STAGES[1] * 3.6e6).toISOString();
    candidates = await sbGet(
      'orders?status=eq.pending&payment_method=eq.fena' +
      `&total=gt.0&created_at=lt.${encodeURIComponent(cutoff)}` +
      '&select=id,created_at,customer_name,customer_email,items,total,recovery_stage' +
      '&order=created_at.asc&limit=200'
    );
  } catch (e) {
    console.error('[recovery/run] query failed:', e.message);
    return res.status(500).json({ error: 'Query failed', detail: e.message });
  }

  for (const order of candidates) {
    if (summary.sent >= MAX_PER_RUN) break;
    summary.scanned++;

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

    let email;
    try { email = buildRecoveryEmail(stage, order, links); }
    catch (e) { console.error('[recovery/run] build failed for', order.id, e.message); summary.errors++; continue; }

    try {
      await resend.emails.send({
        from: 'Velox Peptides <orders@veloxpeps.com>',
        to: order.customer_email,
        subject: email.subject,
        html: email.html,
      });
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
