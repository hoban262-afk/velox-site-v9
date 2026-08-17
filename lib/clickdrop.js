/**
 * Royal Mail Click & Drop helpers (CommonJS, no SDK). Lives OUTSIDE /api so
 * Vercel never treats it as a serverless function — required by
 * api/clickdrop/[action].js.
 *
 * What it does: pushes a PAID order straight into the Click & Drop account via
 * the Click & Drop REST API, so a label is ready to print — no manual CSV
 * upload. The push is idempotent: once an order has a clickdrop_order_identifier
 * it is never re-sent (so a webhook + an admin status change can't double-import).
 *
 * Required env (Vercel, never in the repo):
 *   CLICKANDDROP_API_KEY            — the key from Click & Drop → Settings →
 *                                     Integrations → "Create API key"
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 * Optional env (sensible defaults if unset):
 *   CLICKANDDROP_SERVICE_CODE       — domestic (GB) service code, e.g. "TPN24".
 *                                     UNSET by default → the order imports with no
 *                                     service and Click & Drop applies the account's
 *                                     default postage rule. Set only to hardcode one.
 *   CLICKANDDROP_INTL_SERVICE_CODE  — service code for non-GB orders (also unset).
 *   CLICKANDDROP_PACKAGE_FORMAT     — default "largeLetter".
 *   CLICKANDDROP_DEFAULT_WEIGHT_G   — default package weight in grams, default 150.
 *   CLICKANDDROP_CUSTOMS_DESC       — customs line (<=50 chars), default below.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON         = process.env.SUPABASE_ANON_KEY;
const ADMIN_EMAILS = ['support@veloxpeps.com', 'veloxpeps@gmail.com'];

const API_KEY  = process.env.CLICKANDDROP_API_KEY;
const API_BASE = 'https://api.parcel.royalmail.com';

const SERVICE_GB     = (process.env.CLICKANDDROP_SERVICE_CODE || '').trim();
const SERVICE_INTL   = (process.env.CLICKANDDROP_INTL_SERVICE_CODE || '').trim();
const PACKAGE_FORMAT  = (process.env.CLICKANDDROP_PACKAGE_FORMAT || 'largeLetter').trim();
const PACKAGE_WEIGHT_G = Math.min(30000, Math.max(1, parseInt(process.env.CLICKANDDROP_DEFAULT_WEIGHT_G || '150', 10) || 150));
const CUSTOMS_DESC   = (process.env.CLICKANDDROP_CUSTOMS_DESC || 'Research chemical').slice(0, 50);

function configured() {
  return !!(SUPABASE_URL && SERVICE && API_KEY);
}

// ── Supabase service-role REST helpers ──────────────────────────────────────
async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  return r.json();
}
async function sbWrite(path, method, body, prefer) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      Prefer: prefer || 'return=minimal',
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Supabase ${method} ${path} failed: ${JSON.stringify(data)}`);
  return data;
}

// ── Admin auth (same site-wide pattern as lib/xero.js) ──────────────────────
async function requireAdmin(req) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const ures = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: ANON || SERVICE },
  });
  if (!ures.ok) return null;
  const user = await ures.json();
  if (!user || !ADMIN_EMAILS.includes((user.email || '').toLowerCase())) return null;
  return user;
}

// ── Country name → ISO-2 (covers the UK + every country in the worldwide
//    checkout dropdown — keep in sync with INTL_COUNTRIES in checkout.js) ─────
const ISO = {
  'united kingdom': 'GB', uk: 'GB', gb: 'GB', 'great britain': 'GB', england: 'GB',
  scotland: 'GB', wales: 'GB', 'northern ireland': 'GB',
  // Europe
  albania: 'AL', andorra: 'AD', austria: 'AT', belgium: 'BE',
  'bosnia and herzegovina': 'BA', bulgaria: 'BG', croatia: 'HR', cyprus: 'CY',
  'czech republic': 'CZ', czechia: 'CZ', denmark: 'DK', estonia: 'EE', finland: 'FI',
  france: 'FR', germany: 'DE', gibraltar: 'GI', greece: 'GR', hungary: 'HU',
  iceland: 'IS', ireland: 'IE', italy: 'IT', kosovo: 'XK', latvia: 'LV',
  liechtenstein: 'LI', lithuania: 'LT', luxembourg: 'LU', malta: 'MT', moldova: 'MD',
  monaco: 'MC', montenegro: 'ME', netherlands: 'NL', 'north macedonia': 'MK',
  norway: 'NO', poland: 'PL', portugal: 'PT', romania: 'RO', 'san marino': 'SM',
  serbia: 'RS', slovakia: 'SK', slovenia: 'SI', spain: 'ES', sweden: 'SE',
  switzerland: 'CH', ukraine: 'UA',
  // North America
  canada: 'CA', mexico: 'MX', 'united states': 'US',
  'united states of america': 'US', usa: 'US', us: 'US',
  // Australia & NZ
  australia: 'AU', 'new zealand': 'NZ',
  // Rest of World
  argentina: 'AR', bangladesh: 'BD', brazil: 'BR', chile: 'CL', colombia: 'CO',
  'costa rica': 'CR', ecuador: 'EC', egypt: 'EG', ghana: 'GH', india: 'IN',
  indonesia: 'ID', israel: 'IL', jordan: 'JO', kenya: 'KE', lebanon: 'LB',
  malaysia: 'MY', morocco: 'MA', nigeria: 'NG', pakistan: 'PK', peru: 'PE',
  philippines: 'PH', 'south africa': 'ZA', 'sri lanka': 'LK', taiwan: 'TW',
  thailand: 'TH', tunisia: 'TN', turkey: 'TR', uruguay: 'UY', vietnam: 'VN',
};
function countryToIso(name) {
  const k = String(name || '').trim().toLowerCase();
  if (!k) return 'GB';
  if (ISO[k]) return ISO[k];
  // Already an ISO-2/3 code?
  if (/^[A-Za-z]{2,3}$/.test(k)) return k.toUpperCase().slice(0, 2);
  return 'GB';
}

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function parseItems(order) {
  let items = order.items;
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = null; } }
  return Array.isArray(items) ? items : [];
}

// ── Build the Click & Drop CreateOrderRequest from a Velox order ────────────
function buildOrderPayload(order) {
  const items = parseItems(order);
  const totalQty = items.reduce((s, it) => s + (num(it.qty || it.quantity) || 1), 0) || 1;
  // Flat default package weight; split across items for the per-item customs weight.
  const perItemWeight = Math.max(1, Math.round(PACKAGE_WEIGHT_G / totalQty));

  const countryCode = countryToIso(order.ship_country);
  const serviceCode = countryCode === 'GB' ? SERVICE_GB : SERVICE_INTL;

  const subtotal = num(order.subtotal) || num(order.total);
  const total    = num(order.total) || subtotal;
  const shipping  = Math.max(0, Number((total - subtotal).toFixed(2)));

  const reference = (order.notes || `VELOX-${String(order.id).slice(0, 8)}`).slice(0, 40);

  // Click & Drop rejects an order (error 77) unless every line's SKU is UNIQUE
  // within the package. A cart can hold two variants of the SAME product (e.g.
  // Retatrutide 10mg + 15mg) which share a slug, so key the SKU on slug+size and
  // de-dupe defensively — otherwise the import fails and no label ever prints.
  const seenSku = new Set();
  const skuFor = (it) => {
    if (!it.slug) return undefined;
    const base = (String(it.slug) + (it.size ? '-' + String(it.size).replace(/\s+/g, '') : '')).slice(0, 100);
    let sku = base;
    let dup = 2;
    while (seenSku.has(sku)) { sku = (base.slice(0, 96) + '-' + dup).slice(0, 100); dup++; }
    seenSku.add(sku);
    return sku;
  };
  const contents = items.map((it) => ({
    name: String(it.name || it.title || 'Item').slice(0, 800),
    SKU: skuFor(it),
    quantity: num(it.qty || it.quantity) || 1,
    unitValue: Number(num(it.price).toFixed(2)),
    unitWeightInGrams: perItemWeight,
    customsDescription: CUSTOMS_DESC,
  }));

  const postageDetails = { sendNotificationsTo: 'recipient' };
  if (serviceCode) postageDetails.serviceCode = serviceCode;

  return {
    orderReference: reference,
    recipient: {
      address: {
        fullName: (order.ship_name || order.customer_name || '').slice(0, 210) || 'Customer',
        addressLine1: String(order.ship_line1 || '').slice(0, 100),
        addressLine2: order.ship_line2 ? String(order.ship_line2).slice(0, 100) : undefined,
        city: String(order.ship_city || '').slice(0, 100),
        postcode: order.ship_postcode ? String(order.ship_postcode).slice(0, 20) : undefined,
        countryCode,
      },
      phoneNumber: order.ship_phone ? String(order.ship_phone).slice(0, 25) : undefined,
      emailAddress: order.customer_email ? String(order.customer_email).slice(0, 254) : undefined,
    },
    packages: [{
      weightInGrams: PACKAGE_WEIGHT_G,
      packageFormatIdentifier: PACKAGE_FORMAT,
      contents: contents.length ? contents : undefined,
    }],
    orderDate: order.created_at || new Date().toISOString(),
    subtotal,
    shippingCostCharged: shipping,
    total,
    currencyCode: 'GBP',
    postageDetails,
  };
}

async function getOrder(orderId) {
  const rows = await sbGet(`orders?id=eq.${orderId}&select=*&limit=1`);
  return Array.isArray(rows) ? rows[0] : null;
}

async function cdFetch(path, { method = 'GET', body } = {}) {
  const r = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data };
}

/** Lightweight connectivity check used by the admin Settings status line. */
async function testConnection() {
  if (!API_KEY) return { configured: false, connected: false };
  // GET /api/v1/orders is a cheap authenticated read; 200 ⇒ key works.
  const r = await cdFetch('/api/v1/orders?pageSize=1');
  return { configured: true, connected: r.ok };
}

