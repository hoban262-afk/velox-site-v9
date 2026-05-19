/**
 * POST /api/create-fena-payment
 *
 * Creates a Fena Pay by Bank payment session and returns the hosted payment URL.
 *
 * Body: { amount_pence, reference, description, metadata }
 * Response: { paymentUrl, orderId }
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { amount_pence, reference, description, metadata } = req.body || {};

  if (!amount_pence || !reference) {
    return res.status(400).json({ error: 'Missing amount_pence or reference' });
  }

  const terminalId     = process.env.FENA_TERMINAL_ID;
  const terminalSecret = process.env.FENA_TERMINAL_SECRET;

  if (!terminalId || !terminalSecret) {
    console.error('[create-fena-payment] Missing FENA_TERMINAL_ID or FENA_TERMINAL_SECRET env vars');
    return res.status(500).json({ error: 'Payment service not configured' });
  }

  const auth = Buffer.from(`${terminalId}:${terminalSecret}`).toString('base64');

  try {
    const fenaRes = await fetch('https://api.fena.co/v1/order', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept':        'application/json',
      },
      body: JSON.stringify({
        amount:      amount_pence,
        reference:   reference,
        description: description || 'Velox Peptides Research Order',
        redirectUrl: 'https://veloxpeps.com/checkout/payment-complete/?method=fena',
        webhookUrl:  'https://veloxpeps.com/api/fena-webhook',
        metadata:    metadata || {},
      }),
    });

    const data = await fenaRes.json();

    if (!fenaRes.ok) {
      console.error('[create-fena-payment] Fena API error:', fenaRes.status, JSON.stringify(data));
      return res.status(502).json({ error: data.message || data.error || 'Payment creation failed' });
    }

    // Fena may use different field names depending on API version
    const paymentUrl = data.paymentUrl || data.url || data.payment_url || data.hostedPaymentUrl;
    const orderId    = data.id         || data.orderId || data.order_id;

    if (!paymentUrl) {
      console.error('[create-fena-payment] No paymentUrl in Fena response:', JSON.stringify(data));
      return res.status(502).json({ error: 'No payment URL returned by Fena' });
    }

    console.log(`[create-fena-payment] Payment session created for ${reference} — Fena ID: ${orderId}`);
    return res.status(200).json({ paymentUrl, orderId });

  } catch (e) {
    console.error('[create-fena-payment] Unexpected error:', e.message, e.stack);
    return res.status(500).json({ error: e.message || 'Payment creation failed' });
  }
};
