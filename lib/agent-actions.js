/**
 * lib/agent-actions.js — the write side of the Approval Inbox.
 *
 * Any automation ("agent") calls proposeAction() to drop a card into the
 * agent_actions table for the owner to Approve or Dismiss from /admin/ → Approvals.
 * This is the keystone of the "run it from anywhere" model: agents never act on
 * their own — they propose, you approve, and api/admin/action.js executes.
 *
 * Lives OUTSIDE /api so Vercel never treats it as a serverless function.
 *
 * Fail-safe: writes with the service role and never throws — a notification or
 * insert problem can never break the caller (an order, a cron, a signup).
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (notifications reuse lib/notify-*).
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE         = process.env.NEXT_PUBLIC_SITE_URL || 'https://veloxpeps.com';

const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

// Notifications are best-effort; load lazily so a missing dep never breaks a propose.
let sendPush = null, sendWhatsApp = null;
try { ({ sendPush } = require('./notify-push')); } catch (e) {}
try { ({ sendWhatsApp } = require('./notify-whatsapp')); } catch (e) {}

const VALID_TYPES = new Set([
  'email_reply', 'content_draft', 'reorder', 'vat_summary',
  'reconciliation', 'anomaly', 'shipping', 'briefing', 'email',
]);

function configured() { return !!(SUPABASE_URL && SERVICE); }

/**
 * Is there already an open (pending or approved) card with this dedupe key?
 * Stops a cron that runs daily from posting the same "reorder Retatrutide" card
 * over and over. The key is stored in payload.dedupe_key.
 */
async function hasOpenDuplicate(dedupeKey) {
  if (!dedupeKey) return false;
  try {
    const q = `${SUPABASE_URL}/rest/v1/agent_actions` +
      `?select=id&status=in.(pending,approved)` +
      `&payload->>dedupe_key=eq.${encodeURIComponent(dedupeKey)}&limit=1`;
    const r = await fetch(q, { headers: sbHeaders });
    const rows = r.ok ? await r.json() : [];
    return Array.isArray(rows) && rows.length > 0;
  } catch (e) { return false; }
}

/**
 * Post one approval card.
 * @param {object} o
 *   agent       {string}  which automation created it (e.g. 'reorder-check')   [required]
 *   type        {string}  one of VALID_TYPES                                    [required]
 *   title       {string}  one-line headline for the inbox list                  [required]
 *   summary     {string}  short human context                                   (optional)
 *   payload     {object}  the proposed action (email body, PO numbers, …)       (optional)
 *   relatedOrderId {string} order uuid this relates to                          (optional)
 *   dedupeKey   {string}  skip if an open card with this key already exists      (optional)
 *   notify      {boolean} push/WhatsApp the owner (default true)                 (optional)
 * @returns {Promise<{ok:boolean, id?:string, deduped?:boolean, skipped?:boolean}>}
 */
async function proposeAction(o) {
  if (!configured()) { console.warn('[agent-actions] Supabase not configured — skipping'); return { ok: false, skipped: true }; }
  const agent = String(o.agent || '').trim();
  const type  = String(o.type || '').trim();
  const title = String(o.title || '').trim();
  if (!agent || !type || !title) { console.warn('[agent-actions] missing agent/type/title'); return { ok: false, skipped: true }; }
  if (!VALID_TYPES.has(type)) { console.warn('[agent-actions] unknown type', type); return { ok: false, skipped: true }; }

  const dedupeKey = o.dedupeKey ? String(o.dedupeKey) : null;
  if (dedupeKey && await hasOpenDuplicate(dedupeKey)) {
    return { ok: true, deduped: true };
  }

  const payload = Object.assign({}, o.payload || {});
  if (dedupeKey) payload.dedupe_key = dedupeKey;

  const row = {
    agent, type, title,
    summary: o.summary ? String(o.summary).slice(0, 500) : null,
    payload,
    status: 'pending',
    related_order_id: o.relatedOrderId || null,
  };

  let id = null;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/agent_actions`, {
      method: 'POST', headers: { ...sbHeaders, Prefer: 'return=representation' }, body: JSON.stringify(row),
    });
    if (!r.ok) { console.error('[agent-actions] insert failed', r.status, (await r.text()).slice(0, 200)); return { ok: false }; }
    const data = await r.json().catch(() => null);
    id = Array.isArray(data) ? (data[0] && data[0].id) : (data && data.id);
  } catch (e) { console.error('[agent-actions] insert threw', e.message); return { ok: false }; }

  // Best-effort notify — never blocks or throws.
  if (o.notify !== false) {
    const msg = title;
    const notifyTitle = o.notifyTitle || 'Approval needed';
    try { if (sendPush) await sendPush({ title: notifyTitle, body: msg, url: `${SITE}/admin/#actions` }); } catch (e) {}
    try { if (sendWhatsApp) await sendWhatsApp(`🔔 ${notifyTitle}: ${msg}\nReview: ${SITE}/admin/#actions`); } catch (e) {}
  }

  return { ok: true, id };
}

module.exports = { proposeAction, VALID_TYPES };
