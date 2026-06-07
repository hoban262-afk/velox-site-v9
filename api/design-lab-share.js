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

// Cross-sell map (mirrors the in-app bridge)
const MAP = [
  { re: /glp|gip|glucagon|incretin|metabol|appetite|weight|tirzep|retatru|semaglu|obesit|adipos|insulin|lipid/i,
    title: 'Metabolic & GLP-class research', items: [['Retatrutide', '/compounds/retatrutide/'], ['Browse metabolic', '/compounds/metabolic/']] },
  { re: /repair|heal|tendon|ligament|gut|wound|anti-?inflamm|recover|injur|tissue|collagen|angiogen/i,
    title: 'Tissue-repair research', items: [['BPC-157', '/compounds/bpc-157/'], ['TB-500', '/compounds/tb-500/'], ['BPC-157 + TB-500', '/compounds/bpc157-tb500-mix/']] },
  { re: /growth hormone|secretagogue|ghrh|\bigf\b|cjc|ipamor|tesamor|\bhgh\b|mots/i,
    title: 'Growth-hormone research', items: [['CJC-1295', '/compounds/cjc-1295/'], ['Tesamorelin', '/compounds/tesamorelin/'], ['MOTS-c', '/compounds/mots-c/']] },
  { re: /nootrop|cognit|memory|neuroprotect|\bbrain\b|bdnf|focus|anxiet|\bmood\b|synap/i,
    title: 'Cognitive research', items: [['Semax', '/compounds/semax/'], ['Selank', '/compounds/selank/'], ['Dihexa', '/compounds/dihexa/']] },
  { re: /melano|pigment|\btan\b|melanocortin/i,
    title: 'Melanocortin research', items: [['Melanotan II', '/compounds/melanotan-ii/']] },
  { re: /mitochond|antioxidant|cellular|\bnad\b|glutathione|longevit|senescen|copper|ghk|oxidativ/i,
    title: 'Cellular & antioxidant research', items: [['NAD+', '/compounds/nad-plus/'], ['Glutathione', '/compounds/glutathione/'], ['GHK-Cu', '/compounds/ghk-cu/']] },
];
function bridge(hay) {
  for (const m of MAP) if (m.re.test(hay)) return m;
  return { title: 'Our best-selling research compound', items: [['Retatrutide', '/compounds/retatrutide/'], ['Browse all compounds', '/compounds/']] };
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
  const hay = [brief.target_mechanism || '', (brief.desired_properties || []).join(' '), (brief.reference_compounds || []).join(' '), run.target || ''].join(' ');
  const m = bridge(hay);

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
    + `<div class="tgt"><strong style="color:#fff">Research target:</strong> ${esc(mech)}</div>`
    + candHTML
    + `<a class="cta" href="/design-lab/">Design your own novel peptide free →</a>`
    + `<div class="br"><div style="font-family:'DM Mono',monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#01D3A0;margin-bottom:6px">Researching this area?</div>`
    + `<div style="color:#fff;font-weight:600;margin-bottom:4px">${esc(m.title)} — in stock, HPLC-verified</div>`
    + `<div style="color:#8aa0a0;font-size:13px;line-height:1.6;margin-bottom:6px">Designs are novel and made to order. If your research overlaps a known compound, Velox dispatches verified material from the UK in 24h.</div>`
    + m.items.map((it) => `<a href="${it[1]}">${esc(it[0])} →</a>`).join('')
    + `</div>`
    + `<div class="dis">Velox Design Lab outputs are computational sequence predictions for <em>in vitro</em> research use only. They are hypotheses, not validated compounds, and are not a medicinal product, not medical advice, and not for human or veterinary use. See our <a href="/legal/research-use-policy/" style="color:#8aa0a0">Research Use Policy</a>.</div>`;

  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  return res.status(200).send(page({ title, desc, canonical, body }));
};
