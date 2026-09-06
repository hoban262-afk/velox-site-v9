#!/usr/bin/env node
/**
 * Runs the Meta pixel / CAPI test suite. Each file is a separate process
 * because they mutate process.env and require.cache to test configuration
 * states (pixel configured vs not, advanced matching on vs off).
 *
 *   npm run test:meta
 */
const { spawnSync } = require('child_process');
const path = require('path');

const FILES = [
  'meta-pixel-test.js',        // browser pixel + the dedup property
  'meta-capi-test.js',         // server payload shape, privacy, fail-safe
  'track-integration-test.js', // real handler: DB + CAPI + freeze regression
];

let failed = 0;
for (const f of FILES) {
  console.log(`\n${'='.repeat(60)}\n${f}\n${'='.repeat(60)}`);
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}

console.log(`\n${'='.repeat(60)}`);
console.log(failed ? `${failed} test file(s) FAILED` : 'All test files passed');
process.exit(failed ? 1 : 0);
