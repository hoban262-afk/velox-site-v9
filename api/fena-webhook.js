/**
 * /api/fena-webhook — Vercel Edge Function
 *
 * Fena calls this when a payment event occurs. On a success event we mark the
 * matching Supabase order 'paid' and fire Click & Drop + Xero. This is the
 * browser-independent confirmation (the customer's return to the site is the
 * other, faster path via confirm-fena-payment).
 *
 * Fena's exact payload shape isn't documented for our account, so this handler
 * is deliberately tolerant: it logs the RAW body (to confirm the real shape),
 * then tries JSON, a signed JWT in a `token` field, and form-urlencoded. It
 * matches the order by reference (= our 12-char paymentRef, stored in
 * orders.notes by create-fena-payment) or by an order UUID if present.
 */

export const config = { runtime: 'edge' };

const SUCCESS_STATUSES = new Set(['completed', 'success', 'paid', 'captured', 'settled', 'complete']);

function decodeJwtPayload(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch { return null; }
}

// Pull the first present value across a list of candidate keys (top-level + nested).
function pick(obj, keys) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== '') return obj[k];
  }
  for (const nest of ['payload', 'data', 'result', 'metadata', 'order', 'payment']) {
    if (obj[nest] && typeof obj[nest] === 'object') {
      const v = pick(obj[nest], keys);
      if (v != null && v !== '') return v;
    }
  }
  return undefined;
}

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // ── Shared-secret gate ──────────────────────────────────────────────────────
  // This is a server-to-server endpoint, so a shared secret is a valid guard.
  // Without it, anyone on the internet can POST {"status":"completed","reference":...}
  // and flip an order to PAID (order refs leak in the redirect URL). Configure the
  // Fena webhook URL as  https://veloxpeps.com/api/fena-webhook?key=<FENA_WEBHOOK_SECRET>
  // (or send it as an x-webhook-secret header). When the env var is set we REQUIRE a
  // match; when it is unset we fail OPEN + warn, so deploying this never breaks the
  // live webhook before the secret is configured.
  const WEBHOOK_SECRET = process.env.FENA_WEBHOOK_SECRET;
  if (WEBHOOK_SECRET) {
    let provided = req.headers.get('x-webhook-secret') || '';
    if (!provided) {
      try { provided = new URL(req.url).searchParams.get('key') || ''; } catch { /* ignore */ }
    }
    if (provided !== WEBHOOK_SECRET) {
      console.warn('[fena-webhook] rejected: missing/invalid shared secret');
      return new Response('Unauthorized', { status: 401 });
    }
  } else {
    console.warn('[fena-webhook] FENA_WEBHOOK_SECRET not set — endpoint is UNAUTHENTICATED. Set it and append ?key=... to the Fena webhook URL.');
  }

  const SUPABASE_URL              = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[fena-webhook] Missing Supabase env');
    return new Response('Misconfigured', { status: 500 });
  }

  // ── Read + log the raw body (so we can confirm Fena's real shape) ───────────
  const ct  = (req.headers.get('content-type') || '').toLowerCase();
  const raw = await req.text();
  console.log(`[fena-webhook] content-type="${ct}" raw=${raw.slice(0, 600)}`);

  // ── Parse into a single object, however Fena framed it ──────────────────────
  let obj = {};
  try {
    if (ct.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(raw);
      obj = Object.fromEntries(params.entries());
      if (obj.token) obj = Object.assign(obj, decodeJwtPayload(obj.token) || {});
    } else {
      obj = JSON.parse(raw || '{}');
      const tok = obj.token || obj.jwt;
      if (tok) obj = Object.assign(obj, decodeJwtPayload(tok) || {});
    }
  } catch (e) {
    console.error('[fena-webhook] parse failed:', e.message);
    return new Response('OK', { status: 200 }); // ack so Fena doesn't retry-storm
  }

  const status    = String(pick(obj, ['status', 'paymentStatus', 'payment_status', 'state']) || '').toLowerCase();
  const reference  = pick(obj, ['reference', 'merchantReference', 'paymentReference', 'orderReference', 'merchant_reference']);
  const orderUuid = pick(obj, ['order_id', 'orderId']);
  const paymentId = pick(obj, ['payment_id', 'paymentId', 'id']) || null;

  console.log(`[fena-webhook] parsed status="${status}" reference="${reference || ''}" orderUuid="${orderUuid || ''}"`);

  // ── Subscription events (Pro membership / subscribe-&-save) take priority ────
  // These handle the FULL status lifecycle (not just success), since we must
  // also react to warning/cancelled to downgrade members.
  {
    const subHeaders = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
    let sub = null;
    try {
      const f = paymentId
        ? `fena_payment_id=eq.${encodeURIComponent(paymentId)}`
        : (reference ? `reference=eq.${encodeURIComponent(reference)}` : null);
      if (f) {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?${f}&select=*&order=created_at.desc&limit=1`, { headers: subHeaders });
        sub = r.ok ? (await r.json())[0] : null;
      }
    } catch (e) { console.error('[fena-webhook] sub lookup threw:', e.message); }

    if (sub) {
      const active = SUCCESS_STATUSES.has(status) || status === 'active' || status === 'paid';
      const ended  = ['cancelled', 'rejected', 'warning', 'overdue'].includes(status);
      const patch  = { status: status || sub.status, updated_at: new Date().toISOString() };
      if (ended) patch.cancelled_at = new Date().toISOString();
      await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?id=eq.${sub.id}`, {
        method: 'PATCH', headers: { ...subHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(patch),
      }).catch(() => {});

      // Pro membership → flip the profile gating flags.
      if (sub.kind === 'pro' && sub.user_id) {
        if (active) {
          const until = new Date();
          if (sub.plan === 'annual') until.setFullYear(until.getFullYear() + 1);
          else until.setMonth(until.getMonth() + 1);
          await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${sub.user_id}`, {
            method: 'PATCH', headers: { ...subHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify({ is_pro: true, pro_tier: sub.tier, pro_plan: sub.plan, pro_until: until.toISOString() }),
          }).catch(() => {});
          console.log(`[fena-webhook] Pro ACTIVE user=${sub.user_id} tier=${sub.tier} until=${until.toISOString()}`);
        } else if (ended) {
          await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${sub.user_id}`, {
            method: 'PATCH', headers: { ...subHeaders, Prefer: 'return=minimal' },
            body: JSON.stringify({ is_pro: false }),
          }).catch(() => {});
          console.log(`[fena-webhook] Pro DOWNGRADED user=${sub.user_id} (status=${status})`);
        }
      }
      // Subscribe-&-save per-cycle order creation is handled by a scheduled
      // reconciliation worker (banks don't reliably webhook each standing-order
      // charge). Here we only mirror status. TODO: api/recovery/sub-fulfil-run.js
      return new Response('OK', { status: 200 });
    }
  }

  if (!SUCCESS_STATUSES.has(status)) {
    console.log(`[fena-webhook] status "${status}" not a success event — acknowledging`);
    return new Response('OK', { status: 200 });
  }
  if (!reference && !orderUuid) {
    console.warn('[fena-webhook] success event but no reference/order_id to match — acknowledging');
    return new Response('OK', { status: 200 });
  }

  const sbHeaders = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  };

  // ── Find the order (by UUID, else by reference stored in notes) ─────────────
  let order = null;
  try {
    const filter = orderUuid
      ? `id=eq.${encodeURIComponent(orderUuid)}`
      : `notes=eq.${encodeURIComponent(reference)}`;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/orders?${filter}&select=id,status&order=created_at.desc&limit=1`, { headers: sbHeaders });
    const rows = r.ok ? await r.json() : [];
    order = Array.isArray(rows) ? rows[0] : null;
  } catch (e) {
    console.error('[fena-webhook] order lookup threw:', e.message);
  }

  if (!order) {
    console.warn(`[fena-webhook] no order found (ref=${reference} uuid=${orderUuid}) — acknowledging`);
    return new Response('OK', { status: 200 });
  }

  // ── Mark paid (idempotent) ──────────────────────────────────────────────────
  if (order.status !== 'paid' && order.status !== 'dispatched') {
    try {
      const patch = { status: 'paid' };
      if (paymentId) patch.fena_payment_id = String(paymentId);
      const pr = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(order.id)}`, {
        method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(patch),
      });
      if (!pr.ok) {
        console.error('[fena-webhook] PATCH failed:', pr.status, (await pr.text()).slice(0, 200));
        return new Response('DB error', { status: 500 });
      }
      console.log(`[fena-webhook] Order ${order.id} → paid`);
    } catch (e) {
      console.error('[fena-webhook] PATCH threw:', e.message);
      return new Response('DB error', { status: 500 });
    }
  } else {
    console.log(`[fena-webhook] Order ${order.id} already ${order.status} — skipping`);
  }

  // ── Fire-and-forget: Click & Drop label + Xero invoice (idempotent) ─────────
  const INTERNAL_SECRET = process.env.INTERNAL_TASK_SECRET;
  if (INTERNAL_SECRET) {
    const trigger = (path) => fetch(`https://veloxpeps.com${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
      body: JSON.stringify({ order_id: order.id }),
    }).catch((e) => console.error(`[fena-webhook] ${path} trigger failed:`, e.message));
    await Promise.allSettled([trigger('/api/clickdrop/push'), trigger('/api/xero/create-invoice')]);
  }

  return new Response('OK', { status: 200 });
}
