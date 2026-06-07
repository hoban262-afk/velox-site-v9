# Velox Design Lab — Go-to-Market & Conversion Plan

**Strategic frame:** Design Lab is not a traffic product — it's the *demo that travels*: a 60-second "watch AI invent a novel research peptide" moment that affiliates and community can't stop sharing, captured as email, converted to Pro at the point of delight, and funnelled — both its visitors and its backlink authority — into the real money pages (Retatrutide first).

All framing is **in-vitro research use only**. No medical, health, dosing, or human-use claims anywhere. UK English.

---

## Grounding facts this plan is built on

- **`design_lab_runs`**: `id, user_id, target, brief(jsonb), candidates(jsonb), name, share_token, is_shared, tier_at_run, created_at`. Currently **0 runs** — greenfield.
- Output = **3 candidate sequences**, each scored on **synthesisability, novelty, length-optimisation**.
- Tiers: free = 1 design, Solo = 4, Group = 20, Lab = unlimited.
- **Shareable runs** already supported (`share_token`, `is_shared`).
- Funnel spine tables exist: `visits(sid, path, ref)`, `profiles(is_pro, pro_tier, created_at, email)`, `orders(user_id, affiliate_code_used, items, status)`, `subscribers` (email list), `affiliates` + `affiliate_referrals`.
- Real compound URLs for cross-sell: `/compounds/retatrutide/` (money page), plus `bpc-157, tb-500, bpc157-tb500-mix, ghk-cu, kpv, cjc-1295, tesamorelin, mots-c, semax, selank, dihexa, dsip, melanotan-ii, nad-plus, glutathione`, and category pages `/compounds/{metabolic,recovery,growth,cognitive,antioxidant}/`.

---

## 1. Channel Plan — weaponise the demo

**The one-line weapon:** *"Watch an AI invent a brand-new research peptide in 60 seconds."* Every asset below is a variation on showing that, then handing over a shareable link.

### Affiliates / influencers (primary — this is where demand comes from)
- **Signature demo, not a discount code.** Brief each affiliate to *screen-record one live Design Lab run* on their own target idea. The hook is the novelty (AI inventing a sequence), not "10% off." The affiliate's existing code still rides every order via `orders.affiliate_code_used`.
- **Give every affiliate a pre-made run to react to.** You generate 3–5 strong shareable runs (`is_shared=true`) and hand affiliates the `share_token` URLs so even a non-technical creator can post "look what Velox's AI designed" with zero effort.
- **Attribution that already works:** affiliate link → lands on `/design-lab/?ref={code}`, code persists to checkout, lands in `affiliate_referrals` / `orders.affiliate_code_used`. **Decision needed:** confirm the `?ref=` param is captured on `/design-lab/` the same way it is on product pages (see Measurement gaps).
- **Tiered ask:** micro-creators get the demo script + sample run; larger creators get a **Lab tier comp** (unlimited designs) so the tool itself becomes their content engine — they keep posting runs, you keep getting backlinks and clips.

### Short-form video (Reels / TikTok / Shorts)
- Format that wins: **screen + face, 15–25s, the result reveal is the payoff.** Type a plain-English target → cut to the 3 scored sequences appearing → end on "I designed this in 60 seconds at veloxpeps.com." (5 ready hooks in §4.)
- **Repurpose every run into a clip.** Because runs are shareable and visual, one generation = one post. Cadence: 3–5/week to @veloxpeps, cross-posted to TikTok/Shorts.
- CTA in caption + pinned comment → `/design-lab/` (link in bio), never a raw product link (lead with the toy, sell second).

### Community — the "Design Challenge" mechanic (uses shareable runs)
- **Weekly prompt** in Discord/Telegram: e.g. *"Design the most novel GLP-1/GIP/glucagon triple-agonist candidate you can."* Members run Design Lab and drop their `share_token` link.
- **Scoreboard by the tool's own metrics:** highest combined **novelty × synthesisability** wins. The scores are objective and screenshot-ready, so the contest polices itself.
- **Prize that drives the business:** winner gets a **Pro month (or Lab week)** + a store credit code (issue via `newsletter_codes`). This converts the most engaged researchers into Pro trialists and repeat buyers — directly attacking the "zero repeat buyers" problem.
- **Seed it:** post the first 3 challenge entries yourself (founder runs) so the thread is never empty.
- **Decision needed:** prize cadence/value and whether winners' runs get featured on the landing page as crawlable samples (ties into SEO §2c).

