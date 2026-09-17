# Meta ads launch runbook — Monday 21 September 2026

*Written 17 Sep 2026. `ADS-CAMPAIGN-PLAN.md` is the why. `ADS-BUILD-PACK.md` is
the settings and the copy. **This file is the four-day schedule and the
division of labour** — what's already done, what only Declan can do, and what
has to happen in what order.*

---

## The honest state of it

Seven of the eight ads can launch Monday. Here's the gap between "we have a
plan" and "the ads are live":

| | Status |
|---|---|
| Copy for all 8 ads | ✅ written, `ADS-BUILD-PACK.md` §4 |
| Campaign structure, targeting, budgets | ✅ specified, §1–§3 |
| Tracking code | ✅ built and tested — **but dormant, needs a pixel ID** |
| 5 static creatives × 3 sizes | ✅ rendered, `ad-creatives/out/` |
| 3 photo/video creatives | ❌ **Declan must shoot them** |
| Meta pixel, ad account, Page | ❌ **Declan only — nobody else can** |
| Ad 5 price claim | ⛔ **unsubstantiated — held from launch** |
| 10% discount code | ⚠️ mechanism exists, needs switching on + testing |

**Nothing here is blocked on me. Everything left is blocked on you**, except
the price survey, which either of us can do.

---

## What is already done (don't redo it)

- **Meta pixel + Conversions API code is written, deployed and tested.**
  `npm run test:meta` → 15 passed, 0 failed, including the regression test for
  the Vercel `res.end()` freeze bug that silently ate analytics data once.
  Browser and server events are built to deduplicate. It is sitting dormant
  because `VP_FB_PIXEL_ID` in `output/assets/js/core.js` is an empty string.
- **Five creatives, three sizes each, 15 PNGs**, in `ad-creatives/out/`. Built
  from HTML so a copy change is a one-line edit — see `ad-creatives/README.md`.
- **COA library meta description fixed.** It said "CoA library under
  construction" while the page showed 17 live batch reports. Meta reads the
  landing page, and that was a free contradiction. Fixed in this branch.
- **The category question is answered.** Meta is open (`ADS-BUILD-PACK.md`
  §0.5), Google Shopping is closed and should be treated as permanently closed.
- **Entity decision made:** the £336 runs under CRP Labs Ltd as-is. Entity
  resolution is now a condition on *scaling*, not on launching. See
  `GO-FULL-TIME-GATE.md` Gate 0b.
- **Offer decided:** 10% off first order.

---

## Thursday 17 → Monday 21

### Thursday evening / Friday morning — Declan only

**1. Create the Meta pixel.** Events Manager → create pixel → copy the ID.

- Paste the ID into `VP_FB_PIXEL_ID` in `output/assets/js/core.js` (line ~309),
  commit, push. Pushing main deploys to production — that's the intent here.
- Vercel env: add `META_PIXEL_ID` and `META_CAPI_TOKEN` (Events Manager →
  Settings → Conversions API → Generate access token).
- Optional while verifying: `META_CAPI_TEST_CODE`. **Remove it before launch** —
  test-coded events are excluded from optimisation, so leaving it in means the
  algorithm learns from nothing.

The pixel ID is public and fine to share with me. **The CAPI token is a secret
— put it straight into Vercel, don't paste it into this chat.**

**2. Ad account and Page.**

- Business account, GBP, 2FA on, Luke as backup admin.
- Payment method and billing threshold set. *(I can't and won't touch this.)*
- Page name has to read as a laboratory supplier, not a shop —
  `ADS-BUILD-PACK.md` §0.5 rule 7. The competitor that survived is
  "VerifiedVials Biotech"; the one that got disabled wasn't.
- **The Page needs posts predating the ads.** A brand-new empty Page running
  paid traffic in a scrutinised category is a flag by itself. Three or four
  posts this week is enough — COA screenshots, a dispatch photo, the same
  register as Ad 6.

### Friday — the shoot *(Declan only, and Friday is the natural window)*

Friday is a dispatch day, so the footage exists for free if you film it while
you're doing it. Three creatives depend on this:

| Ad | Shot | Notes |
|---|---|---|
| Ad 3 `vid_fulfilment` | 20–30s of a real dispatch run | vials out of stock boxes, label printer, Royal Mail bags. Unpolished beats produced — it reads as real. No faces needed. Text overlay frame 1: "Dispatch day." |
| Ad 4 `static_uk` | Royal Mail parcel on a UK doorstep | or the packed-parcels shelf |
| Ad 8 `offer_firstorder` | packed parcel, clean background | no vials visible |

⚠️ **Check every frame for legible compound names.** This is the single
rule most likely to be broken by accident. Every one of the 79 existing product
images on the site is unusable for ads for exactly this reason — the compound
name is printed on the vial label. Reflections count. Boxes in the background
count. A screen in shot counts. If a reviewer can zoom in and read it, it's in
the ad.

Shoot more than you need. §0.5 rule 6 is volume and rotation — the surviving
competitor has run ~250 creatives in two months.

### Friday or Saturday — the 10% code *(either of us; I can do the code work)*

**Good news: the mechanism already exists and is better than a plain promo
code.** `api/first-order/validate.js` checks the customer's email against prior
paid/dispatched orders, so it is genuinely first-order-only rather than a
reusable public code. It's driven by two env vars:

- `FIRST_ORDER_CODE` — currently defaults to `DESIGN10`
- `FIRST_ORDER_PCT` — currently defaults to `10`

The percentage is already right. The decision is the code name.

