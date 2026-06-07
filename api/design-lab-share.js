/**
 * /api/design-lab-share?t=SHARE_TOKEN
 * Server-rendered, crawlable HTML page for a PUBLIC (is_shared) Design Lab run.
 * Routed from /design-lab/r/:token via a rewrite in vercel.json.
 *
 * Purpose (per GTM plan §2c): turn every shared run into an indexable page —
 * long-tail SEO + a shareable artefact — that funnels visitors into the tool
 * and the nearest in-stock compound (cross-sell). Research-use framing only.
 */
const SB_URL  = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── Closest-compound bridge (mirrors the in-app /design-lab/app logic) ────────
const CATALOG = {
  'retatrutide': { n: 'Retatrutide', u: '/compounds/retatrutide/', cat: 'metabolic / GLP-class', catU: '/compounds/metabolic/' },
  'bpc-157': { n: 'BPC-157', u: '/compounds/bpc-157/', cat: 'tissue-repair', catU: '/compounds/recovery/' },
  'tb-500': { n: 'TB-500', u: '/compounds/tb-500/', cat: 'tissue-repair', catU: '/compounds/recovery/' },
  'bpc157-tb500-mix': { n: 'BPC-157 + TB-500', u: '/compounds/bpc157-tb500-mix/', cat: 'tissue-repair', catU: '/compounds/recovery/' },
  'ghk-cu': { n: 'GHK-Cu', u: '/compounds/ghk-cu/', cat: 'cellular / antioxidant', catU: '/compounds/antioxidant/' },
  'kpv': { n: 'KPV', u: '/compounds/kpv/', cat: 'anti-inflammatory', catU: '/compounds/recovery/' },
  'cjc-1295': { n: 'CJC-1295', u: '/compounds/cjc-1295/', cat: 'growth-hormone', catU: '/compounds/growth/' },
  'tesamorelin': { n: 'Tesamorelin', u: '/compounds/tesamorelin/', cat: 'growth-hormone', catU: '/compounds/growth/' },
  'mots-c': { n: 'MOTS-c', u: '/compounds/mots-c/', cat: 'mitochondrial', catU: '/compounds/growth/' },
  'semax': { n: 'Semax', u: '/compounds/semax/', cat: 'cognitive', catU: '/compounds/cognitive/' },
  'selank': { n: 'Selank', u: '/compounds/selank/', cat: 'cognitive', catU: '/compounds/cognitive/' },
  'dihexa': { n: 'Dihexa', u: '/compounds/dihexa/', cat: 'cognitive', catU: '/compounds/cognitive/' },
  'dsip': { n: 'DSIP', u: '/compounds/dsip/', cat: 'cognitive / sleep', catU: '/compounds/cognitive/' },
  'melanotan-ii': { n: 'Melanotan II', u: '/compounds/melanotan-ii/', cat: 'melanocortin', catU: '/compounds/' },
  'nad-plus': { n: 'NAD+', u: '/compounds/nad-plus/', cat: 'cellular', catU: '/compounds/antioxidant/' },
  'glutathione': { n: 'Glutathione', u: '/compounds/glutathione/', cat: 'antioxidant', catU: '/compounds/antioxidant/' },
};
const KNOWN_TO_SLUG = { 'BPC-157': 'bpc-157', 'GHK (copper tripeptide)': 'ghk-cu', 'KPV': 'kpv', 'Semax': 'semax', 'Selank': 'selank', 'MOTS-c': 'mots-c', 'CJC-1295 core': 'cjc-1295', 'TB-500 active fragment': 'tb-500', 'Thymosin Beta-4 core': 'tb-500', 'MT-II core': 'melanotan-ii', 'PT-141 core': 'melanotan-ii' };
const ALIASES = [['retatrutide', /retatru|triple agonist|glp-?1[^.]{0,30}g(ip|lucagon)|incretin/i], ['tesamorelin', /tesamor/i], ['cjc-1295', /cjc-?1295|ghrh|mod ?grf/i], ['mots-c', /mots-?c/i], ['bpc157-tb500-mix', /bpc[^.]{0,12}tb-?500|tb-?500[^.]{0,12}bpc/i], ['bpc-157', /bpc-?157/i], ['tb-500', /tb-?500|thymosin beta/i], ['ghk-cu', /ghk|copper (tri)?peptide/i], ['kpv', /\bkpv\b/i], ['semax', /semax/i], ['selank', /selank/i], ['dihexa', /dihexa/i], ['dsip', /\bdsip\b|delta sleep/i], ['melanotan-ii', /melanotan|mt-?2\b|mt-?ii|pt-?141|bremelanotide|melanocortin/i], ['nad-plus', /\bnad\+?\b/i], ['glutathione', /glutathione/i]];
const THEME = [
  [/glp|gip|glucagon|incretin|metabol|appetite|weight|tirzep|obesit|adipos|insulin|lipid/i, 'retatrutide'],
  [/repair|heal|tendon|ligament|gut|wound|anti-?inflamm|recover|injur|tissue|collagen|angiogen/i, 'bpc-157'],
  [/growth hormone|secretagogue|ghrh|\bigf\b|\bhgh\b/i, 'cjc-1295'],
  [/nootrop|cognit|memory|neuroprotect|\bbrain\b|bdnf|focus|anxiet|\bmood\b|synap/i, 'semax'],
  [/mitochond|antioxidant|cellular|longevit|senescen|oxidativ/i, 'nad-plus'],
];
function pickClosest(brief, cands) {
  let seqBest = null;
  (cands || []).forEach((c) => {
    const mt = c.novelty && c.novelty.match;
    if (mt && KNOWN_TO_SLUG[mt.name] && (!seqBest || mt.pct > seqBest.pct)) {
      seqBest = { slug: KNOWN_TO_SLUG[mt.name], pct: mt.pct, knownName: mt.name, mtype: mt.type, candName: c.name || c.id || 'the top candidate', via: 'sequence' };
    }
  });
  if (seqBest) return seqBest;
  const hay = [brief.target_mechanism || '', (brief.desired_properties || []).join(' '), (brief.reference_compounds || []).join(' ')].join(' ');
  for (const [slug, re] of ALIASES) if (re.test(hay)) return { slug, via: 'reference' };
  for (const [re, slug] of THEME) if (re.test(hay)) return { slug, via: 'mechanism' };
  return { slug: 'retatrutide', via: 'fallback' };
}
function closestReason(p) {
  const c = CATALOG[p.slug] || CATALOG['retatrutide'];
  if (p.via === 'sequence') {
    const rel = p.mtype === 'exact' ? 'an exact sequence match to' : p.mtype === 'fragment' ? 'a fragment of' : p.mtype === 'contains' ? 'built around the motif of' : (p.pct + '% sequence-similar to');
    const tail = (p.mtype === 'fragment' || p.mtype === 'contains') ? (' (' + p.pct + '%)') : '';
    return 'This design (<strong style="color:#fff">' + esc(p.candName) + '</strong>) is ' + rel + ' <strong style="color:#fff">' + esc(p.knownName) + '</strong>' + tail + ' — and ' + c.n + ' is the characterised, HPLC-verified compound in that family.';
  }
  if (p.via === 'reference') return 'This brief points straight at <strong style="color:#fff">' + c.n + '</strong> — the closest characterised compound Velox stocks for this kind of research.';
  if (p.via === 'mechanism') return 'This is <strong style="color:#fff">' + c.cat + '</strong> research, and <strong style="color:#fff">' + c.n + '</strong> is the closest characterised compound Velox stocks for it.';
  return '<strong style="color:#fff">' + c.n + '</strong> is Velox’s most-validated, best-selling research compound — a solid known reference point to benchmark a new design against.';
}

