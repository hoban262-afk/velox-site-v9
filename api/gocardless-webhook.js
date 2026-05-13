const crypto = require('crypto');
const gocardless = require('gocardless-nodejs');
const constants = require('gocardless-nodejs/constants');
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
  if (req.method !== 'POST') return res.status(405).end();

  const secret = process.env.GOCARDLESS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[webhook] GOCARDLESS_WEBHOOK_SECRET not configured');
    return res.status(500).end();
  }

  // Read raw body BEFORE any parsing so the HMAC is computed over the exact bytes GoCardless sent.
  const rawBody = await getRawBody(req);

  // ── Signature verification ─────────────────────────────────────────────────
  const signature = req.headers['webhook-signature'] || '';
  const expected  = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
    console.warn('[webhook] Invalid signature — rejecting request');
    return res.status(498).json({ error: 'Invalid signature' });
  }

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

    if (
      (resource_type === 'billing_requests'  && action === 'fulfilled') ||
      (resource_type === 'payment_requests'  && action === 'fulfilled')
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

  // Fetch the billing request from GoCardless to read stored metadata.
  const token  = process.env.GOCARDLESS_ACCESS_TOKEN;
  const client = gocardless(token, constants.Environments.Live);
  const billingRequest = await client.billingRequests.find(billingRequestId);

  const meta = billingRequest.metadata || {};
  const orderRef = meta.order_ref;

  if (!orderRef) {
    console.warn('[webhook] No order_ref in billing request metadata — cannot send emails');
    return;
  }

  // ── Decode compact metadata ────────────────────────────────────────────────
  let cust  = {};
  let order = {};
  try { cust  = JSON.parse(meta.cust  || '{}'); } catch (e) {}
  try { order = JSON.parse(meta.order || '{}'); } catch (e) {}

  const customerName  = cust.n  || '';
  const customerEmail = cust.e  || '';

  if (!customerEmail) {
    console.warn('[webhook] No customer email in metadata — skipping emails');
    return;
  }

  const shippingAddr = [cust.a1, cust.a2, cust.c, cust.pc, cust.co || 'United Kingdom']
    .filter(Boolean).join(', ');

  // ── Fire order emails via shared sendEmails() ──────────────────────────────
  const emailPayload = {
    order_number:     orderRef,
    customer_name:    customerName,
    customer_email:   customerEmail,
    customer_phone:   cust.p   || '',
    addr1:            cust.a1  || '',
    addr2:            cust.a2  || '',
    city:             cust.c   || '',
    postcode:         cust.pc  || '',
    country:          cust.co  || 'United Kingdom',
    shipping_address: shippingAddr,
    shipping_method:  'Royal Mail Tracked 24',
    order_items:      order.it  || '',
    order_subtotal:   order.sub || '0.00',
    shipping_cost:    order.sh  || '0.00',
    discount_code:    order.dc  || '',
    discount_saving:  order.ds  || '0.00',
    order_total:      order.tot || '0.00',
    payment_method:   'instant',
  };

  await sendEmails(emailPayload);
  console.log(`[webhook] Emails sent for order ${orderRef}`);

  // ── Log to Google Sheets ───────────────────────────────────────────────────
  const sheetsUrl = process.env.GOOGLE_SHEETS_URL;
  if (sheetsUrl) {
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
          total:         '£' + (order.tot || '0.00'),
          discountCode:  order.dc  || 'None',
          paymentMethod: 'Instant Bank Pay (webhook)',
        }),
      });
      console.log(`[webhook] Sheets log sent for order ${orderRef}`);
    } catch (e) {
      console.error('[webhook] Sheets logging failed:', e.message);
    }
  }
}
