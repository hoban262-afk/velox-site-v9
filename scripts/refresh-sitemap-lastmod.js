#!/usr/bin/env node
/**
 * scripts/refresh-sitemap-lastmod.js — bump <lastmod> dates in output/sitemap.xml.
 *
 * Google deprecated the sitemap "ping" endpoint in 2023 and Bing recommends
 * IndexNow instead, so there's nothing to GET-ping anymore. The one lever that
 * still matters for Google is an accurate <lastmod>: bump it only for pages that
 * actually changed, then let Google recrawl. (Bumping everything every deploy
 * dilutes the signal, so this script is deliberately path-scoped by default.)
 *
 * Usage:
 *   node scripts/refresh-sitemap-lastmod.js /design-lab/ /compounds/semax/   # bump these
 *   node scripts/refresh-sitemap-lastmod.js --all                            # bump every entry
 *
 * After bumping, push the change and (optionally) submit the same URLs to
 * IndexNow for Bing/Yandex:
 *   curl -X POST https://veloxpeps.com/api/indexnow \
 *     -H "x-internal-secret: $INTERNAL_TASK_SECRET" \
 *     -H "content-type: application/json" \
 *     -d '{"urls":["https://veloxpeps.com/design-lab/"]}'
 */
const fs = require('fs');
const path = require('path');

const SITEMAP = path.join(__dirname, '..', 'output', 'sitemap.xml');
const today = new Date().toISOString().slice(0, 10);
const args = process.argv.slice(2);
const all = args.includes('--all');
const paths = args.filter((a) => a !== '--all');

if (!all && paths.length === 0) {
  console.error('Nothing to do. Pass page paths (e.g. /design-lab/) or --all.');
  process.exit(1);
}

let xml = fs.readFileSync(SITEMAP, 'utf-8');
let changed = 0;

// Rewrite the <lastmod> that sits inside each <url> block, scoped by <loc>.
xml = xml.replace(/<url>([\s\S]*?)<\/url>/g, (block) => {
  const loc = (block.match(/<loc>\s*([^<\s]+)\s*<\/loc>/) || [])[1] || '';
  const hit = all || paths.some((p) => loc === `https://veloxpeps.com${p}` || loc.endsWith(p));
  if (!hit) return block;
  if (/<lastmod>/.test(block)) {
    changed++;
    return block.replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${today}</lastmod>`);
  }
  // No lastmod present — insert one after </loc>.
  changed++;
  return block.replace(/(<\/loc>)/, `$1<lastmod>${today}</lastmod>`);
});

if (!changed) {
  console.error('No matching <loc> entries found. Check the paths.');
  process.exit(2);
}
fs.writeFileSync(SITEMAP, xml);
console.log(`Updated ${changed} <lastmod> -> ${today} in output/sitemap.xml`);
