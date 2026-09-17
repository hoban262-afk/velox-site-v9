#!/usr/bin/env node
/**
 * Render the Velox Meta ad creatives to PNG.
 *
 *   npx playwright install chromium     # once
 *   node ad-creatives/render.js
 *
 * Outputs ad-creatives/out/<ad>-<w>x<h>.png
 *
 * Sizes follow Meta's current placement guidance:
 *   1080x1080  1:1     feed, explore
 *   1080x1350  4:5     feed portrait (highest-performing feed slot)
 *   1200x628   1.91:1  link / right column / audience network
 *
 * Compliance note: these creatives carry NO compound names and NO purity
 * figures, per ADS-BUILD-PACK.md §0.5 rules 1 and 2. Do not add either.
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ADS = ['ad1', 'ad2', 'ad5', 'ad6', 'ad7'];
const SIZES = [
  [1080, 1080],
  [1080, 1350],
  [1200, 628],
];

const SRC = 'file://' + path.join(__dirname, 'creatives.html');
const OUT = path.join(__dirname, 'out');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  let n = 0;

  for (const ad of ADS) {
    for (const [w, h] of SIZES) {
      const page = await browser.newPage({
        viewport: { width: w, height: h },
        deviceScaleFactor: 1,
      });
      await page.goto(`${SRC}?ad=${ad}&w=${w}&h=${h}`, { waitUntil: 'load' });
      await page.waitForSelector('[data-ready="1"]', { timeout: 5000 });

      const file = path.join(OUT, `${ad}-${w}x${h}.png`);
      await page.locator(`#${ad}`).screenshot({ path: file });
      await page.close();

      n++;
      console.log(`  ok  ${path.basename(file)}`);
    }
  }

  await browser.close();
  console.log(`\n${n} creatives written to ad-creatives/out/`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
