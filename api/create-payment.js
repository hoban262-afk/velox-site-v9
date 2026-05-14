const { gocardless, Environments } = require('gocardless-nodejs');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    amount_pence, customer_name, email, description, order_ref,
    // Extended order data for webhook metadata
    phone, addr1, addr2, city, postcode, country,
    order_items, subtotal, shipping, discount_code, discount_saving, total,
  } = req.body || {};

  if (!amount_pence || !order_ref) {
    return res.status(400).json({ error: 'Missing required fields: amount_pence, order_ref' });
  }

  const token = process.env.GOCARDLESS_ACCESS_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Payment service not configured' });
  }

  const client = gocardless(token, Environments.Live);

  // ── Build compact metadata for webhook use ──────────────────────────────────
  // GoCardless metadata: max 3 keys, values up to 500 chars each.
  // We pack customer and order data as compact JSON so the webhook can fire
  // emails without needing a database.
  const custJson = JSON.stringify({
    n:  (customer_name || '').substring(0, 80),
    e:  (email || '').substring(0, 80),
    p:  (phone || '').substring(0, 20),
    a1: (addr1 || '').substring(0, 60),
    a2: (addr2 || '').substring(0, 40),
    c:  (city || '').substring(0, 40),
    pc: (postcode || '').substring(0, 10),
    co: (country || 'United Kingdom').substring(0, 20),
  });

  // Truncate order_items if needed to stay under 500-char limit
  const itemsRaw = (order_items || '').substring(0, 320);
  const orderJson = JSON.stringify({
    it:  itemsRaw,
    sub: String(subtotal || '0.00'),
    sh:  String(shipping || '0.00'),
    dc:  (discount_code || '').substring(0, 20),
    ds:  String(discount_saving || '0.00'),
    tot: String(total || '0.00'),
  });
  // ───────────────────────────────────────────────────────────────────────────

  try {
    // 1. Create billing request with payment details and order metadata
    const billingRequest = await client.billingRequests.create({
      payment_request: {
        description: description || `Velox Peptides order ${order_ref}`,
        amount: Math.round(amount_pence),
        currency: 'GBP',
      },
      prefilled_customer: {
        given_name:  (customer_name || '').split(' ')[0] || undefined,
        family_name: (customer_name || '').split(' ').slice(1).join(' ') || undefined,
        email:       email || undefined,
      },
      metadata: {
        order_ref: order_ref,
        cust:      custJson.substring(0, 500),
        order:     orderJson.substring(0, 500),
      },
    });

    // 2. Create billing request flow to get the authorisation URL
    const billingRequestFlow = await client.billingRequestFlows.create({
      redirect_uri: 'https://veloxpeps.com/checkout/payment-complete/',
      auto_fulfil: false,
      links: {
        billing_request: billingRequest.id,
      },
    });

    res.status(200).json({
      authorisation_url:  billingRequestFlow.authorisation_url,
      billing_request_id: billingRequest.id,
    });
  } catch (e) {
    // Log full error — GoCardless SDK uses `got`; response body is already parsed
    console.error('[create-payment] GoCardless error:', e.message);
    if (e.response) {
      console.error('[create-payment] Status:', e.response.statusCode);
      console.error('[create-payment] Body:', JSON.stringify(e.response.body));
    }
    if (e.errors) {
      console.error('[create-payment] GoCardless errors:', JSON.stringify(e.errors));
    }
    console.error('[create-payment] Stack:', e.stack);
    res.status(500).json({ error: e.message || 'Payment initialisation failed' });
  }
};
