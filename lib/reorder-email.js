/**
 * lib/reorder-email.js
 *
 * Builds the Velox Peptides reorder / replenishment reminder email - sent to
 * past buyers ~4 weeks after dispatch. Same dark house style as the dispatch
 * and recovery emails.
 *
 * COMPLIANCE: research use only. No human/veterinary use, dosing, benefits or
 * health outcomes. The nudge is purely about supply continuity for the
 * customer's research, purity/documentation, and convenience.
 *
 * Exports:
 *   REORDER_WINDOW - { minDays, maxDays } selection window after dispatch
 *   buildReorderEmail(order, links) -> { subject, html }
 */

const LOGO = 'https://veloxpeps.com/assets/images/veloxpeps2.png';

// Only orders dispatched between minDays and maxDays ago are eligible. The
// upper bound stops a first run from emailing the entire back-catalogue.
const REORDER_WINDOW = { minDays: 28, maxDays: 60 };

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

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function money(n) { const v = Number(n); return '£' + (Number.isFinite(v) ? v : 0).toFixed(2); }
function firstName(order) {
  const n = (order.customer_name || '').trim();
  return n ? esc(n.split(/\s+/)[0]) : 'there';
}
function productNames(items) {
  if (!Array.isArray(items) || !items.length) return 'your peptides';
  const names = items.map((it) => it.name || it.title || it.product).filter(Boolean);
  if (!names.length) return 'your peptides';
  if (names.length === 1) return esc(names[0]);
  if (names.length === 2) return esc(names[0]) + ' and ' + esc(names[1]);
  return esc(names[0]) + ', ' + esc(names[1]) + ' and more';
}
function itemRows(items) {
  if (!Array.isArray(items) || !items.length) return '';
  return items.map((it) => {
    const name = esc(it.name || it.title || it.product || 'Item');
    const size = it.size ? ` <span style="color:#888">(${esc(it.size)})</span>` : '';
    const qty  = Number(it.qty || it.quantity || 1) || 1;
    return `<tr>
      <td style="font-size:13px;color:#fff;padding:7px 0;line-height:1.5">${name}${size}
        <span style="color:#888">&times; ${qty}</span></td>
    </tr>`;
  }).join('');
}

function buildReorderEmail(order, links, opts) {
  opts = opts || {};
  const code = opts.code || '';
  const pct = opts.pct || 20;
  const expiresLabel = opts.expiresLabel || '14 days';
  const fn = firstName(order);
  const prod = productNames(order.items);
  const rows = itemRows(order.items);
  const reorderUrl = links.reorderUrl + (code ? (links.reorderUrl.indexOf('?') >= 0 ? '&' : '?') + 'code=' + encodeURIComponent(code) : '');
  const unsubscribeUrl = links.unsubscribeUrl;

  const subject = code ? `Restock ${prod} — ${pct}% off your research reorder` : `Running low on ${prod}? Reorder in a tap`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>Reorder your research peptides</title><style>:root{color-scheme:dark;supported-color-schemes:dark}</style></head>
<body style="${S.body}">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="${S.wrap}">
<tr><td align="center" style="${S.td}">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="${S.card}">

  <tr><td style="${S.bar}">&nbsp;</td></tr>

  <tr><td align="center" style="padding:32px 40px 18px">
    <img src="${LOGO}" alt="Velox Peptides" width="160" style="max-width:160px;height:auto;display:block;border:0">
  </td></tr>

  <tr><td align="center" style="padding:0 40px 12px">
    <table cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="background:rgba(1,211,160,.1);border:1px solid rgba(1,211,160,.25);border-radius:20px;padding:5px 16px">
        <p style="margin:0;font-size:12px;font-weight:700;color:#01D3A0">Time to restock?</p>
      </td>
    </tr></table>
  </td></tr>

  <tr><td align="center" style="padding:0 40px 8px">
    <h1 style="margin:0;font-size:25px;font-weight:700;color:#fff">Running low for your research?</h1>
  </td></tr>

  <tr><td align="center" style="padding:0 40px 22px">
    <p style="margin:0;font-size:15px;color:#888;line-height:1.7">
      Hi ${fn}, your previous order of ${prod} is around the point where research stocks usually run low. ${code ? `As a returning researcher, here's <strong style="color:#01D3A0">${pct}% off</strong> when you restock — code below.` : `I've made it easy to reload your previous order into your basket — one tap and you're at checkout.`}
    </p>
  </td></tr>

  ${rows ? `
  <tr><td style="padding:0 40px 20px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="${S.inner}">
      <tr><td style="padding:10px 18px;border-bottom:1px solid #1a1a1a"><span style="${S.lbl}">Your last order</span></td></tr>
      <tr><td style="padding:10px 18px"><table width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr>
    </table>
  </td></tr>` : ''}

  ${code ? `
  <tr><td align="center" style="padding:0 40px 18px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="${S.inner}">
      <tr><td align="center" style="padding:16px 18px">
        <p style="margin:0 0 6px;${S.lbl}">${pct}% off your restock</p>
        <p style="margin:0;font-size:25px;font-weight:800;color:#01D3A0;font-family:monospace;letter-spacing:.08em">${esc(code)}</p>
        <p style="margin:9px 0 0;font-size:12px;color:#888;line-height:1.6">Apply at checkout &middot; expires in ${esc(expiresLabel)} &middot; one use, this account only</p>
      </td></tr>
    </table>
  </td></tr>` : ''}

  <tr><td align="center" style="padding:4px 40px 22px">
    <table cellpadding="0" cellspacing="0" border="0"><tr>
      <td align="center" bgcolor="#01D3A0" style="background:#01D3A0;border-radius:4px">
        <a href="${esc(reorderUrl)}" style="display:inline-block;padding:15px 38px;font-size:15px;font-weight:700;color:#030407;text-decoration:none;letter-spacing:.06em;font-family:Arial,Helvetica,sans-serif">
          REORDER THESE &rarr;
        </a>
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:0 40px 20px">
    <p style="margin:0;font-size:13px;color:#888;line-height:1.7">
      Current catalogue pricing applies at checkout, and a certificate of analysis is available for every batch on request. Need to change anything? Just reply and I'll help.
    </p>
  </td></tr>

  <tr><td style="padding:0 40px"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="${S.divider}">&nbsp;</td></tr></table></td></tr>

  <tr><td align="center" style="padding:18px 40px 8px">
    <p style="margin:0;font-size:12px;color:#666;line-height:1.7">
      For research use only. Not for human or veterinary consumption.<br>
      Velox Peptides is a trading name of CRP Labs Ltd (NI738125).
    </p>
  </td></tr>

  <tr><td align="center" style="padding:0 40px 30px">
    <p style="margin:0;font-size:11px;color:#555;line-height:1.6">
      <a href="${esc(unsubscribeUrl)}" style="color:#555;text-decoration:underline">Unsubscribe</a>
      &nbsp;&middot;&nbsp; <a href="https://veloxpeps.com" style="color:#555;text-decoration:underline">veloxpeps.com</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, html };
}

module.exports = { REORDER_WINDOW, buildReorderEmail };