/** Push one paid order into Click & Drop. Idempotent + failure-recording. */
async function pushOrderToClickAndDrop(orderId) {
  const order = await getOrder(orderId);
  if (!order) return { ok: false, error: 'Order not found' };
  if (order.clickdrop_order_identifier) {
    return { ok: true, skipped: true, identifier: order.clickdrop_order_identifier };
  }
  if (!order.ship_line1 || !order.ship_postcode) {
    return { ok: false, error: 'Order has no shipping address — cannot create a label' };
  }

  const payload = { items: [buildOrderPayload(order)] };
  const r = await cdFetch('/api/v1/orders', { method: 'POST', body: payload });

  const created = r.data && Array.isArray(r.data.createdOrders) ? r.data.createdOrders[0] : null;
  const failed  = r.data && Array.isArray(r.data.failedOrders)  ? r.data.failedOrders[0]  : null;

  if (!r.ok || !created || !created.orderIdentifier) {
    const msg = (failed && (failed.errors && failed.errors[0] && failed.errors[0].errorCode + ': ' + failed.errors[0].errorMessage))
      || (failed && failed.message)
      || (r.data && r.data.message)
      || `Click & Drop returned ${r.status}`;
    await sbWrite(`orders?id=eq.${orderId}`, 'PATCH', { clickdrop_error: String(msg).slice(0, 500) });
    return { ok: false, error: msg };
  }

  const identifier = String(created.orderIdentifier);
  await sbWrite(`orders?id=eq.${orderId}`, 'PATCH', {
    clickdrop_order_identifier: identifier,
    clickdrop_synced_at: new Date().toISOString(),
    clickdrop_error: null,
  });
  return { ok: true, identifier, reference: created.orderReference };
}

