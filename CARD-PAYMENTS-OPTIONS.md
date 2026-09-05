# Card Payments — Options & Recommendation

**Status:** Investigation only. No integration built. Awaiting Declan's decision on direction.
**Date:** 2026-09-05
**Trigger:** A returning customer (04 Sep 2026) had a Fena payment fail and asked "Are there other options... I'm wanting to use a business card?" and "Could you send me a payment link?" We currently only offer Fena (Pay by Bank) or manual bank transfer — no card, no send-a-link.

---

## TL;DR

- **Do NOT bolt on Stripe / PayPal / Square / Shopify Payments.** They explicitly ban research peptides in the UK and will freeze the account. This is the same de-banking pattern that already cost us Wise and GoCardless. A naive card integration makes things *worse*, not better.
- **Direct card acceptance IS possible** for a UK research-peptide seller, but only via a **dedicated high-risk acquirer**, and it comes with real cost (4–8% fees, a 5–15% rolling reserve held 90–180 days) and a genuine ongoing freeze/termination risk driven by chargebacks. It should be a **secondary rail, never the sole one.**
- **The single biggest quick win is smaller than "add cards":** the customer asked for a **payment link**. Fena can already generate hosted payment links, and we can serve one manually today with zero new risk. That directly solves the Anisha-style friction without touching the merchant-risk profile.
- **My recommendation:** (1) ship a low-risk "send a payment link" capability first; (2) treat true card acceptance as an optional Phase 2 via a high-risk acquirer **with LegitScript**, only if the AOV/lost-order maths justify the cost and freeze exposure; (3) keep crypto (NOWPayments / BTCPay) as de-banking insurance, not as the card answer. Details and reasoning below.

---

## 1. Current payment architecture (what a new method must slot into)

Two rails today, both keyed off an `orders.payment_method` value and a `status` lifecycle of **`pending` → `paid` → `dispatched`** (plus `superseded`, `cancelled`).

### Rail A — Fena "Pay by Bank" (UK only, primary)

Flow:
1. `/checkout/payment/` inline script builds `metadata` + `amount_pence` from `window.__vpCheckoutTotals` (the single source of truth) and `POST`s to **`api/create-fena-payment.js`** (Vercel **edge** fn). — `output/checkout/payment/index.html:1272`
2. `create-fena-payment.js` runs a rate-limit + server-side **price/charge guards** (recomputes subtotal from `product_variants`, applies verified Pro member discount), **inserts the order as `pending` BEFORE redirect** (survives the mobile bank-app sessionStorage wipe), then calls Fena `create-and-process` and returns `result.link`.
3. Browser redirects to Fena's hosted page → customer authorises in their banking app → Fena redirects back to `/checkout/payment-complete/?order_id&ref&method=fena`.
4. **`api/confirm-fena-payment.js`** (Node fn) independently verifies with Fena's public status endpoint (`GET /public/payment-flow/single/{id}/data`), then does a **race-safe conditional PATCH** (`status=eq.pending → paid`) and fires fulfilment.
5. **`api/fena-webhook.js`** (edge fn) is the browser-independent backstop — same verify-then-flip logic; also handles Pro/subscription lifecycle. Recurring via `api/create-fena-recurring.js` + `subscriptions` table.

Fulfilment side-effects on the `pending→paid` win (idempotent, fired from whichever path wins the race): `/api/clickdrop/push` (Royal Mail label), `/api/xero/create-invoice`, `/api/send-order` (emails), `/api/ga/purchase` (GA4 server-side), Google Sheets log.

### Rail B — Manual bank transfer (international + fallback)

Flow:
1. On `/checkout/payment/`, if region = INTL (or as a fallback), the `payment_method` is set to `'bank'` and the submit handler stores totals in `sessionStorage` then redirects to `/checkout/confirmation/`. — `output/assets/js/checkout.js:977`
2. The confirmation page **inserts the order directly client-side** via `window._sb` (Supabase JS), sends the order email via `/api/send-order`, logs to Sheets. — `checkout.js:1129`
3. Order stays **`pending`** until Declan manually marks it `paid` in `/admin` when the transfer lands. No automated confirmation.

### Where a 3rd method would slot in

The Fena edge-function pattern is the clean template. A new card/crypto rail needs:
- **A `create-<provider>-payment.js`** that reuses the existing price/charge guards, inserts the `pending` order (so recovery + admin see it), and returns a hosted payment URL / redirect.
- **A `<provider>-webhook.js`** (or confirm endpoint) that verifies the payment server-side and does the same race-safe `pending→paid` conditional PATCH.
- **Reuse the existing fulfilment triggers verbatim** (`clickdrop/push`, `xero/create-invoice`, `send-order`, `ga/purchase`) — they key off `order_id` and are idempotent, so nothing new is needed there.
- **A new `payment_method` value** and a payment-method card on `/checkout/payment/`.

