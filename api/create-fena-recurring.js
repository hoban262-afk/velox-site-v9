/**
 * /api/create-fena-recurring — Vercel Edge Function
 *
 * Sets up a Fena RECURRING payment (UK bank standing order) and returns the
 * hosted link for the customer to authorise in their banking app. Powers:
 *   • Velox Peps Pro membership  (kind:'pro',  tier:'solo|group|lab', plan:'monthly|annual')
 *   • Subscribe-&-Save reorders  (kind:'reorder', items:[...])  — fixed monthly basket
 *
 * Fena standing-order constraints (see toolkit-docs.fena.co .../recurring-payments):
 *   • Customer initiates once; the BANK then runs it. Amount is FIXED per cycle.
 *   • Merchant cannot change/cancel — only the customer (in their bank).
 *   • First payment date must be >= 3 working days in the future.
 *   • Status updates arrive via /api/fena-webhook (sent/active/paid/warning/cancelled).
 *
 * ⚠️ ENDPOINT/BODY VERIFICATION: Fena's create-recurring reference page wasn't
 * machine-readable when this was written. The path + field names below mirror the
 * working single-payment call (open/payments/single/create-and-process) with the
 * recurring path + `frequency` + `firstPaymentDate`, per Fena's "the initiation
 * flow is the same as single payments" note. Confirm against a live sandbox call
 * (it logs the raw Fena response) and override FENA_RECURRING_ENDPOINT if needed —
 * exactly how the single endpoint was verified on 2026-05-27.
 */

export const config = { runtime: 'edge' };

const FENA_RECURRING_ENDPOINT =
  // override via env once confirmed against the live API
  globalThis.process?.env?.FENA_RECURRING_ENDPOINT ||
  'https://epos.api.prod-gcp.fena.co/open/payments/recurring/create-and-process';

