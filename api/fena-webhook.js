/**
 * POST /api/fena-webhook
 *
 * Receives Fena payment event webhooks.
 * On a successful payment: fires order emails and logs to Google Sheets.
 * Resend idempotency keys prevent duplicate emails if the payment-complete page
 * also calls /api/confirm-fena-payment for the same order.
 *
 * Fena retries webhooks on non-200 responses, so always return 200 for
 * acknowledged events (even if our downstream processing fails).
 */
const crypto = require('crypto');
const { sendEmails } = require('./send-order');

// In-process dedup guard — Resend idempotency handles cross-cold-start dedup
const processedOrders = new Set();

const SUCCESS_STATUSES = new Set(['CAPTURED', 'SUCCESS', 'COMPLETED', 'PAID']);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const body    = req.body;
  const rawBody = JSON.stringify(body);

  // ── Signature verification ─────────────────────────────────────────────────
  const terminalSecret = process.env.FENA_TERMINAL_SECRET;
  const sigHeader      = req.headers['x-fena-signature'] ||
                         req.headers['x-webhook-signature'] || '';

  if (terminalSecret && sigHeader) {
    try {
      const sigHex = sigHeader.replace(/^sha256=/, '');
      const expected = crypto.createHmac('sha256', terminalSecret).update(rawBody).digest('hex');
      const sigBuf   = Buffer.from(sigHex, 'hex');
      const expBuf   = Buffer.from(expected, 'hex');
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        console.error('[fena-webhook] Signature mismatch — rejecting event');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    } catch (e) {
      console.error('[fena-webhook] Signature error:', e.message);
      return res.status(401).json({ error: 'Signature verification failed' });
    }
  } else if (!terminalSecret) {
    console.warn('[fena-webhook] FENA_TERMINAL_SECRET not set — signature verification skipped');
  }

  // ── Parse event ────────────────────────────────────────────────────────────
  const status    = (body.status || body.payment_status || '').toUpperCase();
  const reference = body.reference || body.orderId || body.order_id || body.id || '';
  const fenaId    = body.id || body.orderId || '';

  console.log(`[fena-webhook] Event — status: ${status}, reference: ${reference}, fenaId: ${fenaId}`);

  if (!SUCCESS_STATUSES.has(status)) {
    console.log(`[fena-webhook] Non-success status "${status}" — acknowledged, not processed`);
    return res.status(200).json({ received: true });
  }

  // ── Dedup ──────────────────────────────────────────────────────────────────
  if (processedOrders.has(reference)) {
    console.log(`[fena-webhook] Duplicate event for ${reference} — skipping`);
    return res.status(200).json({ received: true, duplicate: true });
  }
  processedOrders.add(reference);

  // ── Build order payload from metadata ─────────────────────────────────────
  // Metadata is the order data we passed when creating the Fena payment session
  const meta        = body.metadata || {};
  const amountPence = body.amount   || 0;
  const amountGBP   = (amountPence / 100).toFixed(2);

  const customerName = meta.customer_name ||
    (((meta.fname || '') + ' ' + (meta.lname || '')).trim()) || 'Customer';

  const d = {
    order_number:     reference,
    customer_name:    customerName,
    customer_email:   meta.customer_email  || meta.email || '',
    customer_phone:   meta.customer_phone  || meta.phone || '',
    addr1:            meta.addr1           || '',
    addr2:            meta.addr2           || '',
    city:             meta.city            || '',
    postcode:         meta.postcode        || '',
    country:          meta.country         || 'United Kingdom',
    shipping_address: meta.shipping_address || '',
    shipping_method:  meta.shipping_method  || 'Royal Mail Tracked 24',
    order_items:      meta.order_items      || '',
    order_subtotal:   meta.subtotal         ? Number(meta.subtotal).toFixed(2) : amountGBP,
    shipping_cost:    meta.shipping         ? Number(meta.shipping).toFixed(2) : '0.00',
    discount_code:    meta.discount_code    || '',
    discount_saving:  meta.discount_saving  ? Number(meta.discount_saving).toFixed(2) : '0.00',
    order_total:      meta.total            ? Number(meta.total).toFixed(2) : amountGBP,
    currency:         meta.currency        || 'GBP',
    region:           meta.region          || 'UK',
    payment_method:   'fena',
  };

  if (!d.customer_email) {
    console.warn(`[fena-webhook] No customer_email for ${reference} — admin email only`);
  }

  // ── Fire emails ────────────────────────────────────────────────────────────
  // Resend idempotency key = orderRef-admin / orderRef-customer.
  // If /api/confirm-fena-payment already fired these, Resend deduplicates within 24 h.
  try {
    await sendEmails(d, reference);
    console.log(`[fena-webhook] Emails sent for ${reference}`);
  } catch (e) {
    console.error(`[fena-webhook] Email send failed for ${reference}:`, e.message);
    // Don't return 500 — acknowledge receipt so Fena doesn't retry infinitely
  }

  // ── Google Sheets log ──────────────────────────────────────────────────────
  const sheetsUrl = process.env.GOOGLE_SHEETS_URL;
  if (sheetsUrl) {
    try {
      await fetch(sheetsUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          orderId:       reference,
          date:          new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' }),
          name:          d.customer_name,
          email:         d.customer_email,
          phone:         d.customer_phone,
          address:       d.shipping_address,
          products:      d.order_items,
          total:         '£' + d.order_total,
          discountCode:  d.discount_code || 'None',
          region:        d.region,
          currency:      d.currency,
          paymentMethod: 'Fena Pay by Bank',
        }),
      });
      console.log(`[fena-webhook] Sheets log sent for ${reference}`);
    } catch (e) {
      console.error(`[fena-webhook] Sheets logging failed for ${reference}:`, e.message);
    }
  }

  return res.status(200).json({ received: true, processed: true });
};
