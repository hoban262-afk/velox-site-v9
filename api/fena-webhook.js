/**
 * /api/fena-webhook — Vercel Edge Function
 *
 * Fena calls this endpoint when a payment event occurs.
 * On success: marks the order as 'paid' in Supabase via the REST API.
 *
 * Fena sends: POST  application/x-www-form-urlencoded  { token: "<jwt>" }
 * (Some Fena versions send JSON — both are handled.)
 *
 * The order_id in the JWT payload is the Supabase UUID we passed as
 * part of the redirect_url when creating the payment session.
 *
 * NOTE: Full JWT signature verification should be added once you confirm
 * Fena's signing algorithm — see SETUP.md.
 */

export const config = { runtime: 'edge' };

const SUCCESS_STATUSES = new Set(['completed', 'success', 'paid', 'captured']);

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const SUPABASE_URL              = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[fena-webhook] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return new Response('Misconfigured', { status: 500 });
  }

  // ── Parse body ───────────────────────────────────────────────────────────────
  let token;
  try {
    const ct = (req.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('application/x-www-form-urlencoded')) {
      const params = new URLSearchParams(await req.text());
      token = params.get('token');
    } else {
      const json = await req.json();
      token = json.token || json.jwt;
    }
  } catch (err) {
    console.error('[fena-webhook] Body parse error:', err.message);
    return new Response('Bad request', { status: 400 });
  }

  if (!token) {
    console.error('[fena-webhook] No token in request');
    return new Response('Missing token', { status: 400 });
  }

  // ── Decode JWT payload ───────────────────────────────────────────────────────
  let payload;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Malformed JWT');
    const b64    = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    payload = JSON.parse(atob(padded));
  } catch (err) {
    console.error('[fena-webhook] JWT decode failed:', err.message);
    return new Response('Invalid token', { status: 400 });
  }

  console.log('[fena-webhook] payload:', JSON.stringify(payload));

  const status    = (payload.status || payload.payment_status || '').toLowerCase();
  // order_id is the Supabase UUID we embedded in the redirect_url
  const orderId   = payload.order_id || payload.metadata?.order_id || null;
  const paymentId = payload.payment_id || payload.id || token.slice(0, 24);

  if (!SUCCESS_STATUSES.has(status)) {
    console.log(`[fena-webhook] status="${status}" is not a success event — acknowledging`);
    return new Response('OK', { status: 200 });
  }

  if (!orderId) {
    console.warn('[fena-webhook] No order_id in payload — cannot update Supabase. Acknowledging.');
    return new Response('OK', { status: 200 });
  }

  // ── Update order in Supabase ─────────────────────────────────────────────────
  try {
    const patchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`,
      {
        method:  'PATCH',
        headers: {
          'apikey':        SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type':  'application/json',
          'Prefer':        'return=minimal',
        },
        body: JSON.stringify({ status: 'paid', fena_payment_id: paymentId }),
      }
    );

    if (!patchRes.ok) {
      const errText = await patchRes.text();
      console.error(`[fena-webhook] Supabase PATCH ${patchRes.status}: ${errText}`);
      return new Response('DB error', { status: 500 });
    }

    console.log(`[fena-webhook] Order ${orderId} → paid (fenaId: ${paymentId})`);
    return new Response('OK', { status: 200 });

  } catch (err) {
    console.error('[fena-webhook] Supabase fetch threw:', err.message);
    return new Response('Internal error', { status: 500 });
  }
}
