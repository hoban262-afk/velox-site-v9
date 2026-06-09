/**
 * GET /api/og-compare?ids=a,b[,c…]  (or ?slug=a-vs-b)
 *
 * Renders the social-share preview image for a comparison page: a dark, on-brand
 * 1200×630 card showing the compound names ("BPC-157 vs TB-500") in the Velox
 * display font and colours. Linked from /api/compare's og:image / twitter:image
 * so a shared link shows the actual compounds being compared, not a generic logo.
 *
 * Pure-PNG via @vercel/og (satori + resvg). If anything fails (font fetch, bad
 * ids) we 302 to the static og-default.png so a share is never left imageless.
 */
export const config = { runtime: 'edge' };

import { ImageResponse } from '@vercel/og';
import DATA from '../lib/peptide-data.json';

const SITE = 'https://veloxpeps.com';
const TEAL = '#01D3A0';
const BG   = '#080808';
const MAX  = 5;

const BY = {};
for (const p of DATA) BY[p.id] = p;

// Stable open-font (OFL) mirror; satori needs TTF/OTF/WOFF (not WOFF2).
const FONT_URL = 'https://cdn.jsdelivr.net/gh/google/fonts/ofl/barlowcondensed/BarlowCondensed-Bold.ttf';
let _fontPromise = null;
function loadFont() {
  if (!_fontPromise) {
    _fontPromise = fetch(FONT_URL).then((r) => {
      if (!r.ok) throw new Error('font ' + r.status);
      return r.arrayBuffer();
    });
  }
  return _fontPromise;
}

// Minimal hyperscript that yields the element shape satori reads ({type, props}).
const h = (type, props, ...children) => ({
  type,
  key: null,
  props: { ...(props || {}), children: children.length <= 1 ? children[0] : children },
});

function parseIds(url) {
  let ids = (url.searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.length) {
    const slug = url.searchParams.get('slug') || '';
    if (slug) ids = slug.split('-vs-').map((s) => s.trim()).filter(Boolean);
  }
  ids = ids.filter((id) => BY[id]);
  return Array.from(new Set(ids)).slice(0, MAX);
}

export default async function handler(req) {
  const fallback = () => Response.redirect(`${SITE}/assets/images/og-default.png`, 302);
  let url;
  try { url = new URL(req.url); } catch { return fallback(); }

  const ids = parseIds(url).sort();
  const names = ids.map((id) => BY[id].name);

  // Auto-size the name type so 2 short names read large but 5 still fit.
  const n = Math.max(names.length, 1);
  const nameSize = n <= 2 ? 96 : n === 3 ? 78 : n === 4 ? 64 : 54;
  const rowGap = n <= 2 ? 10 : 6;

  // Build the stacked "NAME / vs / NAME" middle block.
  const rows = [];
  names.forEach((name, i) => {
    if (i > 0) {
      rows.push(h('div', {
        style: { display: 'flex', color: TEAL, fontSize: Math.round(nameSize * 0.42), letterSpacing: 2, opacity: 0.95, margin: `${rowGap}px 0` },
      }, 'vs'));
    }
    rows.push(h('div', {
      style: { display: 'flex', color: '#ffffff', fontSize: nameSize, lineHeight: 1, letterSpacing: -1, textTransform: 'uppercase' },
    }, name));
  });

  const titleText = names.length ? null : 'Compare Research Peptides';

  let body;
  if (names.length) {
    body = h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1 } }, ...rows);
  } else {
    body = h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#ffffff', fontSize: 84, textTransform: 'uppercase', letterSpacing: -1 } }, titleText);
  }

  const tree = h('div', {
    style: {
      width: '1200px', height: '630px', display: 'flex', flexDirection: 'column',
      background: BG, fontFamily: 'Barlow Condensed', position: 'relative',
      padding: '56px 72px', boxSizing: 'border-box',
    },
  },
    // teal glow
    h('div', { style: { position: 'absolute', top: '-160px', right: '-120px', width: '520px', height: '520px', background: 'radial-gradient(circle, rgba(1,211,160,0.20), rgba(1,211,160,0) 70%)', display: 'flex' } }),
    // top label
    h('div', { style: { display: 'flex', alignItems: 'center', color: TEAL, fontSize: 24, letterSpacing: 6, textTransform: 'uppercase' } }, 'Side-by-Side Research Comparison'),
    // middle names
    body,
    // bottom row
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #1c1c1c', paddingTop: '26px' } },
      h('div', { style: { display: 'flex', alignItems: 'center', color: '#ffffff', fontSize: 34, letterSpacing: 1 } },
        h('span', { style: { display: 'flex', color: TEAL } }, 'VELOX'),
        h('span', { style: { display: 'flex', marginLeft: 8, color: '#ffffff' } }, 'PEPTIDES'),
      ),
      h('div', { style: { display: 'flex', color: '#6b6b6b', fontSize: 20, letterSpacing: 3, textTransform: 'uppercase' } }, 'For research use only'),
    ),
  );

  try {
    const fontData = await loadFont();
    return new ImageResponse(tree, {
      width: 1200, height: 630,
      fonts: [{ name: 'Barlow Condensed', data: fontData, weight: 700, style: 'normal' }],
      headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable' },
    });
  } catch (e) {
    return fallback();
  }
}
