/**
 * POST /api/track — first-party beacon (public, no PII).
 * Page view:  { sid, path?, ref?, utm? }      → inserts one row into `visits`.
 *   `utm` is the campaign snapshot for a landing hit (utm_* without the prefix,
 *   plus gclid/fbclid/ttclid/msclkid). Present only on paid/tagged arrivals.
 * Funnel event:{ sid, event, path?, meta? }    → inserts one row into `events`
 *   (event ∈ product_view | add_to_cart | begin_checkout |
 *    payment_method_selected | purchase). Kept in a separate table so it does
 *   not inflate page-view/traffic counts. Optional `meta` (jsonb) carries small
 *   non-PII context, e.g. { method:'fena' }, so per-method funnel drop-off can
 *   be measured. Fire-and-forget.
 */
const { sendEvent, clientIp } = require('../lib/meta-capi');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOWED_EVENTS = new Set(['product_view', 'add_to_cart', 'begin_checkout', 'payment_method_selected', 'purchase']);

// Keep meta tiny and non-PII: only short scalars, no nesting, hard caps.
// `value`/`currency`/`content_id` were added for the Meta events and are useful
// in their own right — they let the funnel be measured in money, not just counts.
function cleanMeta(m) {
  if (!m || typeof m !== 'object') return null;
  const out = {};
  if (m.method != null) out.method = String(m.method).replace(/[^a-z0-9_-]/gi, '').slice(0, 24);
  if (m.ref != null)    out.ref    = String(m.ref).replace(/[^a-z0-9_-]/gi, '').slice(0, 32);
  if (m.value != null) { const v = Number(m.value); if (Number.isFinite(v) && v >= 0) out.value = Math.round(v * 100) / 100; }
  if (m.currency != null)   out.currency   = String(m.currency).replace(/[^A-Z]/gi, '').slice(0, 8).toUpperCase();
  if (m.content_id != null) out.content_id = String(m.content_id).replace(/[^a-z0-9_-]/gi, '').slice(0, 64);
  return Object.keys(out).length ? out : null;
}

// The Meta side-channel on the beacon: which standard event the browser pixel
// fired, the event_id it used (so Meta can dedupe the two copies), and the
// first-party cookies that make the server-side copy matchable. Whitelisted like
// everything else here — this endpoint is public and unsigned.
// Deliberately NOT persisted to the database: it is routing data for the
// Conversions API, not analytics, and `events.meta` is documented as non-PII.
const FB_EVENTS = new Set(['ViewContent', 'AddToCart', 'InitiateCheckout', 'AddPaymentInfo', 'Purchase']);
function cleanFb(f) {
  if (!f || typeof f !== 'object' || Array.isArray(f)) return null;
  const event = String(f.event || '');
  if (!FB_EVENTS.has(event)) return null;
  const eid = String(f.eid || '').replace(/[^a-z0-9._-]/gi, '').slice(0, 128);
  if (!eid) return null;
  const out = { event, eid };
  if (f.fbp != null) { const v = String(f.fbp).replace(/[^a-z0-9._-]/gi, '').slice(0, 128); if (v) out.fbp = v; }
  if (f.fbc != null) { const v = String(f.fbc).replace(/[^a-z0-9._-]/gi, '').slice(0, 128); if (v) out.fbc = v; }
  return out;
}

