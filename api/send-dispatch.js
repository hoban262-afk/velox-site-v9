const { sendDispatch } = require('./send-order');

/**
 * POST /api/send-dispatch
 *
 * Sends a dispatch confirmation email to the customer.
 *
 * Body fields:
 *   order_number    {string}  e.g. "VP-20260513-ABCD"
 *   customer_name   {string}
 *   customer_email  {string}
 *   tracking_number {string}  optional — Royal Mail tracking ref
 *   addr1           {string}
 *   addr2           {string}  optional
 *   city            {string}
 *   postcode        {string}
 *   country         {string}  defaults to "United Kingdom"
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const {
    order_number, customer_name, customer_email,
    tracking_number, addr1, addr2, city, postcode, country,
  } = req.body || {};

  if (!order_number || !customer_email) {
    return res.status(400).json({ error: 'Missing required fields: order_number, customer_email' });
  }

  try {
    await sendDispatch({
      order_number,
      customer_name:   customer_name   || '',
      customer_email,
      tracking_number: tracking_number || '',
      addr1:           addr1    || '',
      addr2:           addr2    || '',
      city:            city     || '',
      postcode:        postcode || '',
      country:         country  || 'United Kingdom',
    });
    console.log(`[send-dispatch] Dispatch email sent for ${order_number}`);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[send-dispatch] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
