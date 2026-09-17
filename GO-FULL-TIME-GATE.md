# The Go-Full-Time Gate

*Written 12 September 2026. Every number below is pulled from the live database
(`orders`, `product_costs`, `business_overheads`, `visits`), not estimated.*

**Purpose:** replace "we're starting to think about loans so we can quit" with a
numeric rule that tells you *when* quitting is the right move — and what has to
be true first. The decision to leave two salaries and take on personally
guaranteed debt should be made against thresholds you wrote down in advance,
not against how a given week feels.

---

## 1. Where the business actually is

| Month | Orders | Revenue | AOV | Gross margin* |
|---|---|---|---|---|
| June | 12 | £2,527 | £211 | 82.5% |
| July | 14 | £1,343 | £96 | 83.7% |
| Aug | 12 | £1,055 | £88 | 85.5% |
| Sep (12 days) | 11 | £1,056 | £96 | 83.5% |

\* Product COGS only, from `product_costs`. Excludes postage, packaging, Fena
fees, and lab-testing amortisation.

**Fixed overheads: £144/month** (Claude Max £90, Vercel £20, Claude Pro £18,
Workspace £16). Xero adds £16 from ~December. This is a genuinely lean cost
base — the business itself is nearly free to keep alive. The runway problem is
salaries, nothing else.

**Working contribution margin: ~75%.** Start from 84% gross, subtract postage,
packaging, Fena's per-transaction fee, and a testing allowance. Refine this
once you've reconciled a full month in Xero — if it comes out at 70% or 78%,
update §3 and the thresholds move mechanically.

### The September signal, diagnosed

September is pacing ~£2,600–2,900/month, roughly 2.5x July/August. Attribution
on the 11 orders says:

1. **Traffic is flat.** ~80 sessions/day in both August and September. The
   uptick is *conversion*, not audience — the machine got better, not bigger.
2. **The buying cycle is long.** 5 of 11 September orders came from sessions
   whose first visit was 2–5 weeks earlier (one from 15 July). August's
   visitors are September's buyers. This is why retargeting and email capture
   matter more here than in a typical shop.
3. **The new payment-link flow is carrying real weight**: 3 of 11 orders
   (27%) paid by bank link.
4. **The email/discount machinery is converting**: personal `VELOX-*` codes on
   2 orders, `VOLUME` codes on 3.
5. **Google organic — including free Shopping listings** (`srsltid` URLs) —
   touched 4 of 11 orders.
6. **Retatrutide is in 10 of 11 orders.** The concentration has *increased*.

Read together: the conversion work of July–August (payment links, email flows,
volume discounts) is what's paying, and it pays on a several-week delay. That
is genuine progress — and it is also the strongest argument for running the ad
test *before* any irreversible decision, because paid traffic will feed the
same improving machine.

---

## 2. What a loan would actually be — named honestly

- Mainstream lenders will not lend to a research-peptides company. You have
  already been de-banked once; that is the market telling you its answer.
