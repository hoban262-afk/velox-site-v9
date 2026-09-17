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

## 0.5 ⛔ STOP — do not launch this on Meta

> **Status as of 17 September 2026: everything below §0.5 is ON HOLD.**
> A £5/day "policy probe" was specified here on 13 Sep. It was **cancelled on
> 17 Sep** — not on principle, but because the experiment had already been run
> by someone else, in our country, in our category, on our exact copy, and we
> can read the result for free.

### The evidence: Peptivitalis, from the Meta Ad Library

`peptivitalis.com` is a UK research-peptide supplier positioned almost
identically to us. Their complete Meta ad history:

| Dates | Ad | Outcome |
|---|---|---|
| 15 Aug – 6 Sep | Video — "Research peptides and laboratory reagents, dispatched from the UK… tested by more than one independent laboratory" | ran 22 days |
| 20 – 23 Aug | — | 3 days |
| 31 Aug – 3 Sep | COA-process ad → WhatsApp destination | 3 days |
| 3 – 6 Sep | "UK supplier of research peptides for laboratory use. **≥99% purity by RP-HPLC, independently verified, lot-matched certificate of analysis with every order. Research use only.**" | 3 days |
| **7 Sep** | 20 hrs, <100 impressions | **Page DISABLED** — *"This ad was run by an account or Page we later disabled for not following our Advertising Standards."* |
| 12 Sep | rebuilt as new Page "Peptivitalis **UK**" | died in **2 hours** |
| 13 Sep → | same, purity claim softened to ≥98% | live at time of writing |

**Compare their 3–6 Sep copy to §4 Ad 1 below. It is the same ad.** Same
country, same category, same research-use-only posture, same COA-as-the-product
angle — written independently, three weeks apart. Meta disabled their Page.

Their response was to spin up a new Page and come back. **That is exactly the
circumvention behaviour that escalates to domain-level action.** We do not copy
it. See the warning at the end of this section.

### The category picture (Meta Ad Library, UK, 17 Sep 2026)

- **"retatrutide", ~13 active ads.** Advertisers: *Academic Boost Zone,
  Knowledge Bridge Center, Insight Portal, Smart Resource World, Scroll for
  Deals*. Identical copy, junk destination domains (barglooop, dealworldz,
  promograb, snapdealz, grabandwin), nearly all **"Paid for by Interdog Media
  Limited and others"** — one buyer, seven disposable pages. Several show
  **"Total active time 12 hrs."** Zero legitimate branded vendors.
- **"peptides", ~13,000 active ads** — essentially all cosmetics (collagen,
  Sephora, NipandFab). Not our category; don't be fooled by the volume.
- **What survives for months:** oral BPC-157 *capsule* sellers (Aueral, live
  since Dec 2025; Zorla; Forester Nutrition), a free-ebook lead magnet (Iron
  Gorillas, live since 25 May), and education products (MedLoria peptide
  certification).

**The dividing line is product form, not compliance language.** Zorla makes
florid healing claims and runs for weeks. Peptivitalis said "research use only"
and lost its Page. Vials get killed; capsules, ebooks and courses do not.

### Why we don't spend the £15 anyway

The probe was designed to buy information. It no longer buys any — we know the
likely outcome. What it would still buy is **exposure of the domain**, and the
downside there is not symmetric:

- Meta runs **domain-level classification separately from ad review**, crawling
  the site and reading pixel event payloads. Penalties tier from stripped event
  parameters → blocked AddToCart/Purchase events → all event sharing blocked.
- Per Meta's Business Help Center, **events lost during a domain block are
  permanently unavailable even if the domain is later unblocked**, and appeals
  are largely automated.
- Google already made a **manual, human** ruling on this exact domain and
  catalogue on **21 June 2026** (Merchant Center suspension — see
  `BACKLINK-CAMPAIGN.md`). Don't volunteer for a second platform to do the same.

⚠ **Never** respond to a rejection by spinning up a fresh ad account, a new
Page, or a second domain. ~17% of 2026 bans are circumvention signals, and
recycled/flagged **domains** are explicitly among them. Google's own suspension
email carries the identical warning ("related Merchant Center accounts may also
get suspended"). veloxpeps.com is the asset; an ad account is replaceable, the
domain is not.

### Where the £336 goes instead

| Priority | Channel | Why |
|---|---|---|
| 1 | **Direct newsletter / podcast sponsorship** | No platform gatekeeper — the publisher decides. Health/fitness podcast CPM ~$27; sub-5k-download shows sell flat $300–500/episode; newsletter CPMs $15–30 via Paved / beehiiv. Our budget actually buys inventory here. |
| 2 | **Microsoft / Bing Search, ~£100** | Their healthcare blocklist is brand-name-based (Craze, OxyElite Pro…); "peptide", "SARM", "GLP-1", "retatrutide" do **not** appear. No categorical ban like Google's. Genuinely untested — worth falsifying. Start with non-GLP-1 SKUs. |
| 3 | **Reddit Ads, £5/day** | Policy names steroids and HGH, not peptides. Precise subreddit targeting, trivially cheap to test. |
| — | X, TikTok, Snapchat, Pinterest | Explicit supplement/prescription bans. Closed. |
| — | Taboola / Outbrain | A readable test needs £900–1,900/mo. Budget-excluded. |

⚠ Direct placements bypass *platform* policy, **not UK law**. ASA/CAP and MHRA
bind us as the advertiser on every channel. The copy discipline in §4 —
especially the "Never, in any ad" list — applies word for word to a podcast
read or a newsletter blurb.

*The ad copy in §1–§6 below is kept because it is good, compliant copy and it
ports directly to newsletter and podcast placements. Do not use it to build a
Meta campaign.*

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

> ⛔ **This checklist is suspended — see §0.5.** There is no Meta launch day
> pending. It is kept only so that, if the category position ever changes
> (Meta policy shift, or we move to a product form that isn't an injectable
> research vial), the build is ready. Re-read §0.5 in full before ticking
> anything here.

- [ ] Pixel verified deduplicating (§0)
- [ ] **§0.5 re-checked — Meta hold explicitly lifted, with a reason**
- [ ] `META_CAPI_TEST_CODE` removed from Vercel
- [ ] Campaign `VP-Cold-Prospect-2026-09`, ABO, Sales → InitiateCheckout
- [ ] Ad set A `broad-uk` £7/day · Ad set B `interest-stack` £5/day
- [ ] Five ads in each, named exactly as above
- [ ] URL parameters string on every ad
- [ ] Payment method + billing threshold set in ad account
- [ ] Diary note: **no touching until day 15**, prune day 21, read day 28
