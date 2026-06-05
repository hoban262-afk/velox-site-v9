/**
 * lib/recovery-emails.js
 *
 * Builds the Velox Peptides checkout-recovery emails (payment drop-off
 * sequence). Self-contained HTML in the same house style as the dispatch
 * email (api/send-dispatch.js): dark theme, #01D3A0 accent, logo header.
 *
 * COMPLIANCE: products are sold strictly for in-vitro research use only.
 * These emails must never reference human/veterinary use, dosing, benefits,
 * or health outcomes. They lean only on purity, documentation, supply
 * continuity, dispatch speed, payment reassurance, and support — all of
 * which are compliant and genuinely useful to a research buyer.
 *
 * Exports:
 *   STAGES                       — timing thresholds in hours per stage
 *   buildRecoveryEmail(stage, order, links) -> { subject, html }
 */

const LOGO = 'https://veloxpeps.com/assets/images/veloxpeps2.png';

// Hours after the pending order was created at which each stage email is due.
// stage 1 at 30 min, stage 2 at 3h, stage 3 at 12h (with a unique 15% code).
// The status=pending guard in the worker means anyone who actually paid is
// already excluded, so the 30-min first touch won't email a paying customer.
const STAGES = { 1: 0.5, 2: 3, 3: 12 };

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

function money(n) {
  const v = Number(n);
  return '£' + (Number.isFinite(v) ? v : 0).toFixed(2);
}

function firstName(order) {
  const n = (order.customer_name || '').trim();
  if (!n) return 'there';
  return esc(n.split(/\s+/)[0]);
}

// Defensive item rendering — item shape varies across the codebase.
function itemRows(items) {
  if (!Array.isArray(items) || !items.length) return '';
  return items.map((it) => {
    const name = esc(it.name || it.title || it.product || it.sku || 'Item');
    const qty  = Number(it.qty || it.quantity || 1) || 1;
    const price = it.price != null ? it.price
                : it.line_total != null ? it.line_total
                : it.total != null ? it.total : null;
    const right = price != null ? money(price) : '';
    return `<tr>
      <td style="font-size:13px;color:#fff;padding:7px 0;line-height:1.5">${name}
        <span style="color:#888">&times; ${qty}</span></td>
      <td align="right" style="font-size:13px;color:#fff;padding:7px 0;white-space:nowrap">${right}</td>
    </tr>`;
  }).join('');
}

// ── Per-stage copy ────────────────────────────────────────────────────────────
// Each stage returns { subject, badge, heading, intro, extra }.
function copyForStage(stage, order, code) {
  const fn = firstName(order);
  switch (stage) {
    case 1:
      return {
        subject: "Your Velox order didn't finish — pick up where you left off",
        badge:   'Payment not completed',
        heading: "Your order didn't quite go through",
        intro:   `Hi ${fn}, it looks like your payment didn't finish &mdash; sometimes the bank approval step gets interrupted on the way back to the site. It happens, and it's an easy fix. Your basket is saved below.`,
        extra:   `<p style="margin:0 0 10px;font-size:13px;color:#888;line-height:1.7">
                    Pay-by-Bank takes about <strong style="color:#fff">30 seconds</strong> &mdash; a direct, secure bank transfer with no card details to enter.
                    Prefer a different method? Just reply to this email and I'll send you an alternative (including crypto).
                  </p>`,
      };
    case 2:
      return {
        subject: "Your basket's still reserved at Velox",
        badge:   'Basket saved',
        heading: 'Still here whenever you need it',
        intro:   `Hi ${fn}, your order is still saved if you'd like to finish it. In case it helps you decide, here's what every Velox order comes with.`,
        extra:   `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:2px 0 4px">
                    <tr><td style="font-size:13px;color:#888;padding:5px 0;line-height:1.6">&#10003;&nbsp; <strong style="color:#fff">&ge;99% purity</strong>, with a certificate of analysis available on request.</td></tr>
                    <tr><td style="font-size:13px;color:#888;padding:5px 0;line-height:1.6">&#10003;&nbsp; <strong style="color:#fff">UK dispatch</strong> &mdash; same or next day, Royal Mail Tracked 24, full tracking emailed.</td></tr>
                    <tr><td style="font-size:13px;color:#888;padding:5px 0;line-height:1.6">&#10003;&nbsp; <strong style="color:#fff">A real person on support</strong> &mdash; reply to this email any time and you'll get me, not a bot.</td></tr>
                  </table>`,
      };
    case 3:
    default: {
      // Stage 3 carries a unique, single-use 15% code generated per email by
      // the worker (api/recovery/run.js) and validated at checkout. The code is
      // bound to this customer's email and expires in 7 days. Incentive lives
      // ONLY on the final email — never on stages 1 or 2 (that trains abandons).
      const codeBlock = code ? `
                  <div style="background:#030407;border:1px solid rgba(1,211,160,.35);border-radius:10px;padding:18px 20px;text-align:center;margin:2px 0 4px">
                    <div style="font-size:11px;color:#6B7280;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px">15% off &mdash; just for you</div>
                    <div style="font-family:'Courier New',monospace;font-size:26px;font-weight:700;color:#01D3A0;letter-spacing:.08em">${esc(code)}</div>
                    <div style="font-size:12px;color:#888;margin-top:10px;line-height:1.6">Apply <strong style="color:#fff">${esc(code)}</strong> at checkout to take 15% off this order. Valid for 7 days &middot; one use &middot; tied to your email.</div>
                  </div>` : '';
      return {
        subject: code ? "Here's 15% off to finish your Velox order" : 'Last reminder — closing your saved basket',
        badge:   code ? '15% off inside' : 'Final reminder',
        heading: code ? 'A little something to finish your order' : 'Before I clear your saved basket',
        intro:   code
          ? `Hi ${fn}, this is the last reminder I'll send about this one. To make it easy, here's <strong style="color:#fff">15% off</strong> your saved basket &mdash; a one-time code, just for you. If now isn't the right time, no problem at all; everything stays available whenever your research needs it.`
          : `Hi ${fn}, this is the last reminder I'll send about this one &mdash; after today I'll clear the saved basket so stock frees up for other researchers. If now isn't the right time, no problem at all; everything stays available to order whenever your project needs it.`,
        extra:   codeBlock,
      };
    }
  }
}

