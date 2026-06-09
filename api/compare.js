/**
 * GET /api/compare — server-rendered comparison route.
 *
 * Vercel rewrites /tools/compare (and /tools/compare/:slug) to this function so
 * that every comparison URL gets its OWN <title>, meta description, canonical,
 * and Open Graph / Twitter tags, plus a crawlable text summary — none of which a
 * static client-rendered page can provide (social scrapers don't run JS at all).
 *
 * Compounds come from ?ids=a,b  OR the pretty path /tools/compare/a-vs-b/.
 * Canonical is self-referencing on a NORMALISED (sorted, deduped) ?ids URL, so
 * ?ids=tb-500,bpc-157 and ?ids=bpc-157,tb-500 consolidate to one indexable page.
 */
const SITE = 'https://veloxpeps.com';
const OG_IMAGE = `${SITE}/assets/images/og-default.png`;
const MAX = 5;

const DATA = require('../lib/peptide-data.json');
const BY = {};
for (const p of DATA) BY[p.id] = p;
// Bundled via require() — esbuild includes it automatically, so we no longer need
// the vercel.json `functions.includeFiles` entry (whose pattern was failing the build).
const SHELL = require('../lib/compare-shell.js');

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseIds(req) {
  let url;
  try { url = new URL(req.url, SITE); } catch { url = { searchParams: new URLSearchParams() }; }
  let ids = (url.searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.length) {
    const slug = url.searchParams.get('slug') || '';
    if (slug) ids = slug.split('-vs-').map((s) => s.trim()).filter(Boolean);
  }
  ids = ids.filter((id) => BY[id]);
  return Array.from(new Set(ids)).slice(0, MAX);
}

function buildMeta(sorted) {
  if (sorted.length >= 2) {
    const names = sorted.map((id) => BY[id].name);
    const vs = names.join(' vs ');
    return {
      title: `${vs} — Side-by-Side Comparison — Velox Peptides`,
      ogTitle: `${vs} — Side-by-Side Research Comparison`,
      desc: `Compare ${names.join(' and ')} side by side: mechanism of action, receptor targets, molecular weight, solubility and research data. For in vitro research use only.`,
      canonical: `${SITE}/tools/compare/?ids=${sorted.join(',')}`,
    };
  }
  if (sorted.length === 1) {
    const p = BY[sorted[0]];
    return {
      title: `${p.name} — Research Peptide Profile & Comparison — Velox Peptides`,
      ogTitle: `${p.name} — Research Peptide Profile`,
      desc: `${p.name}: ${p.blurb} Compare its mechanism, receptor targets, molecular weight and solubility against other research peptides. For in vitro research use only.`,
      canonical: `${SITE}/tools/compare/?ids=${sorted[0]}`,
    };
  }
  return {
    title: 'Compare Research Peptides — Velox Peptides',
    ogTitle: 'Compare Research Peptides — Velox Peptides',
    desc: 'Compare research peptides side by side — mechanism, receptor targets, research data, molecular weight, solubility and pricing. Compare up to 5 at once. For in vitro research use only.',
    canonical: `${SITE}/tools/compare/`,
  };
}

function summarySection(sorted) {
  if (!sorted.length) return '';
  const names = sorted.map((id) => BY[id].name);
  const heading = sorted.length >= 2 ? `${names.join(' vs ')} — comparison summary` : `${names[0]} — research summary`;
  const intro = sorted.length >= 2
    ? `This page compares ${esc(names.join(' and '))} across mechanism of action, receptor targets, molecular weight, solubility and research focus, for in vitro research use only.`
    : `Research profile for ${esc(names[0])}: mechanism of action, receptor targets, molecular weight and solubility, for in vitro research use only.`;
  const cards = sorted.map((id) => {
    const p = BY[id];
    const mw = (typeof p.mw === 'number' && p.mw) ? `${p.mw} g/mol` : (p.mw || 'See product page');
    return `<div class="cmp-seo-card"><h3>${esc(p.name)}</h3><p>${esc(p.blurb)}</p>`
      + `<dl><dt>Mechanism</dt><dd>${esc(p.mechanism)}</dd>`
      + `<dt>Receptor targets</dt><dd>${esc(p.receptors)}</dd>`
      + `<dt>Molecular weight</dt><dd>${esc(mw)}</dd>`
      + `<dt>Solubility</dt><dd>${esc(p.solubility)}</dd>`
      + `<dt>Research focus</dt><dd>${esc(p.research)}</dd></dl></div>`;
  }).join('');
  return `<section class="cmp-seo" aria-label="Comparison summary">`
    + `<h2>${esc(heading)}</h2><p class="cmp-seo-intro">${intro}</p>`
    + `<div class="cmp-seo-grid">${cards}</div></section>`;
}

module.exports = function handler(req, res) {
  const sorted = parseIds(req).sort();
  const m = buildMeta(sorted);

  // When ≥1 compound is selected, the share preview is rendered on the fly by
  // /api/og-compare (dark card with the compound names). Otherwise fall back to
  // the generic brand image.
  const ogImage = sorted.length
    ? `${SITE}/api/og-compare?ids=${sorted.join(',')}`
    : OG_IMAGE;

  const headExtra =
    `<meta property="og:image" content="${esc(ogImage)}">`
    + `<meta property="og:image:width" content="1200">`
    + `<meta property="og:image:height" content="630">`
    + `<meta name="twitter:card" content="summary_large_image">`
    + `<meta name="twitter:title" content="${esc(m.ogTitle)}">`
    + `<meta name="twitter:description" content="${esc(m.desc)}">`
    + `<meta name="twitter:image" content="${esc(ogImage)}">`
    + `<style>.cmp-seo{max-width:1080px;margin:0 auto;padding:8px 20px 56px;color:#8aa0a0}`
    + `.cmp-seo h2{font-family:'Barlow Condensed',sans-serif;text-transform:uppercase;color:#fff;font-size:24px;margin:24px 0 10px}`
    + `.cmp-seo-intro{line-height:1.6;font-size:14px;margin:0 0 18px;max-width:760px}`
    + `.cmp-seo-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}`
    + `.cmp-seo-card{background:#0e141b;border:1px solid #1a2230;border-radius:12px;padding:16px}`
    + `.cmp-seo-card h3{color:#fff;font-size:16px;margin:0 0 6px}.cmp-seo-card p{font-size:13px;line-height:1.5;margin:0;color:#aeb9c4}`
    + `.cmp-seo dl{margin:8px 0 0;font-size:13px}.cmp-seo dt{color:#01D3A0;font-weight:700;margin-top:8px}.cmp-seo dd{margin:2px 0 0;line-height:1.5}</style>`;

  let html = SHELL
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(m.title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(">)/, `$1${esc(m.desc)}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(">)/, `$1${esc(m.canonical)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(">)/, `$1${esc(m.ogTitle)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(">)/, `$1${esc(m.desc)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(">)/, `$1${esc(m.canonical)}$2`)
    .replace('</head>', `${headExtra}</head>`)
    .replace('</main>', `</main>\n${summarySection(sorted)}`);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400');
  res.status(200).send(html);
};
