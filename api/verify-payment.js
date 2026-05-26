/* DISABLED — GoCardless removed from UI. Re-enable by removing this wrapper comment.

const { gocardless, Environments } = require('gocardless-nodejs');
const { sendEmails } = require('./send-order');

module.exports = async function handler(req, res) {
  // ── Legacy GET support (status-only, no emails) ───────────────────────────
  if (req.method === 'GET') {
    const id = req.query && req.query.id;
    console.log(`[verify-payment] GET request — id=${id} (legacy, no email trigger)`);
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const token = process.env.GOCARDLESS_ACCESS_TOKEN;
    if (!token) return res.status(500).json({ error: 'Not configured' });
    try {
      const client = gocardless(token, Environments.Live);
      const br = await client.billingRequests.find(id);
      const success = br.status === 'fulfilled' || br.status === 'fulfilling';
      return res.status(200).json({ success, status: br.status });
    } catch (e) {
      console.error('[verify-payment] GET error:', e.message);
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).end();

  // ── POST: verify + trigger emails + Sheets server-side ───────────────────
  const body = req.body || {};
  const billingRequestId = body.billing_request_id || '';
  const orderRef         = body.order_number       || '';
  const customerEmail    = body.customer_email      || '';

  console.log(`[verify-payment] POST — billing_request_id=${billingRequestId} order=${orderRef} email=${customerEmail}`);

  if (!billingRequestId) {
    console.error('[verify-payment] Missing billing_request_id');
    return res.status(400).json({ success: false, error: 'Missing billing_request_id' });
  }
  if (!orderRef || !customerEmail) {
    console.error('[verify-payment] Missing order_number or customer_email');
    return res.status(400).json({ success: false, error: 'Missing order data' });
  }

  const token = process.env.GOCARDLESS_ACCESS_TOKEN;
  if (!token) {
    console.error('[verify-payment] GOCARDLESS_ACCESS_TOKEN not set');
    return res.status(500).json({ success: false, error: 'Payment service not configured' });
  }

  const client = gocardless(token, Environments.Live);

  try {
    // ── 1. Check GoCardless billing request status ────────────────────────
    console.log(`[verify-payment] Fetching billing request from GoCardless: ${billingRequestId}`);
    const billingRequest = await client.billingRequests.find(billingRequestId);
    const status = billingRequest.status;
    console.log(`[verify-payment] Billing request ${billingRequestId} — status: ${status}`);
    console.log(`[verify-payment] Billing request links: ${JSON.stringify(billingRequest.links || {})}`);

    // Accept fulfilled OR fulfilling — payment has been authorised by the customer
    // (fulfilling = payment initiated, will complete barring exceptional circumstances)
    const paymentConfirmed = status === 'fulfilled' || status === 'fulfilling';
    if (!paymentConfirmed) {
      console.warn(`[verify-payment] Payment not confirmed — status: ${status}`);
      return res.status(200).json({ success: false, status });
    }

    // ── 2. Build order data payload from POST body ────────────────────────
    const orderData = {
      order_number:    orderRef,
      customer_name:   body.customer_name   || '',
      customer_email:  customerEmail,
      customer_phone:  body.customer_phone  || '',
      addr1:           body.addr1           || '',
      addr2:           body.addr2           || '',
      city:            body.city            || '',
      postcode:        body.postcode        || '',
      country:         body.country         || 'United Kingdom',
      shipping_address: body.shipping_address || '',
      shipping_method: body.shipping_method || 'Royal Mail Tracked 24',
      order_items:     body.order_items     || '',
      order_subtotal:  body.order_subtotal  || '0.00',
      shipping_cost:   body.shipping_cost   || '0.00',
      discount_code:   body.discount_code   || '',
      discount_saving: body.discount_saving || '0.00',
      order_total:     body.order_total     || '0.00',
      currency:        body.currency        || 'GBP',
      region:          body.region          || 'UK',
      payment_method:  'instant',
    };

    // ── 3. Send emails (idempotency key prevents duplicate if webhook also fires) ──
    console.log(`[verify-payment] Sending order emails for ${orderRef} → ${customerEmail}`);
    await sendEmails(orderData, orderRef);
    console.log(`[verify-payment] Emails sent for ${orderRef}`);

    // ── 4. Log to Google Sheets ───────────────────────────────────────────
    const sheetsUrl = process.env.GOOGLE_SHEETS_URL;
    if (sheetsUrl) {
      const sym = orderData.currency === 'EUR' ? '€' : '£';
      try {
        await fetch(sheetsUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            orderId:        orderRef,
            date:           new Date().toISOString(),
            name:           orderData.customer_name,
            email:          customerEmail,
            phone:          orderData.customer_phone,
            address:        orderData.shipping_address,
            products:       orderData.order_items,
            subtotal:       sym + orderData.order_subtotal,
            delivery:       sym + orderData.shipping_cost,
            discountCode:   orderData.discount_code || 'None',
            discountAmount: sym + orderData.discount_saving,
            total:          sym + orderData.order_total,
            paymentMethod:  'GoCardless Instant Bank Pay',
            currency:       orderData.currency,
            region:         orderData.region,
            status:         'Paid',
          }),
        });
        console.log(`[verify-payment] Sheets log sent for ${orderRef}`);
      } catch (sheetsErr) {
        console.error(`[verify-payment] Sheets logging failed for ${orderRef}:`, sheetsErr.message);
      }
    } else {
      console.warn('[verify-payment] GOOGLE_SHEETS_URL not set — skipping Sheets log');
    }

    console.log(`[verify-payment] Order ${orderRef} fully processed`);
    return res.status(200).json({ success: true, status, order_ref: orderRef });

  } catch (e) {
    console.error('[verify-payment] Error:', e.message);
    if (e.response) {
      console.error('[verify-payment] GC HTTP status:', e.response.statusCode);
      console.error('[verify-payment] GC response body:', JSON.stringify(e.response.body));
    }
    if (e.errors) {
      console.error('[verify-payment] GC error details:', JSON.stringify(e.errors));
    }
    console.error('[verify-payment] Stack:', e.stack);
    return res.status(500).json({ success: false, error: e.message || 'Payment verification failed' });
  }
};


*/ // END DISABLED