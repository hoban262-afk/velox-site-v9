/**
 * lib/design-lab.js — the Velox Design Lab engine (shared, server-side).
 *
 * Ports the peptide design + scoring logic to Node so generation runs on VELOX's
 * Anthropic key (not the visitor's), gated by membership tier. Pure functions +
 * prompt builders + tier limits. Lives outside /api so Vercel doesn't count it.
 *
 * All outputs are computational predictions for in vitro research only.
 */
const MODEL = process.env.DESIGN_LAB_MODEL || 'claude-haiku-4-5-20251001';

// ── Tier usage limits ────────────────────────────────────────────────────────
// free: 1 lifetime (try it). solo: 4/month. group: 20/month.
// lab: marketed as "unlimited" but carries a 300/month fair-use backstop (~10/day)
// so there is no truly uncapped lane. Genuine high-volume users are invited to
// contact us rather than being hard-blocked with an "upgrade" message.
const LIMITS = {
  free:  { limit: 1,   window: 'lifetime', label: 'Free' },
  solo:  { limit: 4,   window: 'month',    label: 'Solo Researcher' },
  group: { limit: 20,  window: 'month',    label: 'Group Researchers' },
  lab:   { limit: 300, window: 'month',    label: 'Lab Researchers', fairUse: true },
};
function limitsFor(tier) { return LIMITS[tier] || LIMITS.free; }

