"""
Rename all stack/bundle names across the entire site.
"""
import os, re, glob

BASE = "output"

# ─── STACK NAME MAP ────────────────────────────────────────────────────────────
# key = old name as it appears in HTML (may include &amp;)
# Note: some names have both plain-text and HTML-entity forms

STACK_MAP = [
    # old_html, old_plain (for JSON-LD), new_html, new_plain, slug
    (
        "Cognitive Stack",
        "Cognitive Stack",
        "Neuropeptide Dual Research Bundle",
        "Neuropeptide Dual Research Bundle",
        "cognitive",
    ),
    (
        "Cognitive &amp; Sleep Stack",
        "Cognitive & Sleep Stack",
        "Neuropeptide &amp; Sleep Research Bundle",
        "Neuropeptide & Sleep Research Bundle",
        "cognitive-and-sleep",
    ),
    (
        "Advanced Cognitive Stack",
        "Advanced Cognitive Stack",
        "Advanced Neuropeptide Research Bundle",
        "Advanced Neuropeptide Research Bundle",
        "advanced-cognitive",
    ),
    (
        "GH Peptide Stack",
        "GH Peptide Stack",
        "Somatotropic Research Bundle",
        "Somatotropic Research Bundle",
        "gh-peptide",
    ),
    (
        "Anti-Ageing Stack",
        "Anti-Ageing Stack",
        "Oxidative Pathway Research Bundle",
        "Oxidative Pathway Research Bundle",
        "anti-ageing",
    ),
    (
        "Metabolic Stack",
        "Metabolic Stack",
        "Incretin Receptor Research Bundle",
        "Incretin Receptor Research Bundle",
        "metabolic",
    ),
    (
        "GH &amp; Metabolic Stack",
        "GH & Metabolic Stack",
        "Somatotropic &amp; Incretin Research Bundle",
        "Somatotropic & Incretin Research Bundle",
        "gh-and-metabolic",
    ),
    (
        "Repair &amp; Metabolic Stack",
        "Repair & Metabolic Stack",
        "Tissue &amp; Receptor Research Bundle",
        "Tissue & Receptor Research Bundle",
        "repair-and-metabolic",
    ),
    (
        "Skin &amp; Aesthetic Stack",
        "Skin & Aesthetic Stack",
        "Dermal Research Bundle",
        "Dermal Research Bundle",
        "skin-and-aesthetic",
    ),
    (
        "Ultimate Repair Stack",
        "Ultimate Repair Stack",
        "Angiogenic Repair Research Bundle",
        "Angiogenic Repair Research Bundle",
        "ultimate-repair",
    ),
]

# ─── PER-PAGE META ──────────────────────────────────────────────────────────────
STACK_META = {
    "cognitive": {
        "title": "Neuropeptide Dual Research Bundle | Semax + Selank | Velox Peptides",
        "desc":  "Semax and Selank research bundle. Both HPLC-verified neuropeptides studied across CNS pathway research. Batch CoA supplied. UK dispatch.",
    },
    "cognitive-and-sleep": {
        "title": "Neuropeptide & Sleep Research Bundle | Semax Selank DSIP | Velox Peptides",
        "desc":  "Three-compound neuropeptide research bundle. Semax, Selank and DSIP studied across neurological and sleep architecture pathways. CoA supplied.",
    },
    "gh-peptide": {
        "title": "Somatotropic Research Bundle | Tesamorelin CJC-1295 | Velox Peptides",
        "desc":  "GH axis research bundle combining Tesamorelin and CJC-1295 WO DAC. HPLC-verified somatotropic research compounds. Batch CoA supplied.",
    },
    "anti-ageing": {
        "title": "Oxidative Pathway Research Bundle | GHK-Cu NAD+ | Velox Peptides",
        "desc":  "Three-compound oxidative pathway research bundle. GHK-Cu, Glutathione and NAD+ studied across cellular antioxidant mechanisms. CoA supplied.",
    },
    "metabolic": {
        "title": "Incretin Receptor Research Bundle | Retatrutide MOTS-C | Velox Peptides",
        "desc":  "Multi-receptor research bundle. MOTS-C, Retatrutide and NAD+ studied across GLP-1, GIP and mitochondrial receptor pathways. CoA supplied.",
    },
    "gh-and-metabolic": {
        "title": "Somatotropic & Incretin Research Bundle | Tesamorelin Retatrutide | Velox Peptides",
        "desc":  "Dual-mechanism research bundle combining Tesamorelin and Retatrutide. Studied across GH axis and incretin receptor pathways. CoA supplied.",
    },
    "repair-and-metabolic": {
        "title": "Tissue & Receptor Research Bundle | BPC-157 TB-500 Retatrutide | Velox Peptides",
        "desc":  "Three-compound research bundle studied across tissue repair and receptor activation pathways. BPC-157, TB-500 and Retatrutide. CoA supplied.",
    },
    "skin-and-aesthetic": {
        "title": "Dermal Research Bundle | MT2 GHK-Cu Glutathione | Velox Peptides",
        "desc":  "Three-compound dermal pathway research bundle. MT2, GHK-Cu and Glutathione studied across melanocortin and oxidative mechanisms. CoA supplied.",
    },
    "ultimate-repair": {
        "title": "Angiogenic Repair Research Bundle | BPC-157 TB-500 GHK-Cu | Velox Peptides",
        "desc":  "Three-compound angiogenic research bundle. BPC-157, TB-500 and GHK-Cu studied across tissue repair and angiogenic pathway research. CoA supplied.",
    },
}

