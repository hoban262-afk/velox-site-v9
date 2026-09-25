# Ad creatives

Renders the Meta ad images from HTML instead of a design tool, so a copy change
is a one-line edit and a re-render rather than a round trip through Figma.

```bash
cd ad-creatives
npm install                  # once — installs playwright locally
npx playwright install chromium   # once
node render.js               # writes out/<ad>-<w>x<h>.png
```

Output: 5 creatives × 3 sizes = 15 PNGs in `out/` (gitignored — regenerate,
don't commit).

| Size | Ratio | Placement |
|---|---|---|
| 1080×1080 | 1:1 | feed, explore |
| 1080×1350 | 4:5 | feed portrait — highest-performing feed slot |
| 1200×628 | 1.91:1 | link, right column, audience network |

## Why these five

`ADS-BUILD-PACK.md` §4 specifies eight ads. Five are pure typography/data and
can be built here. Three cannot:

| Ad | Needs | Status |
|---|---|---|
| Ad 3 `vid_fulfilment` | 20–30s dispatch-day video | **Declan must shoot** |
| Ad 4 `static_uk` | Royal Mail parcel on a doorstep | **Declan must shoot** |
| Ad 8 `offer_firstorder` | packed parcel, clean background | **Declan must shoot** |

The reason we can't reuse existing site imagery: all 79 product images are
renders with **compound names printed on the vial labels**, and §0.5 rule 1 is
zero compound names anywhere in a creative. Every one of them is disqualified by
the label, not by the composition.

When shooting, check the frame for legible labels — including reflections, boxes
in the background, and anything on a screen. A label that's readable when Meta's
reviewer zooms in is a label that's in the ad.

## Compliance constraints baked into these files

From `ADS-BUILD-PACK.md` §0.5 — these are why the creatives look the way they
do, so don't "improve" them back:

1. **No compound names.** Anywhere. Including the chromatogram in ad7, which is
   a stylised trace rather than a real COA screenshot for exactly this reason.
2. **No purity figures.** No "99%", no "≥99%". Ad 7's whole argument is that a
   purity number is the less interesting of the two tests.
3. **Process register, not product register.** Every creative talks about
   documentation, instruments and lot numbers. None of them describes what
   anything does.
4. Every creative carries `For laboratory research use only` in the footer.

## How the sizing works

One HTML file, one `.creative` block per ad, selected by query string:

```
creatives.html?ad=ad7&w=1080&h=1350
```

All dimensions — padding, type sizes, gaps, bar heights, the accent rule on the
left — derive from `Math.min(w, h)` as CSS custom properties. That's what keeps
the 1.91:1 link format from looking like a squashed square. Type scales up
slightly on wide formats (`wide = w/h > 1.5`) because the short edge alone
under-sizes it there.

`render.js` waits for `[data-ready="1"]`, which the sizing script sets last, so
screenshots can't race the layout.

To add a creative: add a `<div class="creative" id="adN">`, add `'adN'` to
`ADS` in `render.js`. No other wiring.

## Ad 5 is deliberately unfinished

`#ad5` renders `£__` for the competitor bar. That is not a bug and **must not be
filled in with a plausible-looking number.**

"Up to half the price of most UK suppliers" is a comparative price claim. As of
17 Sep 2026 nothing in this repo substantiates it — no survey, no competitor
price list, no dated screenshots. The only real figure we hold is our own £29
(`output/compounds/index.html`). An earlier draft of this creative showed
"£31 vs £46"; both numbers were invented, which is how the placeholder got
there.

CAP 3.33 requires comparative claims to be verifiable, and ASA rules bind Velox
as advertiser whatever Meta approves. The competitor who sees this ad is the
most likely complainant.

**Ad 5 is held from the 21 Sep launch.** To release it: run the price survey in
`LAUNCH-RUNBOOK.md`, file the dated screenshots, then set the bar to what the
data says — which may be a smaller gap than "half", in which case the copy
changes too.
