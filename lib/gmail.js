/**
 * Gmail helpers (CommonJS, no SDK). Lives OUTSIDE /api so Vercel never treats it
 * as a serverless function — required by api/gmail/[action].js and the
 * support-autoreply cron.
 *
 * Server-side Gmail access so the support inbox can be triaged 24/7 WITHOUT the
 * desktop app being open. Mirrors the Xero OAuth pattern exactly:
 *   • tokens in the service-role-only `integration_tokens` table (provider='gmail')
 *   • getAccessToken() refreshes the access token from the stored refresh_token
 *     (Google refresh tokens do NOT rotate, so we store it once at connect time)
 *
 * Required env (Vercel, never in the repo):
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 * Optional env:
 *   GMAIL_REDIRECT_URI (default https://veloxpeps.com/api/gmail/callback)
 *   SUPPORT_FROM       (default 'Velox Peptides Support <support@veloxpeps.com>')
 */
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON         = process.env.SUPABASE_ANON_KEY;
const ADMIN_EMAILS = ['support@veloxpeps.com', 'veloxpeps@gmail.com', (process.env.ADMIN_EMAIL || '').toLowerCase()].filter(Boolean);

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI  = process.env.GMAIL_REDIRECT_URI || 'https://veloxpeps.com/api/gmail/callback';
const SUPPORT_FROM  = process.env.SUPPORT_FROM || 'Velox Peptides Support <support@veloxpeps.com>';

// gmail.modify = read + change labels (mark read, label). gmail.send = send mail.
const SCOPES = 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send';

const AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GAPI      = 'https://gmail.googleapis.com/gmail/v1/users/me';

function configured() { return !!(SUPABASE_URL && SERVICE && CLIENT_ID && CLIENT_SECRET); }

// ── Supabase service-role REST helpers ──────────────────────────────────────
async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
  return r.json();
}
async function sbWrite(path, method, body, prefer) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: prefer || 'return=representation' },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Supabase ${method} ${path} failed: ${JSON.stringify(data)}`);
  return data;
}

// ── Admin auth ───────────────────────────────────────────────────────────────
async function requireAdmin(req) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const ures = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: ANON || SERVICE } });
  if (!ures.ok) return null;
  const user = await ures.json();
  if (!user || !ADMIN_EMAILS.includes((user.email || '').toLowerCase())) return null;
  return user;
}

// ── OAuth state (signed CSRF token) ─────────────────────────────────────────
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
  return sig === expect && (Date.now() - Number(ts)) < 10 * 60 * 1000;
}
function authorizeUrl() {
  const params = [
    'client_id=' + encodeURIComponent(CLIENT_ID),
    'redirect_uri=' + encodeURIComponent(REDIRECT_URI),
    'response_type=code',
    'scope=' + encodeURIComponent(SCOPES),
    'access_type=offline',
    'prompt=consent',              // force a refresh_token every time
    'state=' + encodeURIComponent(makeState()),
  ];
  return `${AUTHORIZE}?${params.join('&')}`;
}

// ── Token exchange + persistence ────────────────────────────────────────────
async function exchangeCode(code) {
  const r = await fetch(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Gmail token exchange failed: ${JSON.stringify(data)}`);
  return data; // { access_token, refresh_token, expires_in, ... }
}
async function saveTokens({ access_token, refresh_token, expires_in }) {
  const row = {
    provider: 'gmail', access_token,
    expires_at: new Date(Date.now() + (Number(expires_in || 3600) - 60) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (refresh_token) row.refresh_token = refresh_token; // only present on first consent
  await sbWrite('integration_tokens?on_conflict=provider', 'POST', row, 'resolution=merge-duplicates,return=representation');
}
async function refreshAccessToken(refresh_token) {
  const r = await fetch(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'refresh_token' }),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Gmail token refresh failed: ${JSON.stringify(data)}`);
  await saveTokens({ access_token: data.access_token, refresh_token, expires_in: data.expires_in });
  return data.access_token;
}
async function getAccessToken() {
  const rows = await sbGet('integration_tokens?provider=eq.gmail&select=*&limit=1');
  const tok = Array.isArray(rows) ? rows[0] : null;
  if (!tok || !tok.refresh_token) throw new Error('Gmail not connected');
  const expired = !tok.expires_at || new Date(tok.expires_at).getTime() <= Date.now();
  if (!expired && tok.access_token) return tok.access_token;
  return refreshAccessToken(tok.refresh_token);
}
async function connected() {
  try { const rows = await sbGet('integration_tokens?provider=eq.gmail&select=refresh_token&limit=1'); return !!(Array.isArray(rows) && rows[0] && rows[0].refresh_token); }
  catch { return false; }
}

// ── Gmail API ────────────────────────────────────────────────────────────────
async function gapi(path, { method = 'GET', body, accessToken } = {}) {
  const token = accessToken || await getAccessToken();
  const r = await fetch(`${GAPI}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Gmail ${method} ${path} failed (${r.status}): ${JSON.stringify(data)}`);
  return data;
}

async function listMessages(query, max = 25) {
  const data = await gapi(`/messages?q=${encodeURIComponent(query)}&maxResults=${max}`);
  return Array.isArray(data.messages) ? data.messages : [];
}
function headerMap(payloadHeaders) {
  const m = {};
  (payloadHeaders || []).forEach((h) => { m[(h.name || '').toLowerCase()] = h.value; });
  return m;
}
async function getMessageMeta(id) {
  const d = await gapi(`/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Reply-To`);
  const h = headerMap(d.payload && d.payload.headers);
  const fromRaw = h['from'] || '';
  const emailMatch = fromRaw.match(/<([^>]+)>/);
  return {
    id: d.id, threadId: d.threadId, snippet: d.snippet || '',
    from: fromRaw, fromEmail: (emailMatch ? emailMatch[1] : fromRaw).trim().toLowerCase(),
    subject: h['subject'] || '', messageId: h['message-id'] || '', references: h['references'] || '',
    replyTo: h['reply-to'] || '',
    labelIds: d.labelIds || [],
  };
}

async function ensureLabel(name) {
  const data = await gapi('/labels');
  const found = (data.labels || []).find((l) => l.name === name);
  if (found) return found.id;
  const created = await gapi('/labels', { method: 'POST', body: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' } });
  return created.id;
}
async function modifyThread(threadId, { add = [], remove = [] } = {}) {
  return gapi(`/threads/${threadId}/modify`, { method: 'POST', body: { addLabelIds: add, removeLabelIds: remove } });
}

// Send a threaded plain-text reply from support@.
async function sendReply({ to, subject, body, threadId, inReplyTo, references }) {
  const subj = /^re:/i.test(subject) ? subject : `Re: ${subject}`;
  const lines = [
    `To: ${to}`,
    `From: ${SUPPORT_FROM}`,
    `Subject: ${subj}`,
  ];
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
  if (inReplyTo || references) lines.push(`References: ${[references, inReplyTo].filter(Boolean).join(' ')}`);
  lines.push('Content-Type: text/plain; charset="UTF-8"', 'MIME-Version: 1.0', '', body);
  const raw = Buffer.from(lines.join('\r\n'), 'utf-8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return gapi('/messages/send', { method: 'POST', body: threadId ? { raw, threadId } : { raw } });
}

module.exports = {
  configured, connected, requireAdmin, authorizeUrl, verifyState, exchangeCode, saveTokens,
  getAccessToken, listMessages, getMessageMeta, ensureLabel, modifyThread, sendReply,
  REDIRECT_URI, SUPPORT_FROM,
};
