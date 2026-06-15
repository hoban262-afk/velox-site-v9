const { Resend } = require('resend');
const { sendWhatsApp } = require('../lib/notify-whatsapp');
const { sendPush } = require('../lib/notify-push');

const LOGO = 'https://veloxpeps.com/assets/images/veloxpeps2.png';

/* ── Shared style tokens ───────────────────────────────────────────────────── */
const S = {
  body:    'margin:0;padding:0;background:#030407;font-family:Arial,Helvetica,sans-serif',
  wrap:    'background:#030407',
  td:      'padding:32px 16px',
  card:    'max-width:600px;width:100%;background:#0d0d0d;border:1px solid #1a1a1a;border-radius:8px;overflow:hidden',
  bar:     'background:#01D3A0;height:4px;font-size:0;line-height:0',
  inner:   'background:#030407;border:1px solid #1a1a1a;border-radius:6px;overflow:hidden',
  lbl:     'font-size:10px;font-weight:700;color:#01D3A0;letter-spacing:.12em;text-transform:uppercase;font-family:monospace',
  divider: 'border-top:1px solid #1a1a1a;font-size:0;line-height:0',
  step:    'display:inline-block;width:22px;height:22px;background:#01D3A0;color:#000;font-size:10px;font-weight:700;text-align:center;line-height:22px;border-radius:50%;flex-shrink:0',
  stepDone:'display:inline-block;width:22px;height:22px;background:#01D3A0;color:#000;font-size:11px;font-weight:700;text-align:center;line-height:22px;border-radius:50%',
};

/* ── Helpers ───────────────────────────────────────────────────────────────── */
function itemRows(itemsHtml) {
  return itemsHtml +
    `<tr><td colspan="2" style="${S.divider};padding-top:14px">&nbsp;</td></tr>`;
}

function currencySymbol(d) {
  return d.currency === 'EUR' ? '&euro;' : '&pound;';
}

function orderTotalsRows(d) {
  const sym = currencySymbol(d);
  const shippingLabel = d.shipping_method || 'Royal Mail Tracked 24';
  return `
    <tr><td style="font-size:13px;color:#888;padding:4px 0">Subtotal</td><td align="right" style="font-size:13px;color:#888;padding:4px 0">${sym}${d.order_subtotal}</td></tr>
    <tr><td style="font-size:13px;color:#888;padding:4px 0">Delivery (${shippingLabel})</td><td align="right" style="font-size:13px;color:#888;padding:4px 0">${parseFloat(d.shipping_cost) === 0 ? 'FREE' : sym + d.shipping_cost}</td></tr>
    ${d.discount_code ? `<tr><td style="font-size:13px;color:#888;padding:4px 0">Discount (${d.discount_code})</td><td align="right" style="font-size:13px;color:#01D3A0;padding:4px 0">&minus;${sym}${d.discount_saving}</td></tr>` : ''}
    <tr><td colspan="2" style="border-top:1px solid #1a1a1a;padding-top:10px;font-size:0;line-height:0">&nbsp;</td></tr>
    <tr><td style="font-size:15px;font-weight:700;color:#fff;padding-top:4px">Total</td><td align="right" style="font-size:18px;font-weight:700;color:#fff;padding-top:4px">${sym}${d.order_total}</td></tr>`;
}

function deliveryBlock(d) {
  const shippingLabel = d.shipping_method || 'Royal Mail Tracked 24';
  return `
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
      <p style="margin:10px 0 0;font-size:12px;color:#888">Shipped via <strong style="color:#fff">${shippingLabel}</strong></p>
    </td></tr>
  </table>
</td></tr>`;
}