const CORS = {
  'Access-Control-Allow-Origin': 'https://veloxpeps.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

// Fena requires numberOfPayments on a standing order (it models them as a fixed
// count, not open-ended). We pick a long horizon so a subscription never silently
// expires — the customer can cancel anytime in their own banking app.
const SUB_HORIZON_YEARS = 10;
const PAYMENTS_PER_YEAR = { one_week: 52, one_month: 12, three_months: 4, one_year: 1 };
function numberOfPaymentsFor(frequency) {
  const perYear = PAYMENTS_PER_YEAR[frequency] || 12;
  return perYear * SUB_HORIZON_YEARS;
}

// First payment must be >= 3 working days out (skip Sat/Sun). Returns YYYY-MM-DD.
function firstPaymentDate(workingDays = 3) {
  const d = new Date();
  let added = 0;
  while (added < workingDays) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const ID       = process.env.FENA_CLIENT_ID;
  const SECRET   = process.env.FENA_CLIENT_SECRET;
  const SB_URL   = process.env.SUPABASE_URL;
  const SERVICE  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANON     = process.env.SUPABASE_ANON_KEY;
  const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://veloxpeps.com';
  if (!ID || !SECRET) return json({ error: 'Payment service not configured' }, 500);
  if (!SB_URL || !SERVICE) return json({ error: 'Not configured' }, 500);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON body' }, 400); }

  const kind = body.kind === 'reorder' ? 'reorder' : 'pro';
  const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

  // ── Resolve the signed-in user from their Supabase token (never trust client id) ──
  let user = null;
  const authz = req.headers.get('authorization') || '';
  const token = authz.replace(/^Bearer\s+/i, '');
  if (token) {
    try {
      const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: ANON || SERVICE } });
      if (u.ok) user = await u.json();
    } catch { /* anonymous */ }
  }
  const email = (user?.email || body.customerEmail || '').toLowerCase().trim();
  if (!email) return json({ error: 'Sign in or provide an email to subscribe' }, 401);
  const userId = user?.id || null;

  // ── Determine amount + frequency SERVER-SIDE ─────────────────────────────────
  let amountPence, frequency, tier = null, plan = null, items = [], discountPercent = 0;

  if (kind === 'pro') {
    tier = String(body.tier || '').toLowerCase();
    plan = body.plan === 'annual' ? 'annual' : 'monthly';
    // Price comes from the membership_tiers config table — never from the client.
    const tr = await fetch(`${SB_URL}/rest/v1/membership_tiers?key=eq.${encodeURIComponent(tier)}&active=eq.true&select=*`, { headers: sbHeaders });
    const rows = tr.ok ? await tr.json() : [];
    const t = Array.isArray(rows) ? rows[0] : null;
    if (!t) return json({ error: 'Unknown membership tier' }, 400);
    amountPence = plan === 'annual' ? t.annual_price_pence : t.monthly_price_pence;
    // Fena recurring requires lowercase: one_week | one_month | three_months | one_year
    frequency   = plan === 'annual' ? 'one_year' : 'one_month';
    discountPercent = t.discount_pct;
  } else {
    // Subscribe-&-save: fixed monthly basket, priced from product_variants (DB truth).
    items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return json({ error: 'No items to subscribe to' }, 400);
    const vr = await fetch(`${SB_URL}/rest/v1/product_variants?select=slug,size,base_price,sale_price`, { headers: sbHeaders });
    const variants = vr.ok ? await vr.json() : [];
    const priceMap = {};
    variants.forEach((v) => { priceMap[`${v.slug}|${v.size}`] = (v.sale_price != null ? Number(v.sale_price) : Number(v.base_price)); });
    let subtotal = 0;
    for (const it of items) {
      const p = priceMap[`${it.slug || ''}|${it.size || ''}`];
      if (p == null) return json({ error: `Unknown item: ${it.slug || '?'}` }, 400);
      subtotal += p * (Number(it.qty) || 1);
    }
    // Apply the member's tier discount to the recurring basket if they're Pro.
    if (userId) {
      const pr = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=is_pro,pro_tier,pro_until`, { headers: sbHeaders });
      const prof = pr.ok ? (await pr.json())[0] : null;
      if (prof?.is_pro && (!prof.pro_until || new Date(prof.pro_until) > new Date()) && prof.pro_tier) {
        const tr = await fetch(`${SB_URL}/rest/v1/membership_tiers?key=eq.${encodeURIComponent(prof.pro_tier)}&select=discount_pct`, { headers: sbHeaders });
        const t = tr.ok ? (await tr.json())[0] : null;
        discountPercent = t ? Number(t.discount_pct) : 0;
      }
    }
    subtotal = subtotal * (1 - discountPercent / 100);
    amountPence = Math.round(subtotal * 100);
    // Customer-chosen cadence (Fena enums). Default monthly; quarterly also allowed.
    frequency = body.frequency === 'three_months' ? 'three_months' : 'one_month';
  }
  if (!amountPence || amountPence <= 0) return json({ error: 'Invalid subscription amount' }, 400);

  const amountStr  = (amountPence / 100).toFixed(2);
  const rawRef     = (body.reference || (kind === 'pro' ? 'PRO' : 'SUB') + Date.now().toString(36));
  const reference  = (rawRef.replace(/[^A-Za-z0-9]/g, '').slice(0, 12)) || 'VPSUB';
  const firstDate  = firstPaymentDate(3);

  // ── Record the subscription as 'draft' before redirecting (source of truth) ──
  let subId = null;
  try {
    const ins = await fetch(`${SB_URL}/rest/v1/subscriptions`, {
      method: 'POST', headers: { ...sbHeaders, Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: userId, customer_email: email, kind, tier, plan,
        amount_pence: amountPence, frequency, status: 'draft',
        reference, first_payment_date: firstDate, items, discount_percent: discountPercent,
      }),
    });
    if (ins.ok) { const r = await ins.json(); subId = Array.isArray(r) && r[0] ? r[0].id : null; }
    else console.error('[create-fena-recurring] sub insert failed:', ins.status, (await ins.text()).slice(0, 200));
  } catch (e) { console.error('[create-fena-recurring] sub insert threw:', e.message); }

  const redirectUrl = `${BASE_URL}/account/?sub=${encodeURIComponent(subId || '')}&ref=${encodeURIComponent(reference)}`;

  // ── Create the recurring standing order with Fena ───────────────────────────
  // Build the payload as an object so we can echo it back on failure for debugging.
  const fenaBody = {
    reference,
    // Recurring endpoint wants amount as a NUMBER (the single-payment endpoint
    // takes a 2dp string, but this service rejects the string as "required").
    amount: Number(amountStr),
    frequency: String(frequency).toLowerCase(), // Fena requires lowercase enum
    // Fena requires numberOfPayments (it treats standing orders as a fixed
    // count). Long horizon ⇒ effectively ongoing; customer cancels in-bank.
    numberOfPayments: numberOfPaymentsFor(frequency),
    // Fena's recurring API requires `recurringPaymentDate` (the date the bank
    // first runs the standing order). Send several name variants for compatibility.
    recurringPaymentDate: firstDate,
    firstPaymentDate: firstDate,
    startDate: firstDate,
    customerEmail: email, customerName: user?.user_metadata?.name || body.customerName || '',
    items: [], customRedirectUrl: redirectUrl,
  };
  try {
    const fenaRes = await fetch(FENA_RECURRING_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'integration-id': ID, 'secret-key': SECRET },
      body: JSON.stringify(fenaBody),
    });
    const rawText = await fenaRes.text();
    console.log(`[create-fena-recurring] Fena ${fenaRes.status}: ${rawText.slice(0, 400)}`);
    let data = {}; try { data = JSON.parse(rawText); } catch { data = { _raw: rawText }; }

    if (!fenaRes.ok || !data.created) {
      return json({ error: (data.message || data.error || `Fena HTTP ${fenaRes.status}`), debug: data, sent: fenaBody }, 502);
    }
    const link  = data.result && data.result.link;
    const fenaId = data.result && data.result.id;
    if (!link) return json({ error: 'No payment URL returned by Fena', debug: data }, 502);

    if (subId && fenaId) {
      await fetch(`${SB_URL}/rest/v1/subscriptions?id=eq.${subId}`, {
        method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ fena_payment_id: String(fenaId), status: 'sent', updated_at: new Date().toISOString() }),
      }).catch(() => {});
    }
    return json({ paymentUrl: link, subscriptionId: subId, fenaPaymentId: fenaId });
  } catch (err) {
    console.error('[create-fena-recurring] fetch threw:', err.message);
    return json({ error: 'Failed to reach Fena API', detail: err.message }, 500);
  }
}
