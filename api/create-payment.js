const { gocardless, Environments } = require('gocardless-nodejs');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    amount_pence, order_ref, currency: rawCurrency,
    // Extended order data stored in sessionStorage — used by client-side
    // payment-complete page to send emails; not sent to GoCardless.
    customer_name, email, description,
    phone, addr1, addr2, city, postcode, country,
    order_items, subtotal, shipping, discount_code, discount_saving, total,
    region, shipping_method,
  } = req.body || {};

  const currency = (rawCurrency || 'GBP').toUpperCase();
  if (!['GBP', 'EUR'].includes(currency)) {
    return res.status(400).json({ error: 'Unsupported currency: must be GBP or EUR' });
  }

  if (!amount_pence || !order_ref) {
    return res.status(400).json({ error: 'Missing required fields: amount_pence, order_ref' });
  }

  const token = process.env.GOCARDLESS_ACCESS_TOKEN;
  if (!token) {
    console.error('[create-payment] GOCARDLESS_ACCESS_TOKEN not set');
    return res.status(500).json({ error: 'Payment service not configured' });
  }

  const client = gocardless(token, Environments.Live);

  // Amount must be a whole integer in pence (e.g. £34.99 → 3499)
  const amountPence = Math.round(Number(amount_pence));
  console.log(`[create-payment] Creating billing request: order=${order_ref} amount=${amountPence}p currency=${currency}`);

  try {
    // ── Step 1: Create billing request ────────────────────────────────────────
    // Compact metadata is stored so the GoCardless webhook can act as a backup
    // email trigger if the browser-side redirect flow doesn't complete.
    // GoCardless metadata: max 3 keys, values max 500 chars each.
    const custMeta = JSON.stringify({
      n:  (customer_name  || '').slice(0, 80),
      e:  (email          || '').slice(0, 100),
      p:  (phone          || '').slice(0, 25),
      a1: (addr1          || '').slice(0, 100),
      a2: (addr2          || '').slice(0, 60),
      c:  (city           || '').slice(0, 50),
      pc: (postcode       || '').slice(0, 12),
      co: (country        || 'United Kingdom').slice(0, 30),
    });

    const orderMeta = JSON.stringify({
      it:  (order_items     || '').slice(0, 300), // truncated to fit 500-char limit
      sub: (subtotal        || '0.00').slice(0, 10),
      sh:  (shipping        || '0.00').slice(0, 10),
      dc:  (discount_code   || '').slice(0, 20),
      ds:  (discount_saving || '0.00').slice(0, 10),
      tot: (total           || '0.00').slice(0, 10),
      cu:  currency,
      re:  (region          || 'UK').slice(0, 2),
      sm:  (shipping_method || 'Royal Mail Tracked 24').slice(0, 40),
    });

    console.log(`[create-payment] Metadata — cust(${custMeta.length}c) order(${orderMeta.length}c)`);

    const billingRequest = await client.billingRequests.create({
      payment_request: {
        amount:      amountPence,
        currency:    currency,   // 'GBP' or 'EUR'
        description: 'Velox Peptides Order',
      },
      metadata: {
        order_ref: order_ref,
        cust:      custMeta,
        order:     orderMeta,
      },
    });

    console.log(`[create-payment] Billing request created: ${billingRequest.id}`);

    // ── Step 2: Create billing request flow ───────────────────────────────────
    // prefilled_customer on the flow (not the billing request) lets GoCardless
    // identify the customer's bank and trigger native mobile app redirect.
    const nameParts   = (customer_name || '').trim().split(/\s+/);
    const givenName   = nameParts[0] || '';
    const familyName  = nameParts.slice(1).join(' ');

    const prefilledCustomer = {};
    if (email)      prefilledCustomer.email       = email;
    if (givenName)  prefilledCustomer.given_name  = givenName;
    if (familyName) prefilledCustomer.family_name = familyName;

    const flowPayload = {
      redirect_uri: 'https://veloxpeps.com/checkout/payment-complete/',
      exit_uri:     'https://veloxpeps.com/checkout/payment/',
      links: {
        billing_request: billingRequest.id,
      },
    };

    if (Object.keys(prefilledCustomer).length > 0) {
      flowPayload.prefilled_customer = prefilledCustomer;
    }

    const billingRequestFlow = await client.billingRequestFlows.create(flowPayload);

    console.log(`[create-payment] Billing request flow created, auth_url=${billingRequestFlow.authorisation_url ? 'present' : 'MISSING'}`);

    if (!billingRequestFlow.authorisation_url) {
      console.error('[create-payment] No authorisation_url in flow response:', JSON.stringify(billingRequestFlow));
      return res.status(500).json({ error: 'No authorisation URL returned from GoCardless' });
    }

    // ── Step 3: Return authorisation URL to frontend ──────────────────────────
    res.status(200).json({
      authorisation_url:  billingRequestFlow.authorisation_url,
      billing_request_id: billingRequest.id,
    });

  } catch (e) {
    // GoCardless SDK uses `got` — response body is already parsed (not a stream)
    console.error('[create-payment] GoCardless error:', e.message);
    if (e.response) {
      console.error('[create-payment] HTTP status:', e.response.statusCode);
      console.error('[create-payment] Response body:', JSON.stringify(e.response.body));
    }
    if (e.errors && e.errors.length) {
      console.error('[create-payment] Error details:', JSON.stringify(e.errors));
    }
    console.error('[create-payment] Stack:', e.stack);
    res.status(500).json({ error: e.message || 'Payment initialisation failed' });
  }
};
