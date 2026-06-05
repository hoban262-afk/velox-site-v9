/**
 * lib/welcome-emails.js — stages 2 & 3 of the welcome series.
 * (Stage 1, the code + handbook email, lives in api/newsletter/signup.js.)
 *
 * buildWelcomeEmail(stage, sub, links) -> { subject, html, text }
 *   stage 2 (~2 days): why researchers trust Velox — proof + bestsellers.
 *   stage 3 (~4 days): last-chance nudge, reuses their existing welcome code.
 */
const SITE = 'https://veloxpeps.com';

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function wrap(inner, kicker, unsubUrl) {
  return '' +
  '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><style>:root{color-scheme:dark;supported-color-schemes:dark}</style></head>' +
  '<body style="margin:0;padding:0"><div style="margin:0;padding:0;background:#030407;font-family:Arial,Helvetica,sans-serif">' +
  '<table width="100%" cellpadding="0" cellspacing="0" style="background:#030407"><tr><td style="padding:32px 16px">' +
  '<table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#0d1117;border:1px solid rgba(1,211,160,.2);border-radius:12px;overflow:hidden">' +
    '<tr><td style="background:#01D3A0;height:4px;font-size:0;line-height:0">&nbsp;</td></tr>' +
    '<tr><td style="padding:30px 32px 6px"><div style="font-size:20px;font-weight:800;color:#fff;letter-spacing:.04em">VELOX PEPTIDES</div>' +
      '<div style="font-size:11px;color:#01D3A0;letter-spacing:.14em;text-transform:uppercase;margin-top:4px">' + esc(kicker) + '</div></td></tr>' +
    '<tr><td style="padding:14px 32px 8px">' + inner + '</td></tr>' +
    '<tr><td style="border-top:1px solid #1a1a1a;padding:18px 32px">' +
      '<p style="font-size:11px;color:#6B7280;line-height:1.6;margin:0">Velox Peptides &middot; CRP Labs Ltd, Northern Ireland (NI738125). For research use only. Not for human or veterinary consumption. ' +
      'You receive this because you subscribed at veloxpeps.com. <a href="' + unsubUrl + '" style="color:#6B7280;text-decoration:underline">Unsubscribe</a>.</p></td></tr>' +
  '</table></td></tr></table></div></body></html>';
}

function btn(href, label) {
  return '<a href="' + href + '" style="display:inline-block;background:#01D3A0;color:#021;text-decoration:none;font-weight:700;font-size:14px;padding:13px 28px;border-radius:8px">' + esc(label) + '</a>';
}

function stage2(links) {
  const inner =
    '<h1 style="font-size:22px;color:#fff;margin:0 0 12px">Why researchers choose Velox</h1>' +
    '<p style="font-size:14px;color:#9CA3AF;line-height:1.65;margin:0 0 16px">The research-peptide market is full of unverified product. We built Velox to be the opposite — every batch is independently HPLC-tested with a batch-specific Certificate of Analysis you can actually read.</p>' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px">' +
      '<tr><td style="padding:10px 0;border-bottom:1px solid #1a1a1a;font-size:13px;color:#e5e7eb">&#10003;&nbsp; <strong style="color:#fff">HPLC-verified</strong> by a third-party lab, every batch</td></tr>' +
      '<tr><td style="padding:10px 0;border-bottom:1px solid #1a1a1a;font-size:13px;color:#e5e7eb">&#10003;&nbsp; <strong style="color:#fff">CoA supplied</strong> &mdash; purity &amp; mass-spec on file</td></tr>' +
      '<tr><td style="padding:10px 0;border-bottom:1px solid #1a1a1a;font-size:13px;color:#e5e7eb">&#10003;&nbsp; <strong style="color:#fff">UK dispatch</strong> &mdash; Royal Mail Tracked 24 from Northern Ireland</td></tr>' +
      '<tr><td style="padding:10px 0;font-size:13px;color:#e5e7eb">&#10003;&nbsp; <strong style="color:#fff">Pay by Bank</strong> &mdash; card details never stored</td></tr>' +
    '</table>' +
    '<p style="font-size:14px;color:#9CA3AF;line-height:1.65;margin:0 0 18px">Your 10% welcome code is still valid. Browse what other researchers order most:</p>' +
    '<div style="margin:0 0 8px">' + btn(SITE + '/compounds/', 'Shop the catalogue') + '</div>' +
    '<p style="font-size:13px;color:#6B7280;margin:14px 0 0"><a href="' + SITE + '/about/coa-library/" style="color:#01D3A0;text-decoration:none">View our CoA library &rarr;</a></p>';
  return {
    subject: 'Why researchers choose Velox (your 10% code is still live)',
    html: wrap(inner, 'Research Community', links.unsubscribeUrl),
    text: 'Why researchers choose Velox\n\nEvery batch is independently HPLC-tested with a batch-specific Certificate of Analysis. HPLC-verified, CoA supplied, UK dispatch via Royal Mail Tracked 24, Pay by Bank.\n\nYour 10% welcome code is still valid.\nShop: ' + SITE + '/compounds/\nCoA library: ' + SITE + '/about/coa-library/\n\nFor research use only. Unsubscribe: ' + links.unsubscribeUrl,
  };
}

function stage3(links) {
  const hasCode = !!links.discountCode;
  const codeBlock = hasCode
    ? '<div style="background:#030407;border:1px solid rgba(1,211,160,.35);border-radius:10px;padding:20px;text-align:center;margin:0 0 18px">' +
        '<div style="font-size:11px;color:#6B7280;letter-spacing:.12em;text-transform:uppercase;margin-bottom:8px">YOUR 10% CODE</div>' +
        '<div style="font-family:\'Courier New\',monospace;font-size:28px;font-weight:700;color:#01D3A0;letter-spacing:.08em">' + esc(links.discountCode) + '</div>' +
      '</div>'
    : '';
  const inner =
    '<h1 style="font-size:22px;color:#fff;margin:0 0 12px">' + (hasCode ? 'Your welcome code is about to expire' : 'A quick nudge before you go') + '</h1>' +
    '<p style="font-size:14px;color:#9CA3AF;line-height:1.65;margin:0 0 18px">' +
      (hasCode
        ? 'You joined the Velox research community but haven&rsquo;t placed your first order yet. Your 10% code won&rsquo;t last forever &mdash; here it is one more time.'
        : 'You joined the Velox research community but haven&rsquo;t placed your first order yet. Whenever you&rsquo;re ready, every batch ships HPLC-verified with a CoA.') +
    '</p>' +
    codeBlock +
    '<div style="margin:0 0 8px">' + btn(SITE + '/compounds/', hasCode ? 'Use my code' : 'Browse the catalogue') + '</div>';
  return {
    subject: hasCode ? 'Last chance: your 10% Velox code' : 'Still researching? Here’s where to start',
    html: wrap(inner, 'Research Community', links.unsubscribeUrl),
    text: (hasCode ? 'Your welcome code is about to expire.\n\nCode: ' + links.discountCode + '\n\n' : 'A quick nudge before you go.\n\n') +
          'Shop: ' + SITE + '/compounds/\n\nFor research use only. Unsubscribe: ' + links.unsubscribeUrl,
  };
}

function buildWelcomeEmail(stage, sub, links) {
  if (stage === 2) return stage2(links);
  if (stage === 3) return stage3(links);
  throw new Error('Unknown welcome stage ' + stage);
}

// Days after signup each stage is due.
const WELCOME_STAGES = { 2: 2, 3: 4 };

module.exports = { buildWelcomeEmail, WELCOME_STAGES };