# Stacks hub page meta update
STACKS_HUB_META = {
    "title": "Peptide Research Bundles | Multi-Compound Stacks | Velox Peptides",
    "desc":  "Multi-compound research bundles combining complementary peptides. HPLC-verified, batch CoA supplied. Save up to 50% vs individual compound pricing.",
}

# ─── HELPER: rename stack names in arbitrary HTML ──────────────────────────────
def rename_stacks_global(html):
    h = html
    # Replace HTML-escaped versions first (longer strings first to avoid partial match)
    for old_html, old_plain, new_html, new_plain, slug in sorted(STACK_MAP, key=lambda x: -len(x[0])):
        # stack-card-name h3
        h = h.replace(
            '<h3 class="stack-card-name">%s</h3>' % old_html,
            '<h3 class="stack-card-name">%s</h3>' % new_html,
        )
        # alt attributes in stack card images (format: "Old Name — Compound research bundle")
        h = re.sub(
            r'alt="%s[^"]*"' % re.escape(old_html),
            'alt="%s research bundle"' % new_html,
            h,
        )
        # data-name attribute (order panel)
        h = h.replace('data-name="%s"' % old_html, 'data-name="%s"' % new_html)
        # Also handle plain-text data-name (no &amp;)
        if old_plain != old_html:
            h = h.replace('data-name="%s"' % old_plain, 'data-name="%s"' % new_html)
        # JSON-LD "name": "Old Plain"
        h = h.replace('"name": "%s"' % old_plain, '"name": "%s"' % new_plain)
        # Breadcrumb current span
        h = h.replace(
            '<span class="bc-current" aria-current="page">%s</span>' % old_html,
            '<span class="bc-current" aria-current="page">%s</span>' % new_html,
        )
    # Stack eyebrow: "— STACK · N" → "— RESEARCH BUNDLE · N"
    h = re.sub(r'— STACK ·', '— RESEARCH BUNDLE ·', h)
    # Stacks breadcrumb item (2nd level) — already changed to "Research Bundles" in nav link
    # but JSON-LD still says "Stacks"
    h = h.replace('"name": "Stacks"', '"name": "Research Bundles"')
    return h


# ─── HELPER: update stack detail page head (title/meta/h1) ────────────────────
def update_stack_head(html, slug, old_html_name, new_html_name):
    meta = STACK_META.get(slug)
    if not meta:
        return html
    h = html

    # Title
    h = re.sub(r'<title>.*?</title>', '<title>%s</title>' % meta["title"], h, flags=re.DOTALL)

    # Meta description
    h = re.sub(r'<meta name="description" content="[^"]*"',
               '<meta name="description" content="%s"' % meta["desc"], h)

    # og:title / twitter:title
    h = re.sub(r'<meta property="og:title" content="[^"]*"',
               '<meta property="og:title" content="%s"' % meta["title"], h)
    h = re.sub(r'<meta name="twitter:title" content="[^"]*"',
               '<meta name="twitter:title" content="%s"' % meta["title"], h)

    # og:description / twitter:description
    h = re.sub(r'<meta property="og:description" content="[^"]*"',
               '<meta property="og:description" content="%s"' % meta["desc"], h)
    h = re.sub(r'<meta name="twitter:description" content="[^"]*"',
               '<meta name="twitter:description" content="%s"' % meta["desc"], h)

    # H1: replace stack name before <em>
    # Pattern: <h1 class="page-h1">OLD NAME <em>...</em></h1>
    h = re.sub(
        r'<h1[^>]*>%s\s*(<em>[^<]*</em>)</h1>' % re.escape(old_html_name),
        '<h1 class="page-h1">%s \\1</h1>' % new_html_name,
        h,
    )

    return h


