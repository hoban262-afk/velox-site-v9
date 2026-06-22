/**
 * GET/POST /api/agents/chat-transcripts — email the on-site chatbot's conversations
 * to support@veloxpeps.com. Two modes, selected by ?mode= (default flush):
 *
 *   ?mode=flush   — runs often (every ~15 min). Emails each conversation ONCE,
 *                   shortly after it goes quiet, so support sees real chats while
 *                   they're still fresh. Picks rows where emailed_at is null and
 *                   last_at is older than IDLE_MINUTES, then stamps emailed_at.
 *
 *   ?mode=digest  — runs once a day (morning). One catch-all email summarising
 *                   every conversation from the last 24h that hasn't been put in a
 *                   digest yet, then stamps digest_at. Safety net so nothing is
 *                   ever silently lost even if a flush send failed.
 *
 * Transcripts hold visitor PII, so this is service-role only and the table is
 * never exposed to anon/authenticated (see migration 027). Sent directly via
 * Resend (no marketing pixel/tracking — these are internal ops emails).
 * Auth matches the other cron workers (CRON_SECRET / INTERNAL_TASK_SECRET).
 */
const { Resend } = require('resend');

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE       = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPPORT_EMAIL = (process.env.CHAT_TRANSCRIPT_EMAIL || 'support@veloxpeps.com').toLowerCase();
const FROM          = process.env.CHAT_TRANSCRIPT_FROM || 'Velox Chat <support@veloxpeps.com>';
const IDLE_MINUTES  = Number(process.env.CHAT_FLUSH_IDLE_MINUTES || 10);
const FLUSH_LIMIT   = 50;   // max conversations emailed per flush run

const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

function authorised(req) {
  const auth = req.headers['authorization'] || '';
  const internal = req.headers['x-internal-secret'] || '';
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (process.env.INTERNAL_TASK_SECRET && internal === process.env.INTERNAL_TASK_SECRET) return true;
  if (!process.env.CRON_SECRET && !process.env.INTERNAL_TASK_SECRET) return false; // fail closed
  return false;
}

async function sbGet(path) {
  try { const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders }); return r.ok ? await r.json() : []; }
  catch { return []; }
}
async function sbPatch(path, body) {
  try { await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(body) }); }
  catch (e) { console.error('[chat-transcripts] patch', e.message); }
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDate = (iso) => { try { return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso || ''; } };

// Render one conversation as an HTML block (chat bubbles) + a plain-text version.
function renderConversation(row) {
  const thread = Array.isArray(row.transcript) ? row.transcript : [];
  const head = `${esc(row.email || 'no email shared')} · ${esc(row.page || 'unknown page')} · ${esc(fmtDate(row.last_at))} · ${thread.length} message${thread.length === 1 ? '' : 's'}`;
  const bubbles = thread.map((m) => {
    const who = m.role === 'user' ? 'Visitor' : 'Matt';
    const colour = m.role === 'user' ? '#0b5cff' : '#0a7d4a';
    return `<div style="margin:6px 0"><span style="font-weight:600;color:${colour}">${who}:</span> <span style="color:#222">${esc(m.content)}</span></div>`;
  }).join('');
  const html = `<div style="margin:0 0 24px;padding:14px 16px;border:1px solid #e5e7eb;border-radius:10px">
    <div style="font-size:12px;color:#6b7280;margin-bottom:10px">${head}</div>
    ${bubbles || '<div style="color:#9ca3af">(empty)</div>'}
  </div>`;
  const text = `--- ${row.email || 'no email'} · ${row.page || 'unknown'} · ${fmtDate(row.last_at)} ---\n`
    + thread.map((m) => `${m.role === 'user' ? 'Visitor' : 'Matt'}: ${m.content}`).join('\n');
  return { html, text };
}

async function sendOne(resend, subject, html, text) {
  return resend.emails.send({ from: FROM, to: SUPPORT_EMAIL, replyTo: SUPPORT_EMAIL, subject, html, text });
}

// ── flush: email each freshly-quiet conversation once ─────────────────────────
async function runFlush(resend) {
  const cutoff = new Date(Date.now() - IDLE_MINUTES * 60 * 1000).toISOString();
  const rows = await sbGet(
    `chat_transcripts?emailed_at=is.null&last_at=lt.${cutoff}&msg_count=gte.1`
    + `&select=sid,email,page,transcript,msg_count,started_at,last_at&order=last_at.asc&limit=${FLUSH_LIMIT}`
  );
  let sent = 0;
  for (const row of rows) {
    const { html, text } = renderConversation(row);
    const subj = `Chat transcript — ${row.email || 'visitor'} (${row.msg_count} msg${row.msg_count === 1 ? '' : 's'})`;
    try {
      await sendOne(resend, subj, `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif">${html}</div>`, text);
      await sbPatch(`chat_transcripts?sid=eq.${encodeURIComponent(row.sid)}`, { emailed_at: new Date().toISOString() });
      sent++;
    } catch (e) { console.error('[chat-transcripts] flush send', row.sid, e.message); }
  }
  return { mode: 'flush', candidates: rows.length, sent };
}

// ── digest: one daily catch-all of the last 24h ───────────────────────────────
async function runDigest(resend) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = await sbGet(
    `chat_transcripts?digest_at=is.null&last_at=gte.${since}&msg_count=gte.1`
    + `&select=sid,email,page,transcript,msg_count,started_at,last_at&order=last_at.desc&limit=500`
  );
  if (!rows.length) return { mode: 'digest', candidates: 0, sent: 0 };

  const withEmail = rows.filter((r) => r.email).length;
  const blocks = rows.map(renderConversation);
  const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:680px">
    <h2 style="margin:0 0 4px">Velox chat digest — ${esc(dateStr)}</h2>
    <p style="color:#6b7280;margin:0 0 20px">${rows.length} conversation${rows.length === 1 ? '' : 's'} in the last 24h · ${withEmail} shared an email.</p>
    ${blocks.map((b) => b.html).join('')}
  </div>`;
  const text = `Velox chat digest — ${dateStr}\n${rows.length} conversations in the last 24h, ${withEmail} shared an email.\n\n`
    + blocks.map((b) => b.text).join('\n\n');

  await sendOne(resend, `Velox chat digest — ${rows.length} conversation${rows.length === 1 ? '' : 's'} (${dateStr})`, html, text);
  // Stamp them all so the next digest doesn't repeat them.
  const stamp = new Date().toISOString();
  for (const r of rows) await sbPatch(`chat_transcripts?sid=eq.${encodeURIComponent(r.sid)}`, { digest_at: stamp });
  return { mode: 'digest', candidates: rows.length, sent: 1 };
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not set' });

  const mode = ((req.query && req.query.mode) || 'flush').toString().toLowerCase();
  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const result = mode === 'digest' ? await runDigest(resend) : await runFlush(resend);
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    console.error('[chat-transcripts] error', e.message);
    return res.status(500).json({ error: e.message });
  }
};
