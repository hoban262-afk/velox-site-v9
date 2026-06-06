#!/usr/bin/env node
/**
 * scripts/compliance-check.js — the pre-deploy compliance gate.
 *
 * Scans every HTML page in output/ against lib/compliance.js (MHRA research-use
 * rules). Run it before you push:
 *
 *     node scripts/compliance-check.js
 *
 * Exit code 0 = clean (safe to deploy). Exit code 1 = hard violations or a
 * product/guide page missing its research-use disclaimer (fix before pushing).
 * Soft warnings are listed but never fail the build.
 *
 * Add `--warnings` to also fail on warnings.
 */
const fs = require('fs');
const path = require('path');
const { scanHtml, pathNeedsDisclaimer } = require('../lib/compliance');

const ROOT = path.join(__dirname, '..', 'output');
const FAIL_ON_WARN = process.argv.includes('--warnings');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const fp = path.join(dir, name);
    const st = fs.statSync(fp);
    if (st.isDirectory()) walk(fp, out);
    else if (name.endsWith('.html')) out.push(fp);
  }
  return out;
}

function rel(fp) { return fp.replace(ROOT, '').replace(/\\/g, '/'); }

const files = walk(ROOT);
let hardPages = 0, disclaimerPages = 0, warnPages = 0, warnTotal = 0;
const lines = [];

for (const fp of files) {
  const p = rel(fp);
  const html = fs.readFileSync(fp, 'utf8');
  const r = scanHtml(html, { requireDisclaimer: pathNeedsDisclaimer(p) });

  if (r.hard.length) {
    hardPages++;
    lines.push(`\n  ✗ ${p}`);
    for (const h of r.hard) lines.push(`      [HARD] ${h.label} — "${h.match}"`);
  }
  if (r.missingDisclaimer) {
    disclaimerPages++;
    lines.push(`\n  ✗ ${p}\n      [HARD] Missing research-use disclaimer on a product/guide page`);
  }
  if (r.warnings.length) {
    warnPages++; warnTotal += r.warnings.length;
    lines.push(`\n  ⚠ ${p}`);
    for (const w of r.warnings) lines.push(`      [warn] ${w.label} — "${w.match}"`);
  }
}

const hardCount = hardPages + disclaimerPages;
console.log(`\nCompliance scan — ${files.length} HTML pages checked`);
console.log('─'.repeat(56));
if (lines.length) console.log(lines.join('\n'));
else console.log('  ✓ No issues found.');
console.log('─'.repeat(56));
console.log(`Hard violations: ${hardCount} page(s)   ·   Warnings: ${warnTotal} on ${warnPages} page(s)`);

if (hardCount > 0) { console.log('\n❌ FAIL — fix the hard violations above before deploying.\n'); process.exit(1); }
if (FAIL_ON_WARN && warnTotal > 0) { console.log('\n❌ FAIL (--warnings) — review the warnings above.\n'); process.exit(1); }
console.log('\n✅ PASS — compliant to deploy.\n');
process.exit(0);