# ─── PASS 1: global replacements across all HTML files ────────────────────────
all_html = glob.glob("%s/**/*.html" % BASE, recursive=True)
changed_global = 0
for path in all_html:
    with open(path, "r", encoding="utf-8") as f:
        orig = f.read()
    html = rename_stacks_global(orig)
    if html != orig:
        with open(path, "w", encoding="utf-8") as f:
            f.write(html)
        changed_global += 1
print("Pass 1 (global renames): %d files changed" % changed_global)


# ─── PASS 2: per-stack-page head/meta/H1 updates ─────────────────────────────
changed_meta = 0
for old_html, old_plain, new_html, new_plain, slug in STACK_MAP:
    path = "%s/stacks/%s/index.html" % (BASE, slug)
    if not os.path.exists(path):
        print("MISSING: %s" % path)
        continue
    with open(path, "r", encoding="utf-8") as f:
        orig = f.read()
    html = update_stack_head(orig, slug, old_html, new_html)
    if html != orig:
        with open(path, "w", encoding="utf-8") as f:
            f.write(html)
        changed_meta += 1
print("Pass 2 (stack meta/H1): %d files changed" % changed_meta)


# ─── PASS 3: stacks hub page meta ─────────────────────────────────────────────
hub_path = "%s/stacks/index.html" % BASE
with open(hub_path, "r", encoding="utf-8") as f:
    orig = f.read()
h = orig
h = re.sub(r'<title>.*?</title>',
           '<title>%s</title>' % STACKS_HUB_META["title"], h, flags=re.DOTALL)
h = re.sub(r'<meta name="description" content="[^"]*"',
           '<meta name="description" content="%s"' % STACKS_HUB_META["desc"], h)
h = re.sub(r'<meta property="og:title" content="[^"]*"',
           '<meta property="og:title" content="%s"' % STACKS_HUB_META["title"], h)
h = re.sub(r'<meta name="twitter:title" content="[^"]*"',
           '<meta name="twitter:title" content="%s"' % STACKS_HUB_META["title"], h)
h = re.sub(r'<meta property="og:description" content="[^"]*"',
           '<meta property="og:description" content="%s"' % STACKS_HUB_META["desc"], h)
h = re.sub(r'<meta name="twitter:description" content="[^"]*"',
           '<meta name="twitter:description" content="%s"' % STACKS_HUB_META["desc"], h)
if h != orig:
    with open(hub_path, "w", encoding="utf-8") as f:
        f.write(h)
    print("Pass 3 (stacks hub meta): updated")
else:
    print("Pass 3 (stacks hub meta): no change")


# ─── VERIFICATION ─────────────────────────────────────────────────────────────
print()
print("=== VERIFICATION ===")
old_names = [x[0] for x in STACK_MAP] + [x[1] for x in STACK_MAP]
stale = {}
for path in all_html:
    with open(path, "r", encoding="utf-8") as f:
        html = f.read()
    hits = []
    for name in old_names:
        # Only flag if it appears as a stack card name or data-name (not in image filenames/paths)
        if ('<h3 class="stack-card-name">%s</h3>' % name in html
                or 'data-name="%s"' % name in html
                or '"name": "%s"' % name in html):
            hits.append(name)
    if hits:
        short = path.replace("\\", "/").split("output/")[-1]
        stale[short] = hits
if stale:
    print("STALE NAMES REMAINING:")
    for p, names in stale.items():
        print("  %s: %s" % (p, names))
else:
    print("CLEAN — no old stack names remain in card/data/JSON fields.")
