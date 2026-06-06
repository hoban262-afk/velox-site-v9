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

  // ── Verify Velox Peps Pro membership → entitled discount (server-trusted) ─────
  // The cart sends member-discounted prices; without recomputing the entitlement
  // here the price guard below would wrongly reject legitimate member orders.
  // memberPct comes ONLY from the verified user token + profile, never the client.
  let memberPct = 0, memberTier = null;
  try {
    const authz = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const SBU = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
    if (authz && SBU && SVC) {
      const ures = await fetch(`${SBU}/auth/v1/user`, { headers: { Authorization: `Bearer ${authz}`, apikey: ANON || SVC } });
      if (ures.ok) {
        const u = await ures.json();
        if (u && u.id) {
          const pr = await fetch(`${SBU}/rest/v1/profiles?id=eq.${u.id}&select=is_pro,pro_tier,pro_until`, { headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });
          const prof = pr.ok ? (await pr.json())[0] : null;
          if (prof && prof.is_pro && prof.pro_tier && (!prof.pro_until || new Date(prof.pro_until) > new Date())) {
            const tr = await fetch(`${SBU}/rest/v1/membership_tiers?key=eq.${encodeURIComponent(prof.pro_tier)}&select=discount_pct`, { headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });
            const t = tr.ok ? (await tr.json())[0] : null;
            memberPct = t ? Number(t.discount_pct) : 0;
            memberTier = prof.pro_tier;
          }
        }
      }
    }
  } catch (e) { console.error('[create-fena-payment] member lookup (non-fatal):', e.message); }

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

  // ── Server-side price guard (source of truth = product_variants) ────────────
  // Recompute the pre-discount subtotal from the DB. If the basket is priced
  // BELOW source-of-truth, the client prices were tampered or badly stale —
  // reject instead of charging a wrong amount. Fails OPEN (never blocks a sale)
  // on a DB hiccup or an unknown variant, so legitimate orders are never lost.
  // Legit discounts reduce the TOTAL, not the subtotal, so they don't trip this.
  if (SB_URL && SB_SERVICE && Array.isArray(meta.items) && meta.items.length) {
    try {
      const vr = await fetch(`${SB_URL}/rest/v1/product_variants?select=slug,size,base_price,sale_price`, {
        headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` },
      });
      if (vr.ok) {
        const variants = await vr.json();
        const priceMap = {};
        variants.forEach((v) => { priceMap[`${v.slug}|${v.size}`] = (v.sale_price != null ? Number(v.sale_price) : Number(v.base_price)); });
        let dbSubtotal = 0, allKnown = true;
        for (const it of meta.items) {
          const dbp = priceMap[`${it.slug || ''}|${it.size || ''}`];
          if (dbp == null) { allKnown = false; break; }     // unknown variant → fail open
          dbSubtotal += dbp * (Number(it.qty) || 1);
        }
        dbSubtotal = Math.round(dbSubtotal * 100) / 100;
        // Lower the floor by the member's verified tier discount so Pro orders pass.
        const dbFloor = Math.round(dbSubtotal * (1 - memberPct / 100) * 100) / 100;
        if (allKnown && n(meta.subtotal) + 0.01 < dbFloor) {
          console.warn(`[create-fena-payment] PRICE GUARD: client subtotal £${n(meta.subtotal)} below floor £${dbFloor} (memberPct=${memberPct}) — rejecting`);
          return new Response(JSON.stringify({ error: 'Your basket prices are out of date. Please refresh the page and try again.' }),
            { status: 409, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://veloxpeps.com' } });
        }
      }
    } catch (e) {
      console.error('[create-fena-payment] price guard threw (non-fatal):', e.message);
    }
  }

  if (SB_URL && SB_SERVICE) {
    try {
      const row = {
        customer_name:  fullName,
        customer_email: meta.customer_email || '',
        items:          Array.isArray(meta.items) ? meta.items : [],
        subtotal:       n(meta.subtotal) || n(amountStr),
        total:          n(meta.total)    || n(amountStr),
        discount:       n(meta.discount_saving) || 0,
        shipping:       n(meta.shipping)         || 0,
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