- The realistic instruments are **Start Up Loans (personal, up to £25k per
  director, personally liable)** or high-risk merchant lending at punitive
  rates (which anyway wants card volume you don't have).
- So "business loan to quit our jobs" decodes to: **personal debt, spent on
  salaries, in a category where the payment rails have been cut before.**
  Quitting also removes household income diversification at the exact moment
  leverage is added. Three correlated risks, stacked.
- **Debt has one legitimate future use here:** inventory financing against a
  *proven* CAC/LTV spread. Borrowing £10–15k for stock you know sells, at a
  cost of acquisition you have measured, is a sensible loan a lender can also
  understand. Borrowing for runway-to-find-product-market-fit is what risk
  capital exists for, precisely because it often doesn't come back.

**Rule: debt buys stock, never salaries. And only after Gate 0.**

---

## 3. The arithmetic

Assumptions (edit these two and everything below reprices):

- **Take-home needed:** £1,750/person/month — *placeholder, set your real number*
- **Contribution margin:** 75%
- **AOV:** £96 · **Ad-fed orders:** assume half of orders eventually come from
  paid traffic at £35 CAC (≈18% of revenue re-spent on ads at steady state)

Net cash per £1 of revenue after ads ≈ 0.75 − 0.18 = **£0.57**.

| Goal | Required revenue/month | Orders/month | vs. Sep pace |
|---|---|---|---|
| One salary (£1,750) | **~£3,400** | ~35 | **1.2–1.3x** |
| Both salaries (£3,500) | **~£6,500** | ~68 | ~2.4x |
| Comfortable (£5,000) | **~£9,300** | ~97 | ~3.4x |

The striking row is the first one. **One person full-time is not a distant
fantasy — it is ~25–30% above the current September pace, sustained.** That is
what makes the staggered path below credible rather than consolation-prize
thinking.

---

## 4. The gates

### Gate 0 — prove you can buy a customer *(now — no quitting, no borrowing)*

- Run the **£336 / 28-day cold-traffic test** on Meta, built exactly as
  `ADS-BUILD-PACK.md` §1–§4 specifies.
- **Gate 0a — can we advertise at all? Answered 17 Sep 2026: yes on Meta, no
  on Google Shopping.** The two platforms have to be scored separately, and
  the earlier version of this bullet got Meta wrong.
  - **Google Shopping — closed, and treat it as permanently closed.** Merchant
    Center suspended **21 Jun 2026** for "Forbidden pharmaceuticals", never
    reinstated; 22 of 23 products still blocked in the UK, applied by a
    **manual human review** of this domain. A human looked at veloxpeps.com and
    ruled. The ~242 clicks/28 days are free listings, not a dial we can turn.
  - **Meta — open, conditionally.** UK competitor `verifiedvials.com` has run
    **~250 ads continuously since 16 July 2026**, selling research peptide
    vials — our exact product form, our country — with no enforcement action
    and 13 ads live today. The category is not categorically banned here the
    way it is on Google.
  - **The condition is the copy discipline, and it is not optional.** A second
    competitor, `peptivitalis.com`, ran the same category with a stated purity
    spec and one WhatsApp destination and had its **Page disabled on 7 Sep**,
    then rebuilt under a new Page and died in two hours. The difference between
    the two is written up as seven rules in `ADS-BUILD-PACK.md` §0.5. Follow
    them or don't run the test.
  - **The residual risk is still domain-level.** Meta classifies the domain
    separately from ad review, and events lost to a domain block are
    permanently unrecoverable. That is why §0.5 has a 72-hour policy watch and
    a hard "one appeal, then stop" rule.

  **Consequence for this gate:** Gate 0 means what it originally meant — a real
  verdict on paid social, bought for £336. Two riders:

  1. **Google Shopping stays out of every forecast in this document.** Any
     revenue line that assumed Shopping would come back should be deleted, not
     deferred.
  2. **Meta is viable but fragile, so don't build the full-time case on it
     alone.** Affiliates, SEO/content and newsletter placements remain the
     compounding assets; paid social is the fast, revocable one. If §0.5's
     72-hour watch goes badly, the reserve channel list in that section
     (newsletter/podcast → Bing → Reddit) is the fallback and the £336 moves
     there.

  ⚠ Whatever happens, do **not** open a second ad account, Page or domain in
  response to enforcement. Both platforms punish that at the domain level, and
  Google's suspension email says so explicitly. Peptivitalis tried it and lasted
  two hours.
- **Pass:** blended CAC ≤ £40 with a stable or improving trend, or CAC ≤ £80
  clearly attributable to Pay-by-Bank checkout friction (channel plausible,
  payment method the constraint).
- **Fail:** CAC > £80 after 28 days with no improving trend. If it fails,
  the loan question answers itself: there is nothing yet worth borrowing to
  scale.
- **Void, not fail:** the campaign is stopped by policy before it spends ~£200.
  That's an unrun experiment, not a negative result — rerun it on the §0.5
  reserve channels before concluding anything about CAC.

### Gate 1 — first person goes full-time

All four, simultaneously:

1. **Revenue ≥ £3,500/month for 3 consecutive months** (no single-whale months
   — strip any order > 3x AOV when checking).
2. **≥ 30% of orders from channels you control** (paid + affiliate + email),
   so the base is repeatable rather than lucky.
3. **CAC still ≤ £40** at whatever spend level you've scaled to.
4. **Cash buffer in the business = 3 months of that person's salary** before
   day one.

Who goes first: whoever's daily work most directly moves revenue — funded by
revenue, not debt.

### Gate 2 — second person follows

- **Revenue ≥ £7,000/month for 2 consecutive months** with Gate 1's channel
  and CAC conditions still holding, plus a 3-month buffer for *both* salaries.
- This is the point where inventory debt (not salary debt) becomes reasonable
  if stock depth is the constraint on growth.

### Standing risk caveats (they gate everything above)

- **Concentration:** retatrutide is 10 of 11 September orders. A single MHRA
  reclassification, supplier failure, or platform policy change on one
  compound takes most of the revenue with it. Before Gate 2, no single
  compound should exceed ~60% of revenue — the ads and affiliate work should
  deliberately widen the mix.
- **Rails:** if Fena or the bank wobbles, freeze all gate progress until
  resolved. Never quit into a payments outage.

---

## 5. On "we'd be faster side by side"

True — and worth having. But since February the constraint has never been
build capacity: the site, payments, analytics, SEO engine, dispatch
automation, and pixel all shipped around two full-time jobs. The constraint is
demand, and the actions that create demand (ad test, affiliate activation,
email list) cost pounds and evenings, not 20 person-hours a day. The
side-by-side benefit becomes real *after* Gate 1, when there is a proven
machine to operate at full throttle — and by then it funds itself.
