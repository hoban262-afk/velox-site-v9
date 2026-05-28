/**
 * /api/create-fena-payment — Vercel Edge Function
 *
 * Creates a Fena single immediate payment and returns the hosted payment URL
 * for the browser to redirect the customer to.
 *
 * Endpoint + format taken from Fena's official SDK (github.com/fena-co/toolkit-php-sdk)
 * and verified working against the live Fena API on 2026-05-27:
 *   POST https://epos.api.prod-gcp.fena.co/open/payments/single/create-and-process
 *   Headers: integration-id, secret-key (Content-Type: application/json)
 *   Body:    { reference (<=12 chars), amount (2dp string), customerEmail,
 *              customerName, items, customRedirectUrl }
 *   Success: { created: true, result: { id, link, ... } }  ← result.link is the payment URL
 *
 * Accepts the checkout payload { amount_pence | amount, reference, metadata, orderId }.
 */

export const config = { runtime: 'edge' };

const FENA_ENDPOINT = 'https://epos.api.prod-gcp.fena.co/open/payments/single/create-and-process';

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
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body;
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const { orderId, reference, metadata } = body;

  // Amount: accept pence (from checkout) or a pounds value; Fena wants a 2-dp string
  const amountStr = (body.amount_pence != null)
    ? (Number(body.amount_pence) / 100).toFixed(2)
    : (body.amount != null ? parseFloat(body.amount).toFixed(2) : null);

  if (!amountStr || amountStr === 'NaN' || Number(amountStr) <= 0) {
    return new Response(JSON.stringify({ error: 'Missing or invalid amount' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const ID       = process.env.FENA_CLIENT_ID;
  const SECRET   = process.env.FENA_CLIENT_SECRET;
  const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://veloxpeps.com';

  if (!ID || !SECRET) {
    console.error('[create-fena-payment] Missing FENA_CLIENT_ID or FENA_CLIENT_SECRET');
    return new Response(JSON.stringify({ error: 'Payment service not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  // Fena requires the reference to be <= 12 chars, alphanumeric
  const rawRef     = reference || ('VP' + Date.now().toString(36));
  const paymentRef = (rawRef.replace(/[^A-Za-z0-9]/g, '').slice(0, 12)) || 'VP';

  const meta        = metadata || {};
  const redirectUrl = `${BASE_URL}/checkout/payment-complete/?order_id=${encodeURIComponent(orderId || '')}&ref=${encodeURIComponent(paymentRef)}&method=fena`;

  console.log(`[create-fena-payment] ref=${paymentRef} amount=£${amountStr}`);

  try {
    const fenaRes = await fetch(FENA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'integration-id': ID,
        'secret-key':     SECRET,
      },
      body: JSON.stringify({
        reference:         paymentRef,
        amount:            amountStr,
        customerEmail:     meta.customer_email || body.customerEmail || '',
        customerName:      meta.customer_name  || '',
        items:             [],
        customRedirectUrl: redirectUrl,
      }),
    });

    const rawText = await fenaRes.text();
    console.log(`[create-fena-payment] Fena ${fenaRes.status}: ${rawText.slice(0, 300)}`);

    let data = {};
    try { data = JSON.parse(rawText); } catch { data = { _raw: rawText }; }

    if (!fenaRes.ok || !data.created) {
      return new Response(
        JSON.stringify({ error: (data.message || data.error || `Fena HTTP ${fenaRes.status}`), debug: data }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const paymentUrl    = data.result && data.result.link;
    const fenaPaymentId = data.result && data.result.id;

    if (!paymentUrl) {
      console.error('[create-fena-payment] No result.link in response:', rawText.slice(0, 300));
      return new Response(JSON.stringify({ error: 'No payment URL returned by Fena', debug: data }),
        { status: 502, headers: { 'Content-Type': 'application/json' } });
    }

    console.log(`[create-fena-payment] SUCCESS fenaId=${fenaPaymentId}`);
    return new Response(JSON.stringify({ paymentUrl, fenaPaymentId, orderId: orderId || null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://veloxpeps.com' },
    });

  } catch (err) {
    console.error('[create-fena-payment] fetch threw:', err.message);
    return new Response(JSON.stringify({ error: 'Failed to reach Fena API', detail: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
