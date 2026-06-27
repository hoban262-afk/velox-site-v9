/**
 * POST /api/confirm-fena-payment
 *
 * Called by the payment-complete page when Fena redirects the customer back.
 *
 * Source of truth is the Supabase order that create-fena-payment already
 * inserted as 'pending' BEFORE the redirect — so this works even when the
 * customer's browser lost sessionStorage across the mobile bank-app redirect.
 * We resolve the order by order_id (UUID) or ref (both travel in the redirect
 * URL and survive the round-trip), mark it paid, then fire Click & Drop, emails
 * and Sheets as BEST-EFFORT (a failure in any of those must never show the
 * customer an error — their money has been taken).
 *
 * Body (from the return page): { order_id?, ref?, fena_order_id?, ...optional browser fields }
 * Response: { success: true, order_ref } | { success:false } only for hard misconfig.
 */
const { sendEmails } = require('./send-order');

const SB_URL     = process.env.SUPABASE_URL;
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sbGet(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` },
  });
  return r.ok ? r.json() : null;
}
async function sbPatch(path, body) {
  return fetch(`${SB_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
}

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

// ── Independent payment verification (the security backbone) ──────────────────
// The redirect carries order_id/ref in the URL, so those alone can't prove the
// customer actually paid — anyone who observes/guesses a ref could otherwise
// trigger fulfilment for free. Instead we ask Fena's own public status endpoint
// whether THIS payment id is 'paid'. Validated against live payments 2026-06-07:
//   GET /public/payment-flow/single/{id}/data -> { data: { status: 'paid' | 'sent' | ... } }
// (public, no auth; 404 "Payment not found" for unknown ids).
const PAID_STATUSES = new Set(['paid', 'completed', 'settled', 'captured', 'complete', 'success']);
async function fenaPaymentStatus(paymentId) {
  if (!paymentId) return null;
  try {
    const r = await fetch(`https://epos.api.prod-gcp.fena.co/public/payment-flow/single/${encodeURIComponent(paymentId)}/data`);
    if (!r.ok) return null;                       // 404 / error → cannot confirm
    const j = await r.json().catch(() => null);
    const s = j && j.data && j.data.status;
    return s ? String(s).toLowerCase() : null;
  } catch { return null; }
}

// Build the email payload sendEmails() expects from a stored order row.
function emailPayloadFromOrder(order) {
  let items = order.items;
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
  if (!Array.isArray(items)) items = [];
  const orderItemsText = items.map((it) => {
    const qty = n(it.qty || it.quantity) || 1;
    const line = n(it.price) * qty;
    return `${it.name || 'Item'}${it.size ? ' ' + it.size : ''} x${qty} — £${line.toFixed(2)}`;
  }).join('\n');
  const subtotal = n(order.subtotal) || n(order.total);
  const total    = n(order.total);
  return {
    order_number:    order.notes || String(order.id).slice(0, 8).toUpperCase(),
    customer_name:   order.customer_name || 'Customer',
    customer_email:  order.customer_email || '',
    customer_phone:  order.ship_phone || '',
    addr1:           order.ship_line1 || '',
    addr2:           order.ship_line2 || '',
    city:            order.ship_city || '',
    postcode:        order.ship_postcode || '',
    country:         order.ship_country || 'United Kingdom',
    shipping_address: [order.ship_line1, order.ship_line2, order.ship_city, order.ship_postcode, order.ship_country].filter(Boolean).join(', '),
    shipping_method: 'Royal Mail Tracked 24',
    order_items:     orderItemsText,
    order_subtotal:  subtotal.toFixed(2),
    shipping_cost:   Math.max(0, Number((total - subtotal).toFixed(2))).toFixed(2),
    discount_code:   '',
    discount_saving: '0.00',
    order_total:     total.toFixed(2),
    currency:        'GBP',
    region:          'UK',
    payment_method:  'fena',
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!SB_URL || !SB_SERVICE) {
    console.error('[confirm-fena-payment] Missing Supabase env');
    return res.status(500).json({ success: false, error: 'Server not configured' });
  }

  const body        = req.body || {};
  const orderId     = body.order_id || '';
  const ref         = body.ref || body.order_number || '';
  const fenaOrderId = body.fena_order_id || '';

  if (!orderId && !ref) {
    console.error('[confirm-fena-payment] No order_id or ref supplied');
    return res.status(400).json({ success: false, error: 'Missing order reference' });
  }

  // ── Resolve the order (created as 'pending' by create-fena-payment) ─────────
  let order = null;
  try {
    if (orderId) {
      const rows = await sbGet(`orders?id=eq.${encodeURIComponent(orderId)}&select=*&limit=1`);
      order = Array.isArray(rows) ? rows[0] : null;
    }
    if (!order && ref) {
      const rows = await sbGet(`orders?notes=eq.${encodeURIComponent(ref)}&select=*&order=created_at.desc&limit=1`);
      order = Array.isArray(rows) ? rows[0] : null;
    }
  } catch (e) {
    console.error('[confirm-fena-payment] order lookup threw:', e.message);
  }

  if (!order) {
    // Pending insert must have failed. Don't scare the customer — their payment
    // is real; log loudly so it can be reconciled from the Fena dashboard.
    console.error(`[confirm-fena-payment] Order not found (orderId=${orderId} ref=${ref}) — payment taken but no DB row`);
    return res.status(200).json({ success: true, order_ref: ref, warning: 'order_not_found' });
  }

  const orderRef = order.notes || ref || String(order.id).slice(0, 8).toUpperCase();
  console.log(`[confirm-fena-payment] Resolved order ${order.id} (${orderRef}) status=${order.status}`);

  // ── Verify the payment with Fena BEFORE granting anything ───────────────────
  // Returning from the bank app is NOT proof of payment (open-banking payments
  // can still be 'pending'/'sent' at redirect, and the redirect params are
  // guessable). We only mark paid + fire fulfilment when Fena itself confirms the
  // payment id is 'paid'. If it isn't paid yet — or we can't reach Fena — we show
  // the customer a normal success page but leave the order 'pending'; the webhook
  // (Fena's server-to-server status-update) completes fulfilment once it settles.
  const alreadyDone = order.status === 'paid' || order.status === 'dispatched';
  if (!alreadyDone) {
    const verifyId = order.fena_payment_id || fenaOrderId || '';
    const fenaStatus = await fenaPaymentStatus(verifyId);
    if (!fenaStatus || !PAID_STATUSES.has(fenaStatus)) {
      console.warn(`[confirm-fena-payment] NOT fulfilling ${orderRef}: Fena status="${fenaStatus || 'unknown'}" id="${verifyId}" — leaving pending for webhook`);
      return res.status(200).json({ success: true, order_ref: orderRef, pending: true });
    }
    console.log(`[confirm-fena-payment] Fena confirmed PAID for ${orderRef} (id=${verifyId})`);
  }

  // ── Mark paid (atomic, race-safe) ───────────────────────────────────────────
  // Use a conditional PATCH (status=eq.pending) so only ONE of the two paths
  // (browser redirect vs Fena webhook) wins the transition. The loser's PATCH
  // matches zero rows and we skip emails/notifications for that path.
  let thisPathPaid = false;
  if (order.status !== 'paid' && order.status !== 'dispatched') {
    try {
      const patch = { status: 'paid' };
      if (fenaOrderId) patch.fena_payment_id = String(fenaOrderId);
      // Conditional PATCH: only matches rows still in 'pending'. If the webhook
      // already flipped it to 'paid', this returns an empty array → we lost the race.
      const pr = await fetch(`${SB_URL}/rest/v1/orders?id=eq.${encodeURIComponent(order.id)}&status=eq.pending`, {
        method: 'PATCH',
        headers: {
          apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`,
          'Content-Type': 'application/json', Prefer: 'return=representation',
        },
        body: JSON.stringify(patch),
      });
      if (pr.ok) {
        const rows = await pr.json().catch(() => []);
        thisPathPaid = Array.isArray(rows) && rows.length > 0;
        if (thisPathPaid) {
          order.status = 'paid';
          // Set email_sent_at flag (best-effort, column may not exist yet)
          sbPatch(`orders?id=eq.${encodeURIComponent(order.id)}`, { email_sent_at: new Date().toISOString() }).catch(() => {});
        }
      }
      console.log(`[confirm-fena-payment] Order ${orderRef} → paid (thisPathPaid=${thisPathPaid})`);
    } catch (e) {
      console.error('[confirm-fena-payment] mark-paid failed:', e.message);
    }
  } else {
    console.log(`[confirm-fena-payment] Order ${orderRef} already ${order.status} — skipping emails`);
  }

  // ── Fire-and-forget: Click & Drop label + Xero invoice ──────────────────────
  // These are idempotent, safe to fire from both paths.
  const INTERNAL_SECRET = process.env.INTERNAL_TASK_SECRET;
  if (INTERNAL_SECRET) {
    const trigger = (path) => fetch(`https://veloxpeps.com${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
      body: JSON.stringify({ order_id: order.id }),
    }).catch((e) => console.error(`[confirm-fena-payment] ${path} trigger failed:`, e.message));
    await Promise.allSettled([trigger('/api/clickdrop/push'), trigger('/api/xero/create-invoice')]);
  }

  // ── Best-effort emails — only if THIS path won the race ────────────────────
  if (thisPathPaid) {
    try {
      await sendEmails(emailPayloadFromOrder(order), orderRef);
      console.log(`[confirm-fena-payment] Emails sent for ${orderRef}`);
    } catch (e) {
      console.error(`[confirm-fena-payment] Email send failed (non-fatal) for ${orderRef}:`, e.message);
    }
  } else {
    console.log(`[confirm-fena-payment] Skipping emails for ${orderRef} — other path already sent`);
  }

  // ── Best-effort Google Sheets log ───────────────────────────────────────────
  const sheetsUrl = process.env.GOOGLE_SHEETS_URL;
  if (sheetsUrl) {
    const ep = emailPayloadFromOrder(order);
    try {
      await fetch(sheetsUrl, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          orderId: orderRef,
          date: new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' }),
          name: ep.customer_name, email: ep.customer_email, phone: ep.customer_phone,
          address: ep.shipping_address, products: ep.order_items,
          total: '£' + ep.order_total, discountCode: 'None',
          region: 'UK', currency: 'GBP', paymentMethod: 'Fena Pay by Bank',
        }),
      });
    } catch (e) {
      console.error(`[confirm-fena-payment] Sheets log failed (non-fatal) for ${orderRef}:`, e.message);
    }
  }

  return res.status(200).json({ success: true, order_ref: orderRef });
};
