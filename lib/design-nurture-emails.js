/**
 * lib/design-nurture-emails.js — Design Lab → email nurture sequence.
 * Sent by api/recovery/design-nurture-run.js to account-holders who generated a
 * design. Renders through the shared email-layout so it matches every other flow.
 *
 *   NURTURE_STAGES — hours after the run was created, per stage
 *   buildDesignNurtureEmail(stage, run, links) -> { subject, html, text }
 *
 * All copy is in-vitro research-use framing. No medical/dosing/human-use claims.
 */
const { renderEmail, emailParagraph, emailCodeBox } = require('./email-layout');
const SITE = 'https://veloxpeps.com';

const NURTURE_STAGES = { 1: 2, 2: 72 }; // hours: ~2h after design, then +3 days

// ── Compact closest-compound resolver (mirrors the in-app/app-share logic) ────
const CATALOG = {
  retatrutide:{n:'Retatrutide',u:'/compounds/retatrutide/'}, 'bpc-157':{n:'BPC-157',u:'/compounds/bpc-157/'},
  'tb-500':{n:'TB-500',u:'/compounds/tb-500/'}, 'bpc157-tb500-mix':{n:'BPC-157 + TB-500',u:'/compounds/bpc157-tb500-mix/'},
  'ghk-cu':{n:'GHK-Cu',u:'/compounds/ghk-cu/'}, kpv:{n:'KPV',u:'/compounds/kpv/'},
  'cjc-1295':{n:'CJC-1295',u:'/compounds/cjc-1295/'}, tesamorelin:{n:'Tesamorelin',u:'/compounds/tesamorelin/'},
  'mots-c':{n:'MOTS-c',u:'/compounds/mots-c/'}, semax:{n:'Semax',u:'/compounds/semax/'}, selank:{n:'Selank',u:'/compounds/selank/'},
  dihexa:{n:'Dihexa',u:'/compounds/dihexa/'}, dsip:{n:'DSIP',u:'/compounds/dsip/'},
  'melanotan-ii':{n:'Melanotan II',u:'/compounds/melanotan-ii/'}, 'nad-plus':{n:'NAD+',u:'/compounds/nad-plus/'},
  glutathione:{n:'Glutathione',u:'/compounds/glutathione/'},
};
const KNOWN_TO_SLUG = { 'BPC-157':'bpc-157','GHK (copper tripeptide)':'ghk-cu','KPV':'kpv','Semax':'semax','Selank':'selank','MOTS-c':'mots-c','CJC-1295 core':'cjc-1295','TB-500 active fragment':'tb-500','Thymosin Beta-4 core':'tb-500','MT-II core':'melanotan-ii','PT-141 core':'melanotan-ii' };
const ALIASES = [['retatrutide',/retatru|triple agonist|glp-?1[^.]{0,30}g(ip|lucagon)|incretin/i],['tesamorelin',/tesamor/i],['cjc-1295',/cjc-?1295|ghrh|mod ?grf/i],['mots-c',/mots-?c/i],['bpc157-tb500-mix',/bpc[^.]{0,12}tb-?500|tb-?500[^.]{0,12}bpc/i],['bpc-157',/bpc-?157/i],['tb-500',/tb-?500|thymosin beta/i],['ghk-cu',/ghk|copper (tri)?peptide/i],['kpv',/\bkpv\b/i],['semax',/semax/i],['selank',/selank/i],['dihexa',/dihexa/i],['dsip',/\bdsip\b|delta sleep/i],['melanotan-ii',/melanotan|mt-?2\b|mt-?ii|pt-?141|bremelanotide|melanocortin/i],['nad-plus',/\bnad\+?\b/i],['glutathione',/glutathione/i]];
const THEME = [[/glp|gip|glucagon|incretin|metabol|appetite|weight|tirzep|obesit|adipos|insulin|lipid/i,'retatrutide'],[/repair|heal|tendon|ligament|gut|wound|anti-?inflamm|recover|injur|tissue|collagen|angiogen/i,'bpc-157'],[/growth hormone|secretagogue|ghrh|\bigf\b|\bhgh\b/i,'cjc-1295'],[/nootrop|cognit|memory|neuroprotect|\bbrain\b|bdnf|focus|anxiet|\bmood\b|synap/i,'semax'],[/mitochond|antioxidant|cellular|longevit|senescen|oxidativ/i,'nad-plus']];

