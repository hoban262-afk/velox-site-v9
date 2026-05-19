module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { amount_pence, reference, description, metadata } = req.body || {};

  if (!amount_pence || !reference) {
    return res.status(400).json({ error: 'Missing amount_pence or reference' });
  }

  const terminalId     = process.env.FENA_TERMINAL_ID;
  const terminalSecret = process.env.FENA_TERMINAL_SECRET;

  if (!terminalId || !terminalSecret) {
    console.error('[create-fena-payment] Missing env vars');
    return res.status(500).json({ error: 'Payment service not configured' });
  }

  const amountPounds = (amount_pence / 100).toFixed(2);

  const body = {
    amount:      amountPounds,
    currency:    'GBP',
    reference,
    description: description || 'Velox Peptides Research Order',
    redirectUrl: 'https://veloxpeps.com/checkout/payment-complete/?method=fena',
    webhookUrl:  'https://veloxpeps.com/api/fena-webhook',
    metadata:    metadata || {},
  };

  const basicAuth = 'Basic ' + Buffer.from(`${terminalId}:${terminalSecret}`).toString('base64');

  console.log(`[create-fena-payment] Sending — ref: ${reference}, amount: £${amountPounds}`);

  try {
    const fenaRes = await fetch('https://api.toolkit.fena.co/v1/order', {
      method:  'POST',
      headers: {
        Authorization:  basicAuth,
        'Content-Type': 'application/json',
        Accept:         'application/json',
      },
      body: JSON.stringify(body),
    });

    const rawText = await fenaRes.text();
    console.log(`[create-fena-payment] Fena response ${fenaRes.status}: ${rawText}`);

    let data = {};
    try { data = JSON.parse(rawText); } catch (_) { data = { _raw: rawText }; }

    if (!fenaRes.ok) {
      return res.status(502).json({ error: data.message || data.error || `HTTP ${fenaRes.status}`, debug: data });
    }

    const paymentUrl = data.paymentUrl || data.url || data.payment_url ||
                       data.hostedPaymentUrl || data.checkoutUrl || data.checkout_url;
    const orderId    = data.id || data.orderId || data.order_id || data.paymentId;

    if (!paymentUrl) {
      console.error('[create-fena-payment] No paymentUrl in response:', JSON.stringify(data));
      return res.status(502).json({ error: 'No payment URL returned by Fena', debug: data });
    }

    console.log(`[create-fena-payment] SUCCESS — orderId: ${orderId}`);
    return res.status(200).json({ paymentUrl, orderId });

  } catch (e) {
    console.error(`[create-fena-payment] Fetch threw: ${e.message}`);
    return res.status(500).json({ error: 'Failed to reach Fena API', detail: e.message });
  }
};
