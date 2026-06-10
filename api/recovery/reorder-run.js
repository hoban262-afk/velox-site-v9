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

const crypto = require('crypto');
const { sendMail } = require('../../lib/mail');
const { buildReorderEmail } = require('../../lib/reorder-email');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE         = process.env.NEXT_PUBLIC_SITE_URL || 'https://veloxpeps.com';
const MAX_PER_RUN  = 50;

// ── Depletion model (purchase-bound restock timing) ──────────────────────────
// Fire the restock nudge ~LEAD_DAYS before a purchase is estimated to run low —
// NOT on a blunt fixed window. The estimate is derived from the ACTUAL order
// (compound + quantity), so a self-declared scheduler cycle can never move it.
// CYCLE_DAYS_PER_UNIT is a neutral monthly default; tune per slug in OVERRIDES
// as you learn real reorder cadence.
const CYCLE_DAYS_PER_UNIT = 28;
const CYCLE_OVERRIDES = {};                              // e.g. { 'retatrutide': 56 }
const SUPPLY_SLUGS = new Set(['bacteriostatic-water']);  // consumables only drive a restock
const LEAD_DAYS = 7;                                     // nudge this many days before depletion
const MAX_AGE_DAYS = 150;                                // never email very old orders (backlog guard)
const CODE_PCT = 20;
const CODE_TTL_DAYS = 14;

function orderCycleDays(items) {
  if (!Array.isArray(items)) return CYCLE_DAYS_PER_UNIT;
  let max = 0;
  items.forEach(function (it) {
    const slug = (it.slug || it.id || '').toString().toLowerCase();
    if (SUPPLY_SLUGS.has(slug)) return;
    const qty = Math.max(1, Number(it.qty || it.quantity || 1) || 1);
    const per = CYCLE_OVERRIDES[slug] || CYCLE_DAYS_PER_UNIT;
    max = Math.max(max, per * qty);
  });
  return max || CYCLE_DAYS_PER_UNIT;
}
function depletionTime(order) {
  return new Date(order.created_at).getTime() + orderCycleDays(order.items) * 864e5;
}

// ── Bound, single-use restock code ───────────────────────────────────────────
// Reuses recovery_codes, so it validates at checkout via /api/newsletter/validate
// with zero new plumbing. Bound to THIS order's email → only a real prior
// purchaser can ever claim it. Idempotent: reuses an existing code for the order.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genCode() {
  let out = ''; const b = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[b[i] % CODE_ALPHABET.length];
  return 'VELOX-' + out;
}
async function restockCodeFor(order) {
  const oid = encodeURIComponent(String(order.id));
  try {
    const existing = await sbGet(`recovery_codes?order_id=eq.${oid}&select=code&limit=1`);
    if (Array.isArray(existing) && existing.length && existing[0].code) return existing[0].code;
  } catch (e) { /* fall through to mint */ }
  const expires = new Date(Date.now() + CODE_TTL_DAYS * 864e5).toISOString();
  const body = { email: String(order.customer_email).toLowerCase(), code: genCode(), order_id: String(order.id), discount_pct: CODE_PCT, expires_at: expires };
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/recovery_codes`, { method: 'POST', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(body) });
    if (r.ok) return body.code;
    if (r.status === 409) { body.code = genCode(); continue; }   // rare collision — retry once
    throw new Error(`recovery_codes insert -> ${r.status}`);
  }
  throw new Error('recovery_codes insert failed after retry');
}

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
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'Resend not configured' });

  const summary = { scanned: 0, sent: 0, skipped_notdue: 0, skipped_newer: 0, skipped_unsub: 0, errors: 0 };

  const now = Date.now();
  // Pull paid orders old enough that even the soonest possible depletion (the
  // default cycle) is within LEAD_DAYS, but not older than MAX_AGE_DAYS. The
  // exact, per-order depletion check happens in JS below.
  const earliest = new Date(now - (CYCLE_DAYS_PER_UNIT - LEAD_DAYS) * 864e5).toISOString();
  const oldest   = new Date(now - MAX_AGE_DAYS * 864e5).toISOString();

  let candidates = [];
  try {
    candidates = await sbGet(
      'orders?status=in.(paid,dispatched)' +
      `&created_at=lte.${encodeURIComponent(earliest)}&created_at=gte.${encodeURIComponent(oldest)}` +
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

    // Purchase-bound timing: only fire within LEAD_DAYS of estimated depletion.
    // Not-due orders are left untouched (no stamp) so they're re-checked daily.
    if (now < depletionTime(order) - LEAD_DAYS * 864e5) { summary.skipped_notdue++; continue; }

    const stamp = () => sbPatch(`orders?id=eq.${encodeURIComponent(order.id)}`, { reorder_email_sent_at: new Date().toISOString() }).catch(() => {});

    if (await hasNewerOrder(order.customer_email, order.created_at)) { summary.skipped_newer++; await stamp(); continue; }
    if (await isUnsubscribed(order.customer_email))                 { summary.skipped_unsub++; await stamp(); continue; }

    // Mint the bound, single-use 20% restock code (tied to this real prior
    // purchase + email; expires; one use) — the fraud-proof core of the offer.
    let code = '';
    try { code = await restockCodeFor(order); }
    catch (e) { console.error('[reorder-run] code mint failed', order.id, e.message); summary.errors++; continue; }

    const links = {
      reorderUrl:     `${SITE}/api/recovery/reorder?token=${encodeURIComponent(signReorderToken(order.id))}`,
      unsubscribeUrl: `${SITE}/api/newsletter/unsubscribe?token=${encodeURIComponent(signEmailToken(order.customer_email))}`,
    };

    let email;
    try { email = buildReorderEmail(order, links, { code: code, pct: CODE_PCT, expiresLabel: CODE_TTL_DAYS + ' days' }); }
    catch (e) { console.error('[reorder-run] build failed', order.id, e.message); summary.errors++; continue; }

    try {
      const sendRes = await sendMail({
        to: order.customer_email, subject: email.subject, html: email.html,
        flow: 'reorder', orderId: order.id,
        headers: {
          'List-Unsubscribe': `<${links.unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });
      if (!sendRes.ok) { summary.errors++; continue; }
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