function page({ title, desc, canonical, body, noindex }) {
  return `<!DOCTYPE html><html lang="en-GB"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${noindex ? '<meta name="robots" content="noindex,follow">' : '<link rel="canonical" href="' + esc(canonical) + '">'}
<meta property="og:type" content="article"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="https://veloxpeps.com/assets/images/og-default.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/assets/css/core.css">
<style>
 body{background:#030407;color:#e7edf0;font-family:Inter,system-ui,sans-serif;margin:0}
 .w{max-width:780px;margin:0 auto;padding:40px 20px 80px}
 .ey{font-family:'DM Mono',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#01D3A0;margin:0 0 10px}
 h1{font-family:'Barlow Condensed',sans-serif;font-weight:800;text-transform:uppercase;font-size:clamp(30px,5vw,48px);line-height:1.02;margin:0 0 14px;color:#fff}
 .tgt{background:#0a0d12;border:1px solid #1a2230;border-radius:12px;padding:18px 20px;color:#aeb9bd;line-height:1.6;margin:0 0 26px}
 .cand{background:#0a0d12;border:1px solid #1a2230;border-radius:12px;padding:20px;margin:0 0 14px}
 .cand-h{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
 .cn{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:18px;color:#fff}
 .sc{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:30px;color:#01D3A0;line-height:1}
 .seq{font-family:'DM Mono',monospace;font-size:18px;letter-spacing:3px;background:#030407;border:1px solid #1a2230;border-radius:7px;padding:12px 14px;margin:12px 0;color:#fff;word-break:break-all}
 .bd{font-size:11px;font-family:'DM Mono',monospace;padding:3px 9px;border-radius:5px;background:rgba(1,211,160,.1);color:#01D3A0;border:1px solid rgba(1,211,160,.25)}
 .cta{display:block;text-align:center;background:#01D3A0;color:#04140f;font-weight:800;text-decoration:none;padding:15px;border-radius:10px;margin:28px 0}
 .br{background:#0a0d12;border:1px solid #1a2230;border-radius:12px;padding:20px;margin:24px 0}
 .br a{display:inline-block;font-weight:700;font-size:13px;text-decoration:none;padding:9px 15px;border-radius:9px;background:rgba(1,211,160,.1);color:#01D3A0;border:1px solid rgba(1,211,160,.28);margin:6px 8px 0 0}
 .dis{font-size:12px;color:#5a6675;line-height:1.6;margin-top:30px;border-top:1px solid #1a2230;padding-top:18px}
 a.home{color:#8aa0a0;font-size:13px;text-decoration:none}
 .specbtn{display:inline-block;margin:0 0 22px;font-family:'DM Mono',monospace;font-size:12px;letter-spacing:.5px;color:#01D3A0;background:rgba(1,211,160,.08);border:1px solid rgba(1,211,160,.28);border-radius:8px;padding:9px 14px;cursor:pointer}
 @media print{
   body{background:#fff;color:#111}
   .w{max-width:100%;padding:0}
   .ey{color:#0a8f6e}
   h1,.cn,.cand-h .sc{color:#111}
   .tgt,.cand{background:#fff;border:1px solid #ccc;color:#222}
   .seq{background:#f4f4f4;border:1px solid #ddd;color:#111}
   .bd{background:#eef;border:1px solid #bcd;color:#114}
   .cta,.br,.specbtn,a.home{display:none!important}
   .dis{color:#444;border-top:1px solid #ccc}
   p,div{color:#222}
 }
</style></head><body><div class="w">${body}</div></body></html>`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const token = String((req.query && (req.query.t || req.query.token)) || '').trim();
  if (!SB_URL || !SERVICE || !token) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).send(page({ title: 'Run not found · Velox Design Lab', desc: 'This shared design could not be found.', noindex: true,
      body: '<p class="ey">Velox Design Lab</p><h1>Run not found</h1><p class="tgt">This shared design isn\'t available. <a class="home" href="/design-lab/">Design your own →</a></p>' }));
  }

  let run = null;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/design_lab_runs?share_token=eq.${encodeURIComponent(token)}&is_shared=eq.true&select=target,brief,candidates,name,created_at&limit=1`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
    const rows = r.ok ? await r.json() : [];
    run = Array.isArray(rows) ? rows[0] : null;
  } catch (e) { /* fall through to 404 */ }

  if (!run) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).send(page({ title: 'Run not found · Velox Design Lab', desc: 'This shared design could not be found.', noindex: true,
      body: '<p class="ey">Velox Design Lab</p><h1>Run not found</h1><p class="tgt">This shared design isn\'t available or is private. <a class="home" href="/design-lab/">Design your own →</a></p>' }));
  }

  const brief = run.brief || {};
  const cands = Array.isArray(run.candidates) ? run.candidates : [];
  const mech = brief.target_mechanism || run.target || 'a novel research peptide';
  const runName = run.name || (cands[0] && cands[0].name) || 'Novel peptide design';
  const canonical = `https://veloxpeps.com/design-lab/r/${esc(token)}`;
  const title = `${esc(runName)} — AI-designed research peptide | Velox Design Lab`;
  const desc = `An AI-designed research peptide for: ${String(mech).slice(0, 140)}. ${cands.length} scored, novelty-checked candidate sequences. In vitro research use only.`;
  const pick = pickClosest(Object.assign({}, brief, { target_mechanism: brief.target_mechanism || run.target }), cands);
  const pc = CATALOG[pick.slug] || CATALOG['retatrutide'];

  const candHTML = cands.map((c) => {
    const sc = c.scores || {}, nv = c.novelty || {};
    const badge = nv.badge === 'novel' ? '✦ Likely brand-new' : nv.badge === 'known' ? '⚠ Already exists' : (nv.label || 'Partially similar');
    return `<div class="cand"><div class="cand-h"><div class="cn">${esc(c.name || 'Candidate')}</div><div><div class="sc">${esc(sc.comp || 0)}</div></div></div>`
      + `<div style="margin-top:6px"><span class="bd">${esc(badge)}</span></div>`
      + `<div class="seq">${esc(c.sequence || '')}</div>`
      + (c.plain_summary || c.rationale ? `<p style="color:#aeb9bd;font-size:14px;line-height:1.6;margin:0">${esc(c.plain_summary || c.rationale)}</p>` : '')
      + `</div>`;
  }).join('');

  const body = `<p class="ey">Velox Design Lab · Shared design</p>`
    + `<h1>${esc(runName)}</h1>`
    + `<button class="specbtn" onclick="window.print()">⤓ Download spec sheet (PDF)</button>`
    + `<div class="tgt"><strong style="color:#fff">Research target:</strong> ${esc(mech)}</div>`
    + candHTML
    + `<a class="cta" href="/design-lab/">Design your own novel peptide free →</a>`
    + `<div class="br"><div style="font-family:'DM Mono',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#01D3A0;margin-bottom:8px">Closest compound you can order today</div>`
    + `<div style="font-family:'Space Grotesk',sans-serif;font-size:20px;font-weight:700;color:#fff;margin-bottom:8px">${esc(pc.n)}</div>`
    + `<div style="color:#aeb9bd;font-size:14px;line-height:1.65;margin-bottom:10px">${closestReason(pick)}</div>`
    + `<div style="color:#8aa0a0;font-size:13px;line-height:1.65;margin-bottom:14px">Designed sequences are novel hypotheses that still have to be synthesised. ${esc(pc.n)} is real material you can study now — ≥99% HPLC-verified, batch Certificate of Analysis included, dispatched from the UK in 24h.</div>`
    + `<a href="${pc.u}" style="display:inline-block;font-weight:800;font-size:14px;text-decoration:none;padding:12px 20px;border-radius:10px;background:#01D3A0;color:#04140f;margin-right:8px">Research ${esc(pc.n)} →</a>`
    + `<a href="${pc.catU}">Browse related compounds →</a>`
    + `</div>`
    + `<div class="dis">Velox Design Lab outputs are computational sequence predictions for <em>in vitro</em> research use only. They are hypotheses, not validated compounds, and are not a medicinal product, not medical advice, and not for human or veterinary use. See our <a href="/legal/research-use-policy/" style="color:#8aa0a0">Research Use Policy</a>.</div>`;

  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  return res.status(200).send(page({ title, desc, canonical, body }));
};
