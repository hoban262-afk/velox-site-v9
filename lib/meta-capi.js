/**
 * lib/meta-capi.js — Meta Conversions API sender (server-side half of the pixel).
 *
 * Why this exists: the browser pixel in `output/assets/js/core.js` is silently
 * dropped for every visitor running an ad/tracker blocker, by iOS Safari's ITP,
 * and by anyone who declines tracking — which is a large slice of this audience.
 * Meta's delivery algorithm optimises against the conversions it can actually
 * see, so a pixel-only setup on a small budget trains on a biased, thinned
 * sample. Sending the same events server-to-server closes most of that gap.
 *
 * DEDUPLICATION — the thing to not get wrong.
 * Every event is sent twice on purpose: once from the browser, once from here.
 * Meta collapses the pair when BOTH of these match:
 *     event_name   e.g. 'Purchase'
 *     event_id     e.g. 'purchase.VP1234'
 * `core.js` generates the id and passes it to the server on the beacon, so the
 * two halves cannot disagree. If you ever fire an event from a new place, it
 * MUST carry the same event_id the browser used, or every conversion gets
 * counted twice and reported CPA halves — which looks like great news right up
 * until you scale spend on it.
 *
 * MATCH QUALITY. Meta can only credit a conversion to an ad if it can tie the
 * event to a person. The signals used here, best first:
 *   fbc  — the click id from the ad (`fbclid` -> `_fbc` cookie). Strongest.
 *   fbp  — the pixel's own first-party browser cookie.
 *   IP + user agent — weak alone, useful in combination.
 *   em   — SHA-256 of the customer's email. Strongest of all, and OFF BY
 *          DEFAULT: see META_CAPI_ADVANCED_MATCHING below. This is a privacy
 *          decision, not a technical one.
 *
 * Config (Vercel env):
 *   META_PIXEL_ID                REQUIRED — Events Manager → Data Sources.
 *   META_CAPI_TOKEN              REQUIRED, SECRET — Events Manager → Settings →
 *                                Conversions API → Generate access token.
 *   META_CAPI_TEST_CODE          optional — Events Manager → Test Events. Set it
 *                                while verifying, then REMOVE it: events sent
 *                                with a test code are excluded from optimisation.
 *   META_CAPI_ADVANCED_MATCHING  optional, '1' to enable hashed-email matching.
 *                                Default off. Read the note on hashEmail().
 * With either required var missing every send no-ops, so this is safe to deploy
 * before the pixel exists.
 */

const crypto = require('crypto');

const PIXEL_ID  = process.env.META_PIXEL_ID || '';
const TOKEN     = process.env.META_CAPI_TOKEN || '';
const TEST_CODE = process.env.META_CAPI_TEST_CODE || '';
const ADVANCED_MATCHING = process.env.META_CAPI_ADVANCED_MATCHING === '1';
const API_VERSION = 'v21.0';

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/**
 * SHA-256 of a normalised email, which is the only form Meta accepts.
 *
 * PRIVACY: this is a real decision, which is why it is gated behind
 * META_CAPI_ADVANCED_MATCHING rather than just switched on. Enabling it means
 * customer emails — hashed, never in the clear — are sent to Meta, who match
 * them against their own user base. That is standard e-commerce practice and it
 * materially improves attribution, but under UK GDPR it is still processing
 * personal data for advertising, and the privacy policy should say so before it
 * is turned on. Hashing limits exposure; it does not make it anonymous, because
 * matching against a known address is the entire point.
 */
function hashEmail(email) {
  if (!ADVANCED_MATCHING) return null;
  if (!email || typeof email !== 'string') return null;
  const norm = email.trim().toLowerCase();
  if (!norm || norm.indexOf('@') < 1) return null;
  return crypto.createHash('sha256').update(norm).digest('hex');
}

/** Pull the pixel's first-party cookies out of a raw Cookie header. */
function fbCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader || typeof cookieHeader !== 'string') return out;
  const fbp = cookieHeader.match(/(?:^|;\s*)_fbp=([^;]+)/);
  if (fbp) out.fbp = decodeURIComponent(fbp[1]).slice(0, 128);
  const fbc = cookieHeader.match(/(?:^|;\s*)_fbc=([^;]+)/);
  if (fbc) out.fbc = decodeURIComponent(fbc[1]).slice(0, 128);
  return out;
}

/**
 * The originating visitor's IP. Vercel sits behind a proxy, so req.socket holds
 * the proxy address; x-forwarded-for holds the real client first.
 */
function clientIp(req) {
  try {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return String(xff).split(',')[0].trim().slice(0, 45);
    return (req.socket && req.socket.remoteAddress) || undefined;
  } catch { return undefined; }
}