/**
 * Read live order info from Click & Drop for one or more order identifiers.
 * Returns an array of GetOrderInfoResource:
 *   { orderIdentifier, orderReference, createdOn, orderDate,
 *     printedOn?, manifestedOn?, shippedOn?, trackingNumber? }
 * Used by the despatch-sync cron to detect when a label has been printed and a
 * tracking number assigned, so the customer's dispatch email can fire automatically.
 */
async function getOrdersInfo(identifiers) {
  return (await getOrdersInfoDiag(identifiers)).orders;
}

// Same read, but returns the HTTP status + response shape alongside the orders so
// a stalled despatch-sync can record *why* it saw no live data (auth failure,
// endpoint 404, empty 200, changed response shape) instead of a silent [].
// Royal Mail's GET /orders/{orderIdentifiers} separates multiple values with a
// SEMICOLON — not a comma. Integer order identifiers need no quoting/encoding
// (only string order references do). A comma-joined batch returns HTTP 400 and
// dispatches nothing, which is exactly what stalled auto-despatch once 2+ orders
// were awaiting despatch at the same time.
async function getOrdersInfoDiag(identifiers) {
  if (!API_KEY) return { ok: false, status: 0, reason: 'no-key', count: 0, orders: [] };
  const ids = (Array.isArray(identifiers) ? identifiers : [identifiers])
    .filter(Boolean).map((x) => encodeURIComponent(String(x))).join(';');
  if (!ids) return { ok: false, status: 0, reason: 'no-ids', count: 0, orders: [] };
  const r = await cdFetch(`/api/v1/orders/${ids}`);
  let orders = [];
  if (Array.isArray(r.data)) orders = r.data;
  else if (r.data && Array.isArray(r.data.orders)) orders = r.data.orders;
  const shape = Array.isArray(r.data) ? 'array'
    : (r.data && Array.isArray(r.data.orders)) ? 'orders'
    : (r.data ? typeof r.data : 'null');
  const out = { ok: r.ok, status: r.status, shape, count: orders.length, orders };
  // Non-array bodies are error/metadata objects (no customer PII) — safe to surface.
  if (r.data && !Array.isArray(r.data)) {
    out.topKeys = Object.keys(r.data).slice(0, 12);
    if (!r.ok) out.msg = String(r.data.message || JSON.stringify(r.data)).slice(0, 200);
  }
  // Array body: capture element shape (field NAMES only) + any error code/message +
  // the identifier field, so a renamed identifier or an error payload is visible
  // WITHOUT dumping recipient PII.
  if (Array.isArray(r.data)) {
    out.arraySample = r.data.slice(0, 3).map((el) => (el && typeof el === 'object')
      ? {
          keys: Object.keys(el).slice(0, 14),
          orderIdentifier: el.orderIdentifier ?? el.orderId ?? el.identifier ?? null,
          orderReference: el.orderReference ?? null,
          code: el.code ?? el.errorCode ?? undefined,
          message: (el.message || el.errorMessage) ? String(el.message || el.errorMessage).slice(0, 140) : undefined,
        }
      : { val: String(el).slice(0, 80) });
  }
  return out;
}

module.exports = {
  configured, requireAdmin, testConnection, pushOrderToClickAndDrop,
  getOrdersInfo, getOrdersInfoDiag, buildOrderPayload, countryToIso, sbGet, sbWrite, API_BASE,
};