// ── Reference peptide library (novelty cross-check) ──────────────────────────
// This is a curated REFERENCE LIBRARY of well-known research/therapeutic peptides
// used to flag obvious overlaps. It is NOT a patent or exhaustive novelty search —
// "no match" means "not in our reference library", not "provably new". Copy that
// faces the user must reflect that. Sequences are canonical/representative active
// fragments in single-letter code (non-standard residues approximated).
const KNOWN_PEPTIDES = [
  // Cosmetic / skin / repair
  ['GHK (copper tripeptide)','GHK'],['AHK (copper)','AHK'],['Matrixyl (KTTKS)','KTTKS'],
  ['Argireline (acetyl hexapeptide-8)','EEMQRR'],['SNAP-8','EEMQRRADE'],['Leuphasyl','YAGFL'],
  ['BPC-157','GEPPPGKPADDAGLV'],['KPV','KPV'],['Thymosin Beta-4 core','LKKTETQ'],
  ['TB-500 active fragment','LKKTETQEK'],['Follistatin-315 frag','CRMKKLF'],
  // Longevity / mitochondrial / pineal
  ['Epithalon','AEDG'],['Pinealon','EDR'],['Vesugen','KED'],['Vilon','KE'],
  ['SS-31 (Elamipretide)','DRWFY'],['MOTS-c','MRWQEMGYIFYPRKLR'],
  ['Humanin','MAPRGFSCLLLLTSEIDLPVKRRA'],['P21','AEDGPKFLSYLESR'],
  // Growth-hormone secretagogues / GHRH
  ['Hexarelin','HWAWFK'],['GHRP-6 core','HWAWFK'],['GHRP-2 core','AAWFK'],['Ipamorelin core','AIBHDFK'],
  ['Sermorelin (GRF 1-29)','YADAIFTNSYRKVLGQLSARKLLQDIMSR'],['CJC-1295 core','HADAIFTNSYRKVLDAQSK'],
  ['Tesamorelin core','YADAIFTNSYRKVL'],['MGF E peptide','YQPPSTNKNTKSQRERKGSTFEEHK'],
  ['IGF-1 LR3 active site','GPETLCGAELVDALQ'],['AOD-9604 (hGH 177-191)','YLRIVQCRSVEGSCGF'],
  // Thymic / immune
  ['Thymosin Alpha-1','SDAAVDTSSEITTKDLKEKKEVVEEAEN'],['Thymopentin (TP-5)','RKDVY'],
  ['Tuftsin','TKPR'],['Splenopentin','RKEVY'],
  // Nootropic
  ['Semax','MEHFPGP'],['Selank','TKPRPGP'],
  // Melanocortin
  ['Alpha-MSH','SYSMEHFRWGKPV'],['Melanotan I (afamelanotide) core','SYSMEHFRWGKPV'],
  ['Melanotan II / PT-141 core','SYSMEHFRWGKPV'],['ACTH 1-24','SYSMEHFRWGKPVGKKRRPVKVYP'],
  // Neuropeptides
  ['Substance P','RPKPQQFFGLM'],['Neurotensin','QLYENKPRRPYIL'],['Bradykinin','RPPGFSPFR'],
  ['Bombesin','QQRLGNQWAVGHLM'],['Met-enkephalin','YGGFM'],['Leu-enkephalin','YGGFL'],
  ['Dynorphin A','YGGFLRRIRPKLK'],['Beta-endorphin frag','YGGFMTSEKSQTPLVT'],['Dermorphin','YAFGYPS'],
  // Reproductive / hypothalamic
  ['GnRH (gonadorelin)','QHWSYGLRPG'],['Triptorelin','QHWSYWLRPG'],['Leuprolide','QHWSYLLRP'],
  ['Kisspeptin-10','YNWNSFGLRF'],['Oxytocin','CYIQNCPLG'],['Vasopressin','CYFQNCPRG'],
  // Cardiovascular / vasoactive
  ['Angiotensin II','DRVYIHPF'],['Angiotensin 1-7','DRVYIHP'],['VIP fragment','HSDAVFTDNYTR'],
  ['BNP (nesiritide)','SPKMVQGSGCFGRKMDRISSSSGLGCKVLRRH'],['Bivalirudin','FPRPGGGGNGDFEEIPEEYL'],
  // Incretin / metabolic
  ['GLP-1 (7-37)','HAEGTFTSDVSSYLEGQAAKEFIAWLVKGRG'],['Semaglutide backbone','HAEGTFTSDVSSYLEGQAAKEFIAWLVKGR'],
  ['Exenatide','HGEGTFTSDLSKQMEEEAVRLFIEWLKNGGPSSGAPPPS'],['Glucagon','HSQGTFTSDYSKYLDSRRAQDFVQWLMNT'],
  ['GIP core','YAEGTFISDYSIAMDKIHQQDFVNWLLAQK'],['Secretin','HSDGTFTSELSRLREGARLQRLLQGLV'],
  ['PACAP-27','HSDGIFTDSYSRYRKQMAVKKYLAAVL'],['Amylin (pramlintide)','KCNTATCATQRLANFLVHSSNNFGAILSSTNVGSNTY'],
  // Endocrine
  ['Teriparatide (PTH 1-34)','SVSEIQLMHNLGKHLNSMERVEWLRKKLQDVHNF'],
  ['Calcitonin (salmon)','CSNLSTCVLGKLSQELHKLQTYPRTNTGSGTP'],
  ['Somatostatin-14','AGCKNFFWKTFTSC'],['Octreotide','FCFWKTCT'],
  ['Insulin A-chain','GIVEQCCTSICSLYQLENYCN'],['Insulin B-chain','FVNQHLCGSHLVEALYLVCGERGFFYTPKT'],
  ['Ghrelin','GSSFLSPEHQRVQQRKESKKPPAKLQPR'],['Glutathione','ECG'],
  // Antimicrobial / cell-penetrating
  ['LL-37','LLGDFFRKSKEKIGKEFKRIVQRIKDFLRNLVPRTES'],['Magainin 2','GIGKFLHSAKKFGKAFVGEIMNS'],
  ['Melittin','GIGAVLKVLTTGLPALISWIKRKRQQ'],['Indolicidin','ILPWKWPWWPWRR'],
  ['Pexiganan (MSI-78)','GIGKFLKKAKKFGKAFVKILKK'],['Protegrin-1','RGGRLCYCRRRFCVCVGR'],
  ['HNP-1 defensin','ACYCRIPACIAGERRYGTCIYQGRLWAFCC'],['Cecropin A','KWKLFKKIEKVGQNIRDGIIKAGPAVAVVGQATQIAK'],
  ['TAT (47-57)','YGRKKRRQRRR'],['Penetratin','RQIKIWFQNRRMKWKK'],['Polyarginine R8','RRRRRRRR'],
  // Adhesion / targeting motifs
  ['RGD motif','RGD'],['Cilengitide core','RGDFV'],['Adipotide','CKGGRAKDC'],
  // GI
  ['Linaclotide','CCEYCCNPACTGCY'],['DSIP','WAGGDASGE'],['Sleep peptide (DSIP)','WAGGDASGE'],
];

