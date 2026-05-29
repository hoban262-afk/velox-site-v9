/**
 * Shared Xero helpers (CommonJS, no external SDK).
 *
 * Token lifecycle:
 *   • OAuth tokens are stored in the service-role-only `integration_tokens` table
 *     (provider = 'xero'). They are NEVER exposed to the browser.
 *   • getValidAccessToken() returns a live access token, transparently refreshing
 *     via the stored refresh_token when it has expired (Xero access tokens last
 *     30 min; refresh tokens rotate on every refresh and last 60 days).
 *
 * Required env (set in Vercel, never in the repo):
 *   XERO_CLIENT_ID, XERO_CLIENT_SECRET
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 */
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON         = process.env.SUPABASE_ANON_KEY;
const ADMIN_EMAIL  = 'veloxpeps@gmail.com';

const XERO_CLIENT_ID     = process.env.XERO_CLIENT_ID;
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET;
const REDIRECT_URI       = 'https://veloxpeps.com/api/xero/callback';
const SCOPES             = 'openid profile email accounting.transactions accounting.contacts offline_access';

const IDENTITY = 'https://identity.xero.com/connect/token';
const AUTHORIZE = 'https://login.xero.com/identity/connect/authorize';
const API_BASE  = 'https://api.xero.com';

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

// ── Admin auth (reuse the site-wide pattern) ────────────────────────────────
async function requireAdmin(req) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const ures = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: ANON || SERVICE },
  });
  if (!ures.ok) return null;
  const user = await ures.json();
  if (!user || (user.email || '').toLowerCase() !== ADMIN_EMAIL) return null;
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
  return (Date.now() - Number(ts)) < 10 * 60 * 1000; // 10-minute window
}

function authorizeUrl() {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: XERO_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state: makeState(),
  });
  return `${AUTHORIZE}?${p.toString()}`;
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
  return data; // { access_token, refresh_token, expires_in, ... }
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
    provider: 'xero',
    access_token,
    refresh_token,
    tenant_id,
    expires_at: new Date(Date.now() + (Number(expires_in || 1800) - 60) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  // upsert on provider
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
    expires_in: data.expires_in,
    tenant_id,
  });
  return data.access_token;
}

/** Returns { accessToken, tenantId } or throws if Xero isn't connected. */
async function getValidAccessToken() {
  const rows = await sbGet('integration_tokens?provider=eq.xero&select=*&limit=1');
  const tok = Array.isArray(rows) ? rows[0] : null;
  if (!tok || !tok.refresh_token) throw new Error('Xero not connected');
  const expired = !tok.expires_at || new Date(tok.expires_at).getTime() <= Date.now();
  if (!expired && tok.access_token) return { accessToken: tok.access_token, tenantId: tok.tenant_id };
  const accessToken = await refreshTokens(tok.refresh_token, tok.tenant_id);
  return { accessToken, tenantId: tok.tenant_id };
}

/** Authenticated Xero API call returning parsed JSON. */
async function xeroFetch(path, { method = 'GET', body } = {}) {
  const { accessToken, tenantId } = await getValidAccessToken();
  const r = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Xero-tenant-id': tenantId,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Xero ${method} ${path} failed (${r.status}): ${JSON.stringify(data)}`);
  return data;
}

module.exports = {
  configured, requireAdmin, authorizeUrl, verifyState,
  exchangeCode, fetchTenantId, saveTokens, getValidAccessToken, xeroFetch,
  sbGet, sbWrite, SUPABASE_URL, SERVICE,
};
