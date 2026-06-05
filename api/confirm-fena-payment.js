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

  // If already paid/dispatched, return success immediately (idempotent, no further checks needed).
  if (order.status === 'paid' || order.status === 'dispatched') {
    console.log(`[confirm-fena-payment] Order ${orderRef} already ${order.status} — returning success`);
    return res.status(200).json({ success: true, order_ref: orderRef });
  }

  // Require Fena's payment ID — only someone who completed Fena's payment flow has it.
  if (!fenaOrderId) {
    console.error(`[confirm-fena-payment] Missing fena_order_id for order ${orderRef} — rejecting browser confirm`);
    return res.status(400).json({ success: false, error: 'Missing payment confirmation ID' });
  }

  // Time guard: only allow confirming orders created within the last 4 hours.
  // This prevents anyone who stumbles on an old order ref from flipping it to paid.
  const orderAge = order.created_at ? Date.now() - new Date(order.created_at).getTime() : 0;
  if (orderAge > 4 * 60 * 60 * 1000) {
    console.warn(`[confirm-fena-payment] Order ${orderRef} is ${Math.round(orderAge / 60000)}m old — rejecting stale browser confirm`);
    return res.status(400).json({ success: false, error: 'Order confirmation window expired. Contact support.' });
  }

  // ── Mark paid (idempotent) ──────────────────────────────────────────────────
  // The customer returned from Fena's bank authorisation, so we treat the order
  // as paid here; the webhook is a second, independent confirmation.
  if (order.status !== 'paid' && order.status !== 'dispatched') {
    try {
      const patch = { status: 'paid' };
      if (fenaOrderId) patch.fena_payment_id = String(fenaOrderId);
      await sbPatch(`orders?id=eq.${encodeURIComponent(order.id)}`, patch);
      order.status = 'paid';
      console.log(`[confirm-fena-payment] Order ${orderRef} → paid`);
    } catch (e) {
      console.error('[confirm-fena-payment] mark-paid failed:', e.message);
    }
  }

  // ── Fire-and-forget: Click & Drop label + Xero invoice ──────────────────────
  const INTERNAL_SECRET = process.env.INTERNAL_TASK_SECRET;
  if (INTERNAL_SECRET) {
    const trigger = (path) => fetch(`https://veloxpeps.com${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
      body: JSON.stringify({ order_id: order.id }),
    }).catch((e) => console.error(`[confirm-fena-payment] ${path} trigger failed:`, e.message));
    await Promise.allSettled([trigger('/api/clickdrop/push'), trigger('/api/xero/create-invoice')]);
  }

  // ── Best-effort emails (NEVER fail the response on email error) ─────────────
  try {
    await sendEmails(emailPayloadFromOrder(order), orderRef);
    console.log(`[confirm-fena-payment] Emails sent for ${orderRef}`);
  } catch (e) {
    console.error(`[confirm-fena-payment] Email send failed (non-fatal) for ${orderRef}:`, e.message);
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