function mhraFooter() {
  return `
<tr><td style="padding:0 40px 20px">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1a0f00;border:1px solid #ff9900;border-radius:6px">
    <tr><td style="padding:12px 16px"><p style="margin:0;font-size:12px;color:#ff9900;font-weight:600;line-height:1.6">&#9888; This order is for in vitro research use only. Not for human or veterinary consumption.</p></td></tr>
  </table>
</td></tr>
<tr><td style="padding:0 40px"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="${S.divider}">&nbsp;</td></tr></table></td></tr>
<tr><td align="center" style="padding:18px 40px 28px">
  <p style="margin:0 0 6px;font-size:13px"><a href="https://veloxpeps.com" style="color:#01D3A0;text-decoration:none;font-weight:600">veloxpeps.com</a></p>
  <p style="margin:0 0 4px;font-size:11px;color:#555">Velox Peptides - CRP Labs Ltd - Company no. NI738125</p>
  <p style="margin:0;font-size:11px;color:#555">For in vitro research use only. Not for human or veterinary consumption.</p>
</td></tr>`;
}

function emailHeader(title) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${title}</title><style>:root{color-scheme:dark;supported-color-schemes:dark}</style></head>
<body style="${S.body}">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="${S.wrap}"><tr><td align="center" style="${S.td}">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="${S.card}">
<tr><td style="${S.bar}">&nbsp;</td></tr>
<tr><td align="center" style="padding:32px 40px 20px"><img src="${LOGO}" alt="Velox Peptides" width="160" style="max-width:160px;height:auto;display:block;border:0"></td></tr>`;
}

function emailFooter() {
  return `</table></td></tr></table></body></html>`;
}

/* ── 1. Customer email - instant payment (Fena Pay by Bank) ─────────────── */
function buildCustomerInstantHtml(d, itemsHtml) {
  const sym          = currencySymbol(d);
  const isEU         = d.region === 'EU';
  const shippingName = d.shipping_method || (isEU ? 'Royal Mail International Tracked' : 'Royal Mail Tracked 24');
  const deliveryTime = isEU ? '3&ndash;5 working days' : '1&ndash;2 working days';
  const providerName = 'Fena Pay by Bank';

  return emailHeader('Order Confirmed') + `
<tr><td align="center" style="padding:0 40px 8px">
  <table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:rgba(1,211,160,.1);border:1px solid rgba(1,211,160,.25);border-radius:20px;padding:5px 14px">
    <p style="margin:0;font-size:12px;font-weight:700;color:#01D3A0">&#10003; Payment confirmed via ${providerName}</p>
  </td></tr></table>
</td></tr>
<tr><td align="center" style="padding:0 40px 8px">
  <h1 style="margin:0;font-size:26px;font-weight:700;color:#fff">Order Confirmed - Thank You</h1>
</td></tr>
<tr><td align="center" style="padding:0 40px 24px">
  <p style="margin:0;font-size:15px;color:#888;line-height:1.6">Hi ${d.customer_name}, your payment has been received via ${providerName}.<br>Your order is confirmed and is now being prepared for dispatch.</p>
</td></tr>
<tr><td style="padding:0 40px"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="${S.divider}">&nbsp;</td></tr></table></td></tr>

<tr><td style="padding:20px 40px">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="${S.inner}">
    <tr><td style="padding:10px 18px;border-bottom:1px solid #1a1a1a"><span style="${S.lbl}">YOUR ORDER - ${d.order_number}</span></td></tr>
    <tr><td style="padding:14px 18px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        ${itemRows(itemsHtml)}
        ${orderTotalsRows(d)}
      </table>
    </td></tr>
  </table>
</td></tr>

${deliveryBlock(d)}

<tr><td style="padding:0 40px 20px">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#030f0b;border:1px solid #014d39;border-radius:6px">
    <tr><td style="padding:12px 18px">
      <p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#01D3A0">&#10003; PAYMENT RECEIVED</p>
      <p style="margin:0;font-size:13px;color:#888;line-height:1.6">Your payment of <strong style="color:#fff">${sym}${d.order_total}</strong> has been received and confirmed. No further action is needed from you.</p>
    </td></tr>
  </table>
</td></tr>

