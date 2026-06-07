/**
 * /api/admin/affiliate-payout — ADMIN ONLY
 *
 *  GET  → { affiliates:[{affiliate_id,name,email,ref_code,payable,count}] } (payable summary)
 *  POST { affiliate_id } → marks that affiliate's PAYABLE commissions as paid:
 *        creates a payout row, links + flips the commissions, notifies + emails them.
 *
 * Uses the service role behind an admin check, so it isn't blocked by affiliate RLS.
 */
const { sendMail } = require('../../lib/mail');
let renderEmail, emailParagraph;
try { ({ renderEmail, emailParagraph } = require('../../lib/email-layout')); } catch (e) { /* optional */ }

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON         = process.env.SUPABASE_ANON_KEY;
const SITE         = process.env.NEXT_PUBLIC_SITE_URL || 'https://veloxpeps.com';

const KNOWN_ADMIN_EMAILS = new Set([
  (process.env.ADMIN_EMAIL || '').toLowerCase(), 'support@veloxpeps.com', 'veloxpeps@gmail.com',
].filter(Boolean));

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

const H = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
const sb = (path, opts = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...opts, headers: { ...H, ...(opts.headers || {}) } });
const money = (n) => '£' + (Math.round(Number(n || 0) * 100) / 100).toFixed(2);

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'Unauthorized' });

  // ── Summary of payable commission per affiliate ─────────────────────────────
  if (req.method === 'GET') {
    try {
      const [cRes, aRes] = await Promise.all([
        sb('commissions?status=eq.payable&select=affiliate_id,amount'),
        sb('affiliates?status=eq.active&select=id,name,email,ref_code'),
      ]);
      const comms = cRes.ok ? await cRes.json() : [];
      const affs  = aRes.ok ? await aRes.json() : [];
      const agg = {};
      comms.forEach((c) => { const a = agg[c.affiliate_id] || (agg[c.affiliate_id] = { payable: 0, count: 0 }); a.payable += Number(c.amount || 0); a.count++; });
      const out = affs.map((a) => ({
        affiliate_id: a.id, name: a.name, email: a.email, ref_code: a.ref_code,
        payable: Math.round((agg[a.id] ? agg[a.id].payable : 0) * 100) / 100,
        count: agg[a.id] ? agg[a.id].count : 0,
      })).sort((x, y) => y.payable - x.payable);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ affiliates: out, generated_at: new Date().toISOString() });
    } catch (e) { return res.status(500).json({ error: 'summary_failed' }); }
  }

  // ── Pay out an affiliate's payable commissions ──────────────────────────────
  if (req.method === 'POST') {
    const affiliateId = (req.body || {}).affiliate_id;
    if (!affiliateId) return res.status(400).json({ error: 'affiliate_id required' });
    try {
      const cr = await sb(`commissions?affiliate_id=eq.${encodeURIComponent(affiliateId)}&status=eq.payable&select=id,amount`);
      const rows = cr.ok ? await cr.json() : [];
      const total = Math.round(rows.reduce((s, c) => s + Number(c.amount || 0), 0) * 100) / 100;
      if (!rows.length || total <= 0) return res.status(200).json({ ok: false, error: 'Nothing payable for this affiliate.' });

      const reference = 'PO-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
      const pr = await sb('payouts', { method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ affiliate_id: affiliateId, amount: total, status: 'paid', paid_at: new Date().toISOString(), reference }) });
      if (!pr.ok) return res.status(502).json({ error: 'payout_insert_failed' });
      const payout = (await pr.json())[0];

      await sb(`commissions?affiliate_id=eq.${encodeURIComponent(affiliateId)}&status=eq.payable`,
        { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'paid', payout_id: payout.id }) });

      await sb('notifications', { method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ affiliate_id: affiliateId, type: 'payout_sent', message: 'Payout of ' + money(total) + ' sent (ref ' + reference + '). Thank you!' }) }).catch(() => {});

      // Best-effort confirmation email.
      try {
        const ar = await sb(`affiliates?id=eq.${encodeURIComponent(affiliateId)}&select=name,email`);
        const aff = ar.ok ? (await ar.json())[0] : null;
        if (aff && aff.email && process.env.RESEND_API_KEY) {
          const html = renderEmail ? renderEmail({
            kicker: 'Affiliate Payout', heading: 'You’ve been paid',
            bodyHtml: emailParagraph('Your Velox affiliate commission of <strong style="color:#fff">' + money(total) + '</strong> has been paid out (reference ' + reference + ') across ' + rows.length + ' order' + (rows.length === 1 ? '' : 's') + '. Thank you for promoting Velox.'),
            cta: { href: SITE + '/affiliate/', label: 'VIEW YOUR DASHBOARD →' },
            preheader: 'Your commission of ' + money(total) + ' has been paid.',
          }) : ('<p>Your Velox affiliate commission of ' + money(total) + ' has been paid (ref ' + reference + ').</p>');
          await sendMail({ to: aff.email, subject: 'Your Velox affiliate payout: ' + money(total), html, flow: 'affiliate-payout' });
        }
      } catch (e) { /* non-fatal */ }

      return res.status(200).json({ ok: true, amount: total, count: rows.length, reference });
    } catch (e) {
      console.error('[affiliate-payout]', e.message);
      return res.status(500).json({ error: 'payout_failed' });
    }
  }

  return res.status(405).end();
};
