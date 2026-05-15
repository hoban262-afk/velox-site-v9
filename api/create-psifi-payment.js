const crypto = require('crypto');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const apiKey = process.env.PSIFI_API_KEY;
  if (!apiKey) {
    console.error('[create-psifi-payment] PSIFI_API_KEY not set');
    return res.status(500).json({ error: 'Payment service not configured' });
  }

  const { items, currency, order_ref } = req.body || {};

  if (!items || !Array.isArray(items) || items.length === 0) {
    console.error('[create-psifi-payment] Missing or empty items array');
    return res.status(400).json({ error: 'Missing basket items' });
  }

  console.log(`[create-psifi-payment] Creating session — order=${order_ref} currency=${currency} items=${items.length}`);
  items.forEach((item, i) => {
    console.log(`[create-psifi-payment]   item[${i}]: name="${item.name}" price=${item.price} qty=${item.quantity}`);
  });

  try {
    const psifiPayload = {
      items:       items,
      currency:    (currency || 'GBP').toUpperCase(),
      order_ref:   order_ref || '',
      success_url: 'https://veloxpeps.com/checkout/payment-complete/?method=psifi',
      cancel_url:  'https://veloxpeps.com/checkout/payment-complete/?method=psifi&payment=cancelled',
    };

    console.log('[create-psifi-payment] Sending to PsiFi:', JSON.stringify(psifiPayload));

    const response = await fetch('https://api.psifi.app/api/v2/checkout-sessions', {
      method:  'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       apiKey,
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify(psifiPayload),
    });

    // Read raw text first so we always have something to log, even on non-JSON responses
    const rawText = await response.text();
    console.log(`[create-psifi-payment] PsiFi response HTTP ${response.status}: ${rawText}`);

    let data = {};
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      console.error('[create-psifi-payment] PsiFi response is not valid JSON:', rawText);
      return res.status(502).json({ error: `PsiFi returned non-JSON response (HTTP ${response.status}): ${rawText.slice(0, 200)}` });
    }

    if (!response.ok) {
      // Flatten whatever error shape PsiFi returns into a single readable string
      const errMsg = [data.message, data.error, data.detail, data.errors]
        .map(v => (typeof v === 'string' ? v : v ? JSON.stringify(v) : null))
        .filter(Boolean)
        .join(' | ') || `PsiFi session creation failed (HTTP ${response.status})`;
      console.error('[create-psifi-payment] PsiFi error:', errMsg);
      return res.status(502).json({ error: errMsg });
    }

    if (!data.checkout_url) {
      console.error('[create-psifi-payment] PsiFi response missing checkout_url. Full response:', rawText);
      return res.status(502).json({ error: 'PsiFi did not return a checkout URL. Response: ' + rawText.slice(0, 300) });
    }

    console.log(`[create-psifi-payment] Session created successfully for order ${order_ref}: ${data.checkout_url}`);
    return res.status(200).json({ checkout_url: data.checkout_url });

  } catch (e) {
    console.error('[create-psifi-payment] Error:', e.message);
    console.error('[create-psifi-payment] Stack:', e.stack);
    return res.status(500).json({ error: e.message || 'Payment session creation failed' });
  }
};