<tr><td style="padding:0 40px 24px">
  <p style="margin:0 0 16px;${S.lbl}">WHAT HAPPENS NEXT</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td width="30" valign="top" style="padding-top:1px"><span style="${S.stepDone}">&#10003;</span></td>
      <td style="padding-bottom:14px">
        <p style="margin:0;font-size:14px;color:#fff;font-weight:600">Payment confirmed</p>
        <p style="margin:2px 0 0;font-size:12px;color:#888">Received via ${providerName}.</p>
      </td>
    </tr>
    <tr>
      <td width="30" valign="top" style="padding-top:1px"><span style="${S.step}">2</span></td>
      <td style="padding-bottom:14px">
        <p style="margin:0;font-size:14px;color:#fff;font-weight:600">Order being prepared</p>
        <p style="margin:2px 0 0;font-size:12px;color:#888">We&rsquo;re picking and packing your order now.</p>
      </td>
    </tr>
    <tr>
      <td width="30" valign="top" style="padding-top:1px"><span style="${S.step}">3</span></td>
      <td style="padding-bottom:14px">
        <p style="margin:0;font-size:14px;color:#fff;font-weight:600">Dispatched within 24 hours</p>
        <p style="margin:2px 0 0;font-size:12px;color:#888">Sent via ${shippingName}. You&rsquo;ll receive a dispatch email with your tracking number.</p>
      </td>
    </tr>
    <tr>
      <td width="30" valign="top" style="padding-top:1px"><span style="${S.step}">4</span></td>
      <td>
        <p style="margin:0;font-size:14px;color:#fff;font-weight:600">Delivered in ${deliveryTime}</p>
        <p style="margin:2px 0 0;font-size:12px;color:#888">${shippingName} to your delivery address.</p>
      </td>
    </tr>
  </table>
</td></tr>

${mhraFooter()}
` + emailFooter();
}

/* ── 2. Customer email - manual bank transfer ───────────────────────────────── */
function buildCustomerBankHtml(d, itemsHtml) {
  return emailHeader('Order Reserved - Payment Required') + `
<tr><td align="center" style="padding:0 40px 8px">
  <table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:20px;padding:5px 14px">
    <p style="margin:0;font-size:12px;font-weight:700;color:#F59E0B">&#8987; Payment not yet received</p>
  </td></tr></table>
</td></tr>
<tr><td align="center" style="padding:0 40px 8px">
  <h1 style="margin:0;font-size:26px;font-weight:700;color:#fff">Order Reserved - Payment Required</h1>
</td></tr>
<tr><td align="center" style="padding:0 40px 24px">
  <p style="margin:0;font-size:15px;color:#888;line-height:1.6">Hi ${d.customer_name}, your order is reserved but <strong style="color:#fff">this is not a payment confirmation</strong>.<br>Please transfer the amount below to secure your order.</p>
</td></tr>

<tr><td style="padding:0 40px 20px">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#1a0d00;border:2px solid #F59E0B;border-radius:6px">
    <tr><td style="padding:12px 18px">
      <p style="margin:0 0 2px;font-size:11px;font-weight:700;color:#F59E0B;text-transform:uppercase;letter-spacing:.1em;font-family:monospace">&#9888; Action required</p>
      <p style="margin:0;font-size:13px;color:#FCD34D;line-height:1.6;font-weight:600">Your order will be cancelled if payment is not received within 24 hours.</p>
    </td></tr>
  </table>
</td></tr>
<tr><td style="padding:0 40px"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="${S.divider}">&nbsp;</td></tr></table></td></tr>

