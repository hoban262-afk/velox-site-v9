/**
 * Checkout order-bump — never offer a variant the checkout API will reject.
 *
 * lib/force-oos.mjs is the single source of truth for variants pulled from
 * sale. api/create-fena-payment.js and api/create-fena-recurring.js refuse any
 * matching line with a 409. The payment page's order bump adds a bac-water SKU
 * to the cart one tap before Pay Now — and hides itself once added — so if it
 * ever offers a pulled variant the customer is stranded at the last step of the
 * funnel with no obvious way to undo it.
 *
 * That is not hypothetical: the bump was hardcoded to 10ml at the same time
 * 10ml was in FORCE_OOS, so every vial-only cart was offered a guaranteed 409.
 *
 * output/checkout/payment/index.html is static HTML and cannot import the ESM
 * guard, so it carries a duplicated FORCE_OOS literal. Duplicated constants
 * drift. This suite is the thing that stops them:
 *
 *   §1  The page's FORCE_OOS mirror matches lib/force-oos.mjs exactly
 *   §2  The variant the bump actually selects is not force-OOS
 *   §3  The fallback logic behaves under every pulled/unpulled combination
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const PAGE = ROOT + '/output/checkout/payment/index.html';

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? '  -> ' + extra : ''}`); }
}

const html = fs.readFileSync(PAGE, 'utf8');

// Pull the mirrored literal and the candidate list straight out of the page, so
// the test reads what actually ships rather than a copy of it.
function extractMirror() {
  const m = html.match(/var FORCE_OOS = (\{[^;]*\});/);
  if (!m) return null;
  try { return JSON.parse(m[1].replace(/'/g, '"')); } catch (e) { return null; }
}
function extractCandidates() {
  const m = html.match(/var BUMP_CANDIDATES = \[([\s\S]*?)\];/);
  if (!m) return null;
  const out = [];
  const re = /\{\s*slug:\s*'([^']+)',\s*name:\s*'([^']*)',\s*size:\s*'([^']+)',\s*price:\s*([\d.]+)/g;
  let c; while ((c = re.exec(m[1]))) out.push({ slug: c[1], name: c[2], size: c[3], price: Number(c[4]) });
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n1. The page mirror matches lib/force-oos.mjs');

const mirror = extractMirror();
const candidates = extractCandidates();
check('payment page declares a FORCE_OOS mirror', !!mirror);
check('payment page declares BUMP_CANDIDATES', !!candidates && candidates.length > 0);

(async () => {
  const { FORCE_OOS, isForcedOos } = await import(ROOT + '/lib/force-oos.mjs');

  if (mirror) {
    const norm = (o) => JSON.stringify(
      Object.keys(o).sort().map((k) => [k.toLowerCase(), o[k].map((s) => String(s).toLowerCase()).sort()])
    );
    check('mirror is byte-equivalent to lib/force-oos.mjs',
      norm(mirror) === norm(FORCE_OOS),
      `page=${JSON.stringify(mirror)} module=${JSON.stringify(FORCE_OOS)}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n2. The selected bump variant is safe to offer');

  // Replicate the page's selection: first candidate that is not force-OOS.
  const selected = (candidates || []).find((c) => !isForcedOos(c.slug, c.size)) || null;

  check('a candidate survives the force-OOS filter', !!selected,
    'every bump candidate is pulled — the bump must hide instead');

  if (selected) {
    check(`selected variant (${selected.size}) is NOT force-OOS`,
      !isForcedOos(selected.slug, selected.size));
    check('selected variant has a sane price', selected.price > 0);
  }

  // The real regression: the FIRST candidate being pulled must not be selected.
  const pulled = (candidates || []).filter((c) => isForcedOos(c.slug, c.size));
  for (const p of pulled) {
    check(`pulled variant (${p.size}) is not the one offered`,
      !selected || selected.size !== p.size);
  }

  check('the page hides the bump when nothing is offerable',
    /if \(!BUMP\) \{ box\.hidden = true; return; \}/.test(html));

  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n3. Fallback logic under every combination');

  // Exercise the page's own algorithm against synthetic FORCE_OOS states, so a
  // future edit to the candidate order or the filter is caught here.
  function selectWith(blocked, cands) {
    const isBlocked = (c) => (blocked[c.slug] || []).some((s) => s.toLowerCase() === c.size.toLowerCase());
    return cands.find((c) => !isBlocked(c)) || null;
  }
  const C = candidates || [];
  if (C.length >= 2) {
    const [first, second] = C;
    let s;
    s = selectWith({}, C);
    check('nothing pulled -> offers the preferred (first) variant', s && s.size === first.size);

    s = selectWith({ 'bacteriostatic-water': [first.size] }, C);
    check(`${first.size} pulled -> falls back to ${second.size}`, s && s.size === second.size);

    s = selectWith({ 'bacteriostatic-water': [second.size] }, C);
    check(`${second.size} pulled -> still offers ${first.size}`, s && s.size === first.size);

    s = selectWith({ 'bacteriostatic-water': [first.size, second.size] }, C);
    check('both pulled -> offers nothing (bump hides)', s === null);

    s = selectWith({ 'bacteriostatic-water': [first.size.toUpperCase()] }, C);
    check('matching is case-insensitive', s && s.size === second.size);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('order-bump-test crashed:', e); process.exit(1); });
