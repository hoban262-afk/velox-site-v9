/**
 * lib/welcome-emails.js - stages 2 & 3 of the welcome series.
 * (Stage 1, the code + handbook email, lives in api/newsletter/signup.js.)
 * Renders through the shared lib/email-layout shell so it matches every other flow.
 *
 * buildWelcomeEmail(stage, sub, links) -> { subject, html, text }
 */
const { renderEmail, emailParagraph, emailCodeBox } = require('./email-layout');
const SITE = 'https://veloxpeps.com';

function stage2(links) {
  const trust =
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px">' +
    '<tr><td style="padding:9px 0;border-bottom:1px solid #1a1a1a;font-size:13px;color:#e5e7eb">&#10003;&nbsp; <strong style="color:#fff">HPLC-verified</strong> by a third-party lab, every batch</td></tr>' +
    '<tr><td style="padding:9px 0;border-bottom:1px solid #1a1a1a;font-size:13px;color:#e5e7eb">&#10003;&nbsp; <strong style="color:#fff">CoA supplied</strong> - purity &amp; mass-spec on file</td></tr>' +
    '<tr><td style="padding:9px 0;border-bottom:1px solid #1a1a1a;font-size:13px;color:#e5e7eb">&#10003;&nbsp; <strong style="color:#fff">UK dispatch</strong> - Royal Mail Tracked 24 from Northern Ireland</td></tr>' +
    '<tr><td style="padding:9px 0;font-size:13px;color:#e5e7eb">&#10003;&nbsp; <strong style="color:#fff">Pay by Bank</strong> - card details never stored</td></tr>' +
    '</table>';
  const body =
    emailParagraph('The research-peptide market is full of unverified product. We built Velox to be the opposite - every batch is independently HPLC-tested with a batch-specific Certificate of Analysis you can actually read.') +
    trust +
    emailParagraph('Your 10% welcome code is still valid. Browse what other researchers order most:');
  return {
    subject: 'Why researchers choose Velox (your 10% code is still live)',
    html: renderEmail({
      kicker: 'Research Community', heading: 'Why researchers choose Velox', bodyHtml: body,
      cta: { href: SITE + '/compounds/', label: 'SHOP THE CATALOGUE →' },
      footnote: '<a href="' + SITE + '/about/coa-library/" style="color:#01D3A0;text-decoration:none">View our CoA library &rarr;</a>',
      unsubscribeUrl: links.unsubscribeUrl,
      preheader: 'HPLC-verified, CoA supplied, UK dispatch - your 10% code is still valid.',
    }),
    text: 'Why researchers choose Velox\n\nEvery batch is independently HPLC-tested with a batch-specific Certificate of Analysis. HPLC-verified, CoA supplied, UK dispatch via Royal Mail Tracked 24, Pay by Bank.\n\nYour 10% welcome code is still valid.\nShop: ' + SITE + '/compounds/\nCoA library: ' + SITE + '/about/coa-library/\n\nFor research use only. Unsubscribe: ' + links.unsubscribeUrl,
  };
}

function stage3(links) {
  const hasCode = !!links.discountCode;
  const body =
    emailParagraph(hasCode
      ? 'You joined the Velox research community but haven&rsquo;t placed your first order yet. Your 10% code won&rsquo;t last forever - here it is one more time.'
      : 'You joined the Velox research community but haven&rsquo;t placed your first order yet. Whenever you&rsquo;re ready, every batch ships HPLC-verified with a CoA.') +
    (hasCode ? emailCodeBox(links.discountCode, 'Apply at checkout for 10% off your first order.') : '');
  return {
    subject: hasCode ? 'Last chance: your 10% Velox code' : 'Still researching? Here’s where to start',
    html: renderEmail({
      kicker: 'Research Community',
      heading: hasCode ? 'Your welcome code is about to expire' : 'A quick nudge before you go',
      bodyHtml: body,
      cta: { href: SITE + '/compounds/', label: hasCode ? 'USE MY CODE →' : 'BROWSE THE CATALOGUE →' },
      unsubscribeUrl: links.unsubscribeUrl,
      preheader: hasCode ? 'Your 10% welcome code is about to expire.' : 'Whenever you’re ready - HPLC-verified, CoA supplied.',
    }),
    text: (hasCode ? 'Your welcome code is about to expire.\n\nCode: ' + links.discountCode + '\n\n' : 'A quick nudge before you go.\n\n') +
          'Shop: ' + SITE + '/compounds/\n\nFor research use only. Unsubscribe: ' + links.unsubscribeUrl,
  };
}

function buildWelcomeEmail(stage, sub, links) {
  if (stage === 2) return stage2(links);
  if (stage === 3) return stage3(links);
  throw new Error('Unknown welcome stage ' + stage);
}

const WELCOME_STAGES = { 2: 2, 3: 4 };

module.exports = { buildWelcomeEmail, WELCOME_STAGES };