const HYD = new Set([...'AILMFWPV']);
const GRAVY_TBL = {A:1.8,R:-4.5,N:-3.5,D:-3.5,C:2.5,Q:-3.5,E:-3.5,G:-0.4,H:-3.2,I:4.5,L:3.8,K:-3.9,M:1.9,F:2.8,P:-1.6,S:-0.8,T:-0.7,W:-0.9,Y:-1.3,V:4.2};

function sanitizeSeq(seq) {
  if (!seq) return '';
  return String(seq).replace(/^Ac[-\s]*/i, '').replace(/[-\s]*NH2$/i, '').replace(/^[a-z]{1,4}-/i, '')
    .replace(/[-\s]/g, '').toUpperCase().replace(/[^ACDEFGHIKLMNPQRSTVWY]/g, '');
}
function extractJSON(raw) {
  let t = String(raw || '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(t); } catch (e) {}
  const ob = t.indexOf('{'), oe = t.lastIndexOf('}');
  if (ob !== -1 && oe > ob) { try { return JSON.parse(t.slice(ob, oe + 1)); } catch (e) {} }
  const ab = t.indexOf('['), ae = t.lastIndexOf(']');
  if (ab !== -1 && ae > ab) { try { return JSON.parse(t.slice(ab, ae + 1)); } catch (e) {} }
  return null;
}
// Salvage as many complete top-level {...} objects as possible from a (possibly
// truncated or prose-wrapped) model response. Tolerates a cut-off final object,
// trailing junk, and braces/quotes inside string values. Used as a fallback when
// strict JSON.parse fails on the larger multi-field generation output.
function salvageObjects(raw) {
  const t = String(raw || '').replace(/```json\s*/gi, '').replace(/```\s*/g, '');
  const out = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') { if (depth === 0) start = i; depth++; }
    else if (ch === '}') {
      if (depth > 0) depth--;
      if (depth === 0 && start !== -1) {
        try { out.push(JSON.parse(t.slice(start, i + 1))); } catch (e) {}
        start = -1;
      }
    }
  }
  return out;
}

function gravy(seq) { const s = [...seq].reduce((a, c) => a + (GRAVY_TBL[c] || 0), 0); return Math.round(s / seq.length * 100) / 100; }
function proteaseRisk(seq) {
  const r = [];
  if (/[KR](?!P)/.test(seq)) r.push('Trypsin');
  if (/[FWY]/.test(seq)) r.push('Chymotrypsin');
  if (/^[FWY]/.test(seq) || /[FWY]$/.test(seq)) r.push('Terminal Chymotrypsin');
  return r.length ? r.join(', ') : 'Low';
}
function editDistance(a, b) {
  const m = a.length, n = b.length, dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}