<tr><td style="padding:20px 40px">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="${S.inner}">
    <tr><td style="padding:10px 18px;border-bottom:1px solid #1a1a1a"><span style="${S.lbl}">TRANSFER TO THIS ACCOUNT</span></td></tr>
    <tr><td style="padding:14px 18px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="font-size:12px;color:#888;padding:5px 0;width:40%">Account name</td><td style="font-size:13px;color:#fff;padding:5px 0;font-weight:600">CRP Labs Ltd</td></tr>
        <tr><td style="font-size:12px;color:#888;padding:5px 0">Bank</td><td style="font-size:13px;color:#fff;padding:5px 0;font-weight:600">Zempler Bank</td></tr>
        <tr><td style="font-size:12px;color:#888;padding:5px 0">Sort code</td><td style="font-size:15px;color:#01D3A0;padding:5px 0;font-weight:700;font-family:monospace;letter-spacing:.08em">08-71-99</td></tr>
        <tr><td style="font-size:12px;color:#888;padding:5px 0">Account number</td><td style="font-size:15px;color:#01D3A0;padding:5px 0;font-weight:700;font-family:monospace;letter-spacing:.08em">14617029</td></tr>
        <tr><td colspan="2" style="border-top:1px solid #1a1a1a;padding-top:10px;font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td style="font-size:12px;color:#888;padding:5px 0">Amount to transfer</td><td style="font-size:18px;color:#fff;padding:5px 0;font-weight:700">${currencySymbol(d)}${d.order_total}</td></tr>
        <tr><td style="font-size:12px;color:#888;padding:5px 0">Payment reference</td><td style="font-size:14px;color:#01D3A0;padding:5px 0;font-weight:700;font-family:monospace">${d.order_number}</td></tr>
      </table>
      <p style="margin:14px 0 0;font-size:12px;color:#888;line-height:1.6"><strong style="color:#fff">Important:</strong> Use your order reference exactly as shown so we can match your payment. Faster Payments typically clear within 1&ndash;2 hours.</p>
    </td></tr>
  </table>
</td></tr>

<tr><td style="padding:0 40px 20px">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="${S.inner}">
    <tr><td style="padding:10px 18px;border-bottom:1px solid #1a1a1a"><span style="${S.lbl}">YOUR ORDER - ${d.order_number}</span></td></tr>
    <tr><td style="padding:14px 18px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        ${itemRows(itemsHtml)}
        ${orderTotalsRows(d)}
      </table>
    </td></tr>
  </table>
</td></tr>

${deliveryBlock(d)}

<tr><td style="padding:0 40px 24px">
  <p style="margin:0 0 16px;${S.lbl}">WHAT HAPPENS NEXT</p>
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td width="30" valign="top" style="padding-top:1px"><span style="${S.stepDone}">&#10003;</span></td>
      <td style="padding-bottom:14px">
        <p style="margin:0;font-size:14px;color:#fff;font-weight:600">Order reserved</p>
        <p style="margin:2px 0 0;font-size:12px;color:#888">Your order is held for 24 hours awaiting payment.</p>
      </td>
    </tr>
    <tr>
      <td width="30" valign="top" style="padding-top:1px"><span style="display:inline-block;width:22px;height:22px;background:#F59E0B;color:#000;font-size:10px;font-weight:700;text-align:center;line-height:22px;border-radius:50%">2</span></td>
      <td style="padding-bottom:14px">
        <p style="margin:0;font-size:14px;color:#fff;font-weight:600">You transfer ${currencySymbol(d)}${d.order_total} using reference <span style="color:#01D3A0;font-family:monospace">${d.order_number}</span></p>
        <p style="margin:2px 0 0;font-size:12px;color:#F59E0B">Action required - your order will be cancelled without payment.</p>
      </td>
    </tr>
    <tr>
      <td width="30" valign="top" style="padding-top:1px"><span style="${S.step}">3</span></td>
      <td style="padding-bottom:14px">
        <p style="margin:0;font-size:14px;color:#fff;font-weight:600">Payment clears - dispatched within 24 hours</p>
        <p style="margin:2px 0 0;font-size:12px;color:#888">Sent via Royal Mail Tracked 24. You&rsquo;ll receive a dispatch email with your tracking number.</p>
      </td>
    </tr>
    <tr>
      <td width="30" valign="top" style="padding-top:1px"><span style="${S.step}">4</span></td>
      <td>
        <p style="margin:0;font-size:14px;color:#fff;font-weight:600">Delivered in 1&ndash;2 working days</p>
        <p style="margin:2px 0 0;font-size:12px;color:#888">Royal Mail Tracked 24 to your delivery address.</p>
      </td>
    </tr>
  </table>
</td></tr>

