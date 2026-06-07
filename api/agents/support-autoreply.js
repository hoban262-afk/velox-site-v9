/**
 * GET/POST /api/agents/support-autoreply — ALWAYS-ON support inbox triage.
 *
 * Runs server-side on a cron (no desktop app needed). For each new support
 * email:
 *   • "where's my order?" + a matchable order → AUTO-SEND a status reply from
 *     support@ (threaded, in Gmail), then mark read + label handled.
 *   • anything else → post a "needs a reply" card to the admin Approvals inbox
 *     and leave it UNREAD in Gmail so the owner can reply there. (Never auto-sends.)
 *
 * Compliance: the only thing auto-sent is a customer's own order status — never
 * usage, dosing, or medical content.
 *
 * Auth matches the other cron workers (CRON_SECRET / INTERNAL_TASK_SECRET).
 */
const g = require('../../lib/gmail');
const { proposeAction } = require('../../lib/agent-actions');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE         = process.env.NEXT_PUBLIC_SITE_URL || 'https://veloxpeps.com';
const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

function authorised(req) {
  const auth = req.headers['authorization'] || '';
  const internal = req.headers['x-internal-secret'] || '';
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (process.env.INTERNAL_TASK_SECRET && internal === process.env.INTERNAL_TASK_SECRET) return true;
  if (!process.env.CRON_SECRET && !process.env.INTERNAL_TASK_SECRET) return false; // fail closed
  return false;
}

const STATUS_LINE = {
  pending:    (r) => `We've got your order ${r} and are just waiting for payment to confirm. Once it's through we'll pack and dispatch it.`,
  open:       (r) => `We've got your order ${r} and are just waiting for payment to confirm. Once it's through we'll pack and dispatch it.`,
  paid:       (r) => `Good news — your order ${r} is paid and being packed now. It'll be dispatched very shortly and you'll get a tracking email the moment it's on its way.`,
  dispatched: (r) => `Your order ${r} is on its way with Royal Mail.`,
  delivered:  (r) => `Royal Mail has marked your order ${r} as delivered. If it hasn't reached you, just reply and we'll look into it.`,
  cancelled:  (r) => `Your order ${r} shows as cancelled. If that's unexpected, just reply and we'll sort it out.`,
};

const ORDER_STATUS_HINTS = [
  'where', 'track', 'tracking', 'dispatch', 'shipped', 'ship ', 'arrive', 'arrived',
  'deliver', 'delivery', 'my order', 'order status', 'not received', "hasn't arrived",
  'still waiting', 'when will', 'where is', 'has my', 'did my order',
];

function looksLikeOrderStatus(text) {
  const t = (text || '').toLowerCase();
  return ORDER_STATUS_HINTS.some((k) => t.includes(k));
}

