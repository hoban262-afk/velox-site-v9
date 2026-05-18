/* DISABLED — GoCardless removed from UI. Re-enable by removing this wrapper comment.

const crypto = require('crypto');
const { gocardless, Environments } = require('gocardless-nodejs');
const { sendEmails } = require('./send-order');

// Disable Vercel's body parser so we can read the raw body for signature verification.
module.exports.config = {
  api: { bodyParser: false },
};

// ── Raw body reader ───────────────────────────────────────────────────────────
function getRawBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    req.on('data', function (chunk) { chunks.push(chunk); });
    req.on('end',  function () { resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    console.warn(`[webhook] Unexpected method: ${req.method}`);
    return res.status(405).end();
  }

  const secret = process.env.GOCARDLESS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[webhook] GOCARDLESS_WEBHOOK_SECRET not configured');
    return res.status(500).end();
  }

  // Read raw body BEFORE any parsing so the HMAC is computed over the exact bytes GoCardless sent.
  const rawBody = await getRawBody(req);
  console.log(`[webhook] Received request — body length: ${rawBody.length} bytes`);

  // ── Signature verification ─────────────────────────────────────────────────
  const signature = req.headers['webhook-signature'] || '';
  const expected  = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  console.log(`[webhook] Signature header present: ${Boolean(signature)} length: ${signature.length}`);

  // timingSafeEqual requires equal-length buffers — guard against empty/malformed header
  let signatureValid = false;
  try {
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length > 0 && sigBuf.length === expBuf.length) {
      signatureValid = crypto.timingSafeEqual(sigBuf, expBuf);
    } else {
      console.warn(`[webhook] Signature buffer length mismatch — sig: ${sigBuf.length} expected: ${expBuf.length}`);
    }
  } catch (sigErr) {
    console.error('[webhook] Signature comparison threw:', sigErr.message);
  }

  if (!signatureValid) {
    console.warn(`[webhook] Invalid signature — rejecting request`);
    return res.status(498).json({ error: 'Invalid signature' });
  }

  console.log('[webhook] Signature verified OK');

  // ── Parse payload ──────────────────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch (e) {
    console.error('[webhook] Failed to parse body:', e.message);
    return res.status(400).end();
  }

  const events = body.events || [];
  console.log(`[webhook] Received ${events.length} event(s)`);

  // Process events sequentially; always respond 200 even on partial failure so
  // GoCardless does not retry the entire batch.
  for (const event of events) {
    const { resource_type, action } = event;
    console.log(`[webhook] Event: resource_type=${resource_type} action=${action} links=${JSON.stringify(event.links || {})}`);

    if (
      (resource_type === 'billing_requests' && action === 'fulfilled') ||
      (resource_type === 'payment_requests' && action === 'fulfilled')
    ) {
      try {
        await handleFulfilment(event);
      } catch (e) {
        // Log but do not propagate — let GoCardless consider the webhook delivered.
        console.error('[webhook] Error processing fulfilment event:', e.message, e.stack);
      }
    } else {
      console.log(`[webhook] Ignoring event: ${resource_type}/${action}`);
    }
  }

  return res.status(200).json({ received: true });
};

// ── Fulfilment handler ────────────────────────────────────────────────────────
async function handleFulfilment(event) {
  const billingRequestId = (event.links || {}).billing_request;
  if (!billingRequestId) {
    console.warn('[webhook] No billing_request link in event:', JSON.stringify(event.links));
    return;
  }

  console.log(`[webhook] Handling fulfilment for billing request: ${billingRequestId}`);

  const token  = process.env.GOCARDLESS_ACCESS_TOKEN;
  if (!token) {
    console.error('[webhook] GOCARDLESS_ACCESS_TOKEN not set');
    return;
  }

  const client = gocardless(token, Environments.Live);

  let billingRequest;
  try {
    billingRequest = await client.billingRequests.find(billingRequestId);
    console.log(`[webhook] Billing request ${billingRequestId} status: ${billingRequest.status}`);
  } catch (fetchErr) {
    console.error(`[webhook] Failed to fetch billing request ${billingRequestId}:`, fetchErr.message);
    throw fetchErr;
  }

  const meta = billingRequest.metadata || {};
  console.log(`[webhook] Billing request metadata keys: [${Object.keys(meta).join(', ')}]`);

  const orderRef = meta.order_ref;
  if (!orderRef) {
    console.warn('[webhook] No order_ref in billing request metadata — cannot send emails');
    console.warn('[webhook] This usually means create-payment did not store metadata (old order)');
    return;
  }

  console.log(`[webhook] Processing order: ${orderRef}`);

  // ── Decode compact metadata ────────────────────────────────────────────────
  let cust  = {};
  let order = {};
  try { cust  = JSON.parse(meta.cust  || '{}'); } catch (e) { console.error('[webhook] Failed to parse cust metadata:', e.message); }
  try { order = JSON.parse(meta.order || '{}'); } catch (e) { console.error('[webhook] Failed to parse order metadata:', e.message); }

  const customerEmail = cust.e || '';
  const customerName  = cust.n || '';

  if (!customerEmail) {
    console.warn('[webhook] No customer email in metadata — skipping emails');
    return;
  }

  const shippingAddr = [cust.a1, cust.a2, cust.c, cust.pc, cust.co || 'United Kingdom']
    .filter(Boolean).join(', ');

  const currency       = order.cu || 'GBP';
  const region         = order.re || 'UK';
  const shippingMethod = order.sm || (region === 'EU' ? 'Royal Mail International Tracked' : 'Royal Mail Tracked 24');

  // ── Fire order emails ──────────────────────────────────────────────────────
  // Pass orderRef as idempotency key — if verify-payment already sent these emails
  // (the normal path), Resend will deduplicate and not send again.
  const emailPayload = {
    order_number:    orderRef,
    customer_name:   customerName,
    customer_email:  customerEmail,
    customer_phone:  cust.p   || '',
    addr1:           cust.a1  || '',
    addr2:           cust.a2  || '',
    city:            cust.c   || '',
    postcode:        cust.pc  || '',
    country:         cust.co  || 'United Kingdom',
    shipping_address: shippingAddr,
    shipping_method: shippingMethod,
    order_items:     order.it  || '',
    order_subtotal:  order.sub || '0.00',
    shipping_cost:   order.sh  || '0.00',
    discount_code:   order.dc  || '',
    discount_saving: order.ds  || '0.00',
    order_total:     order.tot || '0.00',
    currency:        currency,
    region:          region,
    payment_method:  'instant',
  };

  console.log(`[webhook] Calling sendEmails for ${orderRef} → ${customerEmail} (idempotencyKey: ${orderRef})`);
  await sendEmails(emailPayload, orderRef);
  console.log(`[webhook] sendEmails completed for ${orderRef} (Resend will deduplicate if already sent by redirect handler)`);

  // ── Log to Google Sheets ───────────────────────────────────────────────────
  // Note: if verify-payment already logged, this creates a second row marked "(webhook)".
  // For a low-volume shop this is acceptable; a duplicate row is easy to spot.
  const sheetsUrl = process.env.GOOGLE_SHEETS_URL;
  if (sheetsUrl) {
    const sym = currency === 'EUR' ? '€' : '£';
    try {
      await fetch(sheetsUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          orderId:       orderRef,
          date:          new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' }),
          name:          customerName,
          email:         customerEmail,
          phone:         cust.p   || '',
          address:       shippingAddr,
          products:      order.it  || '',
          total:         sym + (order.tot || '0.00'),
          discountCode:  order.dc  || 'None',
          region:        region,
          currency:      currency,
          paymentMethod: 'Instant Bank Pay (webhook)',
        }),
      });
      console.log(`[webhook] Sheets log sent for ${orderRef}`);
    } catch (e) {
      console.error(`[webhook] Sheets logging failed for ${orderRef}:`, e.message);
    }
  } else {
    console.warn('[webhook] GOOGLE_SHEETS_URL not set — skipping Sheets log');
  }

  console.log(`[webhook] Fulfilment handling complete for ${orderRef}`);
}


*/ // END DISABLED