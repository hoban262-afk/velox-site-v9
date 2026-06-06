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
function negated(text, idx) {
  const before = text.slice(Math.max(0, idx - 60), idx);
  return /\b(not|never|no|non|without|isn'?t|aren'?t|cannot|can'?t|un(approved|licensed|authorised|authorized))\b/.test(before);
}

// HARD violations — unambiguous. Each: {id, label, re, allowNegated}
const HARD = [
  { id: 'human_use',        label: 'Implies human use/consumption', re: /\bfor human (use|consumption|ingestion)\b/g, allowNegated: true, skipQuestion: true },
  { id: 'safe_human',       label: 'Claims safe for humans',        re: /\b(safe|suitable|fit) for human (use|consumption|ingestion)\b/g, allowNegated: true, skipQuestion: true },
  { id: 'cure_claim',       label: 'Disease cure/treatment claim',   re: /\b(cures?|treats?|prevents?|reverses?|heals?)\s+(your\s+)?(obesity|diabetes|cancer|disease|illness|aids|covid|depression|anxiety)\b/g },
  { id: 'guarantee_loss',   label: 'Guaranteed health/weight outcome claim', re: /\b(guaranteed|guarantee)\s+(weight ?loss|fat ?loss|results|cure)\b|\blose weight fast\b/g },
  { id: 'human_dosing',     label: 'Human dosing/administration instruction', re: /\b(your|recommended|daily|weekly)\s+(human\s+)?(dose|dosage)\s+(is|of|should)\b|\bhow (much|to) (inject|take|administer|dose)\b|\byou should (inject|take|administer|dose)\b/g },
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
      if (r.allowNegated && negated(text, m.index)) continue;
      // Skip FAQ-style questions ("Are these peptides for human use?") — the answer
      // clarifies they're not. A "?" right after the phrase marks a question.
      if (r.skipQuestion && text.slice(m.index + m[0].length, m.index + m[0].length + 3).includes('?')) continue;
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
  const text = ' ' + visibleText(html) + ' ';
  const { hard, warnings } = scanText(text);
  let missingDisclaimer = false;
  if (opts.requireDisclaimer) {
    missingDisclaimer = !DISCLAIMER_HINTS.some((h) => text.includes(h));
  }
  return { pass: hard.length === 0 && !missingDisclaimer, hard, warnings, missingDisclaimer };
}

// Does a site path need the research-use disclaimer present?
function pathNeedsDisclaimer(p) {
  return /\/compounds\//.test(p) || /\/guides\//.test(p) || /\/stacks\//.test(p);
}

module.exports = { scanText, scanHtml, visibleText, pathNeedsDisclaimer, HARD, WARN, DISCLAIMER_HINTS };
