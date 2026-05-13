const gocardless = require('gocardless-nodejs');
const constants = require('gocardless-nodejs/constants');

module.exports = async function handler(req, res) {
  const id = (req.query && req.query.id) || (req.body && req.body.id);

  if (!id) {
    return res.status(400).json({ error: 'Missing billing_request_id' });
  }

  const token = process.env.GOCARDLESS_ACCESS_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Payment service not configured' });
  }

  const client = gocardless(token, constants.Environments.Live);

  try {
    const billingRequest = await client.billingRequests.find(id);
    const status = billingRequest.status;

    // A fulfilled billing request means the customer authorised the Instant Bank Pay
    const success = status === 'fulfilled';

    res.status(200).json({
      status,
      success,
      billing_request_id: id,
    });
  } catch (e) {
    console.error('GoCardless verify-payment error:', e);
    res.status(500).json({ error: e.message || 'Payment verification failed' });
  }
};