/**
 * Post one event to the Conversions API.
 *
 * @param {Object} p
 * @param {string} p.eventName    Meta standard event, e.g. 'Purchase'
 * @param {string} p.eventId      MUST equal the browser event_id (see header)
 * @param {string} [p.sourceUrl]  page the event happened on
 * @param {Object} [p.userData]   { fbp, fbc, ip, userAgent, email }
 * @param {Object} [p.customData] { value, currency, contentIds, contentType }
 * @param {number} [p.eventTime]  unix seconds; defaults to now
 * @returns {Promise<{ok:boolean, skipped?:boolean, reason?:string}>}
 */
async function sendEvent(p = {}) {
  try {
    if (!PIXEL_ID || !TOKEN) return { ok: false, skipped: true, reason: 'not_configured' };
    if (!p.eventName) return { ok: false, skipped: true, reason: 'no_event_name' };

    const ud = p.userData || {};
    const user_data = {};
    if (ud.fbp) user_data.fbp = ud.fbp;
    if (ud.fbc) user_data.fbc = ud.fbc;
    if (ud.ip) user_data.client_ip_address = ud.ip;
    if (ud.userAgent) user_data.client_user_agent = String(ud.userAgent).slice(0, 500);
    const em = hashEmail(ud.email);
    if (em) user_data.em = [em];

    // With no matchable signal at all Meta will accept the event and then
    // discard it. Don't spend a request finding that out.
    if (!Object.keys(user_data).length) return { ok: false, skipped: true, reason: 'no_match_signal' };

    const cd = p.customData || {};
    const custom_data = {};
    if (cd.value != null) custom_data.value = num(cd.value);
    if (cd.currency) custom_data.currency = String(cd.currency).slice(0, 8);
    if (Array.isArray(cd.contentIds) && cd.contentIds.length) {
      custom_data.content_ids = cd.contentIds.map((x) => String(x).slice(0, 64)).slice(0, 20);
    }
    if (cd.contentType) custom_data.content_type = String(cd.contentType).slice(0, 32);
    if (cd.orderId) custom_data.order_id = String(cd.orderId).slice(0, 64);

    const event = {
      event_name: p.eventName,
      event_time: p.eventTime || Math.floor(Date.now() / 1000),
      action_source: 'website',
      user_data,
    };
    if (p.eventId) event.event_id = String(p.eventId).slice(0, 128);
    if (p.sourceUrl) event.event_source_url = String(p.sourceUrl).slice(0, 500);
    if (Object.keys(custom_data).length) event.custom_data = custom_data;

    const body = { data: [event] };
    if (TEST_CODE) body.test_event_code = TEST_CODE;

    const url = `https://graph.facebook.com/${API_VERSION}/${encodeURIComponent(PIXEL_ID)}/events?access_token=${encodeURIComponent(TOKEN)}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // Never let a slow Meta hold a serverless function open.
      signal: (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(3000) : undefined,
    });
    if (r.ok) return { ok: true };
    console.error('[meta-capi] non-2xx', r.status, (await r.text().catch(() => '')).slice(0, 300));
    return { ok: false, reason: 'http_' + r.status };
  } catch (e) {
    console.error('[meta-capi] sendEvent threw', e && e.message);
    return { ok: false, reason: 'threw' };
  }
}

/**
 * Authoritative server-side Purchase, fired from the code path that flips an
 * order to 'paid'.
 *
 * This is the more trustworthy of the two Purchase sends: the browser one fires
 * on the confirmation page while the order may still be 'pending' (the customer
 * has not necessarily moved money yet), and is lost entirely to ad-blockers.
 * This one fires at real payment against the orders table.
 *
 * event_id is `purchase.<orderRef>` — byte-identical to what core.js sends from
 * the confirmation page, so Meta keeps whichever arrives first and drops the
 * duplicate.
 */
async function sendPurchase(order, opts = {}) {
  try {
    if (!order) return { ok: false, skipped: true, reason: 'no_order' };
    const orderRef = opts.orderRef || order.notes ||
      (order.id ? String(order.id).slice(0, 8).toUpperCase() : '');
    if (!orderRef) return { ok: false, skipped: true, reason: 'no_order_ref' };

    let items = order.items;
    if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
    if (!Array.isArray(items)) items = [];

    const cookies = fbCookies(opts.cookieHeader || '');
    return await sendEvent({
      eventName: 'Purchase',
      eventId: `purchase.${orderRef}`,
      sourceUrl: opts.sourceUrl || 'https://veloxpeps.com/checkout/payment-complete/',
      userData: {
        fbp: cookies.fbp,
        fbc: cookies.fbc,
        ip: opts.ip,
        userAgent: opts.userAgent,
        email: order.customer_email,
      },
      customData: {
        value: num(order.total),
        currency: order.currency || 'GBP',
        contentIds: items.map((it) => it.slug || it.name).filter(Boolean),
        contentType: 'product',
        orderId: orderRef,
      },
    });
  } catch (e) {
    console.error('[meta-capi] sendPurchase threw', e && e.message);
    return { ok: false, reason: 'threw' };
  }
}

module.exports = { sendEvent, sendPurchase, fbCookies, clientIp, isConfigured: () => !!(PIXEL_ID && TOKEN) };
