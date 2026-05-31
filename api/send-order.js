const { Resend } = require('resend');

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
  <p style="margin:0 0 4px;font-size:11px;color:#555">Velox Peptides &mdash; CRP Labs Ltd &mdash; Company no. NI738125</p>
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

/* ── 1. Customer email — instant payment (Fena, PsiFi, or GoCardless) ─────── */
function buildCustomerInstantHtml(d, itemsHtml) {
  const sym          = currencySymbol(d);
  const isEU         = d.region === 'EU';
  const isPsifi      = d.payment_method === 'psifi';
  const isFena       = d.payment_method === 'fena';
  const shippingName = d.shipping_method || (isEU ? 'Royal Mail International Tracked' : 'Royal Mail Tracked 24');
  const deliveryTime = isEU ? '3&ndash;5 working days' : '1&ndash;2 working days';
  const providerName = isFena  ? 'Fena Pay by Bank'
                     : isPsifi ? 'Card / Apple Pay / Google Pay'
                     :           'GoCardless Instant Bank Pay';

  return emailHeader('Order Confirmed') + `
<tr><td align="center" style="padding:0 40px 8px">
  <table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:rgba(1,211,160,.1);border:1px solid rgba(1,211,160,.25);border-radius:20px;padding:5px 14px">
    <p style="margin:0;font-size:12px;font-weight:700;color:#01D3A0">&#10003; Payment confirmed via ${providerName}</p>
  </td></tr></table>
</td></tr>
<tr><td align="center" style="padding:0 40px 8px">
  <h1 style="margin:0;font-size:26px;font-weight:700;color:#fff">Order Confirmed — Thank You</h1>
</td></tr>
<tr><td align="center" style="padding:0 40px 24px">
  <p style="margin:0;font-size:15px;color:#888;line-height:1.6">Hi ${d.customer_name}, your payment has been received via ${providerName}.<br>Your order is confirmed and is now being prepared for dispatch.</p>
</td></tr>
<tr><td style="padding:0 40px"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="${S.divider}">&nbsp;</td></tr></table></td></tr>

<tr><td style="padding:20px 40px">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="${S.inner}">
    <tr><td style="padding:10px 18px;border-bottom:1px solid #1a1a1a"><span style="${S.lbl}">YOUR ORDER &mdash; ${d.order_number}</span></td></tr>
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

/* ── 2. Customer email — manual bank transfer ───────────────────────────────── */
function buildCustomerBankHtml(d, itemsHtml) {
  return emailHeader('Order Reserved — Payment Required') + `
<tr><td align="center" style="padding:0 40px 8px">
  <table cellpadding="0" cellspacing="0" border="0"><tr><td style="background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:20px;padding:5px 14px">
    <p style="margin:0;font-size:12px;font-weight:700;color:#F59E0B">&#8987; Payment not yet received</p>
  </td></tr></table>
</td></tr>
<tr><td align="center" style="padding:0 40px 8px">
  <h1 style="margin:0;font-size:26px;font-weight:700;color:#fff">Order Reserved — Payment Required</h1>
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
    <tr><td style="padding:10px 18px;border-bottom:1px solid #1a1a1a"><span style="${S.lbl}">YOUR ORDER &mdash; ${d.order_number}</span></td></tr>
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
        <p style="margin:2px 0 0;font-size:12px;color:#F59E0B">Action required &mdash; your order will be cancelled without payment.</p>
      </td>
    </tr>
    <tr>
      <td width="30" valign="top" style="padding-top:1px"><span style="${S.step}">3</span></td>
      <td style="padding-bottom:14px">
        <p style="margin:0;font-size:14px;color:#fff;font-weight:600">Payment clears &mdash; dispatched within 24 hours</p>
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
  const isPsifi   = d.payment_method === 'psifi';
  const isFena    = d.payment_method === 'fena';
  const isInstant = d.payment_method === 'instant' || isPsifi || isFena;
  const payBadge = isFena
    ? `<td style="background:#014d39;border:1px solid #01D3A0;border-radius:4px;padding:8px 16px;display:inline-block"><p style="margin:0;font-size:12px;font-weight:700;color:#01D3A0;font-family:monospace;text-transform:uppercase;letter-spacing:.1em">&#10003; Fena Pay by Bank &mdash; PAYMENT CONFIRMED</p></td>`
    : isPsifi
      ? `<td style="background:#014d39;border:1px solid #01D3A0;border-radius:4px;padding:8px 16px;display:inline-block"><p style="margin:0;font-size:12px;font-weight:700;color:#01D3A0;font-family:monospace;text-transform:uppercase;letter-spacing:.1em">&#10003; Card / Apple Pay / Google Pay &mdash; PAYMENT CONFIRMED</p></td>`
      : isInstant
        ? `<td style="background:#014d39;border:1px solid #01D3A0;border-radius:4px;padding:8px 16px;display:inline-block"><p style="margin:0;font-size:12px;font-weight:700;color:#01D3A0;font-family:monospace;text-transform:uppercase;letter-spacing:.1em">&#10003; Instant Payment &mdash; PAYMENT CONFIRMED</p></td>`
        : `<td style="background:#1a0d00;border:1px solid #F59E0B;border-radius:4px;padding:8px 16px;display:inline-block"><p style="margin:0;font-size:12px;font-weight:700;color:#F59E0B;font-family:monospace;text-transform:uppercase;letter-spacing:.1em">&#8987; Bank Transfer &mdash; PAYMENT PENDING</p></td>`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>New Order</title></head>
<body style="${S.body}">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="${S.wrap}"><tr><td align="center" style="${S.td}">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="${S.card}">
<tr><td style="${S.bar}">&nbsp;</td></tr>
<tr><td style="padding:24px 40px 14px">
  <h1 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#fff">New Order &mdash; ${d.order_number}</h1>
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
  <p style="margin:0;font-size:15px;color:#888;line-height:1.6">Hi ${d.customer_name}, great news &mdash; your order <strong style="color:#fff">${d.order_number}</strong> has been dispatched and is heading your way.</p>
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
    <tr><td style="padding:10px 18px;border-bottom:1px solid #1a1a1a"><span style="${S.lbl}">ORDER REFERENCE &mdash; ${d.order_number}</span></td></tr>
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
  <p style="margin:0 0 8px;font-size:12px;color:#888;line-height:1.6">Questions about your order? Reply to this email or contact us at <a href="mailto:veloxpeps@gmail.com" style="color:#01D3A0;text-decoration:none">veloxpeps@gmail.com</a> with your order reference.</p>
</td></tr>

${mhraFooter()}
` + emailFooter();
}

/* ── Shared sendEmails() ────────────────────────────────────────────────────── */
/**
 * Fires the admin notification and the appropriate customer email.
 * Called by both the HTTP handler and the GoCardless webhook.
 *
 * @param {object} d          - Order data payload
 * @param {string} [idempotencyKey] - Optional order reference used as Resend idempotency
 *   key so duplicate calls (redirect + webhook) only send each email once.
 */
async function sendEmails(d, idempotencyKey) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const isInstant = d.payment_method === 'instant' || d.payment_method === 'psifi' || d.payment_method === 'fena';

  // Parse "Product Name size x1 — £XX.XX" or "...— €XX.XX" lines into two-column rows
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

  // Build Resend send-options — idempotency key prevents duplicate emails when both
  // the redirect handler (verify-payment) and the GoCardless webhook fire for the same order.
  // Resend deduplicates within a 24-hour window using these keys.
  const adminOpts    = idempotencyKey ? { idempotencyKey: `${idempotencyKey}-admin`    } : {};
  const customerOpts = idempotencyKey ? { idempotencyKey: `${idempotencyKey}-customer` } : {};

  console.log(`[send-order] Sending admin email for ${d.order_number}${idempotencyKey ? ` (idempotencyKey: ${idempotencyKey}-admin)` : ''}`);
  // Admin notification — always fires
  await resend.emails.send({
    from: 'Velox Peptides <orders@veloxpeps.com>',
    to: 'veloxpeps@gmail.com',
    subject: `New Order ${d.order_number} — ${d.currency === 'EUR' ? '€' : '£'}${d.order_total} — ${isInstant ? 'PAID' : 'PENDING'}`,
    html: buildAdminHtml(d, itemsHtml),
  }, adminOpts);

  // Customer email — different template per payment method
  const customerSubject = isInstant
    ? `Order Confirmed — ${d.order_number} — Velox Peptides`
    : `Order Reserved — Payment Required — ${d.order_number} — Velox Peptides`;

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
    subject: `Dispatched — Order ${d.order_number} — Velox Peptides`,
    html: buildDispatchHtml(d),
  });
}

/* ── HTTP handlers ──────────────────────────────────────────────────────────── */
async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    await sendEmails(req.body);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[send-order] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
}

module.exports = handler;
module.exports.sendEmails  = sendEmails;
module.exports.sendDispatch = sendDispatch;
