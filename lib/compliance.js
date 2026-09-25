/**
 * lib/compliance.js — the MHRA "research use only" compliance gate.
 *
 * One shared rules engine used by:
 *   • scripts/compliance-check.js  — lint output/ before you push (the pre-deploy gate)
 *   • api/agents/compliance-audit  — weekly scan of the LIVE site for drift
 *   • the marketing autopilot (P8)  — every AI-drafted page must pass before publishing
 *
 * Design principle: be CONSERVATIVE. Velox legitimately publishes research-framed
 * education (compound explainers, third-party clinical-trial data, comparisons).
 * The gate must catch only clear violations — human-use directions, medical/disease
 * claims, and false approvals — never ordinary mention of compounds, "research",
 * "clinical trial" or "weight loss" in a research context.
 *
 * Two checks:
 *   1. HARD rules  → unambiguous violations. A page that hits one FAILS.
 *   2. Disclaimer  → product (/compounds/) and guide (/guides/) pages must carry a
 *      research-use statement. Missing it FAILS.
 * Plus soft WARNINGS (second-person dosing language) that report but don't fail.
 */

// Strip tags + scripts/styles to visible lowercase text for matching.
function visibleText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// A phrase is OK if a negation appears shortly before it — covers the many
// compliant disclaimer shapes: "not for human consumption", "not approved for
// human use", "No product is intended for human consumption", "not licensed … for".
//
// The window is 140 characters, not 60. Real compliant sentences put a lot of
// words between the negator and the trigger phrase, and 60 was cutting them in
// half — "(LY3437943) is not approved by the FDA, the MHRA, or any other
// regulatory agency as a medicine for human use" puts 79 characters between
// "not" and "for human use", so the correct disclaimer was being reported as a
// violation while the page it sat on was perfectly compliant.
const NEG_WINDOW = 140;
const NEGATOR = /\b(not|never|no|none|neither|nor|nothing|non|without|isn'?t|aren'?t|cannot|can'?t|un(approved|licensed|authorised|authorized))\b/;

// The lookback never crosses a sentence boundary. A 140-char window alone is
// wide enough to reach back into the PREVIOUS sentence, which would let an
// unrelated negation launder a real claim: "We do not offer refunds after
// fourteen days. This product is safe for human use." Genuine disclaimers
// always keep the negator and the phrase in the same sentence, so clamping
// costs nothing and shuts the loophole. Colons and semicolons are NOT
// boundaries — "Note: not approved for human use" must still be honoured.
const SENTENCE_END = /[.!?]\s/g;
function negated(text, idx) {
  let w = text.slice(Math.max(0, idx - NEG_WINDOW), idx);
  let cut = -1, m;
  SENTENCE_END.lastIndex = 0;
  while ((m = SENTENCE_END.exec(w)) !== null) cut = m.index + m[0].length;
  if (cut > -1) w = w.slice(cut);
  return NEGATOR.test(w);
}

// Comparison tables flatten to "<header> <value>", which puts the negation
// AFTER the phrase: "Approved for human use | None, anywhere". Only a negator
// sitting immediately after the match — optionally behind a column separator or
// dash — counts. An ordinary following sentence such as "...for human use. No
// prescription is needed." is deliberately NOT swallowed, because the full stop
// is not an accepted separator.
const POST_NEGATOR = /^[\s:|—–-]*\b(none|no|never|not|nil)\b/;
function negatedAfter(text, endIdx) {
  return POST_NEGATOR.test(text.slice(endIdx, endIdx + 24));
}

// The site also teaches the rule itself, which means writing sentences whose
// subject contains the trigger phrase and whose verb denies it:
//
//   "a product marketed for human use with dosing instructions
//    IS NOT a research reagent"
//
// The negator is ahead of the phrase but too far for the table-shaped
// POST_NEGATOR, and in a different clause. Allowing any forward negator would
// gut the rule ("these are for human use and are not returnable"), so this is
// deliberately narrow on BOTH halves: a copular negation, and then — still
// inside the same sentence — a word that denies research/legal/safety status.
// A negation about shipping, returns or stock will not match.
const FWD_DENIAL = /^[^.!?]{0,160}?\b(is|are|was|were|would|could|does|do|can|may|must)\s?n[o']?t\b[^.!?]{0,40}?\b(an? )?(research|reagent|lawful|legal|legitimate|permitted|allowed|compliant|approved|licen[cs]ed|authoris|authoriz|medicine|medicinal|safe|loophole)/;
function deniedAhead(text, endIdx) {
  return FWD_DENIAL.test(text.slice(endIdx, endIdx + 220));
}

// The guides report on other companies being sued for selling research
// chemicals into human use. Describing a third party's alleged misconduct is
// journalism, not a Velox claim, and the site has to be able to say what the
// lawsuits are about. Scoped to legal-proceeding vocabulary so it cannot be
// used as a general loophole — "illegal"/"unlawful" are deliberately excluded
// as too broad.
const REPORTED_CONDUCT = /\b(alleg\w*|sued|suing|lawsuits?|defendants?|prosecut\w*|indict\w*|accus\w*|mislabel\w*|misbrand\w*)\b/;
function reportedConduct(text, idx) {
  return REPORTED_CONDUCT.test(text.slice(Math.max(0, idx - NEG_WINDOW), idx));
}

// Institutional proper nouns that legitimately contain a trigger phrase. The
// whole name must be present and must span the match, so this cannot be abused
// by dropping the bare phrase onto a page.
const ALLOWED_PHRASES = [
  'committee for medicinal products for human use', // the EMA committee (CHMP)
];
function inAllowedPhrase(text, idx, len) {
  return ALLOWED_PHRASES.some((p) => {
    const start = text.lastIndexOf(p, idx);
    return start !== -1 && start + p.length >= idx + len;
  });
}

// HARD violations — unambiguous. Each:
//   {id, label, re, allowNegated, skipQuestion, allowReported, skipBefore}
const HARD = [
  { id: 'human_use',        label: 'Implies human use/consumption', re: /\bfor human (use|consumption|ingestion)\b/g, allowNegated: true, skipQuestion: true, allowReported: true },
  { id: 'safe_human',       label: 'Claims safe for humans',        re: /\b(safe|suitable|fit) for human (use|consumption|ingestion)\b/g, allowNegated: true, skipQuestion: true },
  // The disease term must not be a hyphenated modifier: "did not prevent
  // diabetes-associated weight loss" is a finding about weight loss, not a
  // claim to prevent diabetes.
  //
  // Note this rule deliberately does NOT set allowNegated. The hyphen guard and
  // skipBefore clear every false positive on the site without it, and a cure
  // claim is the most dangerous thing the gate can miss — no reason to hand it
  // an extra excuse it does not need.
  { id: 'cure_claim',       label: 'Disease cure/treatment claim',   re: /\b(cures?|treats?|prevents?|reverses?|heals?)\s+(your\s+)?(obesity|diabetes|cancer|disease|illness|aids|covid|depression|anxiety)\b(?![-\w])/g,
    // "physicians who treat obesity" names a medical specialty; it says nothing
    // about a product.
    skipBefore: /\b(physicians?|doctors?|clinicians?|specialists?|practitioners?|surgeons?|endocrinologists?)\s+who\s+$/ },
  { id: 'guarantee_loss',   label: 'Guaranteed health/weight outcome claim', re: /\b(guaranteed|guarantee)\s+(weight ?loss|fat ?loss|results|cure)\b|\blose weight fast\b/g },
  // "how (much|to) (inject|…)" missed the single most natural dosing phrasing
  // there is — "how much TO inject" — because the quantity word and the verb
  // are not adjacent. Same for "how often to dose", "how should you inject".
  { id: 'human_dosing',     label: 'Human dosing/administration instruction', re: /\b(your|recommended|daily|weekly)\s+(human\s+)?(dose|dosage)\s+(is|of|should)\b|\bhow (much|many|often|long) (to |should (i|you) )?(inject|take|administer|dose)\b|\bhow to (inject|take|administer|dose)\b|\bhow should (i|you) (inject|take|administer|dose)\b|\byou should (inject|take|administer|dose)\b/g },
];

// Soft warnings — review but don't fail the gate. Regulatory-approval mentions
// live here because they're usually legitimate facts about a comparator drug
// (e.g. "Wegovy is FDA-approved"); a human/AI reviewer judges intent.
const WARN = [
  { id: 'second_person_use', label: 'Second-person usage phrasing (review tone)', re: /\b(when|after) you (take|inject|use|dose|administer)\b/g },
  { id: 'approval_mention',  label: 'Regulatory-approval mention — confirm it refers to a comparator drug, not a Velox product', re: /\b(fda|mhra|ema)[- ]approved\b|\bapproved by the (fda|mhra)\b|\bclinically approved\b/g },
  { id: 'no_prescription',   label: 'Prescription language — fine for legal/education context, not for sales copy', re: /\bno (prescription|rx)\b|\bprescription[- ]free\b|\bwithout a prescription\b/g },
];

const DISCLAIMER_HINTS = [
  'research use only', 'in vitro research', 'not for human consumption',
  'research purposes only', 'not for human use', 'research reagent',
];

function runRules(text, rules) {
  const hits = [];
  for (const r of rules) {
    r.re.lastIndex = 0;
    let m;
    while ((m = r.re.exec(text)) !== null) {
      const end = m.index + m[0].length;
      if (r.allowNegated && (negated(text, m.index) || negatedAfter(text, end) || deniedAhead(text, end))) continue;
      // Skip FAQ-style questions ("Are these peptides for human use?") — the answer
      // clarifies they're not. A "?" right after the phrase marks a question.
      if (r.skipQuestion && text.slice(end, end + 3).includes('?')) continue;
      if (r.allowReported && reportedConduct(text, m.index)) continue;
      if (r.skipBefore && r.skipBefore.test(text.slice(Math.max(0, m.index - NEG_WINDOW), m.index))) continue;
      if (inAllowedPhrase(text, m.index, m[0].length)) continue;
      hits.push({ id: r.id, label: r.label, match: m[0].trim() });
      if (hits.filter((h) => h.id === r.id).length >= 3) break; // cap repeats
    }
  }
  return hits;
}

/**
 * Scan raw text (no HTML). Returns { hard:[], warnings:[] }.
 */
function scanText(text) {
  const t = ' ' + String(text || '').toLowerCase() + ' ';
  return { hard: runRules(t, HARD), warnings: runRules(t, WARN) };
}

/**
 * Scan an HTML document.
 * @param {string} html
 * @param {object} [opts] { requireDisclaimer:boolean }
 * @returns {{ pass:boolean, hard:[], warnings:[], missingDisclaimer:boolean }}
 */
function scanHtml(html, opts = {}) {
  // Redirect stubs (<meta http-equiv="refresh">) have no real content — skip them.
  if (/<meta[^>]+http-equiv=["']?refresh/i.test(String(html || ''))) {
    return { pass: true, redirect: true, hard: [], warnings: [], missingDisclaimer: false };
  }
  const raw = String(html || '');

  // The References section is a bibliography: every entry is the verbatim title
  // of a third-party paper or press release. Reference 3 on the TRIUMPH-1 guide
  // is literally Eli Lilly's press-release headline, which contains "treat
  // obesity" — the site is citing that source, not making the claim, and
  // rewriting a source's title to satisfy a linter would misquote it.
  //
  // So citation text is DOWNGRADED, not skipped: hits there become warnings
  // rather than vanishing. A reviewer still sees them, and the references
  // section never becomes a blind spot where real claims could be parked.
  const refsRe = /<section[^>]*class=["'][^"']*rl-refs[^"']*["'][\s\S]*?<\/section>/gi;
  const refsHtml = raw.match(refsRe) || [];
  const bodyHtml = raw.replace(refsRe, ' ');

  const text = ' ' + visibleText(bodyHtml) + ' ';
  const { hard, warnings } = scanText(text);

  if (refsHtml.length) {
    const refText = ' ' + visibleText(refsHtml.join(' ')) + ' ';
    const r = scanText(refText);
    for (const h of r.hard) {
      warnings.push({ id: h.id, label: `${h.label} — inside a citation title (verify the reference is quoted accurately)`, match: h.match });
    }
    warnings.push(...r.warnings);
  }

  // Disclaimer is checked against the whole page: it may legitimately sit
  // anywhere, and stripping references must not make a compliant page look
  // non-compliant.
  const fullText = ' ' + visibleText(raw) + ' ';
  let missingDisclaimer = false;
  if (opts.requireDisclaimer) {
    missingDisclaimer = !DISCLAIMER_HINTS.some((h) => fullText.includes(h));
  }
  return { pass: hard.length === 0 && !missingDisclaimer, hard, warnings, missingDisclaimer };
}

// Does a site path need the research-use disclaimer present?
function pathNeedsDisclaimer(p) {
  return /\/compounds\//.test(p) || /\/guides\//.test(p) || /\/stacks\//.test(p);
}

module.exports = { scanText, scanHtml, visibleText, pathNeedsDisclaimer, HARD, WARN, DISCLAIMER_HINTS };
