/**
 * scripts/sync-prices.mjs — bake live prices into the static HTML at build time.
 *
 * Runs as the Vercel buildCommand. Pulls product_variants (the single source of
 * truth for prices) and rewrites every hardcoded price in output/:
 *   - product pages: radio data-price, displayed £, ItemPage JSON-LD offers,
 *     "from £X" in meta/OG descriptions
 *   - product cards on the catalogue, homepage and category pages
 *   - /compounds/ CollectionPage ItemList low/high prices
 *   - llms.txt minimum price
 *
 * FAIL-OPEN: any error (no env, network down, bad rows) exits 0 and leaves the
 * committed HTML untouched — a deploy must never be blocked by this script.
 * pricing.js still hydrates live prices client-side; this keeps the no-JS
 * fallback and the schema crawlers read in sync with reality.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'output');
const SB_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const money = (p) => '£' + (p % 1 === 0 ? p.toFixed(0) : p.toFixed(2));
const moneyEnt = (p) => money(p).replace('£', '&pound;');
const fmt2 = (p) => p.toFixed(2);
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); // "40mg Pen" -> "40mgpen"

async function main() {
  if (!SB_URL || !KEY) { console.log('[sync-prices] no Supabase env — skipping'); return; }
  const r = await fetch(`${SB_URL}/rest/v1/product_variants?select=slug,size,base_price,sale_price`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!r.ok) { console.log('[sync-prices] variants fetch failed:', r.status, '— skipping'); return; }
  const rows = await r.json();
  if (!Array.isArray(rows) || !rows.length) { console.log('[sync-prices] no variants — skipping'); return; }

  const V = {}; // slug -> [{size, price}]
  for (const v of rows) {
    const price = v.sale_price != null ? Number(v.sale_price) : Number(v.base_price);
    if (!v.slug || !v.size || !(price > 0)) continue;
    (V[v.slug] = V[v.slug] || []).push({ size: v.size, price });
  }

  let touched = 0;

  // ── product pages ──────────────────────────────────────────────────────
  for (const [slug, variants] of Object.entries(V)) {
    const f = join(OUT, 'compounds', slug, 'index.html');
    if (!existsSync(f)) continue;
    let html = readFileSync(f, 'utf8');
    const orig = html;
    const bySize = Object.fromEntries(variants.map((v) => [v.size, v.price]));
    const byNorm = Object.fromEntries(variants.map((v) => [norm(v.size), v.price]));

    // radio option blocks: data-price + displayed price
    html = html.replace(
      /<input type="radio" name="size" value="([^"]+)"[^>]*>[\s\S]*?<\/label>/g,
      (blk, size) => {
        const p = bySize[size] ?? byNorm[norm(size)];
        if (p == null) return blk;
        return blk
          .replace(/data-price="[\d.]+"/, `data-price="${fmt2(p)}"`)
          .replace(/(<span class="cp-size-p">)(?:&pound;|£)[\d.]+(<\/span>)/, `$1${moneyEnt(p)}$2`);
      }
    );

    // ItemPage JSON-LD offer prices (match offer sku tail to variant size, space-insensitively)
    html = html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (m, body) => {
      let d; try { d = JSON.parse(body); } catch { return m; }
      if (d['@type'] !== 'ItemPage' || d.mainEntity?.['@type'] !== 'Product') return m;
      let offers = d.mainEntity.offers; const single = !Array.isArray(offers);
      let changed = false;
      for (const o of single ? [offers] : offers) {
        if (!o?.sku) continue;
        const skuN = norm(o.sku);
        const hit = variants.find((v) => skuN.endsWith(norm(v.size)));
        if (hit && o.price !== fmt2(hit.price)) { o.price = fmt2(hit.price); changed = true; }
      }
      if (!changed) return m;
      return `<script type="application/ld+json">${JSON.stringify(d)}</script>`;
    });

    // "from £X" in meta descriptions
    const lo = Math.min(...variants.map((v) => v.price));
    html = html.replace(/from £[\d.]+/g, 'from ' + money(lo)).replace(/from &pound;[\d.]+/g, 'from ' + moneyEnt(lo));

    if (html !== orig) { writeFileSync(f, html); touched++; }
  }

  // ── cards on listing pages ─────────────────────────────────────────────
  const cardPages = ['compounds/index.html', 'index.html',
    'compounds/cognitive/index.html', 'compounds/metabolic/index.html', 'compounds/recovery/index.html',
    'compounds/growth/index.html', 'compounds/antioxidant/index.html'].map((p) => join(OUT, p));
  for (const f of cardPages) {
    if (!existsSync(f)) continue;
    let html = readFileSync(f, 'utf8');
    const orig = html;
    html = html.replace(/<article\b[\s\S]*?<\/article>/g, (blk) => {
      const m = blk.match(/\/compounds\/([a-z0-9-]+)\//);
      const variants = m && V[m[1]];
      if (!variants) return blk;
      const lo = Math.min(...variants.map((v) => v.price));
      const label = variants.length > 1 ? 'From ' + moneyEnt(lo) : moneyEnt(lo);
      return blk
        .replace(/(class="cc-price">)(?:From )?(?:&pound;|£)[\d.]+/, `$1${label}`)
        .replace(/>From (?:&pound;|£)[\d.]+</g, `>From ${moneyEnt(lo)}<`);
    });
    if (html !== orig) { writeFileSync(f, html); touched++; }
  }

  // ── catalogue CollectionPage ItemList ──────────────────────────────────
  const catF = join(OUT, 'compounds/index.html');
  if (existsSync(catF)) {
    let html = readFileSync(catF, 'utf8');
    const orig = html;
    html = html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (m, body) => {
      let d; try { d = JSON.parse(body); } catch { return m; }
      if (d['@type'] !== 'CollectionPage' || !d.mainEntity?.itemListElement) return m;
      let changed = false;
      for (const li of d.mainEntity.itemListElement) {
        const slug = li.item?.url?.replace(/\/$/, '').split('/').pop();
        const variants = slug && V[slug];
        if (!variants || !li.item.offers) continue;
        const ps = variants.map((v) => v.price);
        const lo = fmt2(Math.min(...ps)), hi = fmt2(Math.max(...ps));
        if (li.item.offers.lowPrice !== lo || li.item.offers.highPrice !== hi || li.item.offers.offerCount !== ps.length) {
          li.item.offers.lowPrice = lo; li.item.offers.highPrice = hi; li.item.offers.offerCount = ps.length;
          changed = true;
        }
      }
      if (!changed) return m;
      return `<script type="application/ld+json">${JSON.stringify(d)}</script>`;
    });
    if (html !== orig) { writeFileSync(catF, html); touched++; }
  }

  // ── sitewide minimum ("Prices from £X" lede + llms.txt) ────────────────
  const allMin = Math.min(...Object.values(V).flat().map((v) => v.price));
  for (const p of [catF, join(OUT, 'llms.txt')]) {
    if (!existsSync(p)) continue;
    let s = readFileSync(p, 'utf8');
    const o = s;
    s = s.replace(/Prices from (?:&pound;|£)[\d.]+ per vial/g, 'Prices from ' + (p.endsWith('.txt') ? money(allMin) : moneyEnt(allMin)) + ' per vial');
    if (s !== o) { writeFileSync(p, s); touched++; }
  }

  console.log(`[sync-prices] done — ${touched} file(s) updated from ${rows.length} variants`);
}

main().catch((e) => { console.log('[sync-prices] error (non-fatal):', e.message); });
