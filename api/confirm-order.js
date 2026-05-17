const { sendEmails } = require('./send-order');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const d        = req.body || {};
  const orderRef = d.order_number;

  if (!orderRef || !d.customer_email) {
    console.error('[confirm-order] Missing required fields: order_number or customer_email');
    return res.status(400).json({ error: 'Missing required fields' });
  }

  console.log(`[confirm-order] Processing PsiFi order: ${orderRef} → ${d.customer_email}`);

  try {
    // Fire admin + customer emails; idempotency key prevents duplicates on retry
    await sendEmails(d, orderRef);
    console.log(`[confirm-order] Emails sent for ${orderRef}`);

    // Log to Google Sheets
    const sheetsUrl = process.env.GOOGLE_SHEETS_URL;
    if (sheetsUrl) {
      const sym = d.currency === 'EUR' ? '€' : '£';
      try {
        await fetch(sheetsUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            orderId:        orderRef,
            date:           new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' }),
            name:           d.customer_name    || '',
            email:          d.customer_email   || '',
            phone:          d.customer_phone   || '',
            address:        d.shipping_address || '',
            products:       d.order_items      || '',
            subtotal:       sym + (d.order_subtotal  || '0.00'),
            delivery:       sym + (d.shipping_cost   || '0.00'),
            discountCode:   d.discount_code    || 'None',
            discountAmount: sym + (d.discount_saving || '0.00'),
            total:          sym + (d.order_total     || '0.00'),
            paymentMethod:  'PsiFi Card / Apple Pay / Google Pay',
            currency:       d.currency         || 'GBP',
            region:         d.region           || 'UK',
            status:         'Paid',
          }),
        });
        console.log(`[confirm-order] Sheets log sent for ${orderRef}`);
      } catch (e) {
        console.error(`[confirm-order] Sheets logging failed for ${orderRef}:`, e.message);
      }
    } else {
      console.warn('[confirm-order] GOOGLE_SHEETS_URL not set — skipping Sheets log');
    }

    return res.status(200).json({ success: true, order_ref: orderRef });

  } catch (e) {
    console.error('[confirm-order] Error:', e.message, e.stack);
    return res.status(500).json({ error: e.message || 'Order confirmation failed' });
  }
};
