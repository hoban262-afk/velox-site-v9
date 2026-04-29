const { Resend } = require('resend');

const LOGO = 'https://veloxpeps.com/assets/images/veloxpeps2.png';

/* Shared style tokens — defined once, reused to keep HTML compact */
const S = {
  body:    'margin:0;padding:0;background:#030407;font-family:Arial,Helvetica,sans-serif',
  wrap:    'background:#030407',
  td:      'padding:32px 16px',
  card:    'max-width:600px;width:100%;background:#0d0d0d;border:1px solid #1a1a1a;border-radius:8px;overflow:hidden',
  bar:     'background:#01D3A0;height:4px;font-size:0;line-height:0',
  inner:   'background:#030407;border:1px solid #1a1a1a;border-radius:6px;overflow:hidden',
  lbl:     'font-size:10px;font-weight:700;color:#01D3A0;letter-spacing:.12em;text-transform:uppercase;font-family:monospace',
  divider: 'border-top:1px solid #1a1a1a;font-size:0;line-height:0',
  step:    'display:inline-block;width:22px;height:22px;background:#01D3A0;color:#000;font-size:10px;font-weight:700;text-align:center;line-height:22px;border-radius:50%',
};

function itemRows(itemsHtml) {
  return itemsHtml +
    `<tr><td colspan="2" style="${S.divider};padding-top:14px">&nbsp;</td></tr>`;
}

function buildCustomerHtml(d, itemsHtml) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Order Confirmed</title></head>
<body style="${S.body}">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="${S.wrap}"><tr><td align="center" style="${S.td}">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="${S.card}">
<tr><td style="${S.bar}">&nbsp;</td></tr>
<tr><td align="center" style="padding:32px 40px 20px"><img src="${LOGO}" alt="Velox Peptides" width="160" style="max-width:160px;height:auto;display:block;border:0"></td></tr>
<tr><td align="center" style="padding:0 40px 8px"><h1 style="margin:0;font-size:26px;font-weight:700;color:#fff">Order Confirmed</h1></td></tr>
<tr><td align="center" style="padding:0 40px 24px"><p style="margin:0;font-size:15px;color:#888;line-height:1.6">Thank you for your order, ${d.customer_name}.<br>We&rsquo;ll dispatch within 48 hours of payment.</p></td></tr>
<tr><td style="padding:0 40px"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="${S.divider}">&nbsp;</td></tr></table></td></tr>
<tr><td style="padding:20px 40px">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="${S.inner}">
    <tr><td style="padding:10px 18px;border-bottom:1px solid #1a1a1a"><span style="${S.lbl}">YOUR ORDER &mdash; ${d.order_number}</span></td></tr>
    <tr><td style="padding:14px 18px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        ${itemRows(itemsHtml)}
        <tr><td style="font-size:15px;font-weight:700;color:#fff;padding-top:4px">Total</td><td align="right" style="font-size:18px;font-weight:700;color:#fff;padding-top:4px">&pound;${d.order_total}</td></tr>
      </table>
    </td></tr>
  </table>
</td></tr>
<tr><td style="padding:0 40px 20px">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="${S.inner}">
    <tr><td style="padding:10px 18px;border-bottom:1px solid #1a1a1a"><span style="${S.lbl}">DELIVERY DETAILS</span></td></tr>
    <tr><td style="padding:14px 18px">
      <p style="margin:0 0 4px;font-size:13px;color:#fff;font-weight:600">${d.customer_name}</p>
      ${d.customer_phone ? `<p style="margin:0 0 8px;font-size:13px;color:#888">${d.customer_phone}</p>` : ''}
      <p style="margin:0;font-size:13px;color:#888;line-height:1.7">
        ${d.addr1 || ''}<br>
        ${d.addr2 ? d.addr2 + '<br>' : ''}
        ${d.city || ''}<br>
        ${d.postcode || ''}<br>
        ${d.country || 'United Kingdom'}
      </p>
    </td></tr>
  </table>
</td></tr>
<tr><td style="padding:0 40px 20px">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1a0f00;border:1px solid #ff9900;border-radius:6px">
    <tr><td style="padding:12px 16px"><p style="margin:0;font-size:12px;color:#ff9900;font-weight:600;line-height:1.6">&#9888; This order is for in vitro research use only. Not for human or veterinary consumption.</p></td></tr>
  </table>