function buildRecoveryEmail(stage, order, links) {
  const c = copyForStage(stage, order, links && links.discountCode);
  const resumeUrl = links.resumeUrl;
  const unsubscribeUrl = links.unsubscribeUrl;
  const rows = itemRows(order.items);
  const total = money(order.total);

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${esc(c.heading)}</title><style>:root{color-scheme:dark;supported-color-schemes:dark}</style></head>
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
        <p style="margin:0;font-size:12px;font-weight:700;color:#01D3A0">${esc(c.badge)}</p>
      </td>
    </tr></table>
  </td></tr>

  <tr><td align="center" style="padding:0 40px 8px">
    <h1 style="margin:0;font-size:25px;font-weight:700;color:#fff">${esc(c.heading)}</h1>
  </td></tr>

  <tr><td align="center" style="padding:0 40px 22px">
    <p style="margin:0;font-size:15px;color:#888;line-height:1.7">${c.intro}</p>
  </td></tr>

  ${rows ? `
  <tr><td style="padding:0 40px 20px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="${S.inner}">
      <tr><td style="padding:10px 18px;border-bottom:1px solid #1a1a1a"><span style="${S.lbl}">Your basket</span></td></tr>
      <tr><td style="padding:10px 18px">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">${rows}
          <tr><td colspan="2" style="border-top:1px solid #1a1a1a;padding-top:0;font-size:0;line-height:0">&nbsp;</td></tr>
          <tr>
            <td style="font-size:13px;color:#888;padding:7px 0">Total</td>
            <td align="right" style="font-size:15px;color:#01D3A0;font-weight:700;padding:7px 0">${total}</td>
          </tr>
        </table>
      </td></tr>
    </table>
  </td></tr>` : ''}

  <tr><td align="center" style="padding:4px 40px 22px">
    <table cellpadding="0" cellspacing="0" border="0"><tr>
      <td align="center" bgcolor="#01D3A0" style="background:#01D3A0;border-radius:4px">
        <a href="${esc(resumeUrl)}" style="display:inline-block;padding:15px 38px;font-size:15px;font-weight:700;color:#030407;text-decoration:none;letter-spacing:.06em;font-family:Arial,Helvetica,sans-serif">
          COMPLETE MY ORDER &rarr;
        </a>
      </td>
    </tr></table>
  </td></tr>

  ${c.extra ? `<tr><td style="padding:0 40px 20px">${c.extra}</td></tr>` : ''}

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

  return { subject: c.subject, html };
}

module.exports = { STAGES, buildRecoveryEmail };
