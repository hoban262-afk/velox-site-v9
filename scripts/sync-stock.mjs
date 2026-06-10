/**
 * scripts/sync-stock.mjs — bake live stock data into static HTML at build time.
 *
 * For each product/supply page: stamps data-stock/data-in-stock on radio inputs,
 * removes radio labels for variants deleted from product_variants, applies OOS
 * visual state, and disables the order button when all variants are OOS.
 * Also prunes JSON-LD offers for removed variants.
 *
 * Special rule: retatrutide 20mg availability = floor(10mg_qty / 2)
 * because 20mg orders are dispatched as 2× 10mg vials.
 *
 * FAIL-OPEN: any error exits 0; committed HTML is left untouched.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT   = process.cwd();
const OUT    = join(ROOT, 'output');
const SB_URL = process.env.SUPABASE_URL;
const KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

const OOS_BADGE = '<span class="cp-size-badge" style="background:#1f2937;color:#6B7280;' +
  "font-family:'DM Mono',monospace;font-size:.62rem;letter-spacing:.1em;" +
  'text-transform:uppercase;padding:2px 7px;border-radius:3px;margin-left:6px;">Out of stock</span>';
const OOS_BADGE_RE = /<span class="cp-size-badge" style="background:#1f2937[^"]*">Out of stock<\/span>/g;

async function main() {
  if (!SB_URL || !KEY) { console.log('[sync-stock] no Supabase env — skipping'); return; }

  const r = await fetch(
    `${SB_URL}/rest/v1/product_variants?select=slug,size,stock_qty,in_stock,low_stock_threshold`,
    { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }
  );
  if (!r.ok) { console.log('[sync-stock] fetch failed:', r.status, '— skipping'); return; }
  const rows = await r.json();
  if (!Array.isArray(rows) || !rows.length) { console.log('[sync-stock] no variants — skipping'); return; }

  // S: slug → normalisedSize → { qty, inStock }
  const S = {};
  for (const v of rows) {
    if (!v.slug || !v.size) continue;
    const qty     = Number(v.stock_qty ?? 0);
    const inStock = v.in_stock !== false && qty > 0;
    (S[v.slug] = S[v.slug] || {})[norm(v.size)] = { qty, inStock };
  }

  // Retatrutide 20mg derives from 10mg (dispatched as 2× 10mg vials)
  const ret10 = S.retatrutide?.[norm('10mg')];
  if (ret10) {
    const dq = Math.floor(ret10.qty / 2);
    S.retatrutide[norm('20mg')] = { qty: dq, inStock: dq > 0 };
  }

  let touched = 0;

  // Collect product + supply pages
  const pages = [];
  const cDir = join(OUT, 'compounds');
  if (existsSync(cDir)) {
    for (const name of readdirSync(cDir)) {
      const f = join(cDir, name, 'index.html');
      if (existsSync(f)) pages.push({ f, slug: name });
    }
  }
  for (const name of ['bacteriostatic-water']) {
    const f = join(OUT, 'supplies', name, 'index.html');
    if (existsSync(f)) pages.push({ f, slug: name });
  }

  for (const { f, slug } of pages) {
    const variants = S[slug];
    if (!variants) continue; // slug removed from Supabase entirely — handled separately

    let html = readFileSync(f, 'utf8');
    const orig = html;

    // Track whether checked needs to move to the next in-stock label
    let needsCheck = false;

    // ── Update / remove radio label blocks ──────────────────────────────
    html = html.replace(
      /<label class="cp-size-opt[^"]*"[^>]*>[\s\S]*?<\/label>/g,
      (blk) => {
        const im = blk.match(/<input[^>]+name="size"[^>]+value="([^"]+)"[^>]*>/);
        if (!im) return blk;
        const nSize      = norm(im[1]);
        const wasChecked = /\bchecked\b/.test(im[0]);

        // Size deleted from Supabase → remove the entire label
        if (!variants[nSize]) {
          if (wasChecked) needsCheck = true;
          return '';
        }

        const { qty, inStock } = variants[nSize];

        // Strip previously-applied OOS state (idempotency)
        let upd = blk
          .replace(/ cp-size-oos\b/g, '')
          .replace(/ style="opacity:0\.5;cursor:not-allowed;"/g, '')
          .replace(/\s+disabled\b/g, '')
          .replace(OOS_BADGE_RE, '')
          .replace(/\s+data-stock="[^"]*"/g, '')
          .replace(/\s+data-in-stock="[^"]*"/g, '');

        // Stamp fresh data attributes
        upd = upd.replace(
          /(<input[^>]+name="size"[^>]*?)>/,
          `$1 data-stock="${qty}" data-in-stock="${inStock}">`
        );

        if (!inStock) {
          if (wasChecked) needsCheck = true;
          // Remove checked from OOS input
          upd = upd.replace(/(<input[^>]+name="size"[^>]*?)\s+checked\b/g, '$1');
          // Mark label OOS
          upd = upd.replace(/class="cp-size-opt([^"]*)"/, 'class="cp-size-opt$1 cp-size-oos" style="opacity:0.5;cursor:not-allowed;"');
          // Disable the input
          upd = upd.replace(/(<input[^>]+name="size"[^>]*?)>/, '$1 disabled>');
          // Append OOS badge after last </span>
          const ls = upd.lastIndexOf('</span>');
          if (ls !== -1) upd = upd.slice(0, ls + 7) + OOS_BADGE + upd.slice(ls + 7);
        } else if (needsCheck && !wasChecked) {
          // First in-stock label after a removal/OOS — claim checked
          needsCheck = false;
          upd = upd.replace(/(<input[^>]+name="size"[^>]*?)>/, '$1 checked>');
        }

        return upd;
      }
    );

    // ── Prune JSON-LD offers for deleted variants ───────────────────────
    html = html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (m, body) => {
      let d; try { d = JSON.parse(body); } catch { return m; }
      if (d['@type'] !== 'ItemPage' || d.mainEntity?.['@type'] !== 'Product') return m;
      const offers = d.mainEntity.offers;
      if (!offers) return m;
      const isSingle = !Array.isArray(offers);
      const arr = isSingle ? [offers] : offers;
      const kept = arr.filter((o) => {
        if (!o?.sku) return true;
        return Object.keys(variants).some((nv) => norm(o.sku).endsWith(nv));
      });
      if (kept.length === arr.length || kept.length === 0) return m;
      d.mainEntity.offers = isSingle ? kept[0] : kept;
      return `<script type="application/ld+json">${JSON.stringify(d)}</script>`;
    });

    // ── Update order button ──────────────────────────────────────────────
    const allOos = Object.values(variants).every((v) => !v.inStock);
    if (allOos) {
      html = html.replace(
        /(<button[^>]*\bid="add-to-order-btn"[^>]*?)>Add to order<\/button>/,
        '$1 disabled>Out of stock</button>'
      );
    } else {
      html = html.replace(
        /(<button[^>]*\bid="add-to-order-btn"[^>]*?)\s+disabled>Out of stock<\/button>/,
        '$1>Add to order</button>'
      );
    }

    if (html !== orig) { writeFileSync(f, html); touched++; }
  }

  console.log(`[sync-stock] done — ${touched} file(s) updated from ${rows.length} variants`);
}

main().catch((e) => { console.log('[sync-stock] error (non-fatal):', e.message); });
