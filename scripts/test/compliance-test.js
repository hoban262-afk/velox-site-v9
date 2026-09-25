/**
 * lib/compliance.js — the MHRA research-use gate.
 *
 * The gate was loosened (longer negation window, post-phrase negation for
 * tables, FAQ questions, reported third-party conduct, a proper-noun
 * allowlist, and downgrading citation-title hits to warnings) to clear 10
 * false positives that were blocking every deploy.
 *
 * Loosening a compliance rule is exactly the kind of change that quietly
 * stops catching anything. So this suite asserts BOTH directions:
 *
 *   §1  Real violations still FAIL           (the gate still has teeth)
 *   §2  The 10 verified false positives PASS (the gate is usable)
 *   §3  The escape hatches cannot be abused  (loopholes stay shut)
 *   §4  Disclaimer + HTML plumbing           (scanHtml wiring)
 *   §5  The live site                        (output/ stays green)
 */
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const { scanText, scanHtml, pathNeedsDisclaimer } = require(ROOT + '/lib/compliance');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? '  -> ' + extra : ''}`); }
}

// Did the text trip a HARD rule (the kind that fails a deploy)?
const hard = (t) => scanText(t).hard;
const hardIds = (t) => hard(t).map((h) => h.id);
const violates = (t, id) => hardIds(t).includes(id);
const clean = (t) => hard(t).length === 0;
const warnIds = (t) => scanText(t).warnings.map((w) => w.id);

// ───────────────────────────────────────────────────────────────────────────
console.log('\n1. Real violations still FAIL — the gate must keep its teeth');

check('safe for human use', violates('Our peptides are safe for human use.', 'safe_human'));
check('suitable for human consumption', violates('This vial is suitable for human consumption.', 'safe_human'));
check('bare "for human use"', violates('Supplied in sterile vials for human use.', 'human_use'));
check('for human ingestion', violates('Packaged for human ingestion.', 'human_use'));
check('treats obesity', violates('Retatrutide treats obesity in adults.', 'cure_claim'));
check('cures diabetes', violates('This compound cures diabetes.', 'cure_claim'));
check('prevents cancer', violates('Daily use prevents cancer.', 'cure_claim'));
check('reverses your disease', violates('It reverses your disease within weeks.', 'cure_claim'));
check('guaranteed weight loss', violates('Guaranteed weight loss or your money back.', 'guarantee_loss'));
check('lose weight fast', violates('Lose weight fast with our stack.', 'guarantee_loss'));
check('your dose is', violates('Your dose is 5mg once weekly.', 'human_dosing'));
check('recommended dosage of', violates('The recommended dosage of 2mg is typical.', 'human_dosing'));
check('how much to inject', violates('Here is how much to inject each week.', 'human_dosing'));
check('you should inject', violates('You should inject subcutaneously on Mondays.', 'human_dosing'));

// The nastiest regression: a real claim wearing a disclaimer's clothes. The
// negation window is 140 chars, so a claim must not be excused merely because
// the word "not" appears somewhere earlier in an unrelated sentence.
check('claim NOT excused by an unrelated distant "not"', violates(
  'We do not ship outside the UK, and we do not offer refunds after fourteen days from the date of delivery to your address. ' +
  'This product is safe for human use.', 'safe_human'));

// ───────────────────────────────────────────────────────────────────────────
console.log('\n2. The 10 verified false positives now PASS');

check('1. long-form "not approved ... for human use" (79 chars between)', clean(
  'Retatrutide (LY3437943) is not approved by the FDA, the MHRA, or any other regulatory agency as a medicine for human use.'));
check('2. table row: "Approved for human use | None, anywhere"', clean(
  'Approved for human use | None, anywhere'));
check('3. table row with an em-dash separator', clean('Approved for human use — none'));
check('4. FAQ question "Are these peptides for human use?"', clean(
  'Are these peptides for human use? No. Every vial is a research reagent.'));
check('5. reported third-party conduct (lawsuit journalism)', clean(
  'The FTC complaint alleges the defendants marketed the vials for human consumption without approval.'));
check('6. CHMP proper noun', clean(
  'The Committee for Medicinal Products for Human Use issued a positive opinion in March.'));
check('7. hyphenated disease modifier is a finding, not a claim', clean(
  'The analogue did not prevent diabetes-associated weight loss in the cohort.'));
check('8. "physicians who treat obesity" names a specialty', clean(
  'The survey polled physicians who treat obesity in NHS secondary care.'));
check('9. "No product is intended for human consumption"', clean(
  'No product sold on this site is intended for human consumption.'));
check('10. "neither approved nor licensed for human use"', clean(
  'These compounds are neither approved nor licensed for human use anywhere.'));

// The site teaches the rule, so it must be able to write sentences whose
// subject contains the phrase and whose verb denies it.
check('11. "marketed for human use ... is not a research reagent"', clean(
  'Research-only labelling is not a loophole. A product marketed for human use with ' +
  'dosing instructions is not a research reagent.'));
check('11b. "... is not lawful"', clean('Supplying it for human use is not lawful in the UK.'));

// Citation titles are DOWNGRADED, not skipped — a reviewer must still see them.
const refsHtml =
  '<main><p>For research use only.</p></main>' +
  '<section class="rl-section rl-refs"><ol><li>Eli Lilly. ' +
  'Retatrutide met primary endpoint in adults who treat obesity. Press release, 2026.</li></ol></section>';
const refsScan = scanHtml(refsHtml);
check('citation title does not fail the build', refsScan.pass && refsScan.hard.length === 0);
check('citation title still appears as a warning', refsScan.warnings.some((w) => w.id === 'cure_claim'));
check('citation warning is labelled as a citation', refsScan.warnings.some((w) => /citation title/.test(w.label)));

// ───────────────────────────────────────────────────────────────────────────
console.log('\n3. The escape hatches cannot be abused');

// A full stop is deliberately NOT an accepted post-negator separator, or any
// claim could be laundered by following it with an unrelated "No ..." sentence.
check('following sentence starting "No" does NOT excuse the claim', violates(
  'These peptides are for human use. No prescription is needed.', 'human_use'));

// skipQuestion needs the "?" adjacent to the phrase, not anywhere later.
check('a distant "?" does NOT excuse the claim', violates(
  'These vials are for human use in our laboratory programme. Any questions?', 'human_use'));

// The allowlist requires the WHOLE proper noun spanning the match.
check('bare "for human use" is not rescued by a nearby CHMP mention', violates(
  'The Committee for Medicinal Products for Human Use met in March. Our vials are sold for human use.', 'human_use'));

// "illegal"/"unlawful" were deliberately excluded from REPORTED_CONDUCT as too
// broad — they would let any page excuse itself with one adjective.
check('"illegal" is not reported-conduct vocabulary', violates(
  'It is illegal to do otherwise, so these peptides are for human use.', 'human_use'));

// safe_human has no allowReported: calling a product safe is never journalism.
check('reported conduct does NOT excuse "safe for human use"', violates(
  'The lawsuit alleges the seller said the vials were safe for human use.', 'safe_human'));

// The forward-denial hatch needs BOTH halves: a copular negation AND a word
// denying research/legal/safety status. An unrelated negation must not qualify.
check('forward negation about returns does NOT excuse the claim', violates(
  'These vials are for human use and are not returnable once opened.', 'human_use'));
check('forward negation about stock does NOT excuse the claim', violates(
  'Sold for human use, though the 10mg size is not currently in stock.', 'human_use'));
check('forward denial does not reach across a full stop', violates(
  'Our vials are for human use. Nothing here is a research reagent.', 'human_use'));

// cure_claim intentionally has NO allowNegated — the hyphen guard and
// skipBefore clear every real false positive without it, so it must not be
// handed a negation excuse it does not need. This is the gate's most dangerous
// miss, so the strictness is pinned here on purpose.
check('cure_claim is not excusable by negation', violates(
  'This is not a medicine, but it treats obesity.', 'cure_claim'));

// The references downgrade must not become a dumping ground for body copy.
check('a claim OUTSIDE rl-refs still fails even when refs exist', (() => {
  const r = scanHtml('<main><p>Our peptides are safe for human use.</p></main>' +
    '<section class="rl-refs"><li>Some citation.</li></section>');
  return r.pass === false && r.hard.some((h) => h.id === 'safe_human');
})());

// ───────────────────────────────────────────────────────────────────────────
console.log('\n4. scanHtml plumbing');

check('script/style contents are not scanned', clean(
  require(ROOT + '/lib/compliance').visibleText('<script>var x = "safe for human use";</script><p>Hello</p>')));
check('meta-refresh redirect stubs are skipped', (() => {
  const r = scanHtml('<meta http-equiv="refresh" content="0;url=/x/"><p>safe for human use</p>');
  return r.pass && r.redirect === true;
})());
check('missing disclaimer fails when required', (() => {
  const r = scanHtml('<p>Retatrutide is a triple agonist.</p>', { requireDisclaimer: true });
  return r.missingDisclaimer === true && r.pass === false;
})());
check('disclaimer found in body satisfies the requirement', (() => {
  const r = scanHtml('<p>For research use only.</p>', { requireDisclaimer: true });
  return r.missingDisclaimer === false && r.pass === true;
})());
// Regression: stripping rl-refs must not hide a disclaimer that lives there.
check('disclaimer INSIDE rl-refs still counts', (() => {
  const r = scanHtml('<p>Data.</p><section class="rl-refs"><p>For research use only.</p></section>',
    { requireDisclaimer: true });
  return r.missingDisclaimer === false && r.pass === true;
})());
check('disclaimer check is off by default', scanHtml('<p>Data.</p>').missingDisclaimer === false);
check('pathNeedsDisclaimer covers compounds/guides/stacks', (() => (
  pathNeedsDisclaimer('/compounds/bpc-157/') && pathNeedsDisclaimer('/guides/x/') &&
  pathNeedsDisclaimer('/stacks/y/') && !pathNeedsDisclaimer('/about/')
))());

console.log('\n   Soft warnings (report, never fail):');
check('FDA-approved is a warning, not a failure', (() => (
  warnIds('Wegovy is FDA-approved for chronic weight management.').includes('approval_mention') &&
  clean('Wegovy is FDA-approved for chronic weight management.')
))());
check('"no prescription" is a warning, not a failure', (() => (
  warnIds('Sold with no prescription required.').includes('no_prescription') &&
  clean('Sold with no prescription required.')
))());
check('second-person phrasing is a warning, not a failure', (() => (
  warnIds('When you inject the reconstituted solution.').includes('second_person_use') &&
  clean('When you inject the reconstituted solution.')
))());

// ───────────────────────────────────────────────────────────────────────────
console.log('\n5. The live site in output/ stays green');

const { spawnSync } = require('child_process');
const gate = spawnSync(process.execPath, [ROOT + '/scripts/compliance-check.js'],
  { encoding: 'utf8', cwd: ROOT });
check('scripts/compliance-check.js exits 0 on output/', gate.status === 0,
  (gate.stdout || '').trim().split('\n').slice(-6).join(' | '));

// ───────────────────────────────────────────────────────────────────────────
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