// Campaign attribution for a landing hit. This endpoint is public and unsigned,
// so the shape is whitelisted rather than trusted: fixed key set, no nesting,
// hard length caps. Anything else a caller sends is dropped.
const UTM_KEYS = ['source', 'medium', 'campaign', 'content', 'term', 'gclid', 'fbclid', 'ttclid', 'msclkid', 'landing'];
function cleanUtm(u) {
  if (!u || typeof u !== 'object' || Array.isArray(u)) return null;
  const out = {};
  for (const k of UTM_KEYS) {
    if (u[k] == null) continue;
    const v = String(u[k]).replace(/[^\w .:/+-]/g, '').slice(0, 120);
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

module.exports = async function handler(req, res) {
  // Same-origin beacon; respond fast regardless.
  if (req.method !== 'POST') { res.status(405).end(); return; }
  if (!SUPABASE_URL || !SERVICE) { res.status(204).end(); return; }

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  const sid = String(b.sid || '').replace(/[^a-z0-9]/gi, '').slice(0, 40);
  if (!sid) { res.status(204).end(); return; }
  const path = b.path ? String(b.path).slice(0, 300) : null;
  const ref  = b.ref ? String(b.ref).slice(0, 300) : null;
  const event = b.event ? String(b.event).slice(0, 40) : null;
  const meta  = cleanMeta(b.meta);
  const utm   = cleanUtm(b.utm);
  const fb    = cleanFb(b.fb);

  // Mirror the browser pixel to the Conversions API. Kicked off here so it runs
  // concurrently with the Supabase insert below rather than adding its own
  // latency on top — both are awaited before the response, because ending the
  // response freezes the function and kills anything still in flight (the bug
  // documented below). Never rejects, so it can't take the beacon down with it.
  const metaSend = fb ? sendEvent({
    eventName: fb.event,
    eventId: fb.eid,
    sourceUrl: path ? `https://veloxpeps.com${path}` : undefined,
    userData: {
      fbp: fb.fbp,
      fbc: fb.fbc,
      ip: clientIp(req),
      userAgent: req.headers['user-agent'],
      // No email: this endpoint is public and unsigned, so it must never carry
      // PII. The authoritative, email-matched Purchase is sent server-side from
      // the paid-order path in api/confirm-fena-payment.js under the same
      // event_id, which is where an email legitimately exists.
    },
    customData: meta ? {
      value: meta.value,
      currency: meta.currency,
      contentIds: meta.content_id ? [meta.content_id] : undefined,
      contentType: (event === 'product_view' || event === 'add_to_cart') ? 'product' : undefined,
    } : undefined,
  }).catch(() => null) : null;

  // Finish the DB write BEFORE responding. This used to answer 204 first and
  // then await the insert, which looks like a free win but isn't: Vercel freezes
  // the function the moment the response ends, so the in-flight fetch to
  // Supabase was killed mid-request. That surfaced as intermittent
  // "[track] beacon error fetch failed" in the runtime logs and, more
  // damagingly, as visits that silently never landed — so the traffic numbers
  // undercounted by an unknown amount.
  //
  // Nothing waits on this response: the browser sends it via navigator.sendBeacon
  // (or fetch with keepalive), both of which are fire-and-forget from the page's
  // point of view. The extra ~50ms costs the visitor nothing.
  const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  // Cap the work so a slow or unreachable Supabase can't hold the function open.
  const timeout = () => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(3000) : undefined;
  try {
    if (event && ALLOWED_EVENTS.has(event)) {
      const e = await fetch(`${SUPABASE_URL}/rest/v1/events`, {
        method: 'POST', headers: sbHeaders, signal: timeout(),
        body: JSON.stringify(meta ? { sid, event, path, meta } : { sid, event, path }),
      });
      if (!e.ok) console.error('[track] events insert failed', e.status, (await e.text().catch(() => '')).slice(0, 200));
    } else {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/visits`, {
        method: 'POST', headers: sbHeaders, signal: timeout(),
        body: JSON.stringify(utm ? { sid, path, ref, utm } : { sid, path, ref }),
      });
      // Self-heal: a `visits` schema drift (e.g. the optional `ref`/`utm` column
      // being dropped/renamed) would otherwise make every insert 400 and silently
      // freeze ALL visit logging. Surface it, then degrade one column at a time
      // rather than straight to the minimum, so a missing `utm` doesn't also cost
      // us `ref`. Last resort is (sid, path); created_at defaults server-side.
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        console.error('[track] visits insert failed', r.status, detail.slice(0, 200));
        if (r.status === 400 || r.status === 404) {
          let ok = false;
          if (utm) {
            const r2 = await fetch(`${SUPABASE_URL}/rest/v1/visits`, {
              method: 'POST', headers: sbHeaders, signal: timeout(),
              body: JSON.stringify({ sid, path, ref }),
            });
            ok = r2.ok;
          }
          if (!ok) {
            await fetch(`${SUPABASE_URL}/rest/v1/visits`, {
              method: 'POST', headers: sbHeaders, signal: timeout(),
              body: JSON.stringify({ sid, path }),
            });
          }
        }
      }
    }
  } catch (e) { console.error('[track] beacon error', e && e.message); }
  // Same reasoning as the Supabase write: this must settle before the response
  // ends, or Vercel freezes the function and the Conversions API call dies in
  // flight. It was started before the insert, so this usually adds no latency.
  if (metaSend) { try { await metaSend; } catch (e) {} }
  res.status(204).end();
};
