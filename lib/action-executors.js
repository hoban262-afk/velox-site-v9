/**
 * lib/action-executors.js — the "what happens when you tap Approve" registry.
 *
 * api/admin/action.js loads an approved agent_actions row and calls run(type, payload).
 * Each executor returns { ok, result } where result is a small JSON blob stored back
 * on the row so the Approvals tab can show "✓ Sent" / "✗ Failed: …".
 *
 * Design rules:
 *   • Executors only ever do SAFE, reversible-ish things (send an email, write a note).
 *   • Nothing here moves money, places a real paid order, or changes access. Those
 *     stay with the human — a reorder card emails the OWNER a ready-to-send PO; the
 *     owner places the actual order.
 *   • Unknown / informational types (anomaly, vat_summary, reconciliation, briefing)
 *     have no side effect — approving them just acknowledges/archives the card.
 */
let sendMail = null;
try { ({ sendMail } = require('./mail')); } catch (e) {}

const OWNER_EMAIL = (process.env.ADMIN_EMAIL || 'veloxpeps@gmail.com').toLowerCase();

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Wrap plain text / partial HTML in a minimal branded shell.
function shell(title, bodyHtml) {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
    <h2 style="font-size:18px;margin:0 0 12px">${esc(title)}</h2>
    <div style="font-size:14px;line-height:1.6">${bodyHtml}</div>
    <p style="font-size:11px;color:#888;margin-top:24px">Sent from the Velox approval inbox.</p>
  </div>`;
}

/**
 * email / email_reply / reorder → send one email via lib/mail.
 * payload: { to, subject, html?, body?, flow? }
 *   - reorder defaults the recipient to the owner if `to` is omitted.
 */
async function runEmail(type, payload) {
  if (!sendMail) return { ok: false, result: { error: 'mailer unavailable' } };
  const p = payload || {};
  const to = String(p.to || (type === 'reorder' ? OWNER_EMAIL : '')).toLowerCase().trim();
  if (!to) return { ok: false, result: { error: 'no recipient' } };
  const subject = String(p.subject || 'Velox').slice(0, 200);
  const html = p.html || shell(subject, `<p>${esc(p.body || '').replace(/\n/g, '<br>')}</p>`);
  const flow = p.flow || (type === 'reorder' ? 'reorder' : 'campaign');
  try {
    const r = await sendMail({ to, subject, html, text: p.body || undefined, flow, track: false });
    return { ok: !!(r && r.ok), result: { sent_to: to, message_id: r && r.id, ok: !!(r && r.ok) } };
  } catch (e) {
    return { ok: false, result: { error: e.message } };
  }
}

// Informational cards: approving = acknowledge, no side effect.
async function runAcknowledge(type, payload) {
  return { ok: true, result: { acknowledged: true } };
}

const REGISTRY = {
  email: runEmail,
  email_reply: runEmail,
  reorder: runEmail,
  content_draft: runAcknowledge,
  briefing: runAcknowledge,
  anomaly: runAcknowledge,
  vat_summary: runAcknowledge,
  reconciliation: runAcknowledge,
  shipping: runAcknowledge,
};

/**
 * Execute an approved action.
 * @returns {Promise<{ok:boolean, result:object}>}
 */
async function run(type, payload) {
  const fn = REGISTRY[type] || runAcknowledge;
  try {
    return await fn(type, payload);
  } catch (e) {
    return { ok: false, result: { error: e.message } };
  }
}

module.exports = { run };
