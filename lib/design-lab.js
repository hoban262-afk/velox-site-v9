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
// free: 1 lifetime (try it). solo: 4/month. group: 20/month. lab: unlimited.
const LIMITS = {
  free:  { limit: 1,        window: 'lifetime', label: 'Free' },
  solo:  { limit: 4,        window: 'month',    label: 'Solo Researcher' },
  group: { limit: 20,       window: 'month',    label: 'Group Researchers' },
  lab:   { limit: Infinity, window: 'month',    label: 'Lab Researchers' },
};
function limitsFor(tier) { return LIMITS[tier] || LIMITS.free; }

// ── Known research peptides (novelty cross-check) ────────────────────────────
const KNOWN_PEPTIDES = [
  ['GHK (copper tripeptide)','GHK'],['Epithalon','AEDG'],['KPV','KPV'],['Matrixyl (KTTKS)','KTTKS'],
  ['Argireline','EEMQRR'],['BPC-157','GEPPPGKPADDAGLV'],['Semax','MEHFPGP'],['Selank','TKPRPGP'],
  ['Hexarelin','HWAWFK'],['GHRP-6 core','HWAWFK'],['Thymosin Alpha-1','SDAAVDTSSEITTKDLKEKKEVVEEAEN'],
  ['Thymosin Beta-4 core','LKKTETQ'],['SS-31','DRWFY'],['MOTS-c','MRWQEMGYIFYPRKLR'],
  ['Humanin','MAPRGFSCLLLLTSEIDLPVKRRA'],['LL-37','LLGDFFRKSKEKIGKEFKRIVQRIKDFLRNLVPRTES'],
  ['Leuphasyl','YAGFL'],['Snap-8','EEMQRRADE'],['P21','AEDGPKFLSYLESR'],['Follistatin-315 frag','CRMKKLF'],
  ['IGF-1 Lr3 active site','GPETLCGAELVDALQ'],['MGF E peptide','YQPPSTNKNTKSQRERKGSTFEEHK'],
  ['VIP fragment','HSDAVFTDNYTR'],['CJC-1295 core','HADAIFTNSYRKVLDAQSK'],['Ipamorelin core','AIBHDFK'],
  ['PT-141 core','SYSMEHFRWGKPV'],['MT-II core','SYSMEHFRWGKPV'],['Oxytocin','CYIQNCPLG'],
  ['TB-500 active fragment','LKKTETQEK'],
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
    if (s === ks) return { status: 'exact', label: `Exact match: ${name}`, badge: 'known' };
    if (s.includes(ks) && ks.length >= 3) matches.push({ name, type: 'contains', pct: Math.round(ks.length / s.length * 100) });
    else if (ks.includes(s) && s.length >= 3) matches.push({ name, type: 'fragment', pct: Math.round(s.length / ks.length * 100) });
    else if (Math.abs(s.length - ks.length) <= 2 && s.length >= 4) {
      const sim = Math.round((1 - editDistance(s, ks) / Math.max(s.length, ks.length)) * 100);
      if (sim >= 75) matches.push({ name, type: 'similar', pct: sim });
    }
  }
  if (!matches.length) return { status: 'novel', label: 'No match in research peptide database', badge: 'novel' };
  matches.sort((a, b) => b.pct - a.pct); const t = matches[0];
  const tl = t.type === 'contains' ? 'Contains' : t.type === 'fragment' ? 'Fragment of' : 'Similar to';
  return { status: 'partial', label: `${tl} ${t.name} (${t.pct}%)`, badge: 'partial' };
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

// ── Prompts ──────────────────────────────────────────────────────────────────
function briefPrompt(input) {
  return `You are Velox Design Lab's target interpretation engine for a peptide design research platform. All outputs for in vitro (in a lab dish, not in a body) research only — no therapeutic or human-use claims.

PLAIN-LANGUAGE RULE (most important): Write EVERY worded field so a smart 15-year-old with zero biology background fully understands it. Use short, everyday sentences. If you use ANY scientific word, explain it in plain words in brackets right after it — e.g. "peptide (a tiny chain of building blocks called amino acids)", "hydrophobic (water-avoiding)", "in vitro (in a lab dish)". Never leave a technical term unexplained. Avoid bare jargon completely.

Convert the researcher's description into a short, plain structured brief. Return ONLY the JSON object, no preamble, no markdown.
{"target_mechanism":"one or two plain sentences: what the researcher wants the peptide to DO and roughly how it might do it, in everyday words","desired_properties":["up to 4 short plain-English goals, e.g. 'dissolves easily in water'"],"reference_compounds":["up to 3 existing peptide names to learn from"],"optimal_length":{"min":6,"max":20},"key_residues":["up to 4 building blocks that matter, each as its single letter plus a plain note, e.g. 'K (lysine — adds a positive charge)'"],"design_rationale":"one plain sentence on the overall plan","scaffold_classes":["3 different plain-English shapes/styles to try, e.g. 'a short, sturdy loop'"]}
Input: ${input}`;
}
function generatePrompt(brief) {
  return `You are Velox Design Lab's sequence generation engine. All outputs for in vitro research use only.
Research brief: ${JSON.stringify(brief)}
Generate EXACTLY 6 novel peptide sequences. MANDATORY DIVERSITY REQUIREMENTS:
- Generate across at least 3 DIFFERENT scaffold types — do NOT generate 6 variants of the same reference compound
- Include sequences of different lengths: at least one 6-8 residue, one 10-14 residue, one 15-20 residue
- Vary charge profiles: include at least one cationic (net charge >=+2), one hydrophobic-dominant, one amphipathic
- Each sequence must represent a distinct, independently testable structural hypothesis
Return ONLY a JSON array, no preamble, no markdown:
[{"id":"VDL-001","sequence":"GPQGPAGPK","scaffold_class":"the structural class","name":"short name","rationale":"one sentence design logic","key_features":["up to 3 features"],"research_hypothesis":"specific testable in vitro prediction","design_reasoning":"2-3 sentences in plain English explaining WHY this exact sequence was built this way — connect specific residues or motifs to what they are meant to achieve mechanistically. Write so a smart non-scientist understands; if you use a technical term, explain it in the same breath.","strengths":["3-4 concrete reasons this candidate is promising, EACH specific to THIS sequence (reference its actual residues, length, charge or motifs) — not generic praise. Plain English."],"watch_outs":["2-3 honest weaknesses or risks specific to THIS sequence — e.g. a likely protease-cut site, poor predicted solubility, a hard-to-make stretch, or off-target ambiguity. Be candid; this builds trust. Plain English."]}]
Critical rules:
- sequence field: ONLY single-letter AA codes (A C D E F G H I K L M N P Q R S T V W Y) — no Ac- prefix, no -NH2 suffix, no dashes, spaces or numbers, uppercase only
- 6-20 residues, max 1 Cys per sequence, no chemical modification notation
- strengths and watch_outs must be honest and sequence-specific — never repeat the same line across candidates`;
}

module.exports = {
  MODEL, LIMITS, limitsFor, KNOWN_PEPTIDES,
  sanitizeSeq, extractJSON, salvageObjects, score, checkNovelty, gravy, proteaseRisk,
  briefPrompt, generatePrompt,
};
