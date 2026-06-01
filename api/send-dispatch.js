const { Resend } = require('resend');

const LOGO = 'https://veloxpeps.com/assets/images/veloxpeps2.png';

// ── Style tokens (keep inline so the template stays self-contained) ───────────
const S = {
  body:    'margin:0;padding:0;background:#030407;font-family:Arial,Helvetica,sans-serif',
  wrap:    'background:#030407',
  td:      'padding:32px 16px',
  card:    'max-width:600px;width:100%;background:#0d0d0d;border:1px solid #1a1a1a;border-radius:8px;overflow:hidden',
  bar:     'background:#01D3A0;height:4px;font-size:0;line-height:0',
  inner:   'background:#030407;border:1px solid #1a1a1a;border-radius:6px;overflow:hidden',
  lbl:     'font-size:10px;font-weight:700;color:#01D3A0;letter-spacing:.12em;text-transform:uppercase;font-family:monospace',
  divider: 'border-top:1px solid #1a1a1a;font-size:0;line-height:0',
};

// ── Email HTML builder ────────────────────────────────────────────────────────
function buildDispatchHtml(orderNumber, customerName, trackingNumber, address, items, total) {
  const hasTracking = trackingNumber && trackingNumber.trim();
  const trackingUrl = hasTracking
    ? `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(trackingNumber.trim())}`
    : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>Your Order Has Been Dispatched</title>
  <style>:root{color-scheme:dark;supported-color-schemes:dark}</style>
</head>
<body style="${S.body}">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="${S.wrap}">
<tr><td align="center" style="${S.td}">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="${S.card}">

  <!-- Top accent bar -->
  <tr><td style="${S.bar}">&nbsp;</td></tr>

  <!-- Logo -->
  <tr><td align="center" style="padding:32px 40px 20px">
    <img src="${LOGO}" alt="Velox Peptides" width="160" style="max-width:160px;height:auto;display:block;border:0">
  </td></tr>

  <!-- Dispatch badge -->
  <tr><td align="center" style="padding:0 40px 12px">
    <table cellpadding="0" cellspacing="0" border="0">
      <tr><td style="background:rgba(1,211,160,.1);border:1px solid rgba(1,211,160,.25);border-radius:20px;padding:5px 16px">
        <p style="margin:0;font-size:12px;font-weight:700;color:#01D3A0">&#128230; Dispatched via Royal Mail Tracked 24</p>
      </td></tr>
    </table>
  </td></tr>

  <!-- Heading -->
  <tr><td align="center" style="padding:0 40px 8px">
    <h1 style="margin:0;font-size:26px;font-weight:700;color:#fff">Your Order is On Its Way!</h1>
  </td></tr>

  <!-- Sub -->
  <tr><td align="center" style="padding:0 40px 24px">
    <p style="margin:0;font-size:15px;color:#888;line-height:1.6">
      Hi ${esc(customerName)},<br>
      your order <strong style="color:#fff">${esc(orderNumber)}</strong> has been dispatched and is heading your way.
    </p>
  </td></tr>

  <!-- Divider -->
  <tr><td style="padding:0 40px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="${S.divider}">&nbsp;</td></tr>
    </table>
  </td></tr>

  <!-- Tracking box -->
  <tr><td style="padding:20px 40px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#030f0b;border:2px solid #01D3A0;border-radius:6px">
      <tr><td style="padding:10px 18px;border-bottom:1px solid #014d39">
        <span style="${S.lbl}">TRACKING INFORMATION</span>
      </td></tr>
      <tr><td style="padding:14px 18px">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="font-size:12px;color:#888;padding:5px 0;width:40%;vertical-align:top">Carrier</td>
            <td style="font-size:13px;color:#fff;padding:5px 0;font-weight:600">Royal Mail Tracked 24</td>
          </tr>
          <tr>
            <td style="font-size:12px;color:#888;padding:5px 0;vertical-align:top">Tracking number</td>
            <td style="padding:5px 0">
              ${hasTracking
                ? `<a href="${trackingUrl}" style="font-size:15px;color:#01D3A0;font-weight:700;font-family:monospace;letter-spacing:.06em;text-decoration:none">${esc(trackingNumber.trim())}</a>`
                : `<span style="font-size:13px;color:#888">Tracking information will be emailed separately</span>`}
            </td>
          </tr>
          <tr>
            <td style="font-size:12px;color:#888;padding:5px 0">Estimated delivery</td>
            <td style="font-size:13px;color:#fff;padding:5px 0;font-weight:600">1&ndash;2 working days</td>
          </tr>
        </table>
        ${hasTracking ? `<p style="margin:12px 0 0;font-size:12px;color:#888;line-height:1.6">
          Track your parcel at <a href="https://www.royalmail.com/track-your-item" style="color:#01D3A0;text-decoration:none">royalmail.com/track-your-item</a> using the number above.
        </p>` : ''}
      </td></tr>
    </table>
  </td></tr>

  <!-- Track button -->
  ${hasTracking ? `
  <tr><td align="center" style="padding:4px 40px 24px">
    <table cellpadding="0" cellspacing="0" border="0">
      <tr><td align="center" bgcolor="#01D3A0" style="background:#01D3A0;border-radius:4px;mso-padding-alt:0">
        <a href="${trackingUrl}"
           style="display:inline-block;padding:15px 36px;font-size:15px;font-weight:700;color:#030407;text-decoration:none;letter-spacing:.08em;font-family:Arial,Helvetica,sans-serif">
          TRACK YOUR ORDER &rarr;
        </a>
      </td></tr>
    </table>
  </td></tr>` : ''}

  <!-- Delivery address -->
  ${address ? `
  <tr><td style="padding:0 40px 20px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="${S.inner}">
      <tr><td style="padding:10px 18px;border-bottom:1px solid #1a1a1a">
        <span style="${S.lbl}">DELIVERY ADDRESS</span>
      </td></tr>
      <tr><td style="padding:14px 18px">
        <p style="margin:0 0 4px;font-size:13px;color:#fff;font-weight:600">${esc(customerName)}</p>
        <p style="margin:0;font-size:13px;color:#888;line-height:1.7">${esc(address).replace(/,\s*/g, '<br>')}</p>
      </td></tr>
    </table>
  </td></tr>` : ''}

  <!-- Order summary -->
  ${items && items.length ? `
  <tr><td style="padding:0 40px 20px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="${S.inner}">
      <tr><td style="padding:10px 18px;border-bottom:1px solid #1a1a1a">
        <span style="${S.lbl}">ORDER SUMMARY</span>
      </td></tr>
      <tr><td style="padding:14px 18px">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          ${items.map(item => `
          <tr>
            <td style="font-size:13px;color:#ccc;padding:4px 0">${esc(item.name)}</td>
            <td align="right" style="font-size:13px;color:#fff;padding:4px 0;font-weight:600;white-space:nowrap">${esc(String(item.qty))} &times; ${esc(item.price)}</td>
          </tr>`).join('')}
          <tr><td colspan="2" style="border-top:1px solid #1a1a1a;padding-top:10px;margin-top:6px">&nbsp;</td></tr>
          <tr>
            <td style="font-size:13px;color:#888;padding:2px 0;font-weight:700">Total</td>
            <td align="right" style="font-size:15px;color:#01D3A0;font-weight:700;padding:2px 0">${esc(total || '')}</td>
          </tr>
        </table>
      </td></tr>
    </table>
  </td></tr>` : ''}

  <!-- Support note -->
  <tr><td style="padding:0 40px 24px">
    <p style="margin:0;font-size:12px;color:#888;line-height:1.6">
      Questions about your order? Email us at
      <a href="mailto:support@veloxpeps.com?subject=Order%20${encodeURIComponent(orderNumber)}" style="color:#01D3A0;text-decoration:none">support@veloxpeps.com</a>
      with your order reference.
    </p>
  </td></tr>

  <!-- MHRA compliance -->
  <tr><td style="padding:0 40px 20px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1a0f00;border:1px solid #ff9900;border-radius:6px">
      <tr><td style="padding:12px 16px">
        <p style="margin:0;font-size:12px;color:#ff9900;font-weight:600;line-height:1.6">
          &#9888; This order is for in vitro research use only. Not for human or veterinary consumption.
        </p>
      </td></tr>
    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:0 40px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="${S.divider}">&nbsp;</td></tr>
    </table>
  </td></tr>
  <tr><td align="center" style="padding:18px 40px 28px">
    <p style="margin:0 0 6px;font-size:13px">
      <a href="https://veloxpeps.com" style="color:#01D3A0;text-decoration:none;font-weight:600">veloxpeps.com</a>
    </p>
    <p style="margin:0 0 4px;font-size:11px;color:#555">Velox Peptides &mdash; CRP Labs Ltd &mdash; Company no. NI738125</p>
    <p style="margin:0;font-size:11px;color:#555">For in vitro research use only. Not for human or veterinary consumption.</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── HTML entity escaping ──────────────────────────────────────────────────────
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Admin / internal auth ─────────────────────────────────────────────────────
// send-dispatch sends a branded "dispatched" email to an address taken from the
// REQUEST BODY (customerEmail). Left open, that's an email relay an attacker can
// use to send convincing phishing from the veloxpeps.com domain. The only real
// caller is the admin panel (admin.js), so we require either the internal task
// secret OR a signed-in admin's Supabase access token.
const KNOWN_ADMIN_EMAILS = new Set([
  (process.env.ADMIN_EMAIL || '').toLowerCase(),
  'support@veloxpeps.com',
  'veloxpeps@gmail.com',
].filter(Boolean));

async function isAuthorized(req) {
  const INTERNAL_SECRET = process.env.INTERNAL_TASK_SECRET;
  if (INTERNAL_SECRET && (req.headers['x-internal-secret'] || '') === INTERNAL_SECRET) return true;

  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token) return false;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const ANON         = process.env.SUPABASE_ANON_KEY;
  const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL) return false;
  try {
    const ures = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: ANON || SERVICE || '' },
    });
    if (!ures.ok) return false;
    const user = await ures.json();
    return !!user && KNOWN_ADMIN_EMAILS.has((user.email || '').toLowerCase());
  } catch { return false; }
}

