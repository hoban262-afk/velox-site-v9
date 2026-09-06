# Ad Campaign Build — Velox Peptides

**Date:** 6 September 2026
**Companion to:** `PAID-ACQUISITION-PLAN.md` (why to advertise) — this is *how*.
**Status:** ready to build. Two hard prerequisites remain, both listed in §2.

---

## 1. The finding that shapes the whole campaign

I pulled your actual order lines before designing anything. One product carries the business:

| Product | Revenue | % of revenue | Customers |
|---|---|---|---|
| **Retatrutide** | £3,274 | **53.2%** | 31 |
| Tesamorelin | £1,120 | 18.2% | 2 *(one whale)* |
| GHK-Cu | £393 | 6.4% | 6 |
| Bac Water | £300 | 4.9% | 28 *(attach)* |
| Everything else | ~£1,050 | 17% | — |

**31 of your 37 paying customers have bought retatrutide.** All five of your repeat customers are retatrutide buyers. It is not one product among forty — it is the front door to your business, and everything else is basket-filler around it.

The traffic data says the same thing independently. Over the last 30 days `/compounds/retatrutide/` drew **121 unique sessions** — more than three times the next compound page (GHK-Cu, 44) and second only to the homepage and the category index. Demand and revenue agree.

**And it is the single least advertisable thing you sell.**

Retatrutide is a triple GLP-1/GIP/glucagon agonist. It is what the weight-loss market is chasing. Any Meta or Google creative that names it, shows it, or implies what it does will be rejected on review — and repeated rejections are how ad accounts get restricted, not just individual ads.

So the campaign has a structural tension at its centre: *the product that converts is the product you cannot mention.*

### How the competitor resolves it — and this is the copyable insight

Go back to VerifiedVials' 19 live Meta ads. Not one of them names a compound. The verbatim lines were:

> "Three tests. One verified batch."
> "Purchasing decisions should be supported by evidence, not extravagant promises."
> "Big delivery day at the Verified Vials fulfilment centre"

That is not a lack of imagination. **They advertise the brand and the testing, then let the compound be discovered on-site.** The ad sells *trust in a supplier*; the product page does the rest. That's the only formula that survives ad review in this category, and it happens to suit you, because trust is exactly where you're competitively strong and where a cold visitor's actual objection sits.

**Campaign principle: the ad sells the lab. The site sells the compound.**

### One caution on the LTV case

Retatrutide buyers look more valuable at first glance (£161 LTV vs £106), but that gap is almost entirely one £1,554 customer. Strip whales above £1,000 and it's **£115 vs £106 — effectively no difference**. Retatrutide is your *acquisition* product, not a higher-value one. Don't build a CAC case on a retatrutide LTV premium that isn't there. Plan against blended LTV ~£113.

---

## 2. What must be true before you spend

One genuine blocker, and one constraint you'll have to live with rather than fix.

### 2.1 There is no Meta pixel on the site. This is the blocker.

I checked. `output/index.html` carries GA4 (`G-YFPX0Q1G50`) and nothing else. No `fbq`, no Conversions API, no Meta pixel anywhere in the codebase.

This matters more than it sounds. Without a pixel firing purchase events, Meta's delivery algorithm has no conversion signal to optimise toward. You'd be forced to optimise for link clicks or landing-page views — which reliably buys you the cheapest, worst traffic on the platform. A conversion-optimised campaign and a click-optimised one at the same budget are not the same experiment; the click-optimised one will underperform and you'll wrongly conclude the channel doesn't work.

**Build:** pixel + Conversions API server-side, firing `ViewContent`, `AddToCart`, `InitiateCheckout`, `Purchase`. Your first-party `events` table already captures exactly these five events with a `sid` — the server-side CAPI feed can be built straight off it, which also makes it resistant to iOS/ad-blocker loss. Roughly a day's work. I can do this.

