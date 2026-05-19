/**
 * POST /api/create-fena-payment
 *
 * Creates a Fena Pay by Bank payment session and returns the hosted payment URL.
 *
 * Body: { amount_pence, reference, description, metadata }
 * Response: { paymentUrl, orderId }
 *
 * Probes multiple Fena endpoint + auth-format combinations until one succeeds.
 * Every attempt is logged in full so Vercel logs show exactly what Fena returns.
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
    return res.status(500).json({ error: 'Payment service not configured — env vars missing' });
  }

  console.log(`[create-fena-payment] Starting — ref: ${reference}, amount_pence: ${amount_pence}, terminalId: ${terminalId}`);

  // ── Request body ─────────────────────────────────────────────────────────
  // Try two body shapes: Fena may use 'amount' or 'amount_pence' and 'redirectUrl' or 'redirect_url'
  const bodyA = {
    amount:      amount_pence,
    reference,
    description: description || 'Velox Peptides Research Order',
    redirectUrl: 'https://veloxpeps.com/checkout/payment-complete/?method=fena',
    webhookUrl:  'https://veloxpeps.com/api/fena-webhook',
    metadata:    metadata || {},
  };

  // ── Endpoint + auth combinations to try (in order) ───────────────────────
  const basicAuth  = 'Basic ' + Buffer.from(`${terminalId}:${terminalSecret}`).toString('base64');
  const bearerAuth = `Bearer ${terminalSecret}`;

  const ATTEMPTS = [
    // Most likely: Fena Toolkit API with Basic auth
    {
      label: 'toolkit-payments-basic',
      url:   'https://api.toolkit.fena.co/v1/payments',
      headers: { Authorization: basicAuth, 'Content-Type': 'application/json', Accept: 'application/json' },
    },
    // Fena core API /payments with Basic auth
    {
      label: 'fena-payments-basic',
      url:   'https://api.fena.co/v1/payments',
      headers: { Authorization: basicAuth, 'Content-Type': 'application/json', Accept: 'application/json' },
    },
    // Toolkit /order endpoint (original guess)
    {
      label: 'toolkit-order-basic',
      url:   'https://api.toolkit.fena.co/v1/order',
      headers: { Authorization: basicAuth, 'Content-Type': 'application/json', Accept: 'application/json' },
    },
    // Fena core API /order with Basic auth
    {
      label: 'fena-order-basic',
      url:   'https://api.fena.co/v1/order',
      headers: { Authorization: basicAuth, 'Content-Type': 'application/json', Accept: 'application/json' },
    },
    // Toolkit /payments with Bearer token + X-Terminal-ID header
    {
      label: 'toolkit-payments-bearer',
      url:   'https://api.toolkit.fena.co/v1/payments',
      headers: {
        Authorization:  bearerAuth,
        'X-Terminal-ID': terminalId,
        'Content-Type': 'application/json',
        Accept:         'application/json',
      },
    },
    // Alternate host format
    {
      label: 'toolkit-alt-host-payments',
      url:   'https://toolkit.fena.co/api/v1/payments',
      headers: { Authorization: basicAuth, 'Content-Type': 'application/json', Accept: 'application/json' },
    },
  ];

  let lastError   = null;
  let lastStatus  = null;
  let lastBody    = null;

  for (const attempt of ATTEMPTS) {
    const controller = new AbortController();
    const timer      = setTimeout(() => controller.abort(), 9000); // 9 s per attempt

    console.log(`[create-fena-payment] Trying ${attempt.label} — ${attempt.url}`);

    try {
      const fenaRes = await fetch(attempt.url, {
        method:  'POST',
        headers: attempt.headers,
        body:    JSON.stringify(bodyA),
        signal:  controller.signal,
      });
      clearTimeout(timer);

      lastStatus = fenaRes.status;

      // Read body as text first so we can log it even if JSON parsing fails
      const rawText = await fenaRes.text();
      console.log(`[create-fena-payment] ${attempt.label} → HTTP ${fenaRes.status} | body: ${rawText}`);

      let data = {};
      try { data = JSON.parse(rawText); } catch (_) { data = { _raw: rawText }; }
      lastBody = data;

      if (!fenaRes.ok) {
        lastError = data.message || data.error || data.detail || `HTTP ${fenaRes.status}`;
        console.warn(`[create-fena-payment] ${attempt.label} failed (${fenaRes.status}) — trying next`);
        continue; // try next combination
      }

      // ── Success ───────────────────────────────────────────────────────────
      const paymentUrl = data.paymentUrl    || data.url           || data.payment_url ||
                         data.hostedPaymentUrl || data.checkoutUrl || data.checkout_url;
      const orderId    = data.id            || data.orderId        || data.order_id    ||
                         data.paymentId     || data.payment_id;

      if (!paymentUrl) {
        console.error(`[create-fena-payment] ${attempt.label} returned OK but no paymentUrl — full body:`, JSON.stringify(data));
        lastError = 'No payment URL in Fena response';
        continue;
      }

      console.log(`[create-fena-payment] SUCCESS via ${attempt.label} — orderId: ${orderId}, paymentUrl: ${paymentUrl}`);
      return res.status(200).json({ paymentUrl, orderId });

    } catch (e) {
      clearTimeout(timer);
      if (e.name === 'AbortError') {
        console.warn(`[create-fena-payment] ${attempt.label} timed out after 9 s — trying next`);
        lastError = 'Request to Fena timed out';
      } else {
        console.warn(`[create-fena-payment] ${attempt.label} threw: ${e.message} — trying next`);
        lastError = e.message;
      }
    }
  }

  // All attempts failed
  console.error(`[create-fena-payment] All ${ATTEMPTS.length} attempts failed. Last status: ${lastStatus}, Last error: ${lastError}, Last body: ${JSON.stringify(lastBody)}`);
  return res.status(502).json({
    error:      lastError || 'Fena payment service unavailable',
    lastStatus,
    debug:      lastBody,
  });
};
