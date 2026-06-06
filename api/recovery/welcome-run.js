/**
 * GET/POST /api/recovery/welcome-run — welcome-series cron worker (stages 2 & 3)
 *
 * Stage 1 (code + handbook) is sent immediately by api/newsletter/signup.js,
 * which stamps welcome_stage=1. This worker sends the follow-ups:
 *   stage 2 → +2 days : why-Velox / trust + bestsellers
 *   stage 3 → +4 days : last-chance nudge, reusing their existing 10% code
 *
 * Stage 3 is skipped (and parked) for anyone who has already purchased.
 * Auth + suppression match the other recovery workers.
 */
const crypto = require('crypto');
const { sendMail } = require('../../lib/mail');
const { buildWelcomeEmail, WELCOME_STAGES } = require('../../lib/welcome-emails');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE         = process.env.NEXT_PUBLIC_SITE_URL || 'https://veloxpeps.com';
const MAX_PER_RUN  = 80;

function authorised(req) {
  const auth = req.headers['authorization'] || '';
  const internal = req.headers['x-internal-secret'] || '';
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (process.env.INTERNAL_TASK_SECRET && internal === process.env.INTERNAL_TASK_SECRET) return true;
  return false;
}

const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders });
  if (!r.ok) throw new Error(`Supabase GET ${path} -> ${r.status}`);
  return r.json();
}
async function sbPatch(path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase PATCH ${path} -> ${r.status}`);
}

function signEmailToken(email) {
  const e = String(email).toLowerCase();
  const sig = crypto.createHmac('sha256', SERVICE).update(e).digest('hex').slice(0, 32);
  return `${Buffer.from(e, 'utf-8').toString('base64url')}.${sig}`;
}

function dueStage(sub) {
  const ageDays = (Date.now() - new Date(sub.created_at).getTime()) / 864e5;
  const current = Number(sub.welcome_stage || 0);
  let target = current;
  if (ageDays >= WELCOME_STAGES[2]) target = 2;
  if (ageDays >= WELCOME_STAGES[3]) target = 3;
  return target > current ? target : 0;
}

async function hasPurchased(email) {
  try {
    const rows = await sbGet(
      `orders?customer_email=eq.${encodeURIComponent(email)}&status=in.(paid,dispatched)&select=id&limit=1`
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch { return false; }
}

// Their live (unused, unexpired) 10% welcome code, if any — reused in stage 3.
async function activeWelcomeCode(email) {
  try {
    const nowIso = new Date().toISOString();
    const rows = await sbGet(
      `newsletter_codes?email=eq.${encodeURIComponent(email)}&used_at=is.null` +
      `&or=(expires_at.is.null,expires_at.gt.${encodeURIComponent(nowIso)})&select=code&limit=1`
    );
    return (Array.isArray(rows) && rows[0] && rows[0].code) || null;
  } catch { return null; }
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Supabase not configured' });
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorised' });
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'Resend not configured' });

  const summary = { scanned: 0, sent: 0, skipped_purchased: 0, errors: 0, by_stage: { 2: 0, 3: 0 } };

  // Candidates: subscribed, not unsubscribed, still mid-series, old enough for stage 2.
  let subs = [];
  try {
    const cutoff = new Date(Date.now() - WELCOME_STAGES[2] * 864e5).toISOString();
    subs = await sbGet(
      'subscribers?unsubscribed_at=is.null&welcome_stage=lt.3' +
      `&created_at=lt.${encodeURIComponent(cutoff)}` +
      '&select=id,email,created_at,welcome_stage&order=created_at.asc&limit=300'
    );
  } catch (e) {
    console.error('[welcome-run] query failed:', e.message);
    return res.status(500).json({ error: 'Query failed', detail: e.message });
  }

  for (const sub of subs) {
    if (summary.sent >= MAX_PER_RUN) break;
    summary.scanned++;
    if (!sub.email) continue;

    const stage = dueStage(sub);
    if (!stage) continue;

    const park = (s) => sbPatch(`subscribers?id=eq.${encodeURIComponent(sub.id)}`, {
      welcome_stage: s, welcome_last_at: new Date().toISOString(),
    }).catch(() => {});

    // Stage 3 is a "you haven't bought yet" nudge — skip buyers, but advance the
    // stage so they exit the series cleanly.
    if (stage === 3 && await hasPurchased(sub.email)) {
      summary.skipped_purchased++; await park(3); continue;
    }

    const links = {
      unsubscribeUrl: `${SITE}/api/newsletter/unsubscribe?token=${encodeURIComponent(signEmailToken(sub.email))}`,
    };
    if (stage === 3) {
      const code = await activeWelcomeCode(sub.email);
      if (code) links.discountCode = code;
    }

    let email;
    try { email = buildWelcomeEmail(stage, sub, links); }
    catch (e) { console.error('[welcome-run] build failed', sub.email, e.message); summary.errors++; continue; }

    const r = await sendMail({
      to: sub.email, subject: email.subject, html: email.html, text: email.text,
      flow: 'welcome', stage,
      headers: {
        'List-Unsubscribe': `<${links.unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    if (r.ok) {
      await park(stage);
      summary.sent++; summary.by_stage[stage]++;
    } else { summary.errors++; }
  }

  console.log('[welcome-run] done', JSON.stringify(summary));
  return res.status(200).json({ ok: true, ...summary });
};