</td></tr>
<tr><td style="padding:0 40px 24px">
  <p style="margin:0 0 14px;${S.lbl}">WHAT HAPPENS NEXT</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td width="30" valign="top"><span style="${S.step}">1</span></td><td style="padding-bottom:12px"><p style="margin:0;font-size:14px;color:#fff;font-weight:600">Order received</p><p style="margin:2px 0 0;font-size:12px;color:#888">We&rsquo;ve received your order and it&rsquo;s being prepared.</p></td></tr>
    <tr><td width="30" valign="top"><span style="${S.step}">2</span></td><td style="padding-bottom:12px"><p style="margin:0;font-size:14px;color:#fff;font-weight:600">Dispatched within 48 hrs</p><p style="margin:2px 0 0;font-size:12px;color:#888">Sent via Royal Mail Tracked 48 once payment clears.</p></td></tr>
    <tr><td width="30" valign="top"><span style="${S.step}">3</span></td><td><p style="margin:0;font-size:14px;color:#fff;font-weight:600">Tracking sent when available</p><p style="margin:2px 0 0;font-size:12px;color:#888">You&rsquo;ll receive your Royal Mail tracking number by email.</p></td></tr>
  </table>
</td></tr>
<tr><td style="padding:0 40px"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="${S.divider}">&nbsp;</td></tr></table></td></tr>
<tr><td align="center" style="padding:18px 40px 28px">
  <p style="margin:0 0 6px;font-size:13px"><a href="https://veloxpeps.com" style="color:#01D3A0;text-decoration:none;font-weight:600">veloxpeps.com</a></p>
  <p style="margin:0;font-size:11px;color:#888">For research use only. Not for human consumption.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function buildAdminHtml(d, itemsHtml) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>New Order</title></head>
<body style="${S.body}">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="${S.wrap}"><tr><td align="center" style="${S.td}">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="${S.card}">
<tr><td style="${S.bar}">&nbsp;</td></tr>
<tr><td style="padding:24px 40px 14px">
  <h1 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#fff">New Order &mdash; ${d.order_number}</h1>
  <p style="margin:0;font-size:10px;color:#01D3A0;font-family:monospace;letter-spacing:.1em;text-transform:uppercase">Admin Notification</p>
</td></tr>
<tr><td style="padding:0 40px 16px">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="${S.inner}">
    <tr><td style="padding:10px 18px;border-bottom:1px solid #1a1a1a"><span style="${S.lbl}">Customer</span></td></tr>
    <tr><td style="padding:12px 18px">
      <p style="margin:0 0 5px;font-size:13px;color:#fff"><span style="color:#888">Name:</span> ${d.customer_name}</p>
      <p style="margin:0 0 5px;font-size:13px;color:#fff"><span style="color:#888">Email:</span> ${d.customer_email}</p>
      ${d.customer_phone ? `<p style="margin:0 0 5px;font-size:13px;color:#fff"><span style="color:#888">Phone:</span> ${d.customer_phone}</p>` : ''}
      <p style="margin:0;font-size:13px;color:#fff"><span style="color:#888">Address:</span> ${d.shipping_address || ''}</p>
    </td></tr>
  </table>
</td></tr>
<tr><td style="padding:0 40px 28px">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="${S.inner}">
    <tr><td style="padding:10px 18px;border-bottom:1px solid #1a1a1a"><span style="${S.lbl}">Order Items</span></td></tr>
    <tr><td style="padding:14px 18px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        ${itemRows(itemsHtml)}
        <tr><td style="font-size:15px;font-weight:700;color:#fff;padding-top:4px">Total</td><td align="right" style="font-size:18px;font-weight:700;color:#fff;padding-top:4px">&pound;${d.order_total}</td></tr>
      </table>
    </td></tr>
  </table>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const resend = new Resend(process.env.RESEND_API_KEY);
  const d = req.body;

  // Parse "Product Name £XX.XX" lines into two-column rows
  const itemsHtml = (d.order_items || '')
    .split('\n')
    .filter(l => l.trim())
    .map(l => {
      const m = l.match(/^(.+?)\s+[\xA3](\S+)$/);
      if (m) return `<tr><td style="font-size:13px;color:#fff;padding:4px 0">${m[1].trim()}</td><td align="right" style="font-size:13px;color:#888;padding:4px 0;white-space:nowrap">&pound;${m[2]}</td></tr>`;
      return `<tr><td colspan="2" style="font-size:13px;color:#fff;padding:4px 0">${l}</td></tr>`;
    })
    .join('');

  try {
    await resend.emails.send({
      from: 'Velox Peptides <orders@veloxpeps.com>',
      to: 'veloxpeps@gmail.com',
      subject: `New Order ${d.order_number} — £${d.order_total}`,
      html: buildAdminHtml(d, itemsHtml)
    });

    await resend.emails.send({
      from: 'Velox Peptides <orders@veloxpeps.com>',
      to: d.customer_email,
      subject: `Order Confirmed — ${d.order_number}`,
      html: buildCustomerHtml(d, itemsHtml)
    });

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
