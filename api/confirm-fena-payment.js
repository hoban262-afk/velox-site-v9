/**
 * POST /api/confirm-fena-payment
 *
 * Called by the payment-complete page when Fena redirects the customer back.
 * Verifies payment status with the Fena API, then fires order emails and logs
 * to Google Sheets.
 *
 * Body: full order payload + fena_order_id (the Fena-generated order ID)
 * Response: { success: true, order_ref } | { success: false, error, status }
 */
const { sendEmails } = require('./send-order');

const SUCCESS_STATUSES = new Set(['CAPTURED', 'SUCCESS', 'COMPLETED', 'PAID']);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const body        = req.body || {};
  const fenaOrderId = body.fena_order_id;
  const orderRef    = body.order_number;

  if (!orderRef || !body.customer_email) {
    console.error('[confirm-fena-payment] Missing order_number or customer_email');
    return res.status(400).json({ error: 'Missing required fields' });
  }

  console.log(`[confirm-fena-payment] Processing ${orderRef} → ${body.customer_email} (fenaId: ${fenaOrderId || 'unknown'})`);

  // ── Verify payment with Fena API ───────────────────────────────────────────
  const terminalId     = process.env.FENA_TERMINAL_ID;
  const terminalSecret = process.env.FENA_TERMINAL_SECRET;

  if (fenaOrderId && terminalId && terminalSecret) {
    const auth = Buffer.from(`${terminalId}:${terminalSecret}`).toString('base64');
    try {
      const verifyRes = await fetch(`https://api.fena.co/v1/order/${fenaOrderId}`, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json',
        },
      });
      const verifyData = await verifyRes.json();
      const status = (verifyData.status || '').toUpperCase();

      if (!SUCCESS_STATUSES.has(status)) {
        console.error(`[confirm-fena-payment] Payment not confirmed — status: ${status} for ${orderRef}`);
        return res.status(402).json({ success: false, status, error: 'Payment not confirmed by Fena' });
      }
      console.log(`[confirm-fena-payment] Fena verified — status: ${status} for ${orderRef}`);
    } catch (e) {
      // Fena API is unavailable — proceed optimistically.
      // The webhook will also fire; emails are idempotency-keyed so no duplicates.
      console.warn(`[confirm-fena-payment] Fena API verify failed for ${orderRef}: ${e.message} — proceeding`);
    }
  } else {
    console.warn(`[confirm-fena-payment] Skipping Fena API check for ${orderRef} (fenaId=${fenaOrderId}, creds=${!!(terminalId && terminalSecret)})`);
  }

  // ── Fire emails ────────────────────────────────────────────────────────────
  // Idempotency key = orderRef. Resend deduplicates within 24 h, so if the
  // webhook has already sent these emails they won't be sent again.
  const d = { ...body, payment_method: 'fena' };
  try {
    await sendEmails(d, orderRef);
    console.log(`[confirm-fena-payment] Emails sent for ${orderRef}`);
  } catch (e) {
    console.error(`[confirm-fena-payment] Email send failed for ${orderRef}:`, e.message, e.stack);
    return res.status(500).json({ success: false, error: 'Order confirmed but email delivery failed' });
  }

  // ── Google Sheets log ──────────────────────────────────────────────────────
  const sheetsUrl = process.env.GOOGLE_SHEETS_URL;
  if (sheetsUrl) {
    const sym = body.currency === 'EUR' ? '€' : '£';
    try {
      await fetch(sheetsUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          orderId:       orderRef,
          date:          new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' }),
          name:          body.customer_name    || '',
          email:         body.customer_email   || '',
          phone:         body.customer_phone   || '',
          address:       body.shipping_address || '',
          products:      body.order_items      || '',
          total:         sym + (body.order_total || '0.00'),
          discountCode:  body.discount_code    || 'None',
          region:        body.region           || 'UK',
          currency:      body.currency         || 'GBP',
          paymentMethod: 'Fena Pay by Bank',
        }),
      });
      console.log(`[confirm-fena-payment] Sheets log sent for ${orderRef}`);
    } catch (e) {
      console.error(`[confirm-fena-payment] Sheets logging failed for ${orderRef}:`, e.message);
    }
  }

  return res.status(200).json({ success: true, order_ref: orderRef });
};
