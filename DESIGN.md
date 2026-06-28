---
name: Velox Assay
description: >
  Premium-dark research-lab system. A single teal primary used as solid ink and
  fill — never glow — on a chroma-controlled near-black ground. Depth comes from
  layered surfaces and honest shadow, not colored light. Industrial-condensed
  display, technical grotesque body, mono for data. Quiet, exacting, expensive.

# These tokens are the source of truth and mirror output/assets/css/core.css
# :root verbatim. Change one, change both.
colors:
  # Brand primary — teal kept (recognition), but disciplined into a ramp and
  # used as SOLID color/fill/ink. No box-shadow glows anywhere.
  teal:          "oklch(80% 0.145 178)"   # primary accent, CTAs, active
  teal-strong:   "oklch(73% 0.155 178)"   # hover / pressed
  teal-deep:     "oklch(46% 0.105 180)"   # borders, on-surface accent
  teal-wash:     "oklch(30% 0.045 185)"   # subtle low-chroma fills (NOT glow)

  # Surfaces — near-black, faint teal-cool chroma so the neutrals belong to the
  # brand rather than defaulting warm. Explicitly NOT warm cream/paper.
  ground:        "oklch(15% 0.006 200)"   # page bg (~#0a0c0c)
  ground-deep:   "oklch(12% 0.005 200)"   # deepest inset / footer
  surface:       "oklch(20% 0.006 200)"   # panels, cards
  surface-2:     "oklch(24% 0.007 200)"   # raised / inputs
  line:          "oklch(29% 0.006 200)"   # hairline borders
  line-strong:   "oklch(38% 0.008 200)"   # emphasized borders

  # Text — neutral, AA-verified on ground. Fixes the low-contrast grey tell.
  ink:           "oklch(96% 0 0)"         # headlines, <strong>
  body:          "oklch(88% 0 0)"         # body copy
  muted:         "oklch(73% 0 0)"         # captions, meta (>=4.5:1 on ground)
  faint:         "oklch(62% 0 0)"         # subdued, large text only

  # Support — restrained, semantic only.
  gold:          "oklch(82% 0.115 85)"    # bundle / premium marker
  danger:        "oklch(64% 0.17 25)"     # sale price, errors
  info:          "oklch(70% 0.10 240)"    # informational

typography:
  display:  "'Barlow Condensed', sans-serif"   # industrial condensed, uppercase headings
  body:     "'Space Grotesk', system-ui, sans-serif"  # technical grotesque — replaces Inter (already loaded)
  mono:     "'DM Mono', monospace"             # data, eyebrows, spec labels, prices-as-data
  scale:    "1.250 (major third)"
  hero-max: "clamp(2.75rem, 6vw, 5.5rem)"     # <=6rem ceiling, no shouting
  tracking-display: "-0.02em"                 # >= -0.04em floor, never cramped
  line-length: "65-75ch"

radii:
  sm: "4px"   # chips, inputs, buttons
  md: "8px"   # cards, panels
  lg: "14px"  # feature/hero panels
  # Precise, not pill. Nothing fully rounded except status dots.

elevation:
  # Honest neutral shadow only. NO colored glow. Accent "light" is at most a
  # single 1px teal hairline per surface, never a halo.
  e1: "0 1px 2px rgba(0,0,0,.45)"
  e2: "0 4px 18px -6px rgba(0,0,0,.55)"
  e3: "0 14px 44px -10px rgba(0,0,0,.6)"

motion:
  easing: "cubic-bezier(0.16, 1, 0.3, 1)"  # ease-out-expo, no bounce/elastic
  fast: "140ms"
  base: "220ms"
  reduced-motion: "required — crossfade/instant fallback for every animation"
---

# Velox Assay — Visual System

## Concept

A working analytical lab after hours: deep, calm, expensive. The page is the
bench; the data is the light. Teal is the one instrument reading that glows on a
dark console — but here it's *printed*, solid and exact, not bloomed. Every
surface is honest about its depth through stacking and shadow, the way real
materials are, never through a decorative neon halo.

## Color usage

- **Ground is near-black neutral**, chroma ~0.006 toward teal-cyan so it reads
  clinical-cool, never warm-paper. Three surface steps (ground → surface →
  surface-2) carry hierarchy; lift cards by stepping the surface, not by glowing.
- **Teal is rationed.** Primary CTAs, active nav, key data values, one hairline
  accent per major surface. If teal appears more than ~3 places in a viewport,
  remove some. It is solid fill or solid text — never a `box-shadow` glow.
- **Semantic colors are earned**: gold = bundle/premium only; danger = real sale
  or error only; info = genuine information. No decorative color.
- Contrast: body ≥ 4.5:1, large ≥ 3:1, *including* muted and placeholder text.

## Typography

Three families on deliberate contrast axes, so nothing reads as the generic
single-font default:

- **Display — Barlow Condensed**, 800–900, uppercase, tracking −0.02em. Hero and
  section heads. Industrial, precise, distinctive. Hero capped at ~5.5rem.
- **Body — Space Grotesk**, the technical grotesque (replaces Inter for UI and
  prose). Already loaded site-wide; more distinctive and on-brand than Inter
  while staying precise and legible at UI sizes.
- **Mono — DM Mono** for the "data is the hero" texture: eyebrows, spec labels,
  CAS/formula, purity figures, prices rendered as readings. This is the brand's
  signature — use it where numbers and lab facts live.

Body line length 65–75ch. `text-wrap: balance` on h1–h3, `pretty` on prose.

## Depth & material

- Elevation = layered surface + neutral shadow (e1/e2/e3). **No colored glows,
  no glassmorphism.** A panel may carry a single 1px teal top hairline as its
  "instrument" accent — once, at most.
- Borders are hairlines (`line`), strengthening to `line-strong` on hover/focus.
  Hover lifts a card by `translateY(-2px)` + border → teal-deep, not by glow.

## Anti-slop guardrails (enforced)

- ❌ Dark-mode glow `box-shadow` in any brand color → ✅ neutral elevation.
- ❌ Side-tab `border-left: Npx solid <accent>` on cards → ✅ full hairline
  border + optional single top hairline.
- ❌ Inter-for-everything → ✅ the three-family system above.
- ❌ Radial neon hero gradient → ✅ deep surface + a single fine teal seam rule.
- ❌ Aphoristic "No X. No Y." copy cadence → ✅ plain declarative founder voice.
- ❌ Purple→blue gradients, glassmorphism, glowing particles, cyan-on-black neon.

## Motion

Ease-out-expo, 140–220ms. Intentional and specific to what it reveals — no
uniform section-fade reflex, no `<img>` hover-scale. Content is visible by
default; reveals enhance, never gate. Full `prefers-reduced-motion` fallbacks.