function closest(run) {
  const brief = run.brief || {}, cands = Array.isArray(run.candidates) ? run.candidates : [];
  let seqBest = null;
  cands.forEach((c) => { const mt = c.novelty && c.novelty.match; if (mt && KNOWN_TO_SLUG[mt.name] && (!seqBest || mt.pct > seqBest.pct)) seqBest = { slug: KNOWN_TO_SLUG[mt.name], pct: mt.pct }; });
  if (seqBest) return CATALOG[seqBest.slug];
  const hay = [brief.target_mechanism || '', (brief.desired_properties || []).join(' '), (brief.reference_compounds || []).join(' '), run.target || ''].join(' ');
  for (const [slug, re] of ALIASES) if (re.test(hay)) return CATALOG[slug];
  for (const [re, slug] of THEME) if (re.test(hay)) return CATALOG[slug];
  return CATALOG.retatrutide;
}

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function runName(run) { const c = Array.isArray(run.candidates) ? run.candidates : []; return run.name || (c[0] && c[0].name) || 'your design'; }
function runUrl(run) { return run.is_shared && run.share_token ? `${SITE}/design-lab/r/${run.share_token}` : `${SITE}/design-lab/app/`; }

function stage1(run, links) {
  const c = closest(run), nm = runName(run);
  const mech = (run.brief && run.brief.target_mechanism) || run.target || 'your research target';
  const body =
    emailParagraph(`Your Velox Design Lab run <strong style="color:#fff">${esc(nm)}</strong> is saved. You described: <em>${esc(String(mech).slice(0, 160))}</em>.`) +
    emailParagraph(`Your designs are novel hypotheses that still have to be synthesised. The closest characterised compound you can study today is <strong style="color:#fff">${esc(c.n)}</strong>: ≥99% HPLC-verified with a batch Certificate of Analysis, dispatched from the UK in 24h. It's the ideal reference to benchmark your design against.`);
  return {
    subject: `Your design "${nm}" is ready, and the closest compound to study`,
    html: renderEmail({
      kicker: 'Velox Design Lab', heading: `Your design is ready`, bodyHtml: body,
      cta: { href: SITE + c.u, label: `RESEARCH ${c.n.toUpperCase()} →` },
      footnote: `<a href="${runUrl(run)}" style="color:#01D3A0;text-decoration:none">View your design &rarr;</a> &nbsp;&middot;&nbsp; <a href="${SITE}/design-lab/app/" style="color:#01D3A0;text-decoration:none">Design another</a>`,
      unsubscribeUrl: links.unsubscribeUrl,
      preheader: `The closest compound to your design: ${c.n}. HPLC-verified, UK dispatch.`,
    }),
    text: `Your Velox Design Lab run "${nm}" is saved.\n\nThe closest characterised compound to study today is ${c.n}: HPLC-verified, CoA supplied, UK dispatch.\nResearch ${c.n}: ${SITE}${c.u}\nView your design: ${runUrl(run)}\n\nFor in vitro research use only. Unsubscribe: ${links.unsubscribeUrl}`,
  };
}

function stage2(run, links) {
  const c = closest(run), nm = runName(run);
  const code = links.firstOrderCode;
  const body =
    emailParagraph(`A few days ago you designed <strong style="color:#fff">${esc(nm)}</strong> in Velox Design Lab. Researchers exploring this area most often order <strong style="color:#fff">${esc(c.n)}</strong> as their known reference. HPLC-verified, with a Certificate of Analysis on every batch.`) +
    (code ? emailCodeBox(code, 'Apply at checkout for 10% off your first order.') : '') +
    emailParagraph('Prefer your exact sequence? You can request a custom-synthesis quote for any candidate from your run.');
  return {
    subject: code ? `${code}: 10% off your first Velox order` : `Still researching? ${c.n} is the closest reference to your design`,
    html: renderEmail({
      kicker: 'Velox Design Lab', heading: `From design to bench`, bodyHtml: body,
      cta: { href: SITE + c.u, label: `RESEARCH ${c.n.toUpperCase()} →` },
      footnote: `<a href="${SITE}/design-lab/app/" style="color:#01D3A0;text-decoration:none">Design another peptide &rarr;</a>`,
      unsubscribeUrl: links.unsubscribeUrl,
      preheader: code ? `Use ${code} for 10% off your first order.` : `${c.n}: the closest reference to your design.`,
    }),
    text: `You designed "${nm}" in Velox Design Lab.\n\nThe closest reference compound is ${c.n}: ${SITE}${c.u}\n${code ? 'First-order code: ' + code + ' (10% off)\n' : ''}\nFor in vitro research use only. Unsubscribe: ${links.unsubscribeUrl}`,
  };
}

function buildDesignNurtureEmail(stage, run, links) {
  if (stage === 1) return stage1(run, links || {});
  if (stage === 2) return stage2(run, links || {});
  throw new Error('Unknown nurture stage ' + stage);
}

module.exports = { buildDesignNurtureEmail, NURTURE_STAGES, closestCompound: closest };
