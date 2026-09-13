# Meta Ads Build Pack — ready to paste

*Written 12 September 2026. This is the execution companion to
`ADS-CAMPAIGN-PLAN.md` — that file is the why, this one is the exact clicks
and the exact copy. Work top to bottom.*

---

## 0. Prerequisites — do not skip

- [ ] **Pixel activation** (the code is live and dormant on the site):
  1. Meta Events Manager → create pixel → copy the ID.
  2. Paste it into `VP_FB_PIXEL_ID` in `output/assets/js/core.js`, commit, push.
  3. Vercel env: add `META_PIXEL_ID` and `META_CAPI_TOKEN` (Events Manager →
     Settings → Conversions API → Generate access token).
  4. Optional while verifying: `META_CAPI_TEST_CODE` — **remove it after**,
     test-coded events are excluded from optimisation.
- [ ] **Verify events**: browse the live site, add to cart, reach checkout.
  Events Manager should show PageView, ViewContent, AddToCart,
  InitiateCheckout each **deduplicated** (one browser + one server event
  collapsing into one). If you see doubles, stop and tell Claude.
- [ ] **Entity decision made** (`ADS-CAMPAIGN-PLAN.md` §7). Resolve before the
  first ad goes live, not after.
- [ ] Ad account: business account, GBP, 2FA on, backup admin (Luke).

---

## 0.5 Policy probe — one ad, £5/day, before you build anything else

*Added 13 September 2026. Reason: 2026 enforcement data shows **64% of
supplement ad accounts were reviewed at least once in Q1 2026, up 41%
quarter-on-quarter**. Assume you will be reviewed. Several industry sources
state flatly that Meta prohibits peptide advertising — our copy is written to
survive review, but approval is not guaranteed. Find that out for £15, not
after building ten ad placements and teaching the account to expect
rejections.*

**Build exactly this and nothing more:**

| Setting | Value |
|---|---|
| Campaign | `VP-Policy-Probe-2026-09` (separate campaign — delete it after) |
| Objective | Sales → InitiateCheckout (same as the real thing) |
| Ad set | `probe` · £5/day · UK · 25–55 · no interests |
| Ad | **`static_publiccoa` only** (§4 Ad 2) — most defensible creative: educational destination, zero product claims |
| Destination | `https://veloxpeps.com/about/coa-library/` |

**Read it like this:**

| Outcome | Meaning | Do |
|---|---|---|
| Approved, runs 72h clean | Category risk is manageable | Build §1–§4 in full, launch the £336 test. Kill the probe campaign. |
| Approved, then flagged mid-flight | Creative passed review but triggered a downstream signal | Stop. Tell Claude the exact rejection wording before touching anything. |
| Rejected on review | Creative or category blocked | **Do not resubmit variants.** One appeal, stating research-use-only and pointing at the COA page. Then stop and reassess — the account is worth more than the test. |
| Account restricted | Category-level enforcement | Stop entirely. Do not open a second ad account — that's a circumvention signal and it can attach to the *domain*. |

**The £15 buys the answer to "can we advertise at all?", which every number in
`GO-FULL-TIME-GATE.md` Gate 0 is downstream of.** Probe spend counts toward
the £336 — it's the first three days of it, not extra budget.

⚠ **Never** respond to a rejection by spinning up a fresh ad account, a new
page, or a second domain. ~17% of 2026 bans are circumvention signals, and
recycled/flagged **domains** are explicitly among them. veloxpeps.com is the
asset; an ad account is replaceable, the domain is not.

---

## 1. Campaign settings

| Setting | Value |
|---|---|
| Objective | **Sales** |
| Conversion event | **InitiateCheckout** (not Purchase — see plan §3) |
| Budget type | **ABO** (budget set per ad set, *not* Advantage campaign budget) |
| Campaign name | `VP-Cold-Prospect-2026-09` |
| A/B test / Advantage+ shopping | Off |

ABO matters: with CBO Meta will starve one ad set and you learn nothing about
broad vs. interests, which is half the point of the test.

## 2. Ad sets

**Ad set A — `broad-uk`** · £7/day

