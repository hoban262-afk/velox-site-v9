module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { amount_pence, reference, description } = req.body || {};

  if (!amount_pence || !reference) {
    return res.status(400).json({ error: 'Missing amount_pence or reference' });
  }

  const terminalId     = process.env.FENA_TERMINAL_ID;
  const terminalSecret = process.env.FENA_TERMINAL_SECRET;

  if (!terminalId || !terminalSecret) {
    return res.status(500).json({ error: 'Payment service not configured' });
  }

  const amountPounds = (amount_pence / 100).toFixed(2);
  const boundary     = '----VeloxBoundary' + Date.now();

  const fields = {
    amount:      amountPounds,
    currency:    'GBP',
    reference,
    description: description || 'Velox Peptides Research Order',
    redirectUrl: 'https://veloxpeps.com/checkout/payment-complete/?method=fena',
    webhookUrl:  'https://veloxpeps.com/api/fena-webhook',
  };

  let bodyStr = '';
  for (const [key, value] of Object.entries(fields)) {
    bodyStr += `--${boundary}\r\n`;
    bodyStr += `Content-Disposition: form-data; name="${key}"\r\n\r\n`;
    bodyStr += `${value}\r\n`;
  }
  bodyStr += `--${boundary}--\r\n`;

  const bodyBuf  = Buffer.from(bodyStr, 'utf-8');
  const basicAuth = 'Basic ' + Buffer.from(`${terminalId}:${terminalSecret}`).toString('base64');

  console.log(`[create-fena-payment] Sending — ref: ${reference}, amount: £${amountPounds}`);
  console.log(`[create-fena-payment] Body:\n${bodyStr}`);

  try {
    const fenaRes = await fetch('https://toolkit.fena.co/api/v1/payments', {
      method:  'POST',
      headers: {
        Authorization:  basicAuth,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(bodyBuf.length),
      },
      body: bodyBuf,
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
      return res.status(502).json({ error: 'No payment URL returned by Fena', debug: data });
    }

    console.log(`[create-fena-payment] SUCCESS — orderId: ${orderId}`);
    return res.status(200).json({ paymentUrl, orderId });

  } catch (e) {
    console.error(`[create-fena-payment] Fetch threw: ${e.message}`);
    return res.status(500).json({ error: 'Failed to reach Fena API', detail: e.message });
  }
};
