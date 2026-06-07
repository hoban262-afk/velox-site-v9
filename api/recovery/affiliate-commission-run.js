/**
 * GET/POST /api/recovery/affiliate-commission-run — emails affiliates when a
 * commission becomes PAYABLE (order dispatched), once each. The in-app
 * notification is created by the DB trigger; this adds the email + a sent flag
 * (commissions.payable_emailed_at) so it never double-sends. Auth matches the
 * other recovery workers.
 */
const { sendMail } = require('../../lib/mail');
let renderEmail, emailParagraph;
try { ({ renderEmail, emailParagraph } = require('../../lib/email-layout')); } catch (e) { /* optional */ }

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE         = process.env.NEXT_PUBLIC_SITE_URL || 'https://veloxpeps.com';
const MAX_PER_RUN  = 60;

function authorised(req) {
  const auth = req.headers['authorization'] || '';
  const internal = req.headers['x-internal-secret'] || '';
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (process.env.INTERNAL_TASK_SECRET && internal === process.env.INTERNAL_TASK_SECRET) return true;
  return false;
}
const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
const sb = (path, opts = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
const money = (n) => '£' + (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Supabase not configured' });
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorised' });
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'Resend not configured' });

  const summary = { scanned: 0, sent: 0, errors: 0 };
  let comms = [];
  try {
    const r = await sb('commissions?status=eq.payable&payable_emailed_at=is.null&select=id,affiliate_id,amount,order_reference&order=updated_at.asc&limit=200');
    comms = r.ok ? await r.json() : [];
  } catch (e) { return res.status(500).json({ error: 'query_failed', detail: e.message }); }

  // Cache affiliate contact lookups within this run.
  const affCache = {};
  async function aff(id) {
    if (affCache[id] !== undefined) return affCache[id];
    try { const r = await sb(`affiliates?id=eq.${encodeURIComponent(id)}&select=name,email`); affCache[id] = (r.ok ? (await r.json())[0] : null) || null; }
    catch { affCache[id] = null; }
    return affCache[id];
  }

  for (const c of comms) {
    if (summary.sent >= MAX_PER_RUN) break;
    summary.scanned++;
    const stamp = () => sb(`commissions?id=eq.${encodeURIComponent(c.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ payable_emailed_at: new Date().toISOString() }) }).catch(() => {});
    const a = await aff(c.affiliate_id);
    if (!a || !a.email) { await stamp(); continue; } // can't email — don't retry forever

    const html = renderEmail ? renderEmail({
      kicker: 'Affiliate Commission', heading: 'Commission confirmed',
      bodyHtml: emailParagraph('Good news — your commission of <strong style="color:#fff">' + money(c.amount) + '</strong> on order ' + (c.order_reference || '') + ' is now <strong style="color:#fff">confirmed</strong> (the order has dispatched). It will be included in your next payout.'),
      cta: { href: SITE + '/affiliate/', label: 'VIEW YOUR DASHBOARD →' },
      preheader: 'Your commission of ' + money(c.amount) + ' is confirmed.',
    }) : ('<p>Your Velox affiliate commission of ' + money(c.amount) + ' on order ' + (c.order_reference || '') + ' is confirmed.</p>');

    const r = await sendMail({ to: a.email, subject: 'Commission confirmed: ' + money(c.amount), html, flow: 'affiliate-commission' });
    if (r.ok) { await stamp(); summary.sent++; } else summary.errors++;
  }

  return res.status(200).json({ ok: true, ...summary, generated_at: new Date().toISOString() });
};