---

## 2. SEO Plan

### (a) Own the zero-competition category terms
- Target: **"AI peptide design", "AI peptide design tool", "design novel peptides", "Velox Design Lab", "peptide sequence generator (research)."** Near-zero volume but near-zero competition — you can rank #1 and own the category as it emerges, and these terms are what PR/backlinks will use as anchor text.
- `/design-lab/` is the canonical category page. Current title/meta are already strong; keep the H1 aligned to "AI Research Peptide Design."

### (b) Supporting content layer that DOES have demand → links into the tool and the money pages
Build these as guides under `/guides/` and interlink **guide ↔ tool ↔ product** (this is also how Design Lab's authority gets funnelled to Retatrutide):

| Guide (has search demand) | Links out to |
|---|---|
| "What makes a peptide *novel*? (research explainer)" | → `/design-lab/` (try it) + `/guides/glossary/` |
| "GLP-1 / GIP / glucagon triple agonists explained" | → `/compounds/retatrutide/` **(money page)** + `/design-lab/` |
| "Peptide synthesisability: why sequence length & residues matter" | → `/design-lab/` + `/compounds/metabolic/` |
| "Research peptide families: repair, metabolic, growth, cognitive" | → each category page + `/design-lab/` |

- Rule: **every guide that touches metabolic/incretin topics links to `/compounds/retatrutide/` with descriptive anchor text** ("research retatrutide"). This is the mechanism that lifts Retatrutide from ~position 39 — Design Lab earns the links, internal linking passes the authority to the page that makes money.

### (c) Technical setup for `/design-lab/`
- **Title:** keep `Velox Design Lab — AI Research Peptide Design | Velox Peptides`.
- **Meta description:** current one is good (plain-English → 3 scored sequences in 60s, included with Pro).
- **OG/Twitter:** custom OG image showing a sample result card (3 sequences + scores) so shared links render the *product*, not a logo. `og:title`, `og:description`, `og:image` (1200×630), `twitter:card=summary_large_image`.
- **Schema (two blocks):**
  - `SoftwareApplication` — `name: "Velox Design Lab"`, `applicationCategory: "BusinessApplication"`, `offers` reflecting free + Pro tiers, `featureList` (plain-English input, 3 scored candidates, novelty/synthesisability/length scoring, shareable runs).
  - `HowTo` — steps: *Describe your research target → Generate → Review 3 scored candidates → Share or enquire about custom synthesis.* (No outcomes/claims — purely how the tool is used.)
- **Crawlable sample outputs (the SEO unlock):** render shared runs server-side at **`/design-lab/r/[share_token]`** (SSR/static) so each public run is an indexable page with the target text, the 3 sequences, and scores. This turns community challenge entries into a growing corpus of long-tail indexable content and internal links. Add `<link rel="canonical">` per run and a "Design your own →" CTA + nearest-compound cross-sell on every shared run page.
- **Decision needed:** confirm `/design-lab/r/[share_token]` can be server-rendered (Next.js) and that shared runs should be `noindex` until is_shared, then indexable when shared.

---

## 3. Conversion Plumbing

### (a) Pro paywall at the moment of delight
- Free user gets **one full result** (all 3 sequences, all scores — don't cripple the first hit; the delight *is* the conversion driver).
- The paywall fires **immediately after the first result renders**, on the attempt at a 2nd design: an inline card, not a redirect — *"That was design 1 of 1. Velox Pro unlocks 4–unlimited designs, shareable runs, and member pricing on every compound."* (copy in §4).
- Gate logic uses `tier_at_run` + count of `design_lab_runs` for that `user_id`.

### (b) Every result bridges to the closest in-stock compound (cross-sell → Retatrutide etc.)
Add a **"Researching this area? Velox stocks:"** block under every result, mapping the `target`/`brief` to real SKUs:

| Detected target theme | Bridge to |
|---|---|
| GLP-1 / GIP / glucagon / incretin / metabolic / appetite | **`/compounds/retatrutide/`** (+ `/compounds/metabolic/`) |
| tissue repair / tendon / gut / anti-inflammatory | `bpc-157`, `tb-500`, `bpc157-tb500-mix`, `kpv` (`/compounds/recovery/`) |
| growth hormone / secretagogue / GHRH / IGF | `cjc-1295`, `tesamorelin`, `mots-c` (`/compounds/growth/`) |
| nootropic / cognition / neuroprotection | `semax`, `selank`, `dihexa`, `dsip` (`/compounds/cognitive/`) |
| skin / pigmentation / melanocortin | `melanotan-ii` |
| mitochondrial / cellular / antioxidant | `nad-plus`, `glutathione`, `mots-c`, `ghk-cu` (`/compounds/antioxidant/`) |
| **no confident match** | default to **Retatrutide** + "Browse all compounds" |

- **Decision needed:** implement as a keyword-rule map in the result component, or store a `mapped_slug` on the run. Rules are faster to ship; a column makes it analysable.

### (c) Result → custom synthesis enquiry
- Because the AI's sequences are *novel and not stocked*, add a **"Enquire about synthesising this candidate"** CTA on each candidate → pre-filled enquiry (sequence + scores + run link). This monetises the exact thing the tool produces and qualifies high-intent Lab-tier leads. Route to your existing custom-synthesis enquiry flow.

### (d) Free design gated behind email → Handbook → educational → product
- **Email AFTER the first result, not before** (capture at peak delight): *"Want your sequences saved + the Researcher's Handbook? Drop your email."* Writes to **`subscribers`**, triggers the Handbook welcome flow, and (passwordless) creates the `profiles` row so the run attributes to a user.
- Handbook flow sequence: welcome + Handbook → "what makes a peptide novel" guide → soft product intro (Retatrutide / category that matches their first design's theme) → Pro offer.
- **Decision needed:** email-only passwordless capture vs full signup for the free run. Recommend passwordless (lowest friction; still gives `user_id` for attribution).

---

## 4. Copy Assets

### 4.1 `/design-lab/` landing page copy

**Eyebrow:** RESEARCH TOOL · INCLUDED WITH VELOX PRO

**H1:** Describe a research target. Watch AI design a novel peptide.

**Sub:** Velox Design Lab turns a plain-English description of a target mechanism into three novel research-peptide sequences — each scored for synthesisability, novelty and length-optimisation — in under 60 seconds. For in-vitro research use only.

**Primary CTA:** Design your first peptide free →
**Secondary:** See a sample design →  (links to a public shared run)

**How it works (3 steps):**
1. **Describe it in plain English.** "A GLP-1 / GIP / glucagon triple agonist optimised for synthesisability." No notation required.
2. **Generate.** The model proposes three novel candidate sequences.
3. **Review & score.** Each candidate is scored on synthesisability, novelty and length — share the run, or enquire about custom synthesis.

**Why researchers use it:**
- *Novel by design* — sequences are generated, not pulled from a catalogue.
- *Scored, not guessed* — synthesisability, novelty and length-optimisation on every candidate.
- *Shareable* — send a run to a collaborator with one link.
- *Built on a real supply chain* — when you're ready to research a known compound, Velox dispatches HPLC-verified material from the UK.

**Tiers strip:** Free: 1 design · Solo: 4 · Group: 20 · Lab: unlimited. *Included with Velox Pro.*

**Compliance line (footer of page):** Velox Design Lab is a research tool. Generated sequences are computational proposals for in-vitro research use only and are not medical advice, not a medicinal product, and not for human or animal use.

### 4.2 Affiliate demo / video script (~45s)

> **[0–3s, face to cam]** "This is an AI that invents brand-new research peptides. Watch."
> **[3–10s, screen]** "I type what I'm researching — a GLP-1, GIP and glucagon triple agonist — in plain English. No code."
> **[10–18s, screen]** "Hit generate… and in under a minute it gives me *three* novel sequences I won't find in any catalogue."
> **[18–30s, screen]** "Each one's scored — how novel it is, how easy it'd be to synthesise, how length-optimised. This top one scores [X] on novelty."
> **[30–40s, face]** "It's free to try one. I'll drop my link — design your own and send it back to me, I want to see what you get."
> **[40–45s]** "Velox Peptides. Research use only — but this is the coolest tool in the space right now."

*(Affiliate keeps their tracking code; link goes to `/design-lab/?ref=CODE`.)*

### 4.3 Post-result Pro paywall copy

**Headline:** That's design 1 of 1. 🔓
**Body:** You've just generated three novel candidates. Velox Pro unlocks more designs (Solo 4 · Group 20 · Lab unlimited), saves and shares every run, and applies member pricing to every compound in the store.
**Primary CTA:** Unlock more designs with Pro →
**Secondary:** Save these results + get the Researcher's Handbook (just your email) →
**Reassurance:** Cancel anytime in your bank. Research use only.

### 4.4 Five short-form hooks
1. "I asked an AI to invent a peptide that doesn't exist yet. Here's what it gave me."
2. "Type what you're researching in plain English → get 3 novel sequences in 60 seconds."
3. "This is the only AI that designs research peptides — and scores how novel they are."
4. "Nobody's catalogue has this sequence. An AI just invented it live."
5. "Researchers: stop searching for sequences. Describe the target and let the AI design it."

---

## 5. Measurement — the Design Lab funnel

**Funnel:** `Design Lab visit → generation → email captured → Pro started → order placed`. Spine = `user_id` (runs → profiles → orders); top-of-funnel volume = `visits.path`.

**Step 1 — Top of funnel (traffic to tool):**
```sql
select date_trunc('week', created_at) wk, count(*) visits, count(distinct sid) sessions
from visits where path like '/design-lab%' group by 1 order by 1;
```

**Step 2 — Generations (activation):**
```sql
select date_trunc('week', created_at) wk,
       count(*) runs, count(distinct user_id) designers,
       sum((is_shared)::int) shared
from design_lab_runs group by 1 order by 1;
```

**Step 3 — Email captured (lead):** designers who became subscribers.
```sql
select count(distinct r.user_id) designers,
       count(distinct s.email) filter (where s.email is not null) on_list
from design_lab_runs r
left join profiles p on p.id = r.user_id
left join subscribers s on lower(s.email) = lower(p.email);
```

**Step 4 — Pro started (conversion):**
```sql
select count(distinct r.user_id) designers,
       count(distinct r.user_id) filter (where p.is_pro) went_pro
from design_lab_runs r join profiles p on p.id = r.user_id;
```

**Step 5 — Order placed (revenue), incl. designers who later bought:**
```sql
select count(distinct r.user_id) designers,
       count(distinct o.user_id) designers_who_ordered
from design_lab_runs r
left join orders o on o.user_id = r.user_id and o.status in ('paid','dispatched')
                  and o.created_at >= r.created_at;
```

**Full funnel one-shot (find the leak):**
```sql
with d as (select distinct user_id from design_lab_runs where user_id is not null)
select
 (select count(*) from d) designers,
 (select count(*) from d join profiles p on p.id=d.user_id where p.is_pro) pro,
 (select count(distinct o.user_id) from d join orders o on o.user_id=d.user_id
    and o.status in ('paid','dispatched')) ordered;
```

**Affiliate-attributed orders from Design Lab traffic:**
```sql
select affiliate_code_used, count(*) orders, sum(total) revenue
from orders where affiliate_code_used is not null and status in ('paid','dispatched')
group by 1 order by revenue desc;
```

**Read the funnel as conversion rates between each step; the lowest ratio is the leak to fix first.** With ~0 runs today, the first job is simply to get Step 1→2 moving via the channel plan.

### Measurement gaps / decisions needed
1. **Visit→user join is weak.** `visits.sid` (session) doesn't link to `user_id`. To attribute *which* visits convert, stamp `sid` onto `design_lab_runs` at creation (add `sid text`) — small change, big analytics payoff. **Decision:** add `sid` to `design_lab_runs`?
2. **`?ref=` capture on `/design-lab/`.** Confirm the affiliate ref param is persisted from `/design-lab/?ref=` through to checkout (it's the whole point of the affiliate motion).
3. **Email gate type** (passwordless vs full signup) — §3d.
4. **Cross-sell mapping** as rules vs stored `mapped_slug` — §3b.
5. **Public run pages** `/design-lab/r/[share_token]` SSR + index-when-shared — §2c.
6. **Challenge prize** cadence/value and whether to issue via `newsletter_codes` — §1.

---

### Sequenced next actions (highest leverage first)
1. Ship the **post-result paywall + email capture + nearest-compound bridge** (turns the existing tool into a funnel). 
2. Stand up **`/design-lab/r/[share_token]`** public pages (unlocks sharing + SEO + challenge).
3. Generate **5 founder sample runs**, launch the **weekly Design Challenge**, hand sample runs to **3 seed affiliates** with the §4.2 script.
4. Publish the **2 highest-intent guides** (triple-agonists → Retatrutide; what makes a peptide novel → tool) with internal links to the money page.
5. Add the **funnel SQL** as a saved dashboard; watch Step 1→2 and 2→4.
