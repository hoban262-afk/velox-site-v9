/**
 * GET/POST /api/recovery/design-nurture-run — Design Lab nurture cron worker.
 *
 * Emails account-holders who generated a Design Lab run, then went quiet:
 *   stage 1 → +2h  : "your design is ready" + the closest compound to study
 *   stage 2 → +3d  : nudge toward that compound + a first-order code (skipped for buyers)
 *
 * Safety: only the user's FIRST design is nurtured (no per-run spam); anyone with
 * subscribers.unsubscribed_at set is suppressed; every send is idempotent via
 * nurture_stage on the run. Auth matches the other recovery workers.
 */
const crypto = require('crypto');
const { sendMail } = require('../../lib/mail');
const { buildDesignNurtureEmail, NURTURE_STAGES } = require('../../lib/design-nurture-emails');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE         = process.env.NEXT_PUBLIC_SITE_URL || 'https://veloxpeps.com';
const FIRST_ORDER_CODE = process.env.FIRST_ORDER_CODE || 'DESIGN10';
const MAX_PER_RUN  = 40;

function authorised(req) {
  const auth = req.headers['authorization'] || '';
  const internal = req.headers['x-internal-secret'] || '';
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (process.env.INTERNAL_TASK_SECRET && internal === process.env.INTERNAL_TASK_SECRET) return true;
  return false;
}

const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
async function sbGet(path) { const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders }); if (!r.ok) throw new Error(`GET ${path} -> ${r.status}`); return r.json(); }
async function sbPatch(path, body) { const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`PATCH ${path} -> ${r.status}`); }

function signEmailToken(email) {
  const e = String(email).toLowerCase();
  const sig = crypto.createHmac('sha256', SERVICE).update(e).digest('hex').slice(0, 32);
  return `${Buffer.from(e, 'utf-8').toString('base64url')}.${sig}`;
}
function dueStage(run) {
  const ageH = (Date.now() - new Date(run.created_at).getTime()) / 36e5;
  const cur = Number(run.nurture_stage || 0);
  let target = cur;
  if (ageH >= NURTURE_STAGES[1]) target = 1;
  if (ageH >= NURTURE_STAGES[2]) target = 2;
  return target > cur ? target : 0;
}
async function emailFor(userId) {
  try { const rows = await sbGet(`profiles?id=eq.${encodeURIComponent(userId)}&select=email&limit=1`); return (rows[0] && rows[0].email) || null; } catch { return null; }
}
async function isUnsubscribed(email) {
  try { const rows = await sbGet(`subscribers?email=eq.${encodeURIComponent(email)}&unsubscribed_at=not.is.null&select=id&limit=1`); return Array.isArray(rows) && rows.length > 0; } catch { return false; }
}
async function hasPurchased(email) {
  try { const rows = await sbGet(`orders?customer_email=eq.${encodeURIComponent(email)}&status=in.(paid,dispatched)&select=id&limit=1`); return Array.isArray(rows) && rows.length > 0; } catch { return false; }
}
async function userAlreadyNurtured(userId, exceptId) {
  try { const rows = await sbGet(`design_lab_runs?user_id=eq.${encodeURIComponent(userId)}&nurture_stage=gt.0&id=neq.${encodeURIComponent(exceptId)}&select=id&limit=1`); return Array.isArray(rows) && rows.length > 0; } catch { return false; }
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Supabase not configured' });
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorised' });
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'Resend not configured' });

  const summary = { scanned: 0, sent: 0, skipped: 0, errors: 0, by_stage: { 1: 0, 2: 0 } };

  let runs = [];
  try {
    const cutoff = new Date(Date.now() - NURTURE_STAGES[1] * 36e5).toISOString();
    runs = await sbGet(
      'design_lab_runs?nurture_stage=lt.2&user_id=not.is.null' +
      `&created_at=lt.${encodeURIComponent(cutoff)}` +
      '&select=id,user_id,name,brief,candidates,target,is_shared,share_token,nurture_stage,created_at&order=created_at.asc&limit=300'
    );
  } catch (e) { return res.status(500).json({ error: 'Query failed', detail: e.message }); }

  for (const run of runs) {
    if (summary.sent >= MAX_PER_RUN) break;
    summary.scanned++;
    const stage = dueStage(run);
    if (!stage) continue;

    const park = (s) => sbPatch(`design_lab_runs?id=eq.${encodeURIComponent(run.id)}`, { nurture_stage: s, nurture_last_at: new Date().toISOString() }).catch(() => {});

    // Only nurture a user's first design — if another run already entered the series, exit this one.
    if (await userAlreadyNurtured(run.user_id, run.id)) { summary.skipped++; await park(2); continue; }

    const email = await emailFor(run.user_id);
    if (!email) { summary.skipped++; await park(2); continue; }
    if (await isUnsubscribed(email)) { summary.skipped++; await park(2); continue; }

    // Stage 2 is a "haven't ordered" nudge — skip buyers but advance them out.
    if (stage === 2 && await hasPurchased(email)) { summary.skipped++; await park(2); continue; }

    const links = { unsubscribeUrl: `${SITE}/api/newsletter/unsubscribe?token=${encodeURIComponent(signEmailToken(email))}` };
    if (stage === 2) links.firstOrderCode = FIRST_ORDER_CODE;

    let msg;
    try { msg = buildDesignNurtureEmail(stage, run, links); }
    catch (e) { summary.errors++; continue; }

    const r = await sendMail({
      to: email, subject: msg.subject, html: msg.html, text: msg.text, flow: 'design-nurture', stage,
      headers: { 'List-Unsubscribe': `<${links.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    });
    if (r.ok) { await park(stage); summary.sent++; summary.by_stage[stage]++; }
    else summary.errors++;
  }

  return res.status(200).json({ ok: true, ...summary, generated_at: new Date().toISOString() });
};