**Seeding caveat:** Meta needs ~50 conversions per week per ad set to exit the learning phase. You will do nowhere near that. Plan to optimise for `InitiateCheckout` (which you'll get maybe 5–10× more of) rather than `Purchase`, and accept that delivery stays semi-learning throughout the test.

### 2.2 Card payments — the constraint you'll have to live with

You are Pay-by-Bank only. Your 82% payment-page-to-completion rate is measured on *warm* traffic that already decided to buy from you. Cold paid traffic meeting an unfamiliar payment method for the first time behaves very differently.

Quantified against a £360/month test at an assumed £0.80 CPC (~450 clicks):

| Scenario | Cold CVR | Orders | CAC | Verdict |
|---|---|---|---|---|
| Pay-by-Bank only, pessimistic | 0.8% | 3.6 | **£100** | Fails |
| Pay-by-Bank only, optimistic | 1.5% | 6.8 | **£53** | Marginal |
| With card checkout | 2.5% | 11.3 | **£32** | Works |

Your CAC ceiling is £50–60. **Pay-by-Bank-only outcomes straddle the kill line; card outcomes clear it comfortably.** That is the whole argument for sequencing, in one table.

You can still run the test without cards — you'll learn your real CPC and CTR, which are worth knowing. But go in understanding you're likely to record a "failed" CAC that reflects the payment method rather than the channel, and don't kill the channel on that evidence.

#### ⚠️ Update: this prerequisite may not be resolvable, and that changes the plan

I chased the obvious challenge — VerifiedVials has full card checkout, so why can't you? Full write-up in `CARD-PAYMENTS-OPTIONS.md` §6. The short version:

They are on **Shopify Payments, which in the UK is Stripe** (verified from their public payments config — no third-party gateway). Stripe's policy doesn't actually name peptides, so onboarding often succeeds. **But their earliest product dates to 30 April 2026 — they are four months old**, which sits inside the window before Stripe's manual review typically bites. And their bundle names ("Inflammation & Tissue Repair", "Growth Hormone & IGF-1 Signalling") are therapeutic claims — the exact trigger in the clause that would be enforced against them.

The decisive point isn't rejection risk, it's **termination** risk: a prohibited-business termination can put CRP Labs on the card-network **MATCH list**, a ~5-year blacklist that would poison every future acquirer relationship including the high-risk ones. You've been de-banked twice. A third with MATCH attached is far worse than the friction it solves.

**So do not treat "get card payments" as a two-week task before launching.** It may take months via a specialist high-risk acquirer, or prove impractical. Two consequences:

1. **Plan the test on Pay-by-Bank-only economics.** Expect the £53–100 CAC band, not £32. If the trend is improving and CPC/CTR look healthy, that's a *pass* worth scaling carefully — not a fail.
2. **Do not block the ad test on card payments.** That was the sequencing in `PAID-ACQUISITION-PLAN.md`; this finding overturns it. Waiting for a prerequisite that may never land means never testing.

**Cheap partial mitigations, worth doing first:** ship the Fena payment-link flow (`CARD-PAYMENTS-OPTIONS.md` §3 already recommends it, it's low-risk and mostly built), and make the Pay-by-Bank explainer at checkout much stronger — cold traffic abandons because the method is *unfamiliar*, not because it's bad. Explaining it well is free and recovers some of that gap.

---

## 3. Campaign structure

### Meta only. Not Meta *and* Google Display.

`PAID-ACQUISITION-PLAN.md` said "Meta first, Google Display second". Having done the budget maths I'd tighten that: **at £10–15/day, do not split across two platforms.** £6/day per platform buys statistically meaningless data on both and you'll end the month unable to conclude anything. Concentrate the full budget on Meta, get a readable result, then decide.

Google Display is also the weaker cold-prospecting channel by some distance — it's banner inventory, low intent, and it's mostly useful for retargeting. The competitor runs it because Search is closed to them, not because it's their winner.

### Structure

```
Campaign: Velox — Cold Prospecting (Conversions → InitiateCheckout)
│
├── Ad set A: Broad UK, 25–55, no interest targeting     [60% budget]
│     Meta's algorithm out-targets manual interest picking
│     on small budgets. Let it find them.
│
└── Ad set B: Interest-stacked                            [40% budget]
      Biohacking / longevity / peptide-adjacent interests,
      UK, 25–55. Exists as a control to test whether
      targeting beats broad. Kill whichever loses.
```

**No retargeting ad set yet.** At ~200 real humans/month you cannot fill a retargeting pool — the audience would be too small to deliver. Retargeting becomes the highest-ROI campaign you run, but only *after* cold traffic has built the pool. Revisit at month two.

**Landing pages.** Do not send cold ad traffic to the homepage. Send it to:
- `/about/coa-library/` — for testing/documentation creative. This is your strongest page for a sceptical first-time visitor and it is almost entirely unvisited: **46 hits in 90 days**, about one every other day. You built your best trust asset and nothing points at it.
- `/compounds/` — category page, for the broader "what do you sell" creative.

Both with UTM tags, which now work end to end (verified live today).

### UTM convention — use exactly this

```
?utm_source=facebook&utm_medium=cpc&utm_campaign=cold_prospect
 &utm_content={{ad.name}}&utm_term={{adset.name}}
```

Meta's dynamic parameters populate `{{ad.name}}` and `{{adset.name}}` automatically, so every creative shows up as its own row in **Admin → Traffic → Campaigns** without you tagging anything by hand. Name your ads descriptively (`vid_fulfilment`, `static_threetests`) because those names become your reporting.

---

## 4. Creative brief

**The formula:** documentation, testing, dispatch reality. Zero health claims. Zero before/after. Zero dosing. No human-use implication anywhere, including in comments you reply to.

**Every ad closes with:**
> For laboratory research use only. Not for human or veterinary use. Terms apply.

That line is not decoration — it is the thing that gets the ad through review.

### Five ads to launch with

**1. `static_threetests` — the testing proposition**
> Every batch. HPLC and mass spec. Third-party verified.
> We publish the certificate of analysis for all 15 compounds in our catalogue — before you order, not after you ask.
> *For laboratory research use only. Not for human or veterinary use.*

→ `/about/coa-library/`

**2. `static_publiccoa` — the transparency angle**
> Ask a supplier for a COA. Wait three days. Get an image.
> Ours are public, on the site, batch-matched, no email required.
> *For laboratory research use only. Not for human or veterinary use.*

→ `/about/coa-library/`

**3. `vid_fulfilment` — behind the scenes**
Phone footage of a genuine dispatch run: vials, labels, packing, Royal Mail bags. Unpolished works better than produced here — it reads as real.
> Dispatch day at the Velox lab. UK stock, UK dispatch, next working day.
> *For laboratory research use only. Not for human or veterinary use.*

→ `/compounds/`

**4. `static_uk` — the sourcing objection**
> UK-held stock. UK dispatch. No customs, no six-week wait, no "shipped from overseas" surprise.
> *For laboratory research use only. Not for human or veterinary use.*

→ `/compounds/`

**5. `static_price` — the wedge you're not using**
You are **up to 50% cheaper** than VerifiedVials on identical compounds (BPC-157 £31 vs €46.30; GHK-Cu £39 vs €58.17; NAD+ £54 vs €117.52). Do not discount further — but do *say it*.
> Same compounds. Same testing standard. Half the price of most UK suppliers.
> *For laboratory research use only. Not for human or veterinary use.*

→ `/compounds/`

### What to never put in an ad

Compound names in headlines · anything about weight, fat, muscle, healing, sleep or cognition · before/after imagery · syringes or injection imagery · dosing · "results" · testimonials describing effects · any word implying human use.

### One gap worth closing

VerifiedVials' COAs include **endotoxin** testing. Yours are HPLC + mass spec only. Endotoxin is the test a sceptical buyer in this category actually asks about, and it's the one claim of theirs you currently can't match. If you can add it at the batch level, it becomes your strongest single ad and it's a genuine product improvement rather than a marketing one. Worth pricing up.

---

## 5. Budget, timeline, and what "success" honestly looks like

**£12/day × 28 days = £336.** One campaign, two ad sets, five creatives.

| Week | What happens | What you're reading |
|---|---|---|
| 1 | Learning phase. Delivery erratic, CPC unstable. **Change nothing.** | Nothing yet. Resist the urge. |
| 2 | Delivery settles | CPC, CTR, which creative earns clicks |
| 3 | Kill the bottom two creatives, shift budget to winners | Landing-page CVR, cart rate |
| 4 | Read the result | CAC, and whether the trend is improving |

**The single most common way this fails is fiddling in week one.** Small budgets take longer to exit learning, and every edit resets it. Set it, leave it.

### What you're actually buying

Not profit. £336 does not build a business. You are buying three numbers you currently have to guess at: **your real CPC in this category, your cold-traffic CTR, and your cold-traffic conversion rate.** With those you can model whether a £3,000/month campaign works. Without them, any bigger commitment is a guess.

### Kill criteria — with a caveat that matters

Original criterion: stop if CAC > £60 after 30 days with no improving trend.

Keep that, but **interpret it against §2.2**. If you run without card payments and land at £80–100 CAC, the correct conclusion is *"the channel is plausible and the payment method is the constraint"* — not *"ads don't work"*. Those two readings lead to opposite decisions and it would be easy to take the wrong one.

Hard stop regardless: **ad account restriction.** If Meta rejects creatives repeatedly, stop and reassess rather than resubmitting variations — that's the path to losing the account, which is a much more expensive loss than the £336.

---

## 6. Sequencing — what I'd actually do, in order

1. **Email the three affiliates.** Still free, still unstarted, still the highest ROI action available. Brandon King's PeptideStack is a vendor-comparison site — the highest-intent traffic in the category, and it costs you nothing until it produces a sale. Codes and terms are in `PAID-ACQUISITION-PLAN.md` §5. **This needs you, today.**
2. **Meta pixel + CAPI.** ~1 day, built off the existing `events` table. I can do this. **This is the one genuine blocker** — without conversion signal the test is much weaker and you'd be buying an unreliable answer.
3. **Decide on the separate entity** — see §7. Needs you and your accountant. Resolve before the first ad goes live, not after.
4. **Ship the Fena payment-link flow** and strengthen the Pay-by-Bank explainer at checkout. Cheap, low-risk, recovers some of the conversion gap.
5. **Launch the £336 test** on Pay-by-Bank economics. Do not wait for cards.
6. **Card payments in parallel, on a longer clock** — via a specialist high-risk acquirer, or the unexplored third-party-gateway route. Months, not weeks. See `CARD-PAYMENTS-OPTIONS.md` §6.

This is a **change from `PAID-ACQUISITION-PLAN.md`**, which put card payments in Phase 1 as a prerequisite. Having established that the card route is slow and possibly impractical, blocking on it means never testing. Steps 2 and 3 are genuinely worth waiting for — days and a conversation respectively. Card payments are not.

---

## 7. The entity question — you marked this "worth exploring"

Kim Constable did not advertise through The Sculpted Vegan. She incorporated **RKCKMJ Ltd (NI731628)** on 23 July 2025 and ran the entire paid-media play through it, firewalled from her name in both directions.

That is almost certainly deliberate risk structuring, and it's the most instructive thing in the whole competitive analysis. Consumer-facing advertising raises exactly two risks you have already been burned by:

- **ASA / CAP Code 12.11–12.12** — advertising unlicensed medicines to the public. Rulings are public, searchable, and acquirers do search them.
- **Payment provider visibility.** Ad complaints raise your AML profile with your PISP. That pattern de-banked you once.

**CRP Labs Ltd carries your entire business** — the bank, the payment rail, the supplier relationships, the customer base. Advertising under it means a single ASA ruling or complaint cluster puts all of that at risk simultaneously. A separate entity ring-fences the advertising risk from the operating company.

This is a decision for you and your accountant, not for me — there are real costs (a second set of accounts, a second bank relationship, VAT and intercompany considerations) and I'm not qualified to advise on the tax or legal structure. But given you've been de-banked before and your competitor structured for exactly this, **I'd treat it as the default rather than the option**, and I'd resolve it before the first ad goes live rather than after.

---

## 8. What I'm uncertain about

- **The CPC and CVR figures in §2.2 are modelled, not measured.** £0.80 CPC is a reasonable UK estimate for this audience; the cold CVR range is derived from your warm 10% with a standard cold-traffic discount. Both could be materially wrong in either direction — which is precisely why the £336 test exists.
- **Competitor spend is still unknown.** 28 live creatives proves activity, not budget. "Ads everywhere" may partly be tight retargeting of *you*.
- **They may be in enforcement lag.** Passing review in September 2026 doesn't mean the account survives. Budget on the assumption you could lose yours.
- **Whether endotoxin testing is achievable at your scale** — I don't know your lab's capability or what it would cost.
