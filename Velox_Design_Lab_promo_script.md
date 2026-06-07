# Velox Design Lab — Promo Reel (≈38.5s, then loops)

A self-contained animated reel you screen-record. It mirrors the **real Design Lab app** screen-for-screen — same input box, same progress stepper, same result cards, same grading bars, same "closest compound" bridge. Open **`Velox_Design_Lab_promo.html`** in a browser.

## How to record
1. Open the HTML file in Chrome (full screen).
2. Top controls: pick **9:16** (Reels/TikTok/Shorts) or **16:9** (YouTube/site). Click **↻ Replay** to restart.
3. Click **● Record mode** to hide the controls + cursor (clean capture).
4. Screen-record the framed area (QuickTime ⌘⇧5 region select on Mac, or OBS / your recorder set to a region).
   - For pixel-perfect 1080×1920 / 1920×1080, size the browser window to that aspect and capture the frame, then export at the target resolution.
5. It auto-loops, so you get a clean ~38.5s take; trim at the CTA.

## Shot list & timing (~38.5s, then loops — paced so each slide is readable)
| Time | Scene | On screen |
|---|---|---|
| 0.0–3.5s | **Hook** | ✦ VELOX DESIGN LAB → **Design a novel peptide.** · *In plain English. In under a minute.* |
| 3.5–9.5s | **Input** (real screen) | Heading *"Design a novel peptide"* · the brief types into the box: *"A collagen-stimulating peptide, more stable than GHK-Cu, for in vitro skin research."* · button **✨ Design 3 new peptides →** · caption **1 · Tell it what you want to study** |
| 9.5–14.0s | **Working** (real stepper) | 🎯 Reading what you wrote · 🧬 Inventing three new peptides · 📊 Grading & checking novelty · progress bar fills · caption **2 · It reads, invents & grades** |
| 14.0–22.0s | **Results** (real cards) | **✦ DESIGN COMPLETE ✦** · *3 brand-new peptides, just for you* · "WHAT THE AI UNDERSTOOD" brief card with tags (collagen synthesis · protease-stable · skin fibroblast) · 3 candidate cards appear one at a time — **VDL-01 CollaGen-1 90**, **VDL-02 DermaCore 86**, **VDL-03 FibroPep 84**, each "✦ Likely brand-new" · caption **3 · 3 designs — explained, graded & checked they're new** |
| 22.0–28.0s | **Grading** (4 real bars) | Top card **VDL-01 · CollaGen-1 · 90/100** graded on four things: Easy to synthesise **92** · Dissolves in water **70** · Ideal length **100** · Building-block variety **78** · caption **Every design is graded four ways — before you spend a penny** |
| 28.0–33.5s | **Closest compound** (real bridge) | *Closest compound you can order today* · **GHK-Cu** · "the closest characterised compound Velox stocks… your designs are novel hypotheses that still have to be synthesised. GHK-Cu is real material you can study now — ≥99% HPLC-verified, batch CoA, dispatched from the UK in 24h." · buttons *Research GHK-Cu →* / *Browse related* · caption **…and the closest one you can actually order** |
| 33.5–38.5s | **CTA** | **VELOX DESIGN LAB** · **Design yours free.** · `veloxpeps.com/design-lab` · *For in vitro research use only.* |

*Want it faster/slower? Every timing lives in the `play()` function near the bottom of the HTML (the `after(ms, …)` calls) — bump the numbers up to slow down, down to speed up. The whole loop length is the final `after(38500, play)`.*

## Voiceover script (optional — ~35s, plain English, unhurried)
Time it to the scenes above:
> "Every shop sells the same old peptides. Velox Design Lab lets you design your own. Just describe what you want to study in plain English — and in seconds the AI invents three brand-new peptides, explains what each one is, grades them four different ways, and checks they're genuinely new. It even points you to the closest compound you can order today. Design yours, free."

(Calm, confident, slightly fast. Music: minimal ambient with a soft build into the results.)

## On-screen captions (silent-friendly — already baked into the reel)
If you add your own on the platform:
1. "An AI that designs brand-new peptides 🧬"
2. "Describe what you want to study →"
3. "It invents, explains & grades 3 options"
4. "Each one checked to be genuinely new"
5. "+ the closest compound you can order today. Try it free →"

## Posting copy
**Caption:**
> I described a research peptide in one sentence — and this AI designed three brand-new ones for it in seconds. Each design is explained in plain English, graded four different ways, and checked to be genuinely novel — plus it points me to the closest compound I can actually order. This is Velox Design Lab. Free to try 👇 *For in vitro research use only.*

**Hashtags (trim to platform):** #peptides #biotech #AItools #peptidedesign #research #science #invitro #proteinengineering

## Guardrails (kept in the reel)
In-vitro research-use framing only. No medical, health, dosing, cosmetic, or human-use claims. The "Closest compound you can order today" line points to a real, HPLC-verified product (GHK-Cu). The designed peptides are framed as novel hypotheses that still have to be synthesised — not products.
