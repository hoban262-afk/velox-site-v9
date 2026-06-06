/**
 * Xero helpers (CommonJS, no external SDK). Lives OUTSIDE /api so Vercel never
 * treats it as a serverless function — it's required by api/xero/[action].js.
 *
 * Token lifecycle:
 *   • OAuth tokens stored in the service-role-only `integration_tokens` table
 *     (provider = 'xero'). Never exposed to the browser.
 *   • getValidAccessToken() returns a live token, refreshing via the stored
 *     refresh_token when expired (Xero access tokens last 30 min; refresh
 *     tokens rotate each refresh, last 60 days).
 *
 * Required env (Vercel, never in the repo):
 *   XERO_CLIENT_ID, XERO_CLIENT_SECRET
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 * Optional env:
 *   XERO_SALES_ACCOUNT_CODE (default '200'), XERO_BANK_ACCOUNT_CODE,
 *   XERO_PRICES_INCLUDE_VAT ('true'|'false', default 'true'), INTERNAL_TASK_SECRET
 */
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON         = process.env.SUPABASE_ANON_KEY;
const ADMIN_EMAILS = ['support@veloxpeps.com', 'veloxpeps@gmail.com'];

const XERO_CLIENT_ID     = process.env.XERO_CLIENT_ID;
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET;
const REDIRECT_URI       = 'https://veloxpeps.com/api/xero/callback';
// Xero's new GRANULAR scopes — apps created after 2 Mar 2026 can't use the old
// broad "accounting.transactions" (it returns invalid_scope). accounting.invoices
// + accounting.contacts cover creating sales invoices and their contacts.
const SCOPES             = 'openid profile email accounting.contacts accounting.invoices offline_access';

const IDENTITY  = 'https://identity.xero.com/connect/token';
const AUTHORIZE = 'https://login.xero.com/identity/connect/authorize';
const API_BASE  = 'https://api.xero.com';

const SALES_ACCOUNT = process.env.XERO_SALES_ACCOUNT_CODE || '200';
const BANK_ACCOUNT  = process.env.XERO_BANK_ACCOUNT_CODE || '';
const INCLUSIVE     = (process.env.XERO_PRICES_INCLUDE_VAT || 'true') !== 'false';

function configured() {
  return !!(SUPABASE_URL && SERVICE && XERO_CLIENT_ID && XERO_CLIENT_SECRET);
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
      Prefer: prefer || 'return=representation',
    },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Supabase ${method} ${path} failed: ${JSON.stringify(data)}`);
  return data;
}

// ── Admin auth (site-wide pattern) ──────────────────────────────────────────
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

// ── OAuth state (stateless CSRF token, signed with the service key) ─────────
function makeState() {
  const nonce = crypto.randomBytes(16).toString('hex');
  const ts = Date.now().toString();
  const sig = crypto.createHmac('sha256', SERVICE).update(`${nonce}.${ts}`).digest('hex').slice(0, 32);
  return `${nonce}.${ts}.${sig}`;
}
function verifyState(state) {
  const parts = String(state || '').split('.');
  if (parts.length !== 3) return false;
  const [nonce, ts, sig] = parts;
  const expect = crypto.createHmac('sha256', SERVICE).update(`${nonce}.${ts}`).digest('hex').slice(0, 32);
  if (sig !== expect) return false;
  return (Date.now() - Number(ts)) < 10 * 60 * 1000;
}
function authorizeUrl() {
  // Build manually with encodeURIComponent so spaces in `scope` become %20.
  // (URLSearchParams encodes spaces as "+", which Xero rejects as invalid_scope.)
  const params = [
    'response_type=code',
    'client_id=' + encodeURIComponent(XERO_CLIENT_ID),
    'redirect_uri=' + encodeURIComponent(REDIRECT_URI),
    'scope=' + encodeURIComponent(SCOPES),
    'state=' + encodeURIComponent(makeState()),
  ];
  return `${AUTHORIZE}?${params.join('&')}`;
}
function basicAuthHeader() {
  return 'Basic ' + Buffer.from(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`).toString('base64');
}

