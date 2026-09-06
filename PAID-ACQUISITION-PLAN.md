# Paid Acquisition Plan — Velox Peptides

**Date:** 6 September 2026
**Question:** "We're flatlining. I see VerifiedVials ads everywhere. Let's do adverts."
**Verdict: you were right.** VerifiedVials is running real, live, continuously-refreshed paid ads on Meta and Google right now. I went into this expecting to tell you the category was closed to advertising. The evidence says otherwise, and the exact playbook they're using is visible and copyable.

The caveat is sequencing, not strategy — there are three things that will waste your money if you switch ads on before fixing them.

---

## 1. What they are actually running — verified

Ad libraries were bot-walled to plain fetches; these came from a real browser session and Google's own RPC backend. A naive check would have returned a false "no ads".

**Meta — 19 active ads.** Advertiser "VerifiedVials Biotech". Start dates **4 Aug → 4 Sep 2026** — continuous and actively refreshed. Static images and video, CTAs "Shop now" / "Learn more".

**Google — 9 active creatives.** Legal advertiser **RKCKMJ Ltd**, display name "Verified Vials". **Display/banner only — no search text ads.** Formats 300x600, 348x160, 348x224 plus HTML5. First shown 29 Jul 2026, still serving 6 Sep 2026.

**TikTok — nothing.** Verified negative, not a failed fetch.

**Ownership.** Companies House **RKCKMJ LTD, NI731628**, incorporated 23 July 2025, Belmont Road, Belfast. Directors Kim and Ryan Constable. SIC 46750 (wholesale chemicals), 47910 (internet retail).

**Notable:** the brand is *firewalled* from her name. verifiedvials.com has zero mentions of Kim Constable or The Sculpted Vegan; thesculptedvegan.com has zero mentions of Verified Vials. I had assumed she was leveraging her existing fitness audience — the evidence says the opposite. This is a standalone paid-media play run through a separate legal entity.

---

## 2. The playbook, decoded

Everything below is directly copyable.

**Google = Display, not Search.** This is the key insight. Search text ads for this category get disapproved; display/banner inventory passes. They run zero search ads. Don't waste time fighting Search.

**Creative is compliance-first and documentation-led.** Verbatim from live ads:

> "Three tests. One verified batch."
> "Purchasing decisions should be supported by evidence, not extravagant promises. No hype. Just the data."
> "Big delivery day at the Verified Vials fulfilment centre" *(behind-the-scenes warehouse video)*
> "Free worldwide shipping… No surprises at checkout."
> "20% off your first order!"

Every single ad closes with: **"For laboratory research use only. Not for human or veterinary use. Terms apply."**

No health claims. No before/after. No dosing. No human-use implication. The compliance line is not decoration — it is what gets the ad through review.