function checkNovelty(seq) {
  const s = seq.toUpperCase(); const matches = [];
  for (const [name, kseq] of KNOWN_PEPTIDES) {
    const ks = kseq.toUpperCase();
    if (s === ks) return { status: 'exact', label: `Exact match: ${name}`, badge: 'known', match: { name, pct: 100, type: 'exact' } };
    if (s.includes(ks) && ks.length >= 3) matches.push({ name, type: 'contains', pct: Math.round(ks.length / s.length * 100) });
    else if (ks.includes(s) && s.length >= 3) matches.push({ name, type: 'fragment', pct: Math.round(s.length / ks.length * 100) });
    else if (Math.abs(s.length - ks.length) <= 2 && s.length >= 4) {
      const sim = Math.round((1 - editDistance(s, ks) / Math.max(s.length, ks.length)) * 100);
      if (sim >= 75) matches.push({ name, type: 'similar', pct: sim });
    }
  }
  if (!matches.length) return { status: 'novel', label: `No match in our ${KNOWN_PEPTIDES.length}-peptide reference library`, badge: 'novel', match: null };
  matches.sort((a, b) => b.pct - a.pct); const t = matches[0];
  const tl = t.type === 'contains' ? 'Contains' : t.type === 'fragment' ? 'Fragment of' : 'Similar to';
  return { status: 'partial', label: `${tl} ${t.name} (${t.pct}%)`, badge: 'partial', match: { name: t.name, pct: t.pct, type: t.type } };
}
function score(seq) {
  const len = seq.length, cys = (seq.match(/C/g) || []).length, pos = (seq.match(/[KRH]/g) || []).length,
    neg = (seq.match(/[DE]/g) || []).length, hyd = [...seq].filter(a => HYD.has(a)).length, uniq = new Set([...seq]).size;
  const sy = cys > 2 ? 35 : cys === 2 ? 62 : cys === 1 ? 82 : 96;
  const ls = (len >= 6 && len <= 20) ? 100 : (len >= 4 && len <= 26) ? 70 : 45;
  const so = Math.max(30, Math.min(100, Math.round(50 + (pos + neg - hyd * 0.5) * 9)));
  const dv = Math.round((uniq / Math.min(len, 14)) * 100);
  const comp = Math.round(sy * 0.35 + ls * 0.25 + so * 0.2 + dv * 0.2);
  const cost = 75 + len * 7 + cys * 20 + (seq.includes('W') ? 15 : 0) + (seq.includes('M') ? 8 : 0);
  return { comp, sy, ls, so, dv, cost, len, netCharge: pos - neg, gravyScore: gravy(seq), protRisk: proteaseRisk(seq) };
}

// ── Compliance scrub ─────────────────────────────────────────────────────────
// Safety net over model free-text: neutralise human-use / in-vivo / therapeutic
// phrasing so nothing reads as a medical or human-use claim. The prompts already
// ask for in-vitro framing; this guarantees it server-side.
const CLAIM_SWAPS = [
  [/\bin vivo\b/gi, 'in vitro'],
  [/\bin the body\b/gi, 'in a lab dish'],
  [/\bin a body\b/gi, 'in a lab dish'],
  [/\bin humans?\b/gi, 'in lab tests'],
  [/\bpatients?\b/gi, 'research samples'],
  [/\bclinical(ly)?\b/gi, 'preclinical$1'],
  [/\b(cure|cures|curing|cured)\b/gi, 'affect'],
  [/\b(treat|treats|treating|treated)\b/gi, 'act on'],
  [/\b(heal|heals|healing|healed)\b/gi, 'support repair of'],
  [/\b(therapy|therapies|therapeutic)\b/gi, 'research'],
  [/\b(disease|diseases|illness|illnesses)\b/gi, 'condition studied'],
  [/\bdiagnos(e|es|ing|is)\b/gi, 'study'],
];
function scrubClaims(s) { if (s == null) return s; let t = String(s); for (const [re, rep] of CLAIM_SWAPS) t = t.replace(re, rep); return t; }
function scrubField(v) { return Array.isArray(v) ? v.map(scrubClaims) : scrubClaims(v); }
function scrubCandidate(c) {
  if (!c || typeof c !== 'object') return c;
  const fields = ['plain_summary', 'relates_to_request', 'design_reasoning', 'research_hypothesis', 'rationale', 'name', 'style', 'scaffold_class'];
  const arrs = ['how_it_helps', 'why_might_not', 'strengths', 'watch_outs', 'key_features'];
  const out = { ...c };
  for (const f of fields) if (out[f] != null) out[f] = scrubClaims(out[f]);
  for (const a of arrs) if (out[a] != null) out[a] = scrubField(out[a]);
  return out;
}