${mhraFooter()}
` + emailFooter();
}

/* ── 3. Admin notification email ────────────────────────────────────────────── */
function buildAdminHtml(d, itemsHtml) {
  const isFena    = d.payment_method === 'fena';
  const isInstant = d.payment_method === 'instant' || isFena;
  const payBadge = isFena
    ? `<td style="background:#014d39;border:1px solid #01D3A0;border-radius:4px;padding:8px 16px;display:inline-block"><p style="margin:0;font-size:12px;font-weight:700;color:#01D3A0;font-family:monospace;text-transform:uppercase;letter-spacing:.1em">&#10003; Fena Pay by Bank - PAYMENT CONFIRMED</p></td>`
    : isInstant
      ? `<td style="background:#014d39;border:1px solid #01D3A0;border-radius:4px;padding:8px 16px;display:inline-block"><p style="margin:0;font-size:12px;font-weight:700;color:#01D3A0;font-family:monospace;text-transform:uppercase;letter-spacing:.1em">&#10003; Instant Payment - PAYMENT CONFIRMED</p></td>`
      : `<td style="background:#1a0d00;border:1px solid #F59E0B;border-radius:4px;padding:8px 16px;display:inline-block"><p style="margin:0;font-size:12px;font-weight:700;color:#F59E0B;font-family:monospace;text-transform:uppercase;letter-spacing:.1em">&#8987; Bank Transfer - PAYMENT PENDING</p></td>`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>New Order</title></head>
<body style="${S.body}">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="${S.wrap}"><tr><td align="center" style="${S.td}">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="${S.card}">
<tr><td style="${S.bar}">&nbsp;</td></tr>
<tr><td style="padding:24px 40px 14px">
  <h1 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#fff">New Order - ${d.order_number}</h1>
  <p style="margin:0;font-size:10px;color:#01D3A0;font-family:monospace;letter-spacing:.1em;text-transform:uppercase">Admin Notification</p>
</td></tr>
<tr><td style="padding:0 40px 16px"><table cellpadding="0" cellspacing="0" border="0"><tr>${payBadge}</tr></table></td></tr>
<tr><td style="padding:0 40px 16px">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="${S.inner}">
    <tr><td style="padding:10px 18px;border-bottom:1px solid #1a1a1a"><span style="${S.lbl}">Customer</span></td></tr>
    <tr><td style="padding:12px 18px">
      <p style="margin:0 0 5px;font-size:13px;color:#fff"><span style="color:#888">Name:</span> ${d.customer_name}</p>
      <p style="margin:0 0 5px;font-size:13px;color:#fff"><span style="color:#888">Email:</span> <a href="mailto:${d.customer_email}" style="color:#01D3A0;text-decoration:none">${d.customer_email}</a></p>
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
        <tr><td style="font-size:13px;color:#888;padding:4px 0">Subtotal</td><td align="right" style="font-size:13px;color:#888;padding:4px 0">${currencySymbol(d)}${d.order_subtotal}</td></tr>
        <tr><td style="font-size:13px;color:#888;padding:4px 0">Delivery (${d.shipping_method || 'Royal Mail Tracked 24'})</td><td align="right" style="font-size:13px;color:#888;padding:4px 0">${parseFloat(d.shipping_cost) === 0 ? 'FREE' : currencySymbol(d) + d.shipping_cost}</td></tr>
        ${d.discount_code ? `<tr><td style="font-size:13px;color:#888;padding:4px 0">Discount (${d.discount_code})</td><td align="right" style="font-size:13px;color:#01D3A0;padding:4px 0">&minus;${currencySymbol(d)}${d.discount_saving}</td></tr>` : ''}
        <tr><td colspan="2" style="border-top:1px solid #1a1a1a;padding-top:10px;font-size:0;line-height:0">&nbsp;</td></tr>
        <tr><td style="font-size:15px;font-weight:700;color:#fff;padding-top:4px">Total</td><td align="right" style="font-size:18px;font-weight:700;color:#fff;padding-top:4px">${currencySymbol(d)}${d.order_total}</td></tr>
      </table>
    </td></tr>
  </table>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/* ── 4. Dispatch confirmation email ─────────────────────────────────────────── */
