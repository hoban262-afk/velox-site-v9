/**
 * /api/create-fena-payment — Vercel Edge Function
 *
 * Called by the browser checkout when the customer clicks "Place order".
 * Creates a Fena single immediate payment session server-side so that
 * FENA_CLIENT_ID and FENA_CLIENT_SECRET never appear in the browser.
 *
 * POST body (JSON):
 *   { orderId, amount, reference, customerEmail }
 *
 * Returns:
 *   { paymentUrl, fenaPaymentId }  — on success
 *   { error }                      — on failure
 *
 * NOTE: Verify the Fena endpoint and response shape against their developer
 * portal before going live. See SETUP.md for testing instructions.
 */

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': 'https://veloxpeps.com',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { orderId, amount, reference } = body;

  if (!orderId || !amount) {
    return new Response(JSON.stringify({ error: 'Missing required fields: orderId, amount' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const FENA_CLIENT_ID     = process.env.FENA_CLIENT_ID;
  const FENA_CLIENT_SECRET = process.env.FENA_CLIENT_SECRET;
  const BASE_URL           = process.env.NEXT_PUBLIC_SITE_URL || 'https://veloxpeps.com';

  if (!FENA_CLIENT_ID || !FENA_CLIENT_SECRET) {
    console.error('[create-fena-payment] Missing FENA_CLIENT_ID or FENA_CLIENT_SECRET');
    return new Response(JSON.stringify({ error: 'Payment service not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const paymentRef = reference || `VP-${String(orderId).slice(0, 8).toUpperCase()}`;
  console.log(`[create-fena-payment] ref=${paymentRef} amount=£${amount}`);

  try {
    const fenaRes = await fetch(
      'https://app.fena.co/api/single-immediate-payment-initiation-requests',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'client_id':     FENA_CLIENT_ID,
          'client_secret': FENA_CLIENT_SECRET,
        },
        body: JSON.stringify({
          amount:       parseFloat(amount).toFixed(2),
          reference:    paymentRef,
          redirect_url: `${BASE_URL}/checkout/payment-complete/?order_id=${orderId}&ref=${encodeURIComponent(paymentRef)}`,
          webhook_url:  `${BASE_URL}/api/fena-webhook`,
        }),
      }
    );

    const rawText = await fenaRes.text();
    console.log(`[create-fena-payment] Fena ${fenaRes.status}: ${rawText}`);

    let data = {};
    try { data = JSON.parse(rawText); } catch { data = { _raw: rawText }; }

    if (!fenaRes.ok) {
      return new Response(
        JSON.stringify({ error: data.message || data.error || `Fena HTTP ${fenaRes.status}`, debug: data }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fena may use different field names across API versions — try all known ones
    const paymentUrl    = data.payment_url  || data.url        || data.link ||
                          data.hostedPaymentUrl || data.checkout_url;
    const fenaPaymentId = data.id           || data.payment_id || data.reference;

    if (!paymentUrl) {
      console.error('[create-fena-payment] No payment URL in response:', data);
      return new Response(
        JSON.stringify({ error: 'No payment URL returned by Fena', debug: data }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[create-fena-payment] SUCCESS fenaId=${fenaPaymentId}`);

    return new Response(JSON.stringify({ paymentUrl, fenaPaymentId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[create-fena-payment] fetch threw:', err.message);
    return new Response(JSON.stringify({ error: 'Failed to reach Fena API', detail: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