> **Complication worth knowing before you advertise 10%:**
> `output/assets/js/discount-codes.js` currently has **`JOSIE20` and
> `CLAIREAYR20` live at 20% off, public, uncapped, unlimited uses**, plus
> `INSIDER10`. A prospect who clicks the ad and then googles "velox discount
> code" finds a better offer than the one the ad just promised. That makes the
> offer ad weak and slightly silly.
>
> Three ways out, pick one: **(a)** set the two 20% codes `active: false` before
> Monday, **(b)** run the offer ad at 20% instead and accept the margin, or
> **(c)** run the offer ad last, after the other seven have data. I'd do (a) —
> they look like they were meant to be temporary, and one of them is explicitly
> commented "Disable after the sale."

**Then test it end to end before Ad 8 runs:** place a real test order with the
code, on an email that has never ordered, and confirm the discount applies at
checkout and the order lands correctly. An offer ad pointing at a code that
errors is worse than no offer ad.

### Saturday — the price survey *(optional; unblocks Ad 5 only)*

Ad 5 is **held**. "Up to half the price of most UK suppliers" is a comparative
price claim and nothing in this repo substantiates it — no survey, no
competitor price list, no dated screenshots. Our own £29 is the only real
number we hold.

This matters beyond Meta. **CAP 3.33** requires comparative claims to be
verifiable and ASA rules bind Velox as advertiser regardless of what Meta
approves. The most likely complainant is the competitor who sees the ad.

To unblock it:

1. Pick one compound we sell, at one vial size.
2. Find five named UK suppliers listing the same thing at the same size.
3. Screenshot each listing, dated, filed in the repo.
4. Set the claim to what the data supports. If it's 15%, the ad says 15%.
5. Fill the `£__` placeholder in `ad-creatives/creatives.html` `#ad5` and
   re-render.

**If this doesn't happen, launch the other seven.** Seven ads is plenty for a
£12/day test — Meta will not meaningfully distribute across eight anyway.

### Sunday — verification, not building

**Verify the pixel is deduplicating.** Browse the live site, add to cart, reach
checkout. Events Manager should show PageView, ViewContent, AddToCart,
InitiateCheckout each appearing **once** — one browser event and one server
event collapsing into one row. **If you see doubles, stop and tell me**, don't
launch on top of it. Doubled conversion events teach the algorithm the wrong
thing and you can't retroactively clean it.

Then remove `META_CAPI_TEST_CODE` from Vercel.

**Read every creative once more against §4 "Never".** Cold, as a reviewer
would:

- No compound name in any headline, body, image, video frame or alt text
- No purity figure anywhere in the creative
- No "three-test", "sterility", "endotoxin", "LAL" — we run HPLC and mass spec
  only, and claiming a test we don't run is the one lie that would actually
  deserve everything that followed
- Research-use-only line present on every single one

**Click every ad's destination and read the page as a reviewer.** Meta checks
the landing page, not just the ad. An ad whose claim the page contradicts is
the easiest possible rejection.

> **One open contradiction to decide on.** The header ticker on every page still
> says **"BATCH DOCUMENTATION ON REQUEST"**, while Ad 2's whole argument is that
> our COAs are public and don't need asking for. The COA library shows 17 batch
> reports but **no downloadable PDFs**. So "on request" may actually be the
> truthful line and the ad is the overclaim — which is why Ad 2's copy was
> already softened, with a note telling you not to revert it.
>
> Either publish the PDFs and change the ticker, or leave both and keep Ad 2
> soft. **Don't change the ticker without publishing the PDFs** — that's
> replacing an awkward truth with a clean falsehood, on the exact page the ad
> points at.

### Monday 21 — launch

Do **§0.5 first**, not the full build:

1. **Policy probe only.** Campaign `VP-Policy-Probe-2026-09`, £5/day, one ad:
   `static_publiccoa` (Ad 2) → `https://veloxpeps.com/about/coa-library/`.
   That's the most defensible creative we have — educational destination, zero
   product claims.
2. That's the whole of Monday. The probe answers "can we advertise at all?" for
   £15, which is cheaper than finding out after building fourteen ad
   placements and teaching the account to expect rejections.

**Read it like this:**

| Outcome | Do |
|---|---|
| Approved, runs 72h clean | Build the full campaign Thursday 24th. Kill the probe. |
| Approved then flagged mid-flight | Stop. Send me the exact rejection wording before touching anything. |
| Rejected on review | **Do not resubmit variants.** One appeal, stating research-use-only and pointing at the COA page. Then stop and reassess. |
| Account restricted | Stop entirely. Do **not** open a second ad account. |

Probe spend counts toward the £336 — it's the first three days of it, not extra
budget.

⚠️ **Never respond to a rejection with a fresh ad account, a new Page, or a
second domain.** ~17% of 2026 bans are circumvention signals and recycled or
flagged **domains** are explicitly on that list. The ad account is replaceable.
veloxpeps.com is not.

---

## So Monday is a £5 day, not a launch day

Worth saying plainly, because "start the ads Monday" and what's written above
aren't quite the same thing. Monday starts the *process*; the £12/day campaign
goes live around Thursday 24th if the probe comes back clean.

The reason to sequence it that way rather than launching everything Monday is
that a rejection on day one against eight creatives is a much worse position
than a rejection against one. You lose the information about *which* creative
did it, and the account starts its life with a rejection on record.

If you'd rather compress it, the honest version is: the probe is the only part
that genuinely can't be parallelised. Everything else — shoot, code, survey,
pixel — can happen alongside it.

---

## Then: do nothing

Week 1 and week 2 you read numbers and change nothing. The learning phase makes
delivery erratic by design, and every edit resets it. Week 3 you kill the
bottom two creatives. Week 4 you read the month.

**£12/day × 28 days = £336.** What it buys is not profit. It's your real CPC,
CTR and cold-traffic conversion rate — the three numbers `GO-FULL-TIME-GATE.md`
Gate 0 is entirely downstream of.

Diary it now: **no touching until day 15. Prune day 21. Read day 28.**