function buildDispatchHtml(d) {
  return emailHeader('Your Order is On Its Way') + `
<tr><td align="center" style="padding:0 40px 8px">
  <table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:rgba(1,211,160,.1);border:1px solid rgba(1,211,160,.25);border-radius:20px;padding:5px 14px">
    <p style="margin:0;font-size:12px;font-weight:700;color:#01D3A0">&#128230; Dispatched via Royal Mail Tracked 24</p>
  </td></tr></table>
</td></tr>
<tr><td align="center" style="padding:0 40px 8px">
  <h1 style="margin:0;font-size:26px;font-weight:700;color:#fff">Your Order is On Its Way!</h1>
</td></tr>
<tr><td align="center" style="padding:0 40px 24px">
  <p style="margin:0;font-size:15px;color:#888;line-height:1.6">Hi ${d.customer_name}, great news - your order <strong style="color:#fff">${d.order_number}</strong> has been dispatched and is heading your way.</p>
</td></tr>
<tr><td style="padding:0 40px"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="${S.divider}">&nbsp;</td></tr></table></td></tr>

<tr><td style="padding:20px 40px">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#030f0b;border:2px solid #01D3A0;border-radius:6px">
    <tr><td style="padding:10px 18px;border-bottom:1px solid #014d39"><span style="${S.lbl}">TRACKING INFORMATION</span></td></tr>
    <tr><td style="padding:14px 18px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="font-size:12px;color:#888;padding:4px 0;width:40%">Carrier</td><td style="font-size:13px;color:#fff;padding:4px 0;font-weight:600">Royal Mail Tracked 24</td></tr>
        <tr><td style="font-size:12px;color:#888;padding:4px 0">Tracking number</td>
          <td style="padding:4px 0">
            ${d.tracking_number
              ? `<a href="https://www.royalmail.com/track-your-item#/tracking-results/${d.tracking_number}" style="font-size:15px;color:#01D3A0;font-weight:700;font-family:monospace;letter-spacing:.06em;text-decoration:none">${d.tracking_number}</a>`
              : `<span style="font-size:13px;color:#888">Will be available on the Royal Mail website shortly</span>`}
          </td>
        </tr>
        <tr><td style="font-size:12px;color:#888;padding:4px 0">Estimated delivery</td><td style="font-size:13px;color:#fff;padding:4px 0;font-weight:600">1&ndash;2 working days</td></tr>
      </table>
      ${d.tracking_number ? `<p style="margin:12px 0 0;font-size:12px;color:#888;line-height:1.6">Track your parcel at <a href="https://www.royalmail.com/track-your-item" style="color:#01D3A0">royalmail.com/track-your-item</a> using the number above.</p>` : ''}
    </td></tr>
  </table>
</td></tr>

<tr><td style="padding:0 40px 20px">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="${S.inner}">
    <tr><td style="padding:10px 18px;border-bottom:1px solid #1a1a1a"><span style="${S.lbl}">ORDER REFERENCE - ${d.order_number}</span></td></tr>
    <tr><td style="padding:14px 18px">
      <p style="margin:0 0 4px;font-size:13px;color:#fff;font-weight:600">${d.customer_name}</p>
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

<tr><td style="padding:0 40px 24px">
  <p style="margin:0 0 8px;font-size:12px;color:#888;line-height:1.6">Questions about your order? Reply to this email or contact us at <a href="mailto:support@veloxpeps.com" style="color:#01D3A0;text-decoration:none">support@veloxpeps.com</a> with your order reference.</p>
</td></tr>

${mhraFooter()}
` + emailFooter();
}

/* ── Shared sendEmails() ────────────────────────────────────────────────────── */
/**
 * Fires the admin notification and the appropriate customer email.
 * Called by the HTTP handler and the Fena payment-confirm / webhook paths.
 *
 * @param {object} d          - Order data payload
 * @param {string} [idempotencyKey] - Optional order reference used as Resend idempotency
 *   key so duplicate calls (redirect + webhook) only send each email once.
 */
