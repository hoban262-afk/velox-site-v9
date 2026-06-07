#!/usr/bin/env python3
"""
build_search_index.py — generates output/assets/search-index.json for the
client-side site search. Scans the built pages so it stays accurate; re-run
after adding products/guides.
"""
import glob, json, os, re
import html as htmlmod

ROOT = os.path.join(os.path.dirname(__file__), "output")

def read(p):
    return open(p, encoding="utf-8").read()

def first(pat, html, group=1, flags=0):
    m = re.search(pat, html, flags)
    return (m.group(group).strip() if m else "")

# Common abbreviations/aliases researchers actually search for.
ALIASES = {
    "bpc-157": "bpc bpc157 body protection compound pentadecapeptide healing repair",
    "tb-500": "tb500 tb thymosin beta-4 thymosin recovery repair",
    "bpc157-tb500-mix": "bpc tb500 mix blend healing recovery duo",
    "retatrutide": "reta glp-1 glp1 gip glucagon triple agonist metabolic tirzepatide semaglutide",
    "tirzepatide": "tirz twincretin gip glp-1 glp1 dual agonist metabolic incretin retatrutide semaglutide",
    "ipamorelin": "ipa ghrp growth hormone secretagogue ghrelin ghs-r selective gh pentapeptide",
    "cjc-1295": "cjc cjc1295 ghrh growth hormone without dac",
    "tesamorelin": "tesa ghrh growth hormone",
    "semax": "nootropic focus brain bdnf cognitive",
    "selank": "anxiolytic calm anxiety gaba cognitive",
    "dsip": "delta sleep inducing peptide sleep",
    "kpv": "anti-inflammatory inflammation",
    "mots-c": "motsc mits mitochondrial ampk energy metabolic",
    "nad-plus": "nad nad+ nicotinamide energy longevity anti-ageing",
    "ghk-cu": "ghk ghkcu copper peptide skin collagen anti-ageing",
    "glutathione": "antioxidant skin glow detox",
    "melanotan-ii": "mt2 mt-2 melanotan tan tanning melanocortin",
    "bacteriostatic-water": "bac water sterile diluent reconstitution mixing",
}

index = []

# ── Products (/compounds/<slug>/) — identified by the order form ──────────────
for p in sorted(glob.glob(os.path.join(ROOT, "compounds", "*", "index.html"))):
    slug = os.path.basename(os.path.dirname(p))
    html = read(p)
    name = first(r'data-name="([^"]+)"', html)
    if not name:            # category index / non-product page
        continue
    cat = first(r'<div class="cp-eyebrow">[—\-\s]*([^<]+)</div>', html)
    index.append({"t": name, "u": f"/compounds/{slug}/", "c": cat, "y": "product",
                  "k": ALIASES.get(slug, "")})

# ── Supply ────────────────────────────────────────────────────────────────────
bw = os.path.join(ROOT, "supplies", "bacteriostatic-water", "index.html")
if os.path.exists(bw):
    index.append({"t": "Bacteriostatic Water", "u": "/supplies/bacteriostatic-water/",
                  "c": "Supplies", "y": "product", "k": ALIASES["bacteriostatic-water"]})

# ── Stacks / bundles (/stacks/<slug>/) ────────────────────────────────────────
for p in sorted(glob.glob(os.path.join(ROOT, "stacks", "*", "index.html"))):
    slug = os.path.basename(os.path.dirname(p))
    html = read(p)
    name = first(r'data-name="([^"]+)"', html) or first(r'<h1[^>]*>([^<]+)</h1>', html)
    if not name:
        continue
    title = first(r'<title>([^<]+)</title>', html)
    comps = ""
    m = re.search(r'\|\s*([^|]+?)\s*\|', title)   # middle segment often lists components
    if m: comps = m.group(1)
    index.append({"t": name, "u": f"/stacks/{slug}/", "c": "Research Bundle",
                  "y": "bundle", "k": comps})

# ── Guides (/guides/<slug>/) ──────────────────────────────────────────────────
for p in sorted(glob.glob(os.path.join(ROOT, "guides", "*", "index.html"))):
    slug = os.path.basename(os.path.dirname(p))
    html = read(p)
    name = first(r'<h1[^>]*>([^<]+)</h1>', html)
    if not name:
        og = first(r'og:title"\s+content="([^"|]+)', html)
        name = og.strip(" |")
    if not name:
        continue
    index.append({"t": name, "u": f"/guides/{slug}/", "c": "Guide",
                  "y": "guide", "k": ALIASES.get(slug, "")})

# Decode HTML entities so titles/categories display cleanly in the search UI.
for it in index:
    for key in ("t", "c", "k"):
        if it.get(key):
            it[key] = htmlmod.unescape(it[key])

out = os.path.join(ROOT, "assets", "search-index.json")
json.dump(index, open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"Wrote {len(index)} items to {out}")
by = {}
for i in index: by[i["y"]] = by.get(i["y"], 0) + 1
print("by type:", by)