**Their offer stack:** 20% off first order · free UK shipping (scarcity-framed) · next-working-day UK dispatch · third-party COAs with identity/purity/**endotoxin** testing · Loox reviews · Recharge subscriptions.

**Their stack:** Shopify (40 products). **Visa, Mastercard, Maestro, Amex, Discover, Shop Pay, PayPal — full card checkout.** Meta pixel + GTM only, no other pixels.

---

## 3. Your numbers

### You have a traffic problem, not a conversion problem

August recorded 2,668 sessions. Almost all bots:

| Signal | Value |
|---|---|
| Sessions with exactly 1 pageview | 2,832 of ~2,900 |
| …that landed on a `/guides/` page | 2,092 |
| …that reached a cart | 10 |
| **Google organic referrals** | **114** |

Real engaged humans (2+ pageviews): **~170/month**, matching Search Console (~150 clicks/month).

Those real humans behave well:

| Step | Rate |
|---|---|
| Engaged session → cart | ~20% |
| Payment page → completed | 82% |
| **Engaged session → order** | **~10%** |

One in ten real visitors buys. The funnel works. **~200 humans a month is the entire problem.**

### The economics support paid acquisition

| Example | Sell | COGS | Ship | Pack | Contribution |
|---|---|---|---|---|---|
| BPC-157 10mg | £31 | £4.90 | £3.80 | £0.50 | **£21.80 (70%)** |
| Retatrutide 10mg | £59 | £7.90 | £3.80 | £0.50 | **£46.80 (79%)** |

| Metric | Value |
|---|---|
| AOV (clean) | ~£90 |
| Contribution/order | **£60–67** |
| Repeat rate | 13.5% |
| LTV (excl. one £1,554 whale) | ~£113 |
| **Max sustainable CAC** | **~£50–60** |

£50–60 CAC headroom is workable. Money isn't the constraint.

### And you are already cheaper

| | Velox | VerifiedVials |
|---|---|---|
| BPC-157 | **£31** | €46.30 |
| GHK-Cu | **£39** | €58.17 |
| NAD+ | **£54** | €117.52 |

You undercut them by up to 50% and still aren't selling. **Price is not your problem — distribution is.** Do not discount further.

---

## 4. Three things that will burn your money if you skip them

**1. ~~You cannot measure a campaign today.~~ Fixed — see §5.** `api/track.js` stored only `ref`, with no `utm_*`, `gclid` or `fbclid` capture anywhere, so a pound spent would have told you nothing about which ad produced which order. Attribution is now captured end to end and reported in the admin Traffic tab.

**2. They take cards; you don't.** They run Shopify Payments with Visa/MC/Amex/PayPal/Shop Pay. You are Pay-by-Bank only. Identical ad spend converts worse for you — you'd be paying the same CPC to fill a narrower funnel. Your payment-page-to-completion is 82%, which is respectable, but that's measured on *warm* traffic that already chose you. Cold paid traffic is far less tolerant of an unfamiliar payment method.

**3. Ads and banking are the same decision.** UK CAP Code 12.11/12.12 prohibit advertising unlicensed medicines to the public; ASA rulings are public and searchable by acquirers. Consumer-facing ads raise complaint volume and AML visibility with your PISP — the pattern that de-banked you once already. Note what Kim did: **a separate legal entity (RKCKMJ Ltd) incorporated specifically for this.** CRP Labs carries your whole business; she ring-fenced the risk. That structural choice is probably the most important thing on this page.

---

## 5. The plan

### Phase 0 — free

#### Shipped

**Campaign attribution, end to end.** You can now measure an ad.

- `core.js` captures `utm_source/medium/campaign/content/term` plus `gclid`, `fbclid`, `ttclid`, `msclkid` on any tagged landing. A bare `gclid` with no UTMs still resolves to `google / cpc`, so links you don't control are still attributed.
- Two touches are kept: **first** (90-day window — what introduced them) and **last** (what brought them back to buy). Direct/organic visits never overwrite either, so attribution survives the visitor browsing before buying.
- `visits.utm` records the click; `orders.attribution` records the sale. Both jsonb, both written on all three order paths (bank transfer, Fena, emailed payment link).
- Admin → Traffic → **Campaigns** joins the two: clicks, visitors, orders, CVR, revenue and revenue-per-visitor per campaign. Only `paid`/`dispatched` orders count — pending attempts don't flatter a campaign.
- Both public endpoints whitelist the shape (fixed key set, no nesting, 120-char caps), so a hostile caller can't stuff the table.

**Auto-apply captured `?ref=` codes.** `checkout.js` used to pre-fill the affiliate code and wait for an "Apply" click that almost nobody made — costing the affiliate their commission and you the attribution. It now validates and applies automatically, silently and without a red error if the code has since been deactivated, and never overwrites a code the customer is typing.

**Commission 10% → 20%.** The discount+commission pool was a fixed 20% of subtotal, so an affiliate could take at most 15%. The pool is now **30%** (default split: 20% commission / 10% customer discount, affiliate-adjustable 5–25% in their portal). At ~£90 AOV that costs ~£27 and leaves ~£35 — and only ever on a sale that wouldn't have happened.

**Two silent bugs fixed on the way:**
- The admin approval screen wrote `commission_rate`, but `/api/affiliate/validate` reads `commission_pct`. All three approved affiliates were shown to you as 15% and paid 10%. Both fields now written together.
- Brandon King **asked for the code `PSTACK`** on his application and was auto-assigned `BRANDONK`. He'd have published PSTACK on peptidestack.io and it would simply not have worked. Changed to `PSTACK`.

#### Still to do — needs you

**Onboard the three affiliates.** You have 4 affiliates, **0 referrals, 0 attributed orders**. Three are qualified inbound applicants you approved and never contacted:

| | Code | Reach |
|---|---|---|
| **Brandon King** | `PSTACK` | PeptideStack (peptidestack.io) — vendor-comparison/coupon site, the highest-intent traffic in this category |
| **Andrew Firlit** | `ANDREWFI` | Works with Limitless Biotech, PEPTIRA, DeusChem, Driada Shop |
| **Coupon Reals** | `COUPONRE` | Coupon/affiliate network |

They need an email from you with the code, the new 20% terms, links, and how they'll be paid. Costs nothing, pays per sale, and no platform can ban you. **Give them UTM-tagged links** (`?ref=PSTACK&utm_source=peptidestack&utm_medium=affiliate&utm_campaign=launch`) so they show up as their own row in the Campaigns table.

**Consider vanity codes for the other two.** `ANDREWFI` and `COUPONRE` are auto-generated from their names and are not what either would choose to publish. Ask them.

**Open question — is 10% enough of a customer discount?** VerifiedVials leads with 20% off a first order. On a coupon site the discount *is* the product, and 10% is a weak listing. You can move the split to 15/15 without changing the 30% pool.

### Phase 1 — prerequisites, 2–4 weeks

> **Superseded — see `ADS-CAMPAIGN-PLAN.md` §6 for the current sequencing.** The "how is a UK peptide seller live on Shopify Payments?" question below has since been answered: they're on Shopify Payments (= Stripe in the UK), they're only four months old, and the likely answer is enforcement lag plus MATCH-list risk we shouldn't take on. Consequence: **card payments are no longer a prerequisite** — they're a longer-term parallel track, and blocking the ad test on them means never testing. The real blocker turned out to be the missing Meta pixel.

- ~~Resolve card payments (see `CARD-PAYMENTS-OPTIONS.md`). Investigate directly how a UK peptide seller is live on Shopify Payments — that is the single most valuable unknown here.~~ **Answered — `CARD-PAYMENTS-OPTIONS.md` §6.** Now a parallel track on a months-long clock, not a gate.
- Decide on a separate legal entity for the advertised brand. **Still a genuine gate.**
- **Build the Meta pixel + Conversions API.** Not in the original plan; it's the actual blocker.
- Match the offer stack: first-order discount, free UK shipping, reviews widget, subscriptions.

### Phase 2 — paid test, once Phase 1 is done

- **Meta first** (19 live ads prove it passes review), **Google Display second**. Skip Google Search and TikTok entirely.
- Copy the compliance-first creative formula: documentation, testing, COAs, fulfilment BTS. Zero health claims. Always close with the research-use-only line.
- **Budget: £10–15/day for 3–4 weeks (~£300–450).** Not to profit — to learn your CPC, CTR and cold-traffic CVR.
- **Kill criteria:** if CAC exceeds £60 after 30 days with no improving trend, stop.

---

## 6. What to stop

**Pause the daily news engine.** It produced the guides that drew **2,092 single-pageview bot sessions** in August, of which **10** reached a cart. It ranks for zero-commercial-intent queries (`nct07437547 sponsor`, `hudson biotech mots-c`), inflates your analytics so the site looks busier than it is, and consumes effort that belongs on commercial pages.

---

## 7. Honest uncertainties

- **Their spend is unknown.** 28 live creatives proves activity, not budget. Meta only publishes spend for political ads. "Everywhere" may partly be tight retargeting of *you* — you browse peptide sites, so you get followed.
- **Reddit, Bing and Pinterest ad libraries were unreachable.** Unknown, not zero.
- **They may be operating in enforcement lag.** Ads passing review in September 2026 does not guarantee the account survives; peptide advertisers do get banned. Budget on the assumption you may lose the account.