async function sendEmails(d, idempotencyKey) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const isInstant = d.payment_method === 'instant' || d.payment_method === 'fena';

  // Parse "Product Name size x1 - £XX.XX" or "... - €XX.XX" lines into two-column rows
  const sym = d.currency === 'EUR' ? '&euro;' : '&pound;';
  const itemsHtml = (d.order_items || '')
    .split('\n')
    .filter(l => l.trim())
    .map(l => {
      const m = l.match(/^(.+?)\s+[£€\xA3€](\S+)$/);
      if (m) return `<tr><td style="font-size:13px;color:#fff;padding:4px 0">${m[1].trim()}</td><td align="right" style="font-size:13px;color:#888;padding:4px 0;white-space:nowrap">${sym}${m[2]}</td></tr>`;
      return `<tr><td colspan="2" style="font-size:13px;color:#fff;padding:4px 0">${l}</td></tr>`;
    })
    .join('');

  // Build Resend send-options - idempotency key prevents duplicate emails when both
  // the payment-complete confirm and the Fena webhook fire for the same order.
  // Resend deduplicates within a 24-hour window using these keys.
  const adminOpts    = idempotencyKey ? { idempotencyKey: `${idempotencyKey}-admin`    } : {};
  const customerOpts = idempotencyKey ? { idempotencyKey: `${idempotencyKey}-customer` } : {};

  console.log(`[send-order] Sending admin email for ${d.order_number}${idempotencyKey ? ` (idempotencyKey: ${idempotencyKey}-admin)` : ''}`);
  // Admin notification - always fires. Goes to the monitored order-alert inbox(es).
  // Override via ORDER_ALERT_EMAILS (comma-separated) in the project env.
  const ORDER_ALERTS = (process.env.ORDER_ALERT_EMAILS || 'support@veloxpeps.com')
    .split(',').map((s) => s.trim()).filter(Boolean);
  await resend.emails.send({
    from: 'Velox Peptides <orders@veloxpeps.com>',
    to: ORDER_ALERTS,
    replyTo: 'support@veloxpeps.com',
    subject: `New Order ${d.order_number} - ${d.currency === 'EUR' ? '€' : '£'}${d.order_total} - ${isInstant ? 'PAID' : 'PENDING'}`,
    html: buildAdminHtml(d, itemsHtml),
  }, adminOpts);

  // WhatsApp alert to the team (owner + Luke) - best-effort, never blocks the order.
  try {
    const sym = d.currency === 'EUR' ? '€' : '£';
    const itemsLine = String(d.order_items || '').split('\n').map((x) => x.trim()).filter(Boolean).join('; ').slice(0, 350);
    await sendWhatsApp(
      `🟢 New order ${d.order_number}\n${sym}${d.order_total} · ${isInstant ? 'PAID' : 'PENDING'}\n${d.customer_name || ''}` +
      (itemsLine ? `\n${itemsLine}` : ''));
  } catch (e) { console.error('[send-order] whatsapp failed:', e.message); }

  // Web push to installed admin devices (the "cha-ching") - best-effort.
  try {
    const sym = d.currency === 'EUR' ? '€' : '£';
    await sendPush({
      title: `New order - ${sym}${d.order_total}`,
      body: `${d.order_number} · ${isInstant ? 'PAID' : 'PENDING'} · ${d.customer_name || 'Customer'}`,
      url: '/admin/',
    });
  } catch (e) { console.error('[send-order] push failed:', e.message); }

  // Customer email - different template per payment method
  const customerSubject = isInstant
    ? `Order Confirmed - ${d.order_number} - Velox Peptides`
    : `Order Reserved - Payment Required - ${d.order_number} - Velox Peptides`;

  const customerHtml = isInstant
    ? buildCustomerInstantHtml(d, itemsHtml)
    : buildCustomerBankHtml(d, itemsHtml);

  console.log(`[send-order] Sending customer email for ${d.order_number} → ${d.customer_email}${idempotencyKey ? ` (idempotencyKey: ${idempotencyKey}-customer)` : ''}`);
  await resend.emails.send({
    from: 'Velox Peptides <orders@veloxpeps.com>',
    to: d.customer_email,
    subject: customerSubject,
    html: customerHtml,
  }, customerOpts);

  console.log(`[send-order] Both emails sent for ${d.order_number}`);
}

