/**
 * /api/admin/marketing — ADMIN ONLY. The data layer for the admin Marketing tab.
 *
 *  GET ?view=overview   → per-flow analytics (sends/opens/clicks/revenue, 30d),
 *                         a 30-day sends+revenue series, recent campaigns, list size.
 *  GET ?view=subscribers→ subscriber list (email, source, stage, status).
 *  POST { action:'campaign', subject, body, segment } → send a tracked broadcast.
 *
 * Revenue attribution (paid orders, last 30d), in priority order:
 *   1. order.id matches an email_messages.order_id  → that flow (abandoned/reorder)
 *   2. order.welcome_code present                    → welcome
 *   3. email clicked a campaign/back_in_stock/welcome message ≤7d before order → that flow
 */
const crypto = require('crypto');
const { sendMail } = require('../../lib/mail');
const { renderEmail } = require('../../lib/email-layout');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON         = process.env.SUPABASE_ANON_KEY;
const SITE         = process.env.NEXT_PUBLIC_SITE_URL || 'https://veloxpeps.com';

const KNOWN_ADMIN_EMAILS = new Set([
  (process.env.ADMIN_EMAIL || '').toLowerCase(),
  'support@veloxpeps.com', 'veloxpeps@gmail.com',
].filter(Boolean));

const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
const FLOWS = ['welcome', 'abandoned', 'back_in_stock', 'reorder', 'review', 'campaign'];
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