// ── Prompts ──────────────────────────────────────────────────────────────────
function briefPrompt(input) {
  return `You are Velox Design Lab's target interpretation engine for a peptide design research platform. All outputs for in vitro (in a lab dish, not in a body) research only — no therapeutic or human-use claims.

PLAIN-LANGUAGE RULE (most important): Write EVERY worded field so a curious 10-year-old who knows no science fully understands it. Short, simple sentences and common words. A peptide is a tiny chain made of "building blocks" (scientists call them "amino acids"). The second you use any science-y word, explain it right after in brackets in kid words — e.g. "peptide (a tiny chain made of building blocks)", "water-avoiding (it won't mix into water, like oil)", "in vitro (in a lab dish, not in a body)". Never leave a hard word unexplained.

RELEVANCE CHECK (do this first): Decide whether the input is genuinely a request to design a research peptide for some goal/target. If it is gibberish, empty, a test like "asdf", off-topic (a recipe, a joke, a general question), or has no usable research goal, set "usable" to false and give a one-line plain "reason" telling the person what to type instead (e.g. "Try describing what you want the peptide to do, like 'something that helps skin cells make more collagen'."). Otherwise set "usable" to true.

Convert the researcher's description into a short, plain structured brief. Return ONLY the JSON object, no preamble, no markdown.
{"usable":true,"reason":"","target_mechanism":"one or two plain sentences: what the researcher wants the peptide to DO and roughly how it might do it, in everyday words","desired_properties":["up to 4 short plain-English goals, e.g. 'dissolves easily in water'"],"reference_compounds":["up to 3 existing peptide names to learn from"],"optimal_length":{"min":6,"max":20},"key_residues":["up to 4 building blocks that matter, each as its single letter plus a plain note, e.g. 'K (lysine — adds a positive charge)'"],"design_rationale":"one plain sentence on the overall plan","scaffold_classes":["3 different plain-English shapes/styles to try, e.g. 'a short, sturdy loop'"]}
Input: ${input}`;
}
function generatePrompt(brief) {
  return `You are Velox Design Lab's sequence generation engine. All outputs for in vitro (in a lab dish, not in a body or a person) research use only.
Research brief: ${JSON.stringify(brief)}
The researcher asked for this, in their own words: ${JSON.stringify(brief.target_mechanism || '')}

Generate EXACTLY 3 new peptide ideas. The 3 MUST be clearly different from each other:
- 3 DIFFERENT styles/shapes — never 3 versions of the same idea
- 3 different sizes — make one short (about 6-8 building blocks), one medium (about 10-14), one longer (about 15-20)
- 3 different "feels" — for example one with a positive electric charge, one that mostly avoids water, and one that is a mix
- Each one is its own separate idea a scientist could test on its own

WRITE FOR A 10-YEAR-OLD. This is the MOST important rule — if a 10-year-old who knows no science can't follow it, rewrite it. How:
- Short, simple sentences. Common everyday words. No showing off.
- A peptide is a tiny chain. The chain is made of "building blocks" (scientists call these "amino acids"). Each CAPITAL LETTER in the sequence is ONE building block. Always say "building block", and the first time you use it in a field add "(amino acid)".
- The SECOND you use any other science-y word, explain it right after in brackets using kid words. Examples you should follow:
  · "water-loving (it mixes into water easily, like sugar does)"
  · "water-avoiding (it won't mix into water, like oil)"
  · "dissolve (melt into the liquid until you can't see it)"
  · "enzymes (tiny scissors in the body that can snip chains apart)"
  · "positive charge (a tiny electric pull, like one end of a magnet)"
- NEVER use these words without a kid explanation right after: residue, hydrophobic, hydrophilic, amphipathic, cationic, anionic, protease, peptidase, terminus, motif, scaffold, receptor, permeability, bioavailability, stability.
- No abbreviations you haven't just explained.

Return ONLY a JSON array of 3 objects, no preamble, no markdown:
[{"id":"VDL-001","sequence":"GPQGPAGPK","style":"a SHORT kid-friendly description of its shape/feel, no science words, e.g. 'a small oily chain' or 'a short springy loop'","name":"a short friendly name","plain_summary":"ONE simple sentence a 10-year-old instantly gets, summing up this idea","relates_to_request":"2-3 simple sentences clearly explaining WHY this idea matches what the researcher asked for — tie it directly to their actual words","how_it_helps":["2-3 simple bullet points: HOW this chain might actually do what they asked for, in kid words, each one pointing to real letters/parts of the chain"],"why_might_not":["2-3 honest, simple bullet points: real reasons it might NOT work (for example: the body's tiny scissors (enzymes) could cut it at a certain spot; it might not melt into water well; it could be tricky or pricey to build)"],"design_reasoning":"2-3 simple sentences: why the AI picked these exact building blocks, pointing to specific letters and what each one is for, in kid words","research_hypothesis":"one simple sentence: what a scientist might actually SEE happen in a lab dish if they tested it"}]

Critical sequence rules:
- sequence field: ONLY single-letter amino-acid codes (A C D E F G H I K L M N P Q R S T V W Y) — uppercase only, no dashes, spaces, numbers, no Ac- prefix, no -NH2 suffix
- 6-20 building blocks, at most one C, no chemical-modification notation
- Keep every explanation honest and specific to THAT exact chain — never repeat the same lines across the 3`;
}

