# Meta Ads Build Pack — ready to paste

*Written 12 September 2026. **Substantially rewritten 17 September 2026** —
§0.5 and §4 were rebuilt around a UK competitor who has run this exact category
on Meta for two months without incident. This is the execution companion to
`ADS-CAMPAIGN-PLAN.md` — that file is the why, this one is the exact clicks
and the exact copy. Work top to bottom.*

> **Revision history for §0.5, because it moved twice in one day and the
> reasoning matters more than the conclusion:** 13 Sep it specified a £15
> policy probe · 17 Sep (morning) it became "⛔ STOP, do not launch on Meta"
> after finding one competitor's Page disabled · 17 Sep (afternoon) the stop
> was **lifted** after finding a second competitor running ~250 ads over two
> months, alive. The morning conclusion generalised from a single data point.
> Don't repeat that: when this doc makes a category-level claim, it should
> rest on more than one advertiser.

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

## 0.5 The category IS advertisable — here is the proof, and the rules it implies

> **Status: hold lifted, 17 September 2026 (second revision that day).**
> Earlier on 17 Sep this section read "⛔ STOP — do not launch this on Meta",
> on the evidence of one competitor (Peptivitalis) losing its Page. **That
> conclusion was wrong, and it was wrong because it generalised from a single
> data point.** A second competitor — running longer, harder and louder, in
> our exact category and country — falsifies it. What follows replaces the
> stop with something more useful: a copied playbook and a list of the
> specific things that get you killed.

### The proof: VerifiedVials, two months live

Page **"VerifiedVials Biotech"** (renamed from "VerifiedVials"), destination
`verifiedvials.com`, UK, research peptide **vials** — the same product form as
us, not capsules, not ebooks.

| | Observed, Meta Ad Library, 17 Sep 2026 |
|---|---|
| First ad | **16 July 2026** — continuous ever since |
| Total creatives | **~250** |
| Active right now | **13** |
| Of those, started 15 Sep | **7** |
| Page status | healthy; no "later disabled" notice on any ad |

Two months of uninterrupted delivery at high creative volume, on vials, in the
UK. **That is the whole argument.** The category is not categorically banned on
Meta the way it is on Google Shopping. It is *survivable with discipline*, and
somebody is currently demonstrating the discipline in public for free.

### The playbook, read off their live copy

Their ads, verbatim, are a masterclass in saying nothing prosecutable:

> *"We have trust issues. That's why we verify everything. Every batch is
> analysed for purity, identity and endotoxin before it ships, and the
> documentation travels with it."* — headline **"We Verify Everything"**,
> description **"HPLC · LC-MS · LAL"**

> *"'It's 99% pure' is a starting point, not a full answer. The number tells
> you how much of the sample matched the expected peak. It doesn't tell you
> what the sample is. Identity is a separate test on a separate instrument,
> which is why every batch is tested three ways before it's released."* —
> **"Identity Matters Too"**

> *"We're not the cheapest. We're not trying to be. Testing, transparency,
> proper packaging and responsive support all cost money. We'd rather spend it
> there than cut it. Compare on documentation, not just on price."* —
> **"Cheap Was Never The Goal"**

> *"Purchasing decisions should be supported by evidence, not extravagant
> promises. No hype. Just the data."*

> *"Big delivery day at the Verified Vials fulfilment centre. Every order
> packed, checked and dispatched by our UK team, from our warehouse to your
> lab bench."* — **"Behind the Scenes at Verified Vials"**

Plus straight offer ads: 10% / 20% / 50% off first order, free UK shipping,
free worldwide shipping, free BAC water.

**Every single one of ~250 ads ends with:** *"For laboratory research use
only. Not for human or veterinary use. Terms apply."* — which is, word for
word, the line already sitting at the top of our §4. We got that right
independently.

### The seven rules this gives us

1. **Zero compound names.** Not in headline, not in body, not in the image.
   Across ~250 ads they never name one. Our §4 already bans them in headlines;
   from now the ban is total, including body copy and image text.
2. **No purity figure as a claim.** They *discuss* "99% pure" only to argue
   it's insufficient. Peptivitalis stated **"≥99% purity by RP-HPLC"** as a
   spec and lost its Page. Talk about testing as a *process*; never publish a
   number as a promise.
3. **Process and documentation register, not product register.** The subject
   of the sentence is the lab, the batch, the paperwork, the warehouse — not
   the compound and never the customer's body.
