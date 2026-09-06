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
const LOGO = 'https://veloxpeps.com/assets/images/veloxpeps2.png';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Campaign attribution captured by core.js (window.vpAttr) and stored on the
// order, so we can tell which advert produced which sale. This is caller-supplied
// data on a public endpoint, so the shape is whitelisted, not trusted: fixed key
// set, one level of nesting, hard length caps. Returns null when there is
// nothing to attribute.
const ATTR_KEYS = ['source', 'medium', 'campaign', 'content', 'term', 'gclid', 'fbclid', 'ttclid', 'msclkid', 'landing'];
function cleanTouch(t) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) return null;
  const out = {};
  for (const k of ATTR_KEYS) {
    if (t[k] == null) continue;
    const v = String(t[k]).replace(/[^\w .:/+-]/g, '').slice(0, 120);
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}
function cleanAttribution(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return null;
  const out = {};
  const first = cleanTouch(a.first);
  const last  = cleanTouch(a.last);
  if (first) out.first = first;
  if (last)  out.last  = last;
  if (a.ref != null) {
    const ref = String(a.ref).replace(/[^a-z0-9_-]/gi, '').slice(0, 32);
    if (ref) out.ref = ref;
  }
  return Object.keys(out).length ? out : null;
}

// Branded "complete your payment" email — mirrors api/send-payment-link.js's
// buildEmailHtml so the self-serve (create-fena-payment) and admin
// (send-payment-link) flows send an identical-looking mail. Sent edge-side via
// the Resend REST API (the Node SDK can't run in an edge function).
function buildEmailHtml(customerName, ref, amountStr, paymentUrl) {
  const first = String(customerName || '').trim().split(/\s+/)[0] || 'there';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><title>Complete your payment</title>
<style>:root{color-scheme:dark;supported-color-schemes:dark}</style></head>
<body style="margin:0;padding:0;background:#030407;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#030407">
<tr><td align="center" style="padding:32px 16px">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#0d0d0d;border:1px solid #1a1a1a;border-radius:8px;overflow:hidden">
  <tr><td style="background:#01D3A0;height:4px;font-size:0;line-height:0">&nbsp;</td></tr>
  <tr><td align="center" style="padding:32px 40px 20px">
    <img src="${LOGO}" alt="Velox Peptides" width="160" style="max-width:160px;height:auto;display:block;border:0"></td></tr>
  <tr><td style="padding:0 40px 8px">
    <p style="margin:0 0 14px;font-size:15px;color:#fff">Hi ${esc(first)},</p>
    <p style="margin:0 0 14px;font-size:14px;color:#c7ccd4;line-height:1.6">
      Here's a secure link to complete payment for your Velox Peptides order
      <strong style="color:#fff">${esc(ref)}</strong>. Payment is handled by Fena open banking —
      you authorise it directly in your own banking app, and no card or bank details are stored on our site.</p></td></tr>
  <tr><td align="center" style="padding:8px 40px 6px">
    <a href="${esc(paymentUrl)}" style="display:inline-block;background:#01D3A0;color:#021;text-decoration:none;font-weight:700;font-size:15px;padding:14px 34px;border-radius:8px">
      Pay £${esc(amountStr)} securely →</a></td></tr>
  <tr><td align="center" style="padding:2px 40px 22px">
    <p style="margin:0;font-size:11px;color:#6b7280">If the button doesn't work, paste this into your browser:<br>
      <span style="color:#9ca3af;word-break:break-all">${esc(paymentUrl)}</span></p></td></tr>
  <tr><td style="padding:0 40px 30px">
    <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6">
      Prefer to pay another way, or having trouble? Just reply to this email and we'll help.
      This link is for order ${esc(ref)} only.</p></td></tr>
</table></td></tr></table></body></html>`;
}

// Best-effort branded email of the Fena hosted link via the Resend REST API.
// Returns true only on a confirmed Resend 2xx; never throws (a failed email
// must not fail the payment — the frontend can still surface the link).
async function emailPaymentLink({ to, customerName, ref, amountStr, paymentUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !to || !paymentUrl) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from:     'Velox Peptides <orders@veloxpeps.com>',
        to,
        reply_to: 'support@veloxpeps.com',
        subject:  `Complete your payment — order ${ref}`,
        html:     buildEmailHtml(customerName, ref, amountStr, paymentUrl),
      }),
    });
    if (!r.ok) {
      console.error('[create-fena-payment] Resend link email failed:', r.status, (await r.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[create-fena-payment] Resend link email threw (non-fatal):', e.message);
    return false;
  }
}

// Ask Fena's own public status endpoint whether a payment id has settled.
// Same contract used by confirm-fena-payment.js / fena-webhook.js / recovery.
const FENA_PAID_STATUSES = new Set(['paid', 'completed', 'settled', 'captured', 'complete', 'success']);
async function fenaPaymentPaid(paymentId) {
  if (!paymentId) return false;
  try {
    const r = await fetch(`https://epos.api.prod-gcp.fena.co/public/payment-flow/single/${encodeURIComponent(paymentId)}/data`);
    if (!r.ok) return false;
    const j = await r.json().catch(() => null);
    const s = j && j.data && j.data.status ? String(j.data.status).toLowerCase() : '';
    return FENA_PAID_STATUSES.has(s);
  } catch { return false; }
}

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

  // ── Rate limit (financial-exposure guard) ───────────────────────────────────
  // This endpoint is public and creates a Fena payment + a DB row on every call,
  // so a scripted loop could spam Fena and bloat the orders table. Cap per-IP
  // request rate. Fails OPEN on any error so a DB hiccup never blocks a real sale.
  try {
    const SBU = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (SBU && SVC) {
      const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
              || req.headers.get('x-real-ip') || 'unknown';
      const rl = await fetch(`${SBU}/rest/v1/rpc/check_rate_limit`, {
        method: 'POST',
        headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_key: `fena-create:${ip}`, p_limit: 12, p_window_seconds: 60 }),
      });
      if (rl.ok) {
        const allowed = await rl.json().catch(() => true);
        if (allowed === false) {
          console.warn(`[create-fena-payment] RATE LIMIT hit for ip=${ip}`);
          return new Response(JSON.stringify({ error: 'Too many requests. Please wait a moment and try again.' }),
            { status: 429, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://veloxpeps.com', 'Retry-After': '30' } });
        }
      }
    }
  } catch (e) { console.error('[create-fena-payment] rate-limit check threw (non-fatal):', e.message); }

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

  // ── Require a contactable email BEFORE creating the order ────────────────────
  // The pending order row is the source of truth the recovery cron chases when a
  // Pay-by-Bank attempt is abandoned. Without an email that row is unreachable, so
  // a lost sale can NEVER be recovered (this is what produced the blank-email
  // cancelled orders). Require a syntactically valid address here — the checkout
  // form already collects it — rather than writing an un-chaseable order.
  const custEmail = String(meta.customer_email || body.customerEmail || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(custEmail)) {
    return new Response(JSON.stringify({ error: 'A valid email address is required to complete checkout.' }),
      { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://veloxpeps.com' } });
  }
  meta.customer_email = custEmail; // normalise so the order row + Fena call use the trimmed value

  // ── Verify Velox Peps Pro membership → entitled discount (server-trusted) ─────
  // The cart sends member-discounted prices; without recomputing the entitlement
  // here the price guard below would wrongly reject legitimate member orders.
  // memberPct comes ONLY from the verified user token + profile, never the client.
  let memberPct = 0, memberTier = null, memberBalance = 0;
  try {
    const authz = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const SBU = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
    if (authz && SBU && SVC) {
      const ures = await fetch(`${SBU}/auth/v1/user`, { headers: { Authorization: `Bearer ${authz}`, apikey: ANON || SVC } });
      if (ures.ok) {
        const u = await ures.json();
        if (u && u.id) {
          const pr = await fetch(`${SBU}/rest/v1/profiles?id=eq.${u.id}&select=is_pro,pro_tier,pro_until,loyalty_points`, { headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });
          const prof = pr.ok ? (await pr.json())[0] : null;
          if (prof) {
            memberBalance = Number(prof.loyalty_points) || 0; // verified, so claimed points can't be spoofed
            if (prof.is_pro && prof.pro_tier && (!prof.pro_until || new Date(prof.pro_until) > new Date())) {
              const tr = await fetch(`${SBU}/rest/v1/membership_tiers?key=eq.${encodeURIComponent(prof.pro_tier)}&select=discount_pct`, { headers: { apikey: SVC, Authorization: `Bearer ${SVC}` } });
              const t = tr.ok ? (await tr.json())[0] : null;
              memberPct = t ? Number(t.discount_pct) : 0;
              memberTier = prof.pro_tier;
            }
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
        // ── Charge-amount guard ──────────────────────────────────────────────
        // amount_pence is client-supplied; the subtotal guard above doesn't see
        // the amount actually charged. Reject an implausibly low charge (e.g.
        // amount_pence:1 on a real basket → "pay a penny, get the order").
        // Floor = member-adjusted DB subtotal × 0.6, leaving room for any legit
        // promo stack on TOP of the member price (volume/code max 20% + affiliate
        // ~10% ⇒ charge ≈ 0.7 of member subtotal), minus VERIFIED points. Tightened
        // 0.5 → 0.6: real COGS is ~22% of retail and the lowest-margin sellable SKUs
        // are ~31%, so 0.5 allowed prices too close to cost under a max stack.
        // Generous £1 tolerance; fails open (allKnown only) so legit orders never break.
        const qtyTot   = meta.items.reduce((s, it) => s + (Number(it.qty) || 1), 0);
        const ptsValue = Math.min(n(meta.points_redeemed), memberBalance) / 100; // £, capped to real balance
        const minLegit = Math.round((dbSubtotal * (1 - memberPct / 100) * 0.6 - ptsValue) * 100) / 100;
        if (allKnown && n(amountStr) + 1.0 < minLegit) {
          console.warn(`[create-fena-payment] CHARGE GUARD: amount £${n(amountStr)} far below floor £${minLegit} (dbSubtotal=${dbSubtotal}, memberPct=${memberPct}, pts£=${ptsValue}) — rejecting`);
          return new Response(JSON.stringify({ error: 'Payment amount didn’t match your basket. Please refresh and try again.' }),
            { status: 409, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://veloxpeps.com' } });
        }
      }
    } catch (e) {
      console.error('[create-fena-payment] price guard threw (non-fatal):', e.message);
    }
  }

  // ── Collapse rapid retry duplicates ─────────────────────────────────────────
  // Every checkout submit used to INSERT a fresh 'pending' order, so a customer
  // who retried a Pay-by-Bank attempt (bank app closed, timed out, tried again)
  // left a trail of extra rows. Those later surfaced as separate 'cancelled'
  // orders, badly inflating the cancelled / lost-revenue metrics (a single buyer
  // who succeeded on their 3rd tap looked like 2 lost sales). Before inserting,
  // mark any still-unpaid 'pending' attempt from THIS visitor (same sid, last 2h)
  // as 'superseded' so it's excluded from cancelled/abandoned metrics and never
  // chased by the recovery cron. We check Fena FIRST and skip any attempt it has
  // actually settled, so a real payment is never hidden. Fully best-effort: any
  // error here must never block taking payment.
  if (SB_URL && SB_SERVICE && meta.sid) {
    try {
      const since  = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
      const dupUrl = `${SB_URL}/rest/v1/orders?payment_method=eq.fena&status=eq.pending`
        + `&sid=eq.${encodeURIComponent(meta.sid)}&created_at=gt.${encodeURIComponent(since)}`
        + `&select=id,fena_payment_id`;
      const dr = await fetch(dupUrl, { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` } });
      if (dr.ok) {
        const dupes = await dr.json().catch(() => []);
        for (const d of (Array.isArray(dupes) ? dupes : [])) {
          // Never hide an attempt the customer actually paid — leave it pending so
          // the webhook / confirm / recovery self-heal fulfils it as normal.
          if (d.fena_payment_id && await fenaPaymentPaid(d.fena_payment_id)) continue;
          // Conditional PATCH (status=eq.pending) so we can't clobber a row a
          // webhook just flipped to 'paid' in the same moment.
          await fetch(`${SB_URL}/rest/v1/orders?id=eq.${encodeURIComponent(d.id)}&status=eq.pending`, {
            method:  'PATCH',
            headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body:    JSON.stringify({ status: 'superseded' }),
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.error('[create-fena-payment] supersede-dupes threw (non-fatal):', e.message);
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
        discount_code:  meta.discount_code || null,
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
        sid:            (typeof meta.sid === 'string' && meta.sid.length <= 64) ? meta.sid : null,
        attribution:    cleanAttribution(meta.attribution),
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

    // ── Self-serve "email me a payment link" ─────────────────────────────────
    // When the checkout asks for the link by email (email_link:true) instead of
    // redirecting, deliver the SAME hosted link by mail so the customer can pay
    // on another device / later. Best-effort: `emailed` tells the frontend
    // whether to say "sent — check your inbox" or fall back to showing the link.
    let emailed = false;
    if (body.email_link) {
      emailed = await emailPaymentLink({
        to:           meta.customer_email || body.customerEmail || '',
        customerName: meta.customer_name  || fullName,
        ref:          paymentRef,
        amountStr,
        paymentUrl,
      });
      if (emailed) console.log(`[create-fena-payment] link emailed for order ${supabaseOrderId || 'none'} (${paymentRef})`);
    }

    console.log(`[create-fena-payment] SUCCESS fenaId=${fenaPaymentId}`);
    return new Response(JSON.stringify({ paymentUrl, fenaPaymentId, orderId: supabaseOrderId || null, emailed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://veloxpeps.com' },
    });

  } catch (err) {
    console.error('[create-fena-payment] fetch threw:', err.message);
    return new Response(JSON.stringify({ error: 'Failed to reach Fena API', detail: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