// ── Token exchange + persistence ────────────────────────────────────────────
async function exchangeCode(code) {
  const r = await fetch(IDENTITY, {
    method: 'POST',
    headers: { Authorization: basicAuthHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Xero token exchange failed: ${JSON.stringify(data)}`);
  return data;
}
async function fetchTenantId(accessToken) {
  const r = await fetch(`${API_BASE}/connections`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  const conns = await r.json().catch(() => []);
  if (!r.ok || !Array.isArray(conns) || !conns.length) throw new Error('No Xero organisation connected');
  return conns[0].tenantId;
}
async function saveTokens({ access_token, refresh_token, expires_in, tenant_id }) {
  const row = {
    provider: 'xero', access_token, refresh_token, tenant_id,
    expires_at: new Date(Date.now() + (Number(expires_in || 1800) - 60) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  await sbWrite('integration_tokens?on_conflict=provider', 'POST', row, 'resolution=merge-duplicates,return=representation');
}
async function refreshTokens(refresh_token, tenant_id) {
  const r = await fetch(IDENTITY, {
    method: 'POST',
    headers: { Authorization: basicAuthHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token }),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Xero token refresh failed: ${JSON.stringify(data)}`);
  await saveTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token || refresh_token,
    expires_in: data.expires_in, tenant_id,
  });
  return data.access_token;
}
async function getValidAccessToken() {
  const rows = await sbGet('integration_tokens?provider=eq.xero&select=*&limit=1');
  const tok = Array.isArray(rows) ? rows[0] : null;
  if (!tok || !tok.refresh_token) throw new Error('Xero not connected');
  const expired = !tok.expires_at || new Date(tok.expires_at).getTime() <= Date.now();
  if (!expired && tok.access_token) return { accessToken: tok.access_token, tenantId: tok.tenant_id };
  const accessToken = await refreshTokens(tok.refresh_token, tok.tenant_id);
  return { accessToken, tenantId: tok.tenant_id };
}
async function xeroFetch(path, { method = 'GET', body } = {}) {
  const { accessToken, tenantId } = await getValidAccessToken();
  const r = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`, 'Xero-tenant-id': tenantId,
      Accept: 'application/json', 'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Xero ${method} ${path} failed (${r.status}): ${JSON.stringify(data)}`);
  return data;
}

// ── Invoice creation ────────────────────────────────────────────────────────
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function buildLineItems(order) {
  let items = order.items;
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = null; } }
  const lines = [];
  if (Array.isArray(items)) {
    for (const it of items) {
      if (!it || typeof it !== 'object') continue;
      const desc = it.name || it.title || it.product || it.description || it.sku || 'Item';
      const size = it.size || it.variant || '';
      const qty  = num(it.qty || it.quantity || it.q || 1) || 1;
      let unit   = num(it.price ?? it.unitAmount ?? it.unit_price ?? it.unitPrice ?? it.amount);
      if (!unit && (it.lineTotal || it.total)) unit = num(it.lineTotal || it.total) / qty;
      lines.push({
        Description: size ? `${desc} (${size})` : String(desc),
        Quantity: qty, UnitAmount: Number(unit.toFixed(2)), AccountCode: SALES_ACCOUNT,
      });
    }
  }
  const total = num(order.total);
  const sum = lines.reduce((s, l) => s + l.Quantity * l.UnitAmount, 0);
  if (!lines.length || Math.abs(sum - total) > 0.01) {
    return [{
      Description: `Velox Peptides order ${String(order.id).slice(0, 8)}`,
      Quantity: 1, UnitAmount: Number(total.toFixed(2)), AccountCode: SALES_ACCOUNT,
    }];
  }
  return lines;
}

async function getOrder(orderId) {
  const rows = await sbGet(`orders?id=eq.${orderId}&select=*&limit=1`);
  return Array.isArray(rows) ? rows[0] : null;
}

/** Create (or skip) the Xero invoice for one order. Idempotent + reconciliation-safe. */
async function syncOrderToXero(orderId) {
  const order = await getOrder(orderId);
  if (!order) return { ok: false, error: 'Order not found' };
  if (order.xero_invoice_id) return { ok: true, skipped: true, invoice_id: order.xero_invoice_id };

  const today = new Date().toISOString().slice(0, 10);
  const created = await xeroFetch('/api.xro/2.0/Invoices', {
    method: 'POST',
    body: { Invoices: [{
      Type: 'ACCREC',
      Contact: { Name: order.customer_name || order.customer_email || 'Website customer', EmailAddress: order.customer_email || undefined },
      Date: today, DueDate: today,
      Reference: `VELOX-${String(order.id).slice(0, 8)}`,
      LineAmountTypes: INCLUSIVE ? 'Inclusive' : 'Exclusive',
      LineItems: buildLineItems(order),
      Status: 'AUTHORISED',
    }] },
  });
  const inv = created && created.Invoices && created.Invoices[0];
  if (!inv || !inv.InvoiceID) throw new Error('Xero did not return an invoice id');

  let paid = false;
  if (BANK_ACCOUNT) {
    try {
      await xeroFetch('/api.xro/2.0/Payments', {
        method: 'PUT',
        body: { Payments: [{
          Invoice: { InvoiceID: inv.InvoiceID }, Account: { Code: BANK_ACCOUNT },
          Date: today, Amount: num(order.total),
        }] },
      });
      paid = true;
    } catch (e) { console.error('[xero] payment step failed (invoice still created):', e.message); }
  }

  await sbWrite(`orders?id=eq.${orderId}`, 'PATCH', {
    xero_invoice_id: inv.InvoiceID, xero_synced_at: new Date().toISOString(),
  }, 'return=minimal');

  return { ok: true, invoice_id: inv.InvoiceID, invoice_number: inv.InvoiceNumber, marked_paid: paid };
}

module.exports = {
  configured, requireAdmin, authorizeUrl, verifyState,
  exchangeCode, fetchTenantId, saveTokens, getValidAccessToken, xeroFetch,
  syncOrderToXero, sbGet, sbWrite, API_BASE,
};