**Important constraint:** every `.js` in `/api` is one Vercel serverless function (Pro tier lifts the Hobby 12-fn cap; `_`-prefixed files and edge fns don't count). A card rail adds ~2 functions — check headroom before building.

---

## 2. The options, with honest risk read

### Why the obvious ones are off the table
Stripe, PayPal, Square, and Shopify Payments (which is Stripe under the hood) **prohibit research peptides / research chemicals in the UK**. Onboarding succeeds, then underwriting or a later review freezes funds and terminates. Card networks classify peptides under nutraceutical / "unapproved pharmaceutical" MCCs, and **Mastercard's BRAM / Visa's integrity programs specifically flag research peptides**. Peptide-category **chargeback rates reportedly rose ~800% between 2023 and 2024**, which is what keeps mainstream processors out.

### Option 1 — Dedicated high-risk card acquirer
Providers that knowingly underwrite this vertical: **Instabill, Easy Pay Direct, AllayPay, Corepay, Paycron, Unison, PayRio, Sensapay** (mostly US-centric); UK/EU-facing: **Trust Payments, Cardstream (gateway), Paynetics (FCA EMI), QuadraPay, SecureGlobalPay**.

- **Approval likelihood:** Moderate — but conditional. It's underwritten per-merchant (typically 3–7 business days with full docs), not a self-serve signup. For **card** acceptance, Visa/Mastercard's Internet Pharmacy programs generally require **LegitScript certification** for peptides (research-use-only positioning can dodge LegitScript for *ACH* but **not** for cards). **Not all research chemicals are LegitScript-certifiable** — an application listing non-certifiable SKUs can be rejected outright.
- **Fees:** ~**3.5–8%** + per-transaction, plus setup + monthly minimums, plus chargeback fees (~£15–£40 each).
- **Reserve:** **5–15% rolling reserve held 90–180 days** — this ties up working capital continuously.
- **Chargeback / freeze exposure:** **HIGH and ongoing.** Even after approval, if chargebacks breach Visa/MC monitoring thresholds you face fines and termination. This *is* the de-banking risk we already know, just with a processor that tolerates more of it for a higher price.
- **KYC:** Declan must personally complete underwriting/KYC/banking. **Disclose the full peptide catalogue up front** (our standing rule — avoids the onboard-then-close trap that got us with Wise/GoCardless).

### Option 2 — Crypto-to-card gateway (card in, USDC/crypto settle)
E.g. **Peptide-Pay** and similar "fiat-to-crypto" gateways: customer pays by Visa/Mastercard/Apple Pay on the gateway's hosted page; the gateway settles **USDC/crypto to our wallet**. Marketed at exactly this vertical.

- **Upside:** a real "pay by card" button without *us* holding a card-network merchant account; **no chargebacks reach us** (we're settled in crypto); closure-resistant on our side; conversion far better than pure crypto because the buyer uses a card.
- **Downside / risk:** (a) **trust & custody risk** — several of these entities are opaque; verify legal entity, banking, and custody before sending a penny of volume through them (this matches our prior read on "PeptiPay": opaque/low-trust). (b) We then **hold crypto and must off-ramp to GBP**, which re-introduces banking/de-risking exposure at the exchange/withdrawal step. (c) Fees ~**3%+**. (d) The card-network risk hasn't vanished — it's just borne by the gateway, which is why these gateways themselves come and go.
- **Verdict:** viable as a "card-like" option *only after* verifying the provider's entity/bank/custody and having a working GBP off-ramp. Medium trust risk.

### Option 3 — Pure crypto (NOWPayments / self-hosted BTCPay)
- **NOWPayments:** 300+ coins, ~0.5% fee, no chargebacks; fiat features need KYC. **BTCPay:** self-hosted, non-custodial, ~free, max sovereignty but technical to run and crypto-only.
- **Reality check:** **85–90% of buyers won't open a wallet to check out** → this is *not* a card fallback and won't help the Anisha case. It's genuine **de-banking insurance** and belongs in the resilience plan, but it's a different job.

### Option 4 — Another open-banking provider "with a card fallback"
Most open-banking rails (TrueLayer, Yapily, Plaid) are **bank-only** — adding a card fallback means adding an acquirer, i.e. you're back to Option 1's underwriting and freeze risk. There's no free "open banking + cards" that skips high-risk card underwriting.

### Option 5 (not really a new rail) — Fena payment links / better fallback UX
Fena supports **hosted payment links**. The customer literally asked for a link. We can send a Fena (or bank-transfer) payment link **manually today** with zero new risk, and later expose a "email me a payment link" button. This solves the *"can you send me a payment link"* half of the friction immediately, and part of the *"my payment didn't go through"* half (a fresh link lets them retry cleanly). It does **not** solve "I want to use a business card" — only a card rail (Option 1/2) does that.

---

## 3. Recommendation

**Is a card option viable?** Technically yes, via a dedicated high-risk acquirer (Option 1) or a crypto-to-card gateway (Option 2). But it is **not advisable as a first move**, because both re-import the exact freeze/de-banking exposure that shaped our current bank-only setup, at material cost, to serve a minority of buyers who specifically want a card.

Suggested sequence:

1. **Now (low risk, high leverage): ship "send a payment link."**
   Start manual (founder pastes a Fena / bank-transfer link into the reply), then productise a "email me a secure payment link" action from `/admin` or the recovery flow. Directly answers the customer's request, helps Fena-failure retries, adds **zero merchant-risk**. This is the cheapest way to recover Anisha-type lost orders.

2. **Measure the actual card demand.** Before paying for a high-risk acquirer, quantify: how many orders are lost specifically to "no card option" vs. Fena retry-friction (which we already know is a UX/data problem, not mainly a revenue leak). If it's a handful, the rolling reserve + fees won't pay for themselves.

3. **If card demand is real → Option 1 with LegitScript**, treated as a **secondary rail alongside Fena**, never the sole processor. Declan personally handles underwriting/KYC/banking; disclose the full catalogue up front; budget for the rolling reserve and active chargeback management. Get a written category-acceptance confirmation before integrating.

4. **Optionally, Option 2 (crypto-to-card)** as a lighter-touch "card" button — **only after** verifying the gateway's entity, banking, and custody, and confirming a reliable GBP off-ramp.

5. **Keep Option 3 (NOWPayments / BTCPay) on the roadmap as de-banking insurance** — independent of the card question.

**Integration shape (whichever card route wins):** mirror the Fena edge-function pattern — a `create-<provider>-payment.js` (guards + insert `pending` + return hosted URL), a `<provider>-webhook.js` (verify + race-safe `pending→paid`), reuse the existing fulfilment triggers, add a `payment_method` value and a checkout card. ~2 new serverless functions — confirm Vercel function headroom first.

**Do not proceed to build any card integration until (a) the demand is quantified and (b) Declan has picked a provider and completed onboarding.** No account creation, KYC, or key handling will be done on his behalf.

---

## Sources
- [Peptide Payment Processing in 2026 (Coinmonks/Medium)](https://medium.com/coinmonks/peptide-payment-processing-in-2026-how-research-chemical-companies-are-finally-accepting-card-d87867be0eb8)
- [10 Best Payment Processors for Peptide Merchants 2026 (PayRam)](https://payram.com/blog/best-payment-processors-for-peptide-merchants)
- [Peptide Merchant Account 2026 (Unison)](https://www.unisonpayment.com/industries/peptides)
- [LegitScript for Peptide Merchants 2026 (Unison)](https://www.unisonpayment.com/blog/legitscript-certification-peptide-merchants)
- [Do Peptide Research-Only Sellers Qualify Without LegitScript? (SeamlessChex)](https://www.seamlesschex.com/deep-dives/do-peptide-research-only-sellers-qualify-for-ach-origination-without-legitscript)
- [Healthcare Certification (LegitScript)](https://www.legitscript.com/certification/healthcare-certification/)
- [Best Payment Gateways for Peptide Sellers in the UK (Wallid)](https://wallid.co/blog/tpost/xgkgrgpeg1-best-payment-gateways-for-peptide-seller)
- [No-KYC / card-to-crypto Gateways 2026 (Coinmonks/Medium)](https://medium.com/coinmonks/no-kyc-payment-gateways-in-2026-which-platforms-actually-let-you-accept-cards-and-get-paid-in-adb6b25fe1cd)
- [NOWPayments — accepting crypto payments FAQ](https://nowpayments.io/help/payments)
- [Cardstream High Risk Payment Processing (UK)](https://cardstream.com/cardstream/high-risk-payment-processing/)
- [Trust Payments — guide to payments for high-risk businesses](https://www.trustpayments.com/blog/the-essential-guide-to-payments-for-high-risk-businesses/)
- [Best High-Risk Merchant Accounts UK 2026 (Business Expert)](https://www.businessexpert.co.uk/payment-processing/best-high-risk-merchant-accounts/)
