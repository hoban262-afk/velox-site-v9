/**
 * POST /api/admin/send-test — ADMIN ONLY.
 *
 * Renders a real marketing email template with representative sample data and
 * sends ONE copy to support@veloxpeps.com so you can preview exactly what goes
 * out — without touching any real recipient or marking anything as sent.
 *
 * Body: { type: 'welcome'|'abandoned'|'reorder'|'review'|'restock' }
 */
const { sendMail } = require('../../lib/mail');
const { buildWelcomeEmail }       = require('../../lib/welcome-emails');
const { buildRecoveryEmail }      = require('../../lib/recovery-emails');
const { buildReorderEmail }       = require('../../lib/reorder-email');
const { buildReviewRequestEmail } = require('../../lib/review-request-email');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON         = process.env.SUPABASE_ANON_KEY;
const SITE         = process.env.NEXT_PUBLIC_SITE_URL || 'https://veloxpeps.com';
// support@veloxpeps.com is only a Gmail send-as alias with no inbox, so test
// copies sent there silently disappear. Default to the real monitored mailbox;
// the admin UI can override per send.
const DEFAULT_TEST_TO = process.env.TEST_EMAIL_TO || 'veloxpeps@gmail.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const KNOWN_ADMIN_EMAILS = new Set([
  (process.env.ADMIN_EMAIL || '').toLowerCase(),
  'support@veloxpeps.com', 'veloxpeps@gmail.com',
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

// Representative data so every template renders with real-looking content.
function sample(to) {
  const order = {
    customer_name: 'Test Researcher',
    customer_email: to,
    total: 89.97,
    items: [
      { name: 'Retatrutide', slug: 'retatrutide', size: '10mg', qty: 1, price: 59.99 },
      { name: 'BPC-157',     slug: 'bpc-157',     size: '10mg', qty: 1, price: 29.98 },
    ],
  };
  const links = {
    resumeUrl:      `${SITE}/cart/`,
    reorderUrl:     `${SITE}/cart/`,
    unsubscribeUrl: `${SITE}/api/newsletter/unsubscribe?token=test`,
    discountCode:   'WELCOME10',
  };
  return { order, links };
}

function restockEmail() {
  const link = `${SITE}/compounds/retatrutide/`;
  const html =
    '<div style="margin:0;padding:0;background:#030407;font-family:Arial,Helvetica,sans-serif">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#030407"><tr><td style="padding:32px 16px">' +
    '<table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#0d1117;border:1px solid rgba(1,211,160,.2);border-radius:12px;overflow:hidden">' +
      '<tr><td style="background:#01D3A0;height:4px;font-size:0;line-height:0">&nbsp;</td></tr>' +
      '<tr><td style="padding:30px 32px 8px"><div style="font-size:20px;font-weight:800;color:#fff;letter-spacing:.04em">VELOX PEPTIDES</div>' +
        '<div style="font-size:11px;color:#01D3A0;letter-spacing:.14em;text-transform:uppercase;margin-top:4px">Back in stock</div></td></tr>' +
      '<tr><td style="padding:16px 32px 8px"><h1 style="font-size:22px;color:#fff;margin:0 0 12px">Retatrutide is back in stock</h1>' +
        '<p style="font-size:14px;color:#9CA3AF;line-height:1.65;margin:0 0 16px">A compound you were waiting on is available again — HPLC-verified, batch-tested, dispatched from the UK. Stock can move quickly.</p></td></tr>' +
      `<tr><td style="padding:8px 32px 28px"><a href="${link}" style="display:inline-block;background:#01D3A0;color:#021;text-decoration:none;font-weight:700;font-size:14px;padding:12px 26px;border-radius:8px">View Retatrutide</a></td></tr>` +
      '<tr><td style="border-top:1px solid #1a1a1a;padding:18px 32px"><p style="font-size:11px;color:#6B7280;line-height:1.6;margin:0">Velox Peptides &middot; CRP Labs Ltd, Northern Ireland. For research use only. Not for human or veterinary consumption.</p></td></tr>' +
    '</table></td></tr></table></div>';
  return { subject: 'Back in stock: Retatrutide', html };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'Unauthorized' });
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'Email service not configured' });

  const body = req.body || {};
  const type = String(body.type || '').trim();
  // Abandoned-cart sequence stage: 1 (30 min), 2 (3 h), 3 (12 h, carries 15% code).
  const stage = Math.min(3, Math.max(1, parseInt(body.stage, 10) || 1));
  const reqTo = String(body.to || '').toLowerCase().trim();
  const testTo = EMAIL_RE.test(reqTo) ? reqTo : DEFAULT_TEST_TO;
  const { order, links } = sample(testTo);

  let email;
  try {
    if (type === 'welcome')        email = buildWelcomeEmail(2, { email: testTo }, links);
    else if (type === 'abandoned') {
      // Only stage 3 shows a discount code; stages 1 & 2 must never carry one
      // (an incentive that early just trains customers to abandon).
      const recoveryLinks = Object.assign({}, links, {
        discountCode: stage === 3 ? 'VLX15-TEST7K' : null,
      });
      email = buildRecoveryEmail(stage, order, recoveryLinks);
    }
    else if (type === 'reorder')   email = buildReorderEmail(order, links);
    else if (type === 'review')    email = buildReviewRequestEmail(order, links);
    else if (type === 'restock')   email = restockEmail();
    else return res.status(400).json({ error: 'Unknown test type' });
  } catch (e) {
    console.error('[admin/send-test build]', e.message);
    return res.status(500).json({ error: 'Could not render this template: ' + e.message });
  }

  try {
    const r = await sendMail({
      to: testTo,
      subject: '[TEST] ' + email.subject,
      html: email.html,
      text: email.text,
      flow: 'test',     // excluded from marketing analytics
      track: false,     // don't rewrite links for a preview
    });
    return res.status(200).json({ ok: !!(r && r.ok), to: testTo, type, stage: type === 'abandoned' ? stage : undefined, subject: '[TEST] ' + email.subject });
  } catch (e) {
    console.error('[admin/send-test send]', e.message);
    return res.status(500).json({ error: 'Send failed: ' + e.message });
  }
};
