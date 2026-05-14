const { gocardless, Environments } = require('gocardless-nodejs');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    amount_pence, order_ref,
    // Extended order data stored in sessionStorage — used by client-side
    // payment-complete page to send emails; not sent to GoCardless.
    customer_name, email, description,
    phone, addr1, addr2, city, postcode, country,
    order_items, subtotal, shipping, discount_code, discount_saving, total,
  } = req.body || {};

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
  console.log(`[create-payment] Creating billing request: order=${order_ref} amount=${amountPence}p`);

  try {
    // ── Step 1: Create billing request ────────────────────────────────────────
    // Minimal payload matching the GoCardless Instant Bank Pay API exactly.
    // Only payment_request is required; extra fields cause "Invalid document structure".
    const billingRequest = await client.billingRequests.create({
      payment_request: {
        amount:      amountPence,
        currency:    'GBP',
        description: 'Velox Peptides Order',
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