// ── Handler ───────────────────────────────────────────────────────────────────
/**
 * POST /api/send-dispatch
 *
 * Auth: internal task secret (x-internal-secret) OR an admin Supabase bearer token.
 * Accepts both camelCase (from Google Sheets) and snake_case variants.
 *
 * Fields:
 *   orderNumber    / order_number    {string}  required
 *   customerEmail  / customer_email  {string}  required
 *   customerName   / customer_name   {string}
 *   trackingNumber / tracking_number {string}  optional
 *   address                          {string}  optional — full address as one string
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  if (!(await isAuthorized(req))) return res.status(401).json({ error: 'Unauthorized' });

  const b = req.body || {};

  // Accept camelCase (Google Sheets) or snake_case (internal) field names
  const orderNumber    = b.orderNumber    || b.order_number    || '';
  const customerEmail  = b.customerEmail  || b.customer_email  || '';
  const customerName   = b.customerName   || b.customer_name   || '';
  const trackingNumber = b.trackingNumber || b.tracking_number || '';
  const address        = b.address        || '';
  const items          = b.items          || [];   // [{name, qty, price}]
  const total          = b.total          || '';

  if (!orderNumber || !customerEmail) {
    return res.status(400).json({ error: 'Missing required fields: orderNumber, customerEmail' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('[send-dispatch] RESEND_API_KEY not configured');
    return res.status(500).json({ error: 'Email service not configured' });
  }

  try {
    const resend = new Resend(apiKey);

    await resend.emails.send({
      from:    'Velox Peptides <orders@veloxpeps.com>',
      to:      customerEmail,
      subject: 'Your Order Has Been Dispatched — Velox Peptides',
      html:    buildDispatchHtml(orderNumber, customerName, trackingNumber, address, items, total),
    });

    console.log(`[send-dispatch] Dispatch email sent for ${orderNumber} to ${customerEmail}`);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[send-dispatch] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
