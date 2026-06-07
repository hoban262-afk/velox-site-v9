# Velox Design Lab — Property Prediction Scope

**Goal:** move the result cards from ad-hoc heuristics ("score theatre") to *defensible, cited, real* property prediction — without overclaiming. Every number stays a **computational prediction for in vitro research**, never an efficacy or human-use claim.

**Guiding rule for all phases:** show the *method* and a *confidence/origin* next to every number. "Predicted aggregation propensity (AGGRESCAN-style, in vitro guide)" beats a bare bar every time. Credibility comes from sourcing, not bigger numbers.

---

## Where we are today (the baseline being replaced)

In `lib/design-lab.js`, the displayed properties are:
- **Real & fine:** `calcPI` (Henderson–Hasselbalch), `gravy` (Kyte–Doolittle GRAVY), `hydrophobicMoment`, net charge at pH 7.4 — these are legitimate.
- **Ad-hoc / weak:** "Dissolves in water" (`so` = charge-count arithmetic), "Building-block variety" (`dv`, arbitrary /14 cap), the composite "make-ability" weights, `estHalfLife` (N-end first-residue lookup), `proteaseRisk` (simple regex). They're plausible-looking but not grounded in published methods.

The honest framing fixes already shipped (make-ability relabel, in-vitro half-life note). This scope is about replacing the *weak* items with real methods and adding genuinely useful new signal.

---

## Phase 1 — Defensible biophysics (no new infrastructure)

Replace the ad-hoc maths with **established, citable algorithms computed in Node** — the same ones ExPASy ProtParam, Expasy, and peptide-property packages use. No ML, no external calls, runs inside the existing serverless function.

**Add / upgrade (all deterministic, literature-standard):**
- **Instability index** (Guruprasad 1990) — predicts whether a peptide is stable in a test tube; threshold-based, widely cited.
- **Aliphatic index** (Ikai 1980) — thermostability proxy.
- **Boman index** (potential protein-binding) — relevant to bioactive peptides.
- **Aggregation propensity** — port a published per-residue β-aggregation scale (AGGRESCAN-style / Pawar–Chiti intrinsic scales). Gives a real "will it clump / be hard to dissolve" signal, replacing the charge-only `so`.
- **SPPS synthesis-difficulty** — replace cost guesswork with documented "difficult sequence" rules (β-sheet-prone stretches, consecutive bulky/β-branched residues, Cys/Met oxidation risk, Asp-Pro/Asn-Gly liabilities). This is exactly what a peptide chemist judges by, and it's literature-backed.
- **Extinction coefficient / molecular weight / true solubility class** (proper Henderson–Hasselbalch + hydrophobicity, not a linear charge formula).
- **Keep & cite:** pI, GRAVY, hydrophobic moment, net-charge curve.

**UX changes:** each property gets a one-line method + source on hover; group into "Make & handle" vs "Predicted behaviour"; drop the single composite hero number or keep it strictly as "make-ability" (already done).

**Validation:** backtest every metric against the 92-peptide reference library and against ExPASy ProtParam for ~15 sequences — must match ProtParam within rounding. Ship a small `node` test that asserts parity.

**Effort:** ~2–3 focused days. **Infra/cost:** none. **Risk:** low. **This is the recommended first move** — biggest credibility gain per unit effort, zero new dependencies, and it makes the tool legitimately useful to a chemist.

---

## Phase 2 — Learned signal via protein embeddings (one hosted dependency)

Add **ESM-2 embeddings** through a hosted inference API (we have no GPU; can't run it inline). Providers to price-check: Hugging Face Inference, BioLM, Replicate, NVIDIA BioNeMo. Use the small/mid model (8M–35M) — fast, cheap, plenty for short peptides.

**What embeddings unlock that heuristics can't:**
- **"Closest functional analog"** — cosine-distance of the design's embedding against an embedded library of known peptides. This is a far better novelty + cross-sell signal than the current exact/edit-distance string match (catches *functional* similarity, not just spelling), and directly improves the "closest compound you can order" mapping.
- **Learned solubility / aggregation** — a light regressor on top of embeddings, trained on public solubility datasets, beats the Phase-1 scale for borderline cases.

**Infra to design:** provider + API key (Velox-side, like the Anthropic key), a 1–2s latency budget added to each run, response caching keyed by sequence (embeddings are deterministic → cache aggressively in Supabase), and graceful fail-open (fall back to Phase-1 metrics if the embedding call errors, so a run never breaks).

**Effort:** ~3–5 days (integration + caching + the analog search). **Cost:** low per call at small model sizes — *verify current pricing before committing.* **Risk:** medium (external dependency, latency, cost monitoring).

---

## Phase 3 — Activity-class predictors (the real moat)

Predict the **propensities Velox customers actually care about**, framed strictly as in-vitro likelihoods, not efficacy:
- **Antimicrobial propensity** (datasets: DBAASP, APD3) — mature, well-validated ML territory.
- **Cell-penetrating propensity** (CPPsite 2.0; published ESM-2/ProtBERT fusion models report AUC ~0.98) — strong precedent.
- **Velox-relevant classes** (collagen/skin-signal, metabolic) where public data supports it.

**Serving options:** (a) tiny logistic/gradient-boosted models exported to run in JS from embedding features (no new service), or (b) a small Python microservice (separate from Vercel) if models get heavier. Start with (a).

**Compliance is load-bearing here:** every output must read as "predicted *in vitro* propensity / structural similarity to known actives," never "this peptide will do X." Each prediction shows training-data provenance and an explicit "not validated, not for human use" note.

**Effort:** ~1–3 weeks per class (data prep, training, validation, calibration, UX, copy review) + ongoing maintenance as datasets update. **Risk:** higher — accuracy claims must be honest and calibrated, and this is the part that needs the most careful framing.

---

## Adjacent (cheap, high trust): real novelty / IP check

Independent of the above, swap the 92-entry library for (or supplement with) a **live UniProt lookup** so "no match" means something stronger, and add an explicit "this is not a patent search — consult an IP professional before commercialising" line. ~1 day; meaningfully de-risks the novelty claim.

---

## Recommended sequencing

1. **Phase 1** now — defensible biophysics + validation. Standalone shippable win.
2. **Adjacent UniProt novelty** — quick, pairs naturally with Phase 1's reference work.
3. **Phase 2** — embeddings for functional-analog matching (also improves cross-sell, so it pays for itself).
4. **Phase 3** — one activity class first (antimicrobial *or* CPP, whichever matches your audience), prove the pattern, then expand.

## Decisions needed from you

- **Appetite for an external ML dependency + small recurring cost** (gates Phases 2–3). If no, Phase 1 + UniProt still delivers a genuinely credible tool.
- **Which activity class matters most** to your buyers (drives Phase 3 priority).
- **Build vs. partner** on the activity models — train in-house on public data, or integrate an existing predictor.