| Setting | Value |
|---|---|
| Audience | UK · 25–55 · all genders · **no** interests, no custom audiences |
| Advantage audience | On (it's broad anyway; let delivery optimise) |
| Placements | Advantage+ (automatic) |
| Optimisation | Conversions → InitiateCheckout |
| Attribution | 7-day click, 1-day view |

**Ad set B — `interest-stack`** · £5/day

Same everything, except detailed targeting — stack with OR:
`Biohacking · Longevity · Life extension · Nootropic · Anti-aging ·
Self-improvement · Bodybuilding (as interest)`. Meta's interest list shifts;
if one is missing, skip it rather than substituting something health-claimy.
Advantage audience **off** for B (otherwise Meta expands it back to broad and
the control is meaningless).

Both ad sets run **all five ads**. Meta allocates; week 3 you prune.

## 3. URL parameters — set once per ad, in the "URL parameters" field

```
utm_source=facebook&utm_medium=cpc&utm_campaign=cold_prospect&utm_content={{ad.name}}&utm_term={{adset.name}}
```

Meta fills `{{ad.name}}`/`{{adset.name}}` automatically, and every creative
then reports as its own row in **Admin → Traffic → Campaigns**. The ad names
below are load-bearing — they become your reporting. Keep the base website
URL clean (no query string); the parameters field appends automatically.

---

## 4. The five ads — final copy

Every ad ends with the line that gets it through review:
*For laboratory research use only. Not for human or veterinary use. Terms apply.*

### Ad 1 · `static_threetests` → `https://veloxpeps.com/about/coa-library/` · CTA: **Learn More**

**Primary text**
> Every batch. HPLC and mass spec. Third-party verified.
>
> We publish the certificate of analysis for all 15 compounds in our catalogue — before you order, not after you ask.
>
> For laboratory research use only. Not for human or veterinary use. Terms apply.

**Headline:** Every batch tested. Every COA public.
**Description:** Third-party verified. UK dispatch.
**Image:** clean flat-lay of a printed COA beside a sealed vial, white background. No syringes, no people.

### Ad 2 · `static_publiccoa` → `https://veloxpeps.com/about/coa-library/` · CTA: **Learn More**

**Primary text**
> Ask a supplier for a COA. Wait three days. Get a blurry JPEG.
>
> Ours are public, on the site, batch-matched, no email required. HPLC and mass spec, all 15 compounds.
>
> For laboratory research use only. Not for human or veterinary use. Terms apply.

**Headline:** COAs shouldn't be a secret
**Description:** Public. Batch-matched. Check before you buy.
**Image:** screenshot of the COA library page itself. It's the product.

### Ad 3 · `vid_fulfilment` → `https://veloxpeps.com/compounds/` · CTA: **Shop Now**

**Video:** 20–30s phone footage of a real dispatch run — vials out of stock
boxes, label printer, Royal Mail bags. Unpolished beats produced; it reads as
real. No faces needed. Text overlay on first frame: "Dispatch day."

**Primary text**
> Dispatch day at Velox. UK-held stock, packed same day, Royal Mail next-working-day delivery.
>
> Every vial batch-tested by HPLC and mass spec — certificates public on the site.
>
> For laboratory research use only. Not for human or veterinary use. Terms apply.

**Headline:** UK stock. Next-working-day dispatch.
**Description:** Batch-tested. COAs public.

### Ad 4 · `static_uk` → `https://veloxpeps.com/compounds/` · CTA: **Shop Now**

**Primary text**
> UK-held stock. UK dispatch. No customs forms, no six-week wait, no "shipped from overseas" surprise.
>
> 15 research compounds, every batch third-party tested, every certificate published.
>
> For laboratory research use only. Not for human or veterinary use. Terms apply.

**Headline:** Held in the UK. Dispatched from the UK.
**Description:** No customs. No waiting.
**Image:** Royal Mail parcel on a UK doorstep, or the packed-parcels shelf. Union-flag-adjacent without being naff.

### Ad 5 · `static_price` → `https://veloxpeps.com/compounds/` · CTA: **Shop Now**

**Primary text**
> Same compounds. Same testing standard. Up to half the price of most UK suppliers.
>
> We publish every certificate of analysis and hold all stock in the UK. Check the prices side by side — we're happy to be compared.
>
> For laboratory research use only. Not for human or veterinary use. Terms apply.

**Headline:** Same testing. Half the price.
**Description:** We publish everything. Compare us.
**Image:** simple price-comparison graphic — generic "£31 vs £46" style bars. **Do not name VerifiedVials in the creative** (invites a report and a takedown; the claim "most UK suppliers" is defensible, a named competitor is a fight).

### Never, in any ad or any comment reply

Compound names in headlines · weight/fat/muscle/healing/sleep/cognition ·
before/after · syringes or injection imagery · dosing · "results" ·
testimonials describing effects · any word implying human use. **Comments:**
hide anything describing personal use; reply only "Research use only — see
our terms." Meta reads engagement on human-use comments as a policy signal.

---

## 5. Operating calendar

| Week | Do | Read |
|---|---|---|
| 1 | **Nothing.** Learning phase; delivery is erratic by design. Every edit resets it. | Nothing. Genuinely. |
| 2 | Still nothing | CPC, CTR per creative |
| 3 | Kill bottom two creatives; keep both ad sets | Landing CVR, add-to-cart rate |
| 4 | Read the month | CAC, trend direction, broad vs. interests |

**£12/day × 28 days = £336.** What it buys is not profit — it's your real
CPC, CTR, and cold-traffic conversion rate, the three numbers a scaling
decision (and `GO-FULL-TIME-GATE.md` Gate 0) depends on.

**Kill criteria:** CAC > £80 after 28 days with no improving trend → stop.
CAC £40–80 → the channel is plausible and Pay-by-Bank friction is the
suspect; fix checkout before concluding anything about ads. Repeated creative
rejections → stop and reassess, don't resubmit variants; the ad account is
worth more than the test.

---

## 6. Launch-day checklist

- [ ] Pixel verified deduplicating (§0)
- [ ] **Policy probe passed — approved and ran 72h clean (§0.5)**
- [ ] Probe campaign `VP-Policy-Probe-2026-09` deleted
- [ ] `META_CAPI_TEST_CODE` removed from Vercel
- [ ] Campaign `VP-Cold-Prospect-2026-09`, ABO, Sales → InitiateCheckout
- [ ] Ad set A `broad-uk` £7/day · Ad set B `interest-stack` £5/day
- [ ] Five ads in each, named exactly as above
- [ ] URL parameters string on every ad
- [ ] Payment method + billing threshold set in ad account
- [ ] Diary note: **no touching until day 15**, prune day 21, read day 28
