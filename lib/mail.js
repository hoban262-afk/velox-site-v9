/**
 * lib/mail.js — central marketing-email sender + analytics instrumentation.
 *
 * Every marketing email (welcome series, abandoned checkout, back-in-stock,
 * reorder, campaigns) goes through sendMail() so that:
 *   1. one row per send is logged in email_messages (the analytics backbone),
 *   2. an open-tracking pixel + signed click-redirects are injected,
 *   3. the From address is centralised on the marketing subdomain.
 *
 * Provider-agnostic: today it sends with Resend; to move to Amazon SES later,
 * swap the deliver() body — nothing else changes.
 */
const crypto = require('crypto');
const { Resend } = require('resend');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE         = process.env.NEXT_PUBLIC_SITE_URL || 'https://veloxpeps.com';

// Marketing mail sends from the news. subdomain so a marketing complaint can
// never dent the deliverability of order receipts on the root domain.
// Default is the already-verified newsletter@ address so deploying before the
// subdomain's DNS is verified can't break sends. Once news.veloxpeps.com is
// verified in Resend, set MARKETING_FROM='Velox Peptides <hello@news.veloxpeps.com>'.
const MARKETING_FROM = process.env.MARKETING_FROM || 'Velox Peptides <newsletter@veloxpeps.com>';
const REPLY_TO       = process.env.MARKETING_REPLY_TO || 'support@veloxpeps.com';

const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

// ── Signed click links (prevents our redirect being used as an open redirect) ──
function signClickUrl(url) {
  const enc = Buffer.from(String(url), 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', SERVICE).update(enc).digest('hex').slice(0, 16);
  return `${enc}.${sig}`;
}
function verifyClickToken(token) {
  const [enc, sig] = String(token || '').split('.');
  if (!enc || !sig) return null;
  const good = crypto.createHmac('sha256', SERVICE).update(enc).digest('hex').slice(0, 16);
  if (sig !== good) return null;
  try {
    const url = Buffer.from(enc, 'base64url').toString('utf-8');
    return /^https?:\/\//i.test(url) ? url : null;
  } catch { return null; }
}

// ── Inject open pixel + rewrite links to tracked redirects ────────────────────
function injectTracking(html, messageId) {
  let out = String(html || '');
  // Rewrite outbound links, but leave unsubscribe / tracking / mailto / tel alone.
  out = out.replace(/href="(https?:\/\/[^"]+)"/gi, (m, url) => {
    if (/\/api\/newsletter\/unsubscribe|\/api\/e\//i.test(url)) return m;
    const tracked = `${SITE}/api/e/c?m=${encodeURIComponent(messageId)}&u=${encodeURIComponent(signClickUrl(url))}`;
    return `href="${tracked}"`;
  });
  const pixel = `<img src="${SITE}/api/e/o?m=${encodeURIComponent(messageId)}" width="1" height="1" alt="" style="display:none;max-height:0;overflow:hidden">`;
  if (/<\/body>/i.test(out)) out = out.replace(/<\/body>/i, pixel + '</body>');
  else out += pixel;
  return out;
}

async function logMessage(row) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/email_messages`, {
      method: 'POST', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(row),
    });
    return r.ok;
  } catch (e) { console.error('[mail] logMessage', e.message); return false; }
}

async function setProviderId(id, providerId) {
  if (!providerId) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/email_messages?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify({ provider_id: providerId }),
    });
  } catch {}
}

// Append an open/click/bounce event and bump the message counters. Used by the
// /api/e/* tracking endpoints.
async function recordEvent(messageId, type, meta = {}) {
  const evt = { message_id: messageId, type, url: meta.url || null, ua: (meta.ua || '').slice(0, 300), ip: meta.ip || null };
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/email_events`, {
      method: 'POST', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(evt),
    });
  } catch {}
  // Bump counters / first-touch timestamps on the message via RPC-free PATCH.
  const nowIso = new Date().toISOString();
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/email_messages?id=eq.${encodeURIComponent(messageId)}&select=open_count,click_count,opened_at,first_click_at`, { headers: sbHeaders });
    const rows = r.ok ? await r.json() : [];
    const cur = Array.isArray(rows) ? rows[0] : null;
    if (!cur) return;
    const patch = {};
    if (type === 'open') {
      patch.open_count = Number(cur.open_count || 0) + 1;
      if (!cur.opened_at) patch.opened_at = nowIso;
    } else if (type === 'click') {
      patch.click_count = Number(cur.click_count || 0) + 1;
      if (!cur.first_click_at) patch.first_click_at = nowIso;
      if (!cur.opened_at) patch.opened_at = nowIso; // a click implies an open
    }
    if (Object.keys(patch).length) {
      await fetch(`${SUPABASE_URL}/rest/v1/email_messages?id=eq.${encodeURIComponent(messageId)}`, {
        method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(patch),
      });
    }
  } catch (e) { console.error('[mail] recordEvent', e.message); }
}

/**
 * Send one tracked marketing email.
 * @param {object} o
 *   to, subject, html, text         — content
 *   flow                            — welcome | abandoned | back_in_stock | reorder | review | campaign
 *   stage, campaignId, orderId, productSlug  — analytics context (optional)
 *   from, replyTo, headers          — overrides (optional)
 *   track                           — default true; set false to skip pixel/redirects
 * @returns {Promise<{id:string, ok:boolean}>}
 */
async function sendMail(o) {
  const to = String(o.to || '').toLowerCase().trim();
  if (!to) return { id: null, ok: false };
  const id = crypto.randomUUID();

  await logMessage({
    id, email: to, flow: o.flow || 'campaign', stage: o.stage ?? null,
    subject: o.subject || null, campaign_id: o.campaignId || null,
    order_id: o.orderId || null, product_slug: o.productSlug || null,
  });

  const html = o.track === false ? o.html : injectTracking(o.html, id);

  if (!process.env.RESEND_API_KEY) { console.error('[mail] RESEND_API_KEY missing'); return { id, ok: false }; }
  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const resp = await resend.emails.send({
      from: o.from || MARKETING_FROM,
      to,
      replyTo: o.replyTo || REPLY_TO,
      subject: o.subject,
      html,
      text: o.text,
      headers: o.headers || {},
    });
    if (resp && resp.data && resp.data.id) await setProviderId(id, resp.data.id);
    if (resp && resp.error) { console.error('[mail] resend error', resp.error); return { id, ok: false }; }
    return { id, ok: true };
  } catch (e) {
    console.error('[mail] send failed', e.message);
    return { id, ok: false };
  }
}

module.exports = {
  sendMail, recordEvent, verifyClickToken, signClickUrl, injectTracking,
  MARKETING_FROM, REPLY_TO, SITE,
};