4. **Anti-hype as the actual positioning.** "No hype, just the data" is both
   their brand and their compliance shield. It is a cheap thing for us to say
   truthfully, because it is what we already do.
5. **Own-site destinations only.** Every VerifiedVials ad lands on
   `verifiedvials.com`. Peptivitalis sent at least one ad to
   `api.whatsapp.com`. **Never** point a Velox ad at WhatsApp, Messenger,
   Telegram, or any off-site chat.
6. **Volume and rotation.** ~250 creatives in two months; 7 of 13 live ads are
   two days old. Constant fresh creative appears to be part of how they stay
   healthy — a single ad accumulating months of reports is the fragile shape.
   Hence §4 now specifies **eight** ads, not five, and a rotation cadence.
7. **A serious-sounding Page name.** "VerifiedVials **Biotech**". Ours should
   read as a laboratory supplier, not a shop.

### What actually kills you — the two side by side

| | **VerifiedVials** — 2 months, ~250 ads, alive | **Peptivitalis** — Page disabled 7 Sep |
|---|---|---|
| Purity | discussed as a concept; **no figure claimed** | **"≥99% purity by RP-HPLC"** — a hard spec |
| Destination | own site, every ad | **WhatsApp** on at least one ad |
| Volume | ~250 creatives, daily rotation | ~11 ads total |
| Page name | "VerifiedVials **Biotech**" | "Peptivitalis" → "Peptivitalis UK" |
| Register | process, documentation, philosophy | product specifications |
| After trouble | n/a | **rebuilt under a new Page** — died in 2 hrs |

Peptivitalis' full history, for the record: 15 Aug–6 Sep video (22 days) →
20–23 Aug → 31 Aug–3 Sep (COA ad → WhatsApp) → 3–6 Sep (the ≥99% spec ad) →
**7 Sep, 20 hrs, <100 impressions, "This ad was run by an account or Page we
later disabled for not following our Advertising Standards"** → 12 Sep rebuilt
as "Peptivitalis UK", died in 2 hours → 13 Sep live again with purity softened
to ≥98%.

### One thing we cannot copy

VerifiedVials claims a **three-test** standard — purity, identity **and
endotoxin/sterility** (HPLC · LC-MS · LAL). **We currently have HPLC and mass
spec only. Endotoxin testing is an open loop, not a capability.**

> ⚠ **Do not write "three-test", "sterility", "endotoxin" or "LAL" into any
> Velox ad** until those certificates actually exist. Matching a competitor's
> claim we can't evidence is how a survivable category position turns into an
> ASA complaint and a Trading Standards letter. Our honest claim is two tests,
> published publicly, batch-matched — which is still more than most suppliers
> show, and §4 is written to make that the point.

### The competitive read

Their **"We're not the cheapest"** ad is a pre-built defence against a price
attack. They are spending money inoculating against precisely the angle our
old §4 Ad 5 came at them with — which suggests it is the angle that works.
Ad 5 is kept, sharpened, and still does not name them (see §4).

### The residual risk, unchanged

- Meta runs **domain-level classification separately from ad review**, crawling
  the site and reading pixel event payloads. Penalties tier from stripped event
  parameters → blocked AddToCart/Purchase events → all event sharing blocked.
- Per Meta's Business Help Center, **events lost during a domain block are
  permanently unavailable even if the domain is later unblocked**, and appeals
  are largely automated.
- Google already made a **manual, human** ruling on this exact domain and
  catalogue on **21 June 2026** (Merchant Center suspension — see
  `BACKLINK-CAMPAIGN.md`).

This is why the rules above are rules and not preferences. VerifiedVials
proves the door is open; it does not prove we can walk through it carelessly.

### The domain name itself is not a risk

Asked and answered 17 Sep 2026. `veloxpeps.com` carries a category signal, but
so does `verifiedvials.com` — a *product form* in the domain — and that account
has run two months clean. Peptivitalis' domain was the blandest thing about
them and they still lost the Page. The classifier reacts to claims, not to
brand etymology.

It is also staying regardless: changing domains after a Google manual action is
the circumvention pattern, not an escape from it.

