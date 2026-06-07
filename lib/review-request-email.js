/**
 * lib/review-request-email.js
 *
 * Post-dispatch review request. Sent once, ~10+ days after a dispatched order,
 * asking the customer to leave a review on the product page. Same dark house
 * style as the other Velox emails.
 *
 * COMPLIANCE: research use only. The ask is framed around the research/ordering
 * experience and product quality/service - never human use, dosing, or health
 * outcomes. We do NOT offer an incentive for reviews (keeps reviews authentic
 * and safe for rating-schema use).
 *
 * Exports:
 *   REVIEW_WINDOW - { minDays, maxDays } selection window after order
 *   buildReviewRequestEmail(order, links) -> { subject, html }
 */

const LOGO = 'https://veloxpeps.com/assets/images/veloxpeps2.png';

// Only dispatched orders placed between minDays and maxDays ago are eligible.
const REVIEW_WINDOW = { minDays: 10, maxDays: 40 };

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
function firstName(order) {
  const n = (order.customer_name || '').trim();
  return n ? esc(n.split(/\s+/)[0]) : 'there';
}

// Pick the primary item to review (first with a slug), plus a friendly product label.
function primaryItem(items) {
  if (!Array.isArray(items)) return null;
  for (const it of items) {
    const slug = it.slug || it.sku;
    if (slug) return { slug: String(slug), name: it.name || it.title || it.product || 'your order' };
  }
  return null;
}

function buildReviewRequestEmail(order, links) {
  const fn = firstName(order);
  const item = primaryItem(order.items);
  const name = item ? esc(item.name) : 'your recent order';
  // CTA target: product review section if we have a slug, else the catalogue.
  const reviewUrl = item
    ? `https://veloxpeps.com/compounds/${encodeURIComponent(item.slug)}/#reviews`
    : 'https://veloxpeps.com/compounds/';
  const unsubscribeUrl = links.unsubscribeUrl;

  const subject = `How was your Velox order? A 1-minute review would help`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>Leave a review</title><style>:root{color-scheme:dark;supported-color-schemes:dark}</style></head>
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
        <p style="margin:0;font-size:12px;font-weight:700;color:#01D3A0">Your feedback</p>
      </td>
    </tr></table>
  </td></tr>

  <tr><td align="center" style="padding:0 40px 8px">
    <h1 style="margin:0;font-size:25px;font-weight:700;color:#fff">How was your order?</h1>
  </td></tr>

  <tr><td align="center" style="padding:0 40px 22px">
    <p style="margin:0;font-size:15px;color:#888;line-height:1.7">
      Hi ${fn}, thanks for your recent order with Velox. If you have a minute, a short review of <strong style="color:#fff">${name}</strong> - purity, documentation, dispatch speed, or your experience ordering - would genuinely help other researchers choose with confidence.
    </p>
  </td></tr>

  <tr><td align="center" style="padding:4px 40px 22px">
    <table cellpadding="0" cellspacing="0" border="0"><tr>
      <td align="center" bgcolor="#01D3A0" style="background:#01D3A0;border-radius:4px">
        <a href="${esc(reviewUrl)}" style="display:inline-block;padding:15px 38px;font-size:15px;font-weight:700;color:#030407;text-decoration:none;letter-spacing:.06em;font-family:Arial,Helvetica,sans-serif">
          LEAVE A REVIEW &rarr;
        </a>
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:0 40px 20px">
    <p style="margin:0;font-size:13px;color:#888;line-height:1.7">
      It takes about a minute and no account is needed. Anything we could do better? Just reply to this email - it comes straight to me.
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

module.exports = { REVIEW_WINDOW, buildReviewRequestEmail };
