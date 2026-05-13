const gocardless = require('gocardless-nodejs');
const constants = require('gocardless-nodejs/constants');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { amount_pence, customer_name, email, description, order_ref } = req.body || {};

  if (!amount_pence || !order_ref) {
    return res.status(400).json({ error: 'Missing required fields: amount_pence, order_ref' });
  }

  const token = process.env.GOCARDLESS_ACCESS_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Payment service not configured' });
  }

  const client = gocardless(token, constants.Environments.Live);

  try {
    // 1. Create billing request with payment details
    const billingRequest = await client.billingRequests.create({
      payment_request: {
        description: description || `Velox Peptides order ${order_ref}`,
        amount: Math.round(amount_pence),
        currency: 'GBP',
      },
      prefilled_customer: {
        given_name: (customer_name || '').split(' ')[0] || undefined,
        family_name: (customer_name || '').split(' ').slice(1).join(' ') || undefined,
        email: email || undefined,
      },
    });

    // 2. Create billing request flow to get the authorisation URL
    const billingRequestFlow = await client.billingRequestFlows.create({
      redirect_uri: 'https://veloxpeps.com/checkout/payment-complete/',
      auto_fulfil: false,
      billing_request: {
        id: billingRequest.id,
      },
    });

    res.status(200).json({
      authorisation_url: billingRequestFlow.authorisation_url,
      billing_request_id: billingRequest.id,
    });
  } catch (e) {
    console.error('GoCardless create-payment error:', e);
    res.status(500).json({ error: e.message || 'Payment initialisation failed' });
  }
};