/* ── sendDispatch() ─────────────────────────────────────────────────────────── */
/**
 * Sends a dispatch confirmation to the customer.
 * d = { order_number, customer_name, customer_email, tracking_number (optional),
 *        addr1, addr2, city, postcode, country }
 */
async function sendDispatch(d) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: 'Velox Peptides <orders@veloxpeps.com>',
    to: d.customer_email,
    subject: `Dispatched - Order ${d.order_number} - Velox Peptides`,
    html: buildDispatchHtml(d),
  });
}

/* ── HTTP handlers ──────────────────────────────────────────────────────────── */

// Auth: internal task secret OR a signed-in admin's Supabase bearer token.
// The /api/send-order HTTP endpoint can fire emails FROM orders@veloxpeps.com - // left open it's a phishing relay. The exported sendEmails() function is still
// called directly (no HTTP) by confirm-fena-payment and fena-webhook, which is fine.
const KNOWN_SEND_ORDER_ADMINS = new Set([
  (process.env.ADMIN_EMAIL || '').toLowerCase(),
  'support@veloxpeps.com',
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
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: ANON || SERVICE || '' },
    });
    if (!r.ok) return false;
    const u = await r.json();
    return !!u && KNOWN_SEND_ORDER_ADMINS.has((u.email || '').toLowerCase());
  } catch { return false; }
}

// Build the sendEmails() payload from a stored order row. Lets internal callers
// (the Fena webhook) trigger the alert with just { order_id } instead of the full
// payload — so a paid-via-webhook order still emails/WhatsApps/pushes the team.
async function buildPayloadFromOrderId(orderId) {
  const SB_URL = process.env.SUPABASE_URL, SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SB_URL || !SB_SERVICE) return null;
  const r = await fetch(`${SB_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=*&limit=1`, {
    headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` },
  });
  if (!r.ok) return null;
  const rows = await r.json().catch(() => null);
  const o = Array.isArray(rows) ? rows[0] : null;
  if (!o) return null;
  const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
  let items = o.items;
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
  if (!Array.isArray(items)) items = [];
  const orderItemsText = items.map((it) => {
    const qty = num(it.qty || it.quantity) || 1;
    const line = num(it.price) * qty;
    return `${it.name || 'Item'}${it.size ? ' ' + it.size : ''} x${qty} - £${line.toFixed(2)}`;
  }).join('\n');
  const subtotal = num(o.subtotal) || num(o.total);
  const total = num(o.total);
  return {
    order_number: o.notes || String(o.id).slice(0, 8).toUpperCase(),
    customer_name: o.customer_name || 'Customer',
    customer_email: o.customer_email || '',
    customer_phone: o.ship_phone || '',
    addr1: o.ship_line1 || '', addr2: o.ship_line2 || '',
    city: o.ship_city || '', postcode: o.ship_postcode || '',
    country: o.ship_country || 'United Kingdom',
    shipping_address: [o.ship_line1, o.ship_line2, o.ship_city, o.ship_postcode, o.ship_country].filter(Boolean).join(', '),
    shipping_method: 'Royal Mail Tracked 24',
    order_items: orderItemsText,
    order_subtotal: subtotal.toFixed(2),
    shipping_cost: Math.max(0, Number((total - subtotal).toFixed(2))).toFixed(2),
    discount_code: '', discount_saving: '0.00',
    order_total: total.toFixed(2),
    currency: 'GBP', region: 'UK', payment_method: 'fena',
  };
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!(await isAuthorized(req))) return res.status(401).json({ error: 'Unauthorized' });
  try {
    let payload = req.body || {};
    let idemKey;
    // Internal callers can pass just { order_id }; build the full payload from DB.
    // idempotencyKey (= order ref) dedupes emails if the browser-return path also fires.
    if (payload.order_id && !payload.order_items) {
      payload = await buildPayloadFromOrderId(payload.order_id);
      if (!payload) return res.status(404).json({ error: 'Order not found' });
      idemKey = payload.order_number;
    }
    await sendEmails(payload, idemKey);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[send-order] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
}

module.exports = handler;
module.exports.sendEmails  = sendEmails;
module.exports.sendDispatch = sendDispatch;
