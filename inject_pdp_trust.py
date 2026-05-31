#!/usr/bin/env python3
"""
inject_pdp_trust.py — adds a conversion trust strip directly beneath the buy box
on every Velox product page. Idempotent (safe to re-run). No fabricated data:
every claim (>=99% HPLC, third-party testing, batch CoA, Royal Mail Tracked 24,
Pay by Bank) is already true site-wide and stated elsewhere on the page.
"""
import glob, os

ROOT = os.path.join(os.path.dirname(__file__), "output", "compounds")
CATEGORY_INDEXES = {
    "index", "neuropeptide-research", "incretin-receptor-research",
    "angiogenic-tissue-research", "somatotropic-research", "oxidative-pathway-research",
}
ANCHOR = '<section class="cp-section" id="overview">'
MARKER = "vp-pdp-trust"

BLOCK = '''<style id="vp-pdp-trust-css">
.vp-pdp-trust-sec{border-top:1px solid var(--brd,rgba(255,255,255,.07));border-bottom:1px solid var(--brd,rgba(255,255,255,.07));background:#0b0b0b}
.vp-pdp-trust{max-width:1200px;margin:0 auto;display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:rgba(255,255,255,.06)}
.vp-pdp-trust .tc{background:#0b0b0b;display:flex;flex-direction:column;align-items:center;text-align:center;gap:7px;padding:18px 10px}
.vp-pdp-trust .tc svg{width:22px;height:22px;stroke:#00D4A0;fill:none}
.vp-pdp-trust .tt{font-family:var(--disp,sans-serif);font-weight:800;font-size:14px;letter-spacing:.02em;color:#fff;line-height:1}
.vp-pdp-trust .ts{font-family:var(--mono,monospace);font-size:9.5px;letter-spacing:.05em;text-transform:uppercase;color:#6B7280;line-height:1.25}
@media(max-width:760px){.vp-pdp-trust{grid-template-columns:repeat(2,1fr)}.vp-pdp-trust .tc:last-child{grid-column:1/-1}}
</style>
<section class="vp-pdp-trust-sec" aria-label="Why buy from Velox">
  <div class="vp-pdp-trust">
    <div class="tc">
      <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>
      <div class="tt">&ge;99%</div><div class="ts">HPLC purity</div>
    </div>
    <div class="tc">
      <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v6l-4 8a2 2 0 0 0 2 3h8a2 2 0 0 0 2-3l-4-8V2"/><line x1="8" y1="2" x2="16" y2="2"/></svg>
      <div class="tt">3rd-Party Tested</div><div class="ts">Independent lab</div>
    </div>
    <div class="tc">
      <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>
      <div class="tt">CoA Every Order</div><div class="ts">Batch-specific</div>
    </div>
    <div class="tc">
      <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
      <div class="tt">Tracked 24</div><div class="ts">Royal Mail UK</div>
    </div>
    <div class="tc">
      <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      <div class="tt">Pay by Bank</div><div class="ts">No card stored</div>
    </div>
  </div>
</section>
'''

changed, skipped, noanchor = [], [], []
for path in sorted(glob.glob(os.path.join(ROOT, "*", "index.html"))):
    slug = os.path.basename(os.path.dirname(path))
    if slug in CATEGORY_INDEXES:
        continue
    html = open(path, encoding="utf-8").read()
    if MARKER in html:
        skipped.append(slug); continue
    if ANCHOR not in html:
        noanchor.append(slug); continue
    html = html.replace(ANCHOR, BLOCK + ANCHOR, 1)
    open(path, "w", encoding="utf-8").write(html)
    changed.append(slug)

print("CHANGED (%d): %s" % (len(changed), ", ".join(changed)))
print("SKIPPED already-injected (%d): %s" % (len(skipped), ", ".join(skipped)))
print("NO ANCHOR (%d): %s" % (len(noanchor), ", ".join(noanchor)))