function refinePrompt(brief, candidate, instruction) {
  const ctx = candidate
    ? `Parent candidate:\n- Name: ${candidate.name || 'Unnamed'}\n- Sequence: ${candidate.sequence}\n- Rationale: ${candidate.rationale || ''}\n- Key features: ${(candidate.key_features || []).join(', ')}`
    : 'No specific parent candidate provided — generate improved variants of the general design brief.';
  const briefCtx = brief
    ? `Original design brief:\n${JSON.stringify(brief)}\n\n`
    : '';
  return `You are Velox Design Lab's refinement engine. All outputs for in vitro research use only.

${briefCtx}${ctx}

Researcher instruction: "${instruction}"

Generate EXACTLY 6 refined peptide sequences that address the instruction while staying true to the original design goal.
Each refined candidate must be meaningfully different from the parent (not just a trivially shifted version).
Apply the same diversity rules as new generation: vary length, charge, scaffold class.

PLAIN-LANGUAGE RULE: Write every worded field so a smart non-scientist fully understands it. Explain any technical term in plain brackets right after it.

Return ONLY a JSON array, no preamble, no markdown:
[{"id":"VDL-R01","sequence":"GPQGPAGPK","scaffold_class":"the structural class","name":"short name","rationale":"one sentence on how this addresses the instruction","key_features":["up to 3 features"],"research_hypothesis":"specific testable in vitro prediction","design_reasoning":"2-3 plain sentences: WHY this sequence, connecting specific residues to the instruction and the research goal","strengths":["3 concrete strengths specific to THIS sequence — reference its actual residues, length, or charge"],"watch_outs":["2 honest weaknesses specific to THIS sequence"]}]

Critical rules:
- sequence: ONLY single-letter AA codes (A C D E F G H I K L M N P Q R S T V W Y), uppercase, no modifications notation
- 6-20 residues, max 1 Cys per sequence
- ids: use VDL-R01 through VDL-R06`;
}

module.exports = {
  MODEL, LIMITS, limitsFor, KNOWN_PEPTIDES,
  sanitizeSeq, extractJSON, salvageObjects, score, checkNovelty, gravy, proteaseRisk,
  scrubClaims, scrubCandidate,
  briefPrompt, generatePrompt, refinePrompt,
};
