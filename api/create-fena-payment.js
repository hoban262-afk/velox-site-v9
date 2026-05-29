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

  const meta = metadata || {};

  // ── Capture the order in Supabase as 'pending' BEFORE redirecting ──────────
  // This is the source of truth: it survives the customer's browser losing
  // sessionStorage across the mobile bank-app redirect. The webhook /
  // confirm-fena-payment later flip it to 'paid' (which fires Click & Drop,
  // emails, Xero). Best-effort — a DB hiccup must never block taking payment.
  const SB_URL     = process.env.SUPABASE_URL;
  const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  const fullName = (meta.customer_name || `${meta.fname || ''} ${meta.lname || ''}`).trim() || 'Customer';
  let supabaseOrderId = orderId || '';

  if (SB_URL && SB_SERVICE) {
    try {
      const row = {
        customer_name:  fullName,
        customer_email: meta.customer_email || '',
        items:          Array.isArray(meta.items) ? meta.items : [],
        subtotal:       n(meta.subtotal) || n(amountStr),
        total:          n(meta.total)    || n(amountStr),
        status:         'pending',
        payment_method: 'fena',
        notes:          paymentRef,
        user_id:        meta.user_id || null,
        ship_name:      fullName,
        ship_line1:     meta.addr1    || null,
        ship_line2:     meta.addr2    || null,
        ship_city:      meta.city     || null,
        ship_postcode:  meta.postcode || null,
        ship_country:   meta.country  || 'GB',
        ship_phone:     meta.customer_phone || null,
      };
      const ins = await fetch(`${SB_URL}/rest/v1/orders`, {
        method:  'POST',
        headers: {
          apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`,
          'Content-Type': 'application/json', Prefer: 'return=representation',
        },
        body: JSON.stringify(row),
      });
      if (ins.ok) {
        const created = await ins.json().catch(() => null);
        if (Array.isArray(created) && created[0] && created[0].id) supabaseOrderId = created[0].id;
      } else {
        console.error('[create-fena-payment] pending order insert failed:', ins.status, (await ins.text()).slice(0, 200));
      }
    } catch (e) {
      console.error('[create-fena-payment] pending order insert threw (non-fatal):', e.message);
    }
  }

  const redirectUrl = `${BASE_URL}/checkout/payment-complete/?order_id=${encodeURIComponent(supabaseOrderId)}&ref=${encodeURIComponent(paymentRef)}&method=fena`;

  console.log(`[create-fena-payment] ref=${paymentRef} amount=£${amountStr} orderId=${supabaseOrderId || 'none'}`);

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

    // Record the Fena payment id on the pending order (best-effort).
    if (SB_URL && SB_SERVICE && supabaseOrderId && fenaPaymentId) {
      try {
        await fetch(`${SB_URL}/rest/v1/orders?id=eq.${encodeURIComponent(supabaseOrderId)}`, {
          method:  'PATCH',
          headers: {
            apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`,
            'Content-Type': 'application/json', Prefer: 'return=minimal',
          },
          body: JSON.stringify({ fena_payment_id: String(fenaPaymentId) }),
        });
      } catch (e) { /* non-fatal */ }
    }

    console.log(`[create-fena-payment] SUCCESS fenaId=${fenaPaymentId}`);
    return new Response(JSON.stringify({ paymentUrl, fenaPaymentId, orderId: supabaseOrderId || null }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://veloxpeps.com' },
    });

  } catch (err) {
    console.error('[create-fena-payment] fetch threw:', err.message);
    return new Response(JSON.stringify({ error: 'Failed to reach Fena API', detail: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