async function isAdmin(req) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token || !SUPABASE_URL) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: ANON || SERVICE || '' } });
    if (!r.ok) return false;
    const u = await r.json();
    return !!u && KNOWN_ADMIN_EMAILS.has((u.email || '').toLowerCase());
  } catch { return false; }
}

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders });
  return r.ok ? r.json() : [];
}
function unsubToken(email) {
  const sig = crypto.createHmac('sha256', SERVICE).update(String(email).toLowerCase()).digest('hex').slice(0, 32);
  return Buffer.from(String(email).toLowerCase()).toString('base64url') + '.' + sig;
}
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function bodyToHtml(message) {
  return String(message || '').trim().split(/\n{2,}/).map((p) =>
    `<p style="font-size:14px;color:#9CA3AF;line-height:1.65;margin:0 0 16px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
}
function wrapCampaign(bodyHtml, email) {
  const unsub = `${SITE}/api/newsletter/unsubscribe?token=${encodeURIComponent(unsubToken(email))}`;
  return renderEmail({
    kicker: 'Research Bulletin',
    bodyHtml,
    cta: { href: `${SITE}/compounds/`, label: 'SHOP THE CATALOGUE →' },
    unsubscribeUrl: unsub,
  });
}

function emptyStat() { return { sends: 0, opens: 0, clicks: 0, revenue: 0, orders: 0 }; }

async function buildOverview() {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const since37 = new Date(Date.now() - 37 * 864e5).toISOString();

  const [messages, orders, campaigns, subRows] = await Promise.all([
    sbGet(`email_messages?sent_at=gte.${encodeURIComponent(since37)}&select=id,email,flow,sent_at,opened_at,first_click_at,order_id&order=sent_at.desc&limit=20000`),
    sbGet(`orders?status=in.(paid,dispatched)&created_at=gte.${encodeURIComponent(since)}&select=id,customer_email,total,created_at,welcome_code&limit=5000`),
    sbGet('email_campaigns?select=*&order=created_at.desc&limit=20'),
    sbGet('subscribers?select=unsubscribed_at&limit=100000'),
  ]);

  // Per-flow send/open/click within the 30-day window.
  const stats = {}; FLOWS.forEach((f) => stats[f] = emptyStat());
  const orderIdToFlow = {};                 // order_id -> flow (abandoned/reorder)
  const clicksByEmail = {};                 // email -> [{flow, at}]
  for (const m of messages) {
    if (new Date(m.sent_at).getTime() >= new Date(since).getTime() && stats[m.flow]) {
      stats[m.flow].sends++;
      if (m.opened_at) stats[m.flow].opens++;
      if (m.first_click_at) stats[m.flow].clicks++;
    }
    if (m.order_id) orderIdToFlow[m.order_id] = m.flow;
    if (m.first_click_at) {
      const e = (m.email || '').toLowerCase();
      (clicksByEmail[e] = clicksByEmail[e] || []).push({ flow: m.flow, at: new Date(m.first_click_at).getTime() });
    }
  }

  // Revenue attribution.
  const daily = {}; // yyyy-mm-dd -> { sends, revenue }
  for (let i = 0; i < 30; i++) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    daily[d] = { date: d, sends: 0, revenue: 0 };
  }
  for (const m of messages) {
    const d = String(m.sent_at).slice(0, 10);
    if (daily[d]) daily[d].sends++;
  }
  for (const o of orders) {
    let flow = null;
    if (o.id && orderIdToFlow[o.id]) flow = orderIdToFlow[o.id];
    else if (o.welcome_code) flow = 'welcome';
    else {
      const e = (o.customer_email || '').toLowerCase();
      const orderT = new Date(o.created_at).getTime();
      const clicks = (clicksByEmail[e] || []).filter((c) => c.at <= orderT && (orderT - c.at) <= 7 * 864e5);
      if (clicks.length) flow = clicks.sort((a, b) => b.at - a.at)[0].flow;
    }
    if (flow && stats[flow]) {
      stats[flow].revenue += n(o.total);
      stats[flow].orders++;
      const d = String(o.created_at).slice(0, 10);
      if (daily[d]) daily[d].revenue += n(o.total);
    }
  }

  // Round + derive rates.
  const flows = FLOWS.map((f) => {
    const s = stats[f];
    return {
      flow: f, sends: s.sends, opens: s.opens, clicks: s.clicks, orders: s.orders,
      revenue: Math.round(s.revenue * 100) / 100,
      open_rate: s.sends ? Math.round((s.opens / s.sends) * 1000) / 10 : 0,
      click_rate: s.sends ? Math.round((s.clicks / s.sends) * 1000) / 10 : 0,
    };
  });
  const totals = flows.reduce((a, f) => ({
    sends: a.sends + f.sends, opens: a.opens + f.opens, clicks: a.clicks + f.clicks,
    revenue: Math.round((a.revenue + f.revenue) * 100) / 100, orders: a.orders + f.orders,
  }), { sends: 0, opens: 0, clicks: 0, revenue: 0, orders: 0 });

  const subs = subRows || [];
  const subscriber_count = subs.filter((x) => !x.unsubscribed_at).length;

  return {
    flows, totals,
    series: Object.values(daily).sort((a, b) => a.date.localeCompare(b.date)),
    campaigns: (campaigns || []).map((c) => ({ id: c.id, subject: c.subject, segment: c.segment, sent_count: c.sent_count, total: c.total, created_at: c.created_at })),
    subscriber_count, subscriber_total: subs.length,
    generated_at: new Date().toISOString(),
  };
}

async function recipientsFor(segment) {
  if (segment === 'customers') {
    const rows = await sbGet('orders?status=in.(paid,dispatched)&select=customer_email&limit=100000');
    const unsub = await sbGet('subscribers?unsubscribed_at=not.is.null&select=email&limit=100000');
    const blocked = new Set((unsub || []).map((x) => (x.email || '').toLowerCase()));
    return Array.from(new Set((rows || []).map((x) => (x.customer_email || '').toLowerCase().trim()).filter(Boolean))).filter((e) => !blocked.has(e));
  }
  const rows = await sbGet('subscribers?unsubscribed_at=is.null&select=email&limit=100000');
  return Array.from(new Set((rows || []).map((x) => (x.email || '').toLowerCase().trim()).filter(Boolean)));
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    const view = (req.query && req.query.view) || 'overview';
    try {
      if (view === 'subscribers') {
        const rows = await sbGet('subscribers?select=email,source,created_at,unsubscribed_at,welcome_stage&order=created_at.desc&limit=500');
        return res.status(200).json({ subscribers: rows || [] });
      }
      return res.status(200).json(await buildOverview());
    } catch (e) {
      console.error('[admin/marketing GET]', e.message);
      return res.status(500).json({ error: 'Failed to load marketing data' });
    }
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    if (b.action !== 'campaign') return res.status(400).json({ error: 'Unknown action' });
    if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'Email service not configured' });
    const subject = String(b.subject || '').trim();
    const message = String(b.body || '').trim();
    const segment = b.segment === 'customers' ? 'customers' : 'all';
    if (!subject || !message) return res.status(400).json({ error: 'Subject and message are required' });

    // Test send: render the real campaign email but deliver only to the admin.
    if (b.test) {
      // support@veloxpeps.com is a send-as alias with no inbox; default to the
      // real mailbox and allow a validated override from the admin UI.
      const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const reqTo = String(b.testTo || '').toLowerCase().trim();
      const TEST_TO = EMAIL_RE.test(reqTo) ? reqTo : (process.env.TEST_EMAIL_TO || 'veloxpeps@gmail.com');
      const unsub = `${SITE}/api/newsletter/unsubscribe?token=${encodeURIComponent(unsubToken(TEST_TO))}`;
      const r = await sendMail({
        to: TEST_TO, subject: '[TEST] ' + subject,
        html: wrapCampaign(bodyToHtml(message), TEST_TO),
        text: message + '\n\n— Velox Peptides (test send)',
        flow: 'test', track: false,
        headers: { 'List-Unsubscribe': `<${unsub}>` },
      }).catch(() => ({ ok: false }));
      return res.status(200).json({ test: true, sent: r && r.ok ? 1 : 0, to: TEST_TO });
    }

    try {
      const emails = await recipientsFor(segment);
      if (!emails.length) return res.status(200).json({ sent: 0, total: 0, message: 'No recipients in that segment.' });

      // Record the campaign first so each send can be tagged with its id.
      const ins = await fetch(`${SUPABASE_URL}/rest/v1/email_campaigns`, {
        method: 'POST', headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ subject, body: message, segment, total: emails.length, sent_count: 0, created_by: 'admin' }),
      });
      const insRows = ins.ok ? await ins.json() : [];
      const campaignId = (Array.isArray(insRows) && insRows[0] && insRows[0].id) || null;

      const bodyHtml = bodyToHtml(message);
      let sent = 0;
      // Send in small concurrent chunks to stay within the function time budget.
      for (let i = 0; i < emails.length; i += 20) {
        const chunk = emails.slice(i, i + 20);
        const results = await Promise.all(chunk.map((email) => {
          const unsub = `${SITE}/api/newsletter/unsubscribe?token=${encodeURIComponent(unsubToken(email))}`;
          return sendMail({
            to: email, subject, html: wrapCampaign(bodyHtml, email),
            text: message + '\n\n— Velox Peptides\nFor research use only. Unsubscribe: ' + unsub,
            flow: 'campaign', campaignId,
            headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
          }).then((r) => r.ok).catch(() => false);
        }));
        sent += results.filter(Boolean).length;
      }

      if (campaignId) {
        await fetch(`${SUPABASE_URL}/rest/v1/email_campaigns?id=eq.${encodeURIComponent(campaignId)}`, {
          method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify({ sent_count: sent }),
        }).catch(() => {});
      }
      return res.status(200).json({ sent, total: emails.length, campaignId });
    } catch (e) {
      console.error('[admin/marketing POST]', e.message);
      return res.status(500).json({ error: 'Campaign send failed' });
    }
  }

  return res.status(405).end();
};
