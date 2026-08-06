/**
 * lib/ga-mp.js — GA4 Measurement Protocol sender (server-side purchase events).
 *
 * Why this exists: the client-side gtag `purchase` fires on the confirmation
 * page (order still 'pending', before the customer has actually transferred
 * money) and is silently dropped for every visitor running an ad/tracker
 * blocker — which is a large slice of this audience. That's why GA4 conversions
 * ran well below the orders table.
 *
 * This fires `purchase` server-side, from the code path that flips an order to
 * 'paid', so:
 *   - it's immune to ad-blockers (server-to-server, no browser),
 *   - it fires at real payment (matches the orders table = source of truth),
 *   - transaction_id = order ref, so GA4 dedupes if it's ever sent twice.
 *
 * Config (Vercel env):
 *   GA4_MEASUREMENT_ID   default 'G-YFPX0Q1G50'
 *   GA4_MP_API_SECRET    REQUIRED — create in GA4 Admin → Data Streams →
 *                        (web stream) → Measurement Protocol API secrets.
 * When the secret is missing the sender no-ops (logs a warning) so deploying
 * this never throws before the secret is configured.
 */

const MEASUREMENT_ID = process.env.GA4_MEASUREMENT_ID || 'G-YFPX0Q1G50';
const API_SECRET     = process.env.GA4_MP_API_SECRET || '';

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

/**
 * Pull a GA client_id out of a Cookie header's `_ga` value.
 *   _ga=GA1.1.1234567890.1700000000  ->  "1234567890.1700000000"
 * Returns null when absent/malformed.
 */
function clientIdFromCookie(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return null;
  const m = cookieHeader.match(/(?:^|;\s*)_ga=([^;]+)/);
  if (!m) return null;
  // _ga = "GA1.1.<clientId1>.<clientId2>" — client_id is the last two dot parts.
  const parts = decodeURIComponent(m[1]).split('.');
  if (parts.length < 4) return null;
  return parts.slice(-2).join('.');
}

/**
 * Deterministic fallback client_id when no real _ga cookie is available
 * (e.g. the Fena server-to-server webhook wins the paid race). Derived from the
 * order ref so retries reuse the same id; attribution defaults to (direct) but
 * the conversion + revenue still register.
 */
function fallbackClientId(seed) {
  let h = 0;
  const s = String(seed || Date.now());
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  const a = Math.abs(h) || 1;
  const b = Math.abs(h ^ 0x5f3759df) || 2;
  return `${a}.${b}`;
}

/**
 * Send a GA4 `purchase` event for a paid order.
 *
 * @param {Object} order  Supabase order row (items, total, subtotal, shipping,
 *                        discount, notes/ref).
 * @param {Object} [opts]
 * @param {string} [opts.clientId]     real _ga client_id (browser path)
 * @param {string} [opts.cookieHeader] raw Cookie header to extract _ga from
 * @param {string} [opts.transactionId] override order ref
 * @returns {Promise<{ok:boolean, skipped?:boolean, reason?:string}>}
 */
async function sendPurchase(order, opts = {}) {
  try {
    if (!API_SECRET) {
      console.warn('[ga-mp] GA4_MP_API_SECRET not set — skipping server-side purchase event');
      return { ok: false, skipped: true, reason: 'no_api_secret' };
    }
    if (!order) return { ok: false, skipped: true, reason: 'no_order' };

    const transactionId = opts.transactionId || order.notes ||
      (order.id ? String(order.id).slice(0, 8).toUpperCase() : '');
    if (!transactionId) return { ok: false, skipped: true, reason: 'no_transaction_id' };

    // Normalise items (stored as JSON array or a JSON string).
    let items = order.items;
    if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
    if (!Array.isArray(items)) items = [];
    const gaItems = items.map((it) => ({
      item_id: it.slug || it.name || 'item',
      item_name: it.name || it.slug || 'item',
      item_variant: it.size || undefined,
      price: num(it.price),
      quantity: num(it.qty || it.quantity) || 1,
    }));

    const clientId = opts.clientId ||
      clientIdFromCookie(opts.cookieHeader) ||
      fallbackClientId(transactionId);

    const payload = {
      client_id: clientId,
      // Non-personalized: this is a completed transaction, not ad targeting.
      events: [{
        name: 'purchase',
        params: {
          transaction_id: transactionId,
          currency: order.currency || 'GBP',
          value: num(order.total),
          shipping: num(order.shipping),
          ...(order.discount ? { discount: num(order.discount) } : {}),
          items: gaItems,
          // Marks the event as engaged so it lands in an engaged session.
          engagement_time_msec: 1,
        },
      }],
    };

    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(MEASUREMENT_ID)}&api_secret=${encodeURIComponent(API_SECRET)}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    // MP /collect returns 204 No Content on success (it never validates payloads;
    // use /debug/mp/collect for validation). Any 2xx = accepted.
    if (r.ok) {
      console.log(`[ga-mp] purchase sent txn=${transactionId} value=${num(order.total)} client=${clientId}`);
      return { ok: true };
    }
    console.error('[ga-mp] collect non-2xx', r.status, (await r.text().catch(() => '')).slice(0, 200));
    return { ok: false, reason: 'http_' + r.status };
  } catch (e) {
    console.error('[ga-mp] sendPurchase threw', e && e.message);
    return { ok: false, reason: 'threw' };
  }
}

module.exports = { sendPurchase, clientIdFromCookie };