What *is* adjustable, and free: the **Page name** doesn't have to match the
domain. The site already presents as `og:site_name` **Velox Peptides**, schema
`legalName` **CRP Labs Ltd**, company **NI738125**, with a real Holywood
address. So run the Page as **Velox Peptides** and let the payer disclaimer
read **CRP Labs Ltd** (cf. Peptivitalis' burner network paying as "Interdog
Media Limited"). "Peps" then appears nowhere except the URL.

### Accepted risk — the purity figure on `/compounds/` stays

**Decision, Declan, 17 Sep 2026.** The landing page for Ads 3, 4, 5 and 8 is
titled *"Buy Research Peptides UK – HPLC-Verified ≥99% | Velox"*, and the same
figure is in its meta description plus 14 other pages'. That is close to the
wording Peptivitalis was running when their Page was disabled (*"≥99% purity by
RP-HPLC"*), and Meta reads landing pages at ad review as well as for
domain-level classification.

It stays anyway, deliberately, because:

- the claim is **substantiated** — Janoshik Analytical batch reports on
  `/about/coa-library/` show 99.3%, 99.5% etc. per lot. It is legal under
  ASA/CAP; this is a platform-classification risk, not a compliance breach;
- Google Shopping is gone, so **organic is load-bearing**, and these are
  ranking titles. Stripping them has a certain cost to pay down an uncertain risk.

**Consequences to hold in mind, since this is a bet and not a non-issue:**

1. **If an ad is rejected, check this first.** Don't start rewriting creative —
   the creative is clean of purity figures by design. The landing page is the
   most likely culprit and it is a one-line change to test.
2. **Never let the figure migrate into the creative.** The §4 ban is unchanged
   and this decision does not soften it. Page metadata is a judgement call;
   ad copy is not.
3. **It is reversible in minutes.** If the 72-hour watch goes badly, rewriting
   the `/compounds/` title and description is the first lever to pull, ahead of
   pausing the campaign.

⚠ **Never** respond to a rejection by spinning up a fresh ad account, a new
Page, or a second domain. ~17% of 2026 bans are circumvention signals, and
recycled/flagged **domains** are explicitly among them. Google's own suspension
email carries the identical warning ("related Merchant Center accounts may also
get suspended"). veloxpeps.com is the asset; an ad account is replaceable, the
domain is not. **Peptivitalis rebuilt and died in two hours. That is the
lesson, not the tactic.**

### First 72 hours — watch, don't gate

No blocking probe campaign. Launch §1–§4 as specified, then for the first
three days check once daily:

| See this | Do this |
|---|---|
| All ads approved, delivering | Nothing. Go to §5 week 1. |
| One or two creatives rejected | Pause those two. Do **not** resubmit variants. The other six carry the test. |
| Four or more rejected | Pause the campaign. Bring the exact rejection wording to Claude before editing anything. |
| Page restricted or disabled | Stop entirely. One appeal, citing research-use-only and the public COA library. Then reassess. **No new Page, no new account, no second domain.** |

### If Meta closes anyway — the reserve list

Kept from the earlier draft; these are no longer the plan, they are the
fallback if the 72-hour watch goes badly.

| Priority | Channel | Why |
|---|---|---|
| 1 | **Direct newsletter / podcast sponsorship** | No platform gatekeeper — the publisher decides. Health/fitness podcast CPM ~$27; sub-5k-download shows sell flat $300–500/episode; newsletter CPMs $15–30 via Paved / beehiiv. |
| 2 | **Microsoft / Bing Search, ~£100** | Healthcare blocklist is brand-name-based (Craze, OxyElite Pro…); "peptide", "SARM", "GLP-1" do **not** appear. No categorical ban like Google's. |
| 3 | **Reddit Ads, £5/day** | Policy names steroids and HGH, not peptides. Precise subreddit targeting, cheap to test. |
| — | X, TikTok, Snapchat, Pinterest | Explicit supplement/prescription bans. Closed. |
| — | Taboola / Outbrain | A readable test needs £900–1,900/mo. Budget-excluded. |

⚠ Direct placements bypass *platform* policy, **not UK law**. ASA/CAP and MHRA
bind us as the advertiser on every channel. The copy discipline in §4 —
especially the "Never, in any ad" list — applies word for word to a podcast
read or a newsletter blurb.

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

Both ad sets run **all eight ads** (§4). Meta allocates; week 3 you prune. Eight
rather than five is deliberate — see §0.5 rule 6 on creative volume.

## 3. URL parameters — set once per ad, in the "URL parameters" field

```
utm_source=facebook&utm_medium=cpc&utm_campaign=cold_prospect&utm_content={{ad.name}}&utm_term={{adset.name}}
```

Meta fills `{{ad.name}}`/`{{adset.name}}` automatically, and every creative
then reports as its own row in **Admin → Traffic → Campaigns**. The ad names
below are load-bearing — they become your reporting. Keep the base website
URL clean (no query string); the parameters field appends automatically.

---

## 4. The eight ads — final copy

*Rewritten 17 Sep 2026 against the §0.5 rules. Every ad ends with the line
that gets it through review:*
*For laboratory research use only. Not for human or veterinary use. Terms apply.*

**Before you paste any of this, read the two hard limits:**

> **No compound names anywhere** — headline, body, image text, or alt text.
> **No purity figure as a claim** — not 99%, not 98%, not ">98". You may
> describe *what a purity test is*; you may not publish a number as a promise.
> Our COA library shows the actual figures per batch; that's where numbers live.

Note the old Ad 1 was named `static_threetests`. **It has been renamed** — we
run two tests, not three (§0.5, "One thing we cannot copy"). The name was
going to end up in reporting and in Declan's head as a claim we can't evidence.

### Ad 1 · `static_twotests` → `https://veloxpeps.com/about/coa-library/` · CTA: **Learn More**

**Primary text**
> Two instruments, every batch, before anything ships — and we don't run them ourselves.
>
> HPLC for purity, mass spec for identity, independently by Janoshik Analytical. A purity number tells you how much of the sample matched the expected peak; it doesn't tell you what the sample is. That's the second test. Both results are published on the site against the lot number.
>
> For laboratory research use only. Not for human or veterinary use. Terms apply.

**Headline:** Tested by a lab that isn't us
**Description:** Janoshik Analytical. Published by lot.

> **Name the lab.** Janoshik Analytical is ISO-accredited and independently
> recognised in this category — naming it is a stronger credibility signal than
> any adjective we could write, and it is a statement of fact about a testing
> arrangement rather than a claim about a product. It carries no health-claim
> risk. The earlier draft said only "two instruments" and left our single
> best third-party proof point sitting unused on the COA page.
**Image:** clean flat-lay of a printed COA beside a sealed vial, white background. No syringes, no people, **no readable compound name on the label** — blur or angle it out.

### Ad 2 · `static_publiccoa` → `https://veloxpeps.com/about/coa-library/` · CTA: **Learn More**

**Primary text**
> Ask most suppliers for a certificate of analysis. Wait three days. Get a blurry JPEG with the batch number cropped off.
>
> Ours are published on the site — lot number, HPLC purity, mass-spec confirmation and the name of the lab that ran it. Read them before you order rather than after.
>
> For laboratory research use only. Not for human or veterinary use. Terms apply.

**Headline:** COAs shouldn't be a secret
**Description:** Published by lot. Check before you buy.
**Image:** screenshot of the COA library index page — the *list* view, not an individual certificate, so no compound name is legible. It's the product.

> ⚠ **Copy was softened 17 Sep 2026 — don't revert it.** The earlier draft said
> *"no email required, nothing to request."* The site's own header ticker reads
> **"BATCH DOCUMENTATION ON REQUEST"**, and the library publishes batch *data*
> as on-page reports rather than downloadable PDF certificates. The original
> line promised more than the page delivers, which is an ASA substantiation
> problem before it is a Meta one — and the contradiction is visible to any
> reviewer who clicks through. If the PDFs are ever published directly, this ad
> can go back to the stronger claim and the ticker should change with it.

### Ad 3 · `vid_fulfilment` → `https://veloxpeps.com/compounds/` · CTA: **Shop Now**

**Video:** 20–30s phone footage of a real dispatch run — vials out of stock
boxes, label printer, Royal Mail bags. Unpolished beats produced; it reads as
real. No faces needed. Text overlay on first frame: "Dispatch day."
**Check the footage frame by frame for legible labels before uploading.**

**Primary text**
> Dispatch day at Velox. UK-held stock, packed and checked by hand, Royal Mail next-working-day.
>
> Every batch tested by HPLC and mass spec before it reaches this shelf, and the paperwork is public on the site.
>
> For laboratory research use only. Not for human or veterinary use. Terms apply.

**Headline:** UK stock. Next-working-day dispatch.
**Description:** Tested before it ships. Documented after.

### Ad 4 · `static_uk` → `https://veloxpeps.com/compounds/` · CTA: **Shop Now**

**Primary text**
> UK-held stock. UK dispatch. No customs forms, no six-week wait, no "shipped from overseas" surprise at the door.
>
> Fifteen research compounds in the catalogue, every batch tested on two instruments, every certificate published.
>
> For laboratory research use only. Not for human or veterinary use. Terms apply.

**Headline:** Held in the UK. Dispatched from the UK.
**Description:** No customs. No waiting.
**Image:** Royal Mail parcel on a UK doorstep, or the packed-parcels shelf. Union-flag-adjacent without being naff.

### Ad 5 · `static_price` → `https://veloxpeps.com/compounds/` · CTA: **Shop Now**

*Sharpened. The main UK competitor now runs a standing "we're not the cheapest,
compare on documentation" ad — they have pre-loaded a defence against exactly
this angle, which is good evidence the angle bites. So don't argue cheap;
argue that the documentation is equal and the price isn't.*

**Primary text**
> "You get what you pay for" is doing a lot of work in this industry.
>
> Same testing standard. Same published certificates. Same UK stock holding. Up to half the price of most UK suppliers — because our overheads are smaller, not because the paperwork is thinner. Put the COAs side by side, then put the prices side by side.
>
> For laboratory research use only. Not for human or veterinary use. Terms apply.

**Headline:** Compare the documents. Then the price.
**Description:** Same standard. Not the same invoice.
**Image:** simple price-comparison graphic — generic "£31 vs £46" style bars, unbranded. **Do not name any competitor in the creative** (invites a report and a takedown; "most UK suppliers" is defensible, a named competitor is a fight).

### Ad 6 · `static_nohype` → `https://veloxpeps.com/about/coa-library/` · CTA: **Learn More**

*Brand/positioning ad. This is the register the whole account should sound
like — it is also the most review-proof creative in the set, so it's the one
to lean on if anything else gets rejected.*

**Primary text**
> No before-and-afters. No testimonials. No claims about what anything does.
>
> We sell laboratory reagents to people who already know what they're buying, and the only thing we'll try to convince you of is that the analysis is real and the batch number matches. Evidence, not promises.
>
> For laboratory research use only. Not for human or veterinary use. Terms apply.

**Headline:** No hype. Just the paperwork.
**Description:** Read the certificates yourself.
**Image:** plain typographic card, white on dark, the headline set large. No product at all.

### Ad 7 · `static_whatpurity` → `https://veloxpeps.com/about/coa-library/` · CTA: **Learn More**

*Educational. Deliberately argues that purity figures are insufficient — which
is both true and the reason we don't advertise one.*

**Primary text**
> A purity percentage is a starting point, not an answer.
>
> It tells you how much of the sample matched the expected peak on the chromatogram. It does not tell you what the sample is — that's identity, and it's a separate test on a separate instrument. Anyone quoting you one number is quoting you half the test.
>
> Both are on every certificate we publish, with the batch number.
>
> For laboratory research use only. Not for human or veterinary use. Terms apply.

**Headline:** Purity isn't identity
**Description:** Two tests. Both published.
**Image:** stylised, unlabelled chromatogram trace. Abstract — must not be a real COA screenshot with a compound name on it.

### Ad 8 · `offer_firstorder` → `https://veloxpeps.com/compounds/` · CTA: **Shop Now**

*Straight offer ad — the competitor runs several and they appear to pass review
fine. **Declan picks the offer before build**; free UK shipping is the
lowest-margin-risk of the three.*

**Offer options (choose one, don't run all three):**
free UK shipping on first order · 10% off first order · free BAC water with first order

**Primary text**
> Free UK shipping on your first order. *(← swap for the chosen offer)*
>
> UK-held stock, next-working-day Royal Mail, every batch tested on two instruments with the certificate published on the site before you order.
>
> For laboratory research use only. Not for human or veterinary use. Terms apply.

**Headline:** Free UK shipping, first order
**Description:** UK stock. Public COAs.
**Image:** packed parcel, clean background. No vials visible.

### Rotation — this is part of the compliance strategy, not a growth tactic

The surviving competitor has run **~250 creatives in two months**; 7 of their
13 live ads were two days old when we looked. A single ad accumulating months
of impressions and reports is the fragile shape.

- Refresh **two creatives per fortnight** from week 3 onward — new image, new
  first line, same register.
- Retire an ad at ~3 weeks even if it's performing; duplicate it with a fresh
  image rather than letting one asset age.
- Keep every retired ad in a `retired/` note so the copy bank compounds.

### Never, in any ad or any comment reply

**Compound names anywhere** (not just headlines) · **any purity figure** ·
"three-test", "sterility", "endotoxin", "LAL" (we don't have it — §0.5) ·
weight/fat/muscle/healing/sleep/cognition · before/after · syringes or
injection imagery · dosing · "results" · testimonials describing effects ·
any word implying human use · **any destination that isn't veloxpeps.com** —
no WhatsApp, no Messenger, no Telegram, no link-in-bio.

**Comments:** hide anything describing personal use; reply only "Research use
only — see our terms." Meta reads engagement on human-use comments as a policy
signal, and a comment section full of dosing chat will sink an otherwise clean
ad account.

---

## 5. Operating calendar

| Week | Do | Read |
|---|---|---|
| 1 | **Nothing.** Learning phase; delivery is erratic by design. Every edit resets it. | Nothing. Genuinely. |
| 2 | Still nothing | CPC, CTR per creative |
| 3 | Kill bottom **three** creatives; replace two with fresh images (§4 rotation); keep both ad sets | Landing CVR, add-to-cart rate |
| 4 | Read the month | CAC, trend direction, broad vs. interests |

Days 1–3 have their own light-touch check — §0.5 "First 72 hours". That is a
policy watch, not a performance read; it does **not** license editing ad sets
during learning.

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

> **Live checklist — the hold was lifted 17 Sep 2026 (§0.5).** There is no
> blocking probe campaign; the old `VP-Policy-Probe-2026-09` step is gone.
> Work top to bottom, then don't touch anything until day 15.

**Account and tracking**
- [ ] Pixel created, ID in `VP_FB_PIXEL_ID` (`output/assets/js/core.js`), committed
- [ ] `META_PIXEL_ID` + `META_CAPI_TOKEN` in Vercel env *(Declan only — do not paste tokens into chat)*
- [ ] Pixel verified **deduplicating** — one browser + one server event collapsing into one (§0)
- [ ] `META_CAPI_TEST_CODE` removed from Vercel after verification
- [ ] Ad account: business, GBP, 2FA on, backup admin (Luke)
- [ ] Payment method + billing threshold set
- [ ] Entity decision resolved (`ADS-CAMPAIGN-PLAN.md` §7)

**Page**
- [ ] Page name reads as a laboratory supplier, not a shop (§0.5 rule 7)
- [ ] Page has posts predating the ads — a brand-new empty Page running paid is a flag

**Build**
- [ ] Campaign `VP-Cold-Prospect-2026-09`, ABO, Sales → InitiateCheckout
- [ ] Ad set A `broad-uk` £7/day · Ad set B `interest-stack` £5/day
- [ ] **Eight** ads in each, named exactly as §4
- [ ] Offer chosen for `offer_firstorder` and the copy swapped accordingly
- [ ] URL parameters string on every ad
- [ ] Every destination is a `veloxpeps.com` URL — no chat apps, no link-in-bio

**Compliance pass — read every creative once more against §4 "Never"**
- [ ] No compound name in any headline, body, image, video frame or alt text
- [ ] No purity figure anywhere in the creative
- [ ] No "three-test" / "sterility" / "endotoxin" / "LAL"
- [ ] Research-use-only line present on **all eight**

**Landing-page pass — click every ad's destination and read it as a reviewer**
*Meta checks the page, not just the ad. An ad whose claim the landing page
contradicts is the easiest possible rejection.*
- [ ] Every claim in the ad is actually visible on the page it lands on
- [ ] No ad promises documentation the page makes you request *(see Ad 2 note)*
- [ ] `/about/coa-library/` meta description no longer says **"under construction"** — it currently does, while the page shows 17 live batch reports *(open item, see below)*
- [ ] Header ticker "BATCH DOCUMENTATION ON REQUEST" reconciled with whatever the ads claim
- [ ] Accepted risk on the `/compounds/` purity title re-read and still accepted (§0.5)

**After launch**
- [ ] 72-hour policy watch scheduled (§0.5) — check once daily, days 1–3
- [ ] Diary note: **no touching until day 15**, prune + rotate day 21, read day 28