function firstName(from) {
  const namePart = String(from || '').split('<')[0].trim().replace(/"/g, '');
  if (!namePart || namePart.includes('@')) return 'there';
  return namePart.split(/\s+/)[0];
}

// Automated / no-reply / known-provider senders we never act on, as a backstop.
const SYSTEM_SENDER = /((^|[._-])(no-?reply|noreply|do-?not-?reply|notifications?|mailer-daemon|postmaster|bounce|automated|alerts?)@)|(@(.*\.)?(vercel|supabase|resend|stripe|google|googlemail|github|fena|royalmail|paypal|gocardless|cloudflare|namecheap)\.)/i;
function isSystemSender(email) { return SYSTEM_SENDER.test(String(email || '')); }

async function findOrder(email) {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?customer_email=ilike.${encodeURIComponent(email)}&select=notes,status,dispatched_at,tracking_number&order=created_at.desc&limit=1`,
      { headers: sbHeaders }
    );
    const rows = r.ok ? await r.json() : [];
    return Array.isArray(rows) ? rows[0] : null;
  } catch { return null; }
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!g.configured() || !(await g.connected())) {
    return res.status(200).json({ ok: true, skipped: 'gmail-not-connected' });
  }

  let seenLabel, supportLabel;
  try {
    seenLabel = await g.ensureLabel('AI-Seen');
    supportLabel = await g.ensureLabel('Support');
  } catch (e) { return res.status(502).json({ error: 'Gmail label error: ' + e.message }); }

  // SCOPE: only ever look at the Primary tab (this excludes Promotions, Updates,
  // Forums and Social — most newsletters, receipts and system noise), PLUS anything
  // you manually drop into the "Support" label. Everything else in the inbox
  // (suppliers, Vercel/Supabase/bank alerts, personal mail) is never touched.
  let candidates = [];
  try {
    const a = await g.listMessages('in:inbox category:primary newer_than:3d -label:AI-Seen', 25);
    const b = await g.listMessages('label:Support newer_than:3d -label:AI-Seen', 25);
    const seen = new Set();
    candidates = [...a, ...b].filter((m) => { if (!m || !m.id || seen.has(m.id)) return false; seen.add(m.id); return true; });
  } catch (e) { return res.status(502).json({ error: 'Gmail list error: ' + e.message }); }

  let autoSent = 0, carded = 0, skipped = 0;
  for (const m of candidates) {
    try {
      const meta = await g.getMessageMeta(m.id);
      const labels = meta.labelIds || [];
      // Never touch our own outbound, empty senders, Sent, or automated/no-reply mail.
      if (!meta.fromEmail || meta.fromEmail.endsWith('@veloxpeps.com') || labels.includes('SENT') || isSystemSender(meta.fromEmail)) {
        skipped++; continue; // leave it completely alone — no label, no card
      }

      const hasSupportLabel = labels.includes(supportLabel);
      const order = await findOrder(meta.fromEmail);

      // GATE — only act on real customers (already in your orders) or anything you've
      // manually labelled "Support". Anyone else (suppliers, personal, etc.) is ignored.
      if (!hasSupportLabel && !order) { skipped++; continue; }

      const isStatus = looksLikeOrderStatus(`${meta.subject} ${meta.snippet}`);

      if (isStatus && order) {
        // AUTO-SEND order status (the only thing we ever send without a human).
        const ref = order.notes || 'your order';
        const lineFn = STATUS_LINE[order.status] || ((r) => `Here's the latest on order ${r}.`);
        let body = `Hi ${firstName(meta.from)},\n\nThanks for getting in touch about your order.\n\n${lineFn(ref)}`;
        if (order.status === 'dispatched' && order.tracking_number) {
          const tn = order.tracking_number;
          body += `\n\nTracking number: ${tn}\nTrack it here: https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(tn.replace(/\s+/g, ''))}`;
        }
        body += `\n\nYou can always see live status here: ${SITE}/track/?ref=${encodeURIComponent(ref)}&email=${encodeURIComponent(meta.fromEmail)}\n\nBest,\nVelox Peptides Support`;

        await g.sendReply({
          to: meta.replyTo || meta.fromEmail, subject: meta.subject || 'Your order',
          body, threadId: meta.threadId, inReplyTo: meta.messageId, references: meta.references,
        });
        await g.modifyThread(meta.threadId, { add: [seenLabel], remove: ['UNREAD'] });
        autoSent++;
      } else {
        // Needs a human — notify via Approvals card, leave UNREAD in Gmail.
        await proposeAction({
          agent: 'support-autoreply',
          type: 'briefing', // acknowledge-only: the owner replies in Gmail
          title: `Support email needs a reply: ${(meta.subject || '(no subject)').slice(0, 80)}`,
          summary: `From ${meta.from}: ${meta.snippet.slice(0, 200)} — reply from support@ in Gmail.`,
          payload: { from: meta.from, from_email: meta.fromEmail, subject: meta.subject, snippet: meta.snippet, gmail_thread: meta.threadId },
          dedupeKey: `support:${meta.threadId}`,
          notify: true,
        });
        await g.modifyThread(meta.threadId, { add: [seenLabel] }); // keep UNREAD for the human
        carded++;
      }
    } catch (e) {
      console.error('[support-autoreply] message failed', m.id, e.message);
      skipped++;
    }
  }

  return res.status(200).json({ ok: true, scanned: candidates.length, autoSent, carded, skipped });
};
