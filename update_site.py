import os, re

BASE = r"C:\Users\hoban\Desktop\claude website\velox-multipage-handoff\velox\output"

def read_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def write_file(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

def replace_once(content, old, new, path=""):
    if old not in content:
        print(f"  WARNING: pattern not found in {path}:\n    {repr(old[:80])}")
        return content
    return content.replace(old, new, 1)

# ---------------------------------------------------------------------------
# Shared HTML fragments
# ---------------------------------------------------------------------------

ADV_COG_CARD = (
    '<article class="stack-card">\n'
    '  <a class="stack-card-link" href="/stacks/advanced-cognitive/"><div class="sc-img-placeholder">'
    '<img src="../../assets/images/advancedcognativestack.png" alt="Stack image" class="sc-prod-img">'
    '<span class="sc-img-label">STACK IMAGE</span></div>\n'
    '    <div class="stack-card-eyebrow">\xe2\x80\x94 STACK \xb7 3 COMPOUNDS</div>\n'
    '    <h3 class="stack-card-name">Advanced Cognitive Stack</h3>\n'
    '    <div class="stack-card-full">Semax + Selank + Dihexa</div>\n'
    '    <div class="sc-card-pills"><span class="sc-card-pill"><span class="sc-cp-name">Semax</span>'
    '<span class="sc-cp-size">10mg</span><span class="sc-cp-price">&pound;34.99</span></span>'
    '<span class="sc-card-pill"><span class="sc-cp-name">Selank</span><span class="sc-cp-size">10mg</span>'
    '<span class="sc-cp-price">&pound;39.99</span></span><span class="sc-card-pill">'
    '<span class="sc-cp-name">Dihexa</span><span class="sc-cp-size">10mg</span>'
    '<span class="sc-cp-price">&pound;64.99</span></span></div>\n'
    '    <div class="stack-card-ft">\n'
    '      <div class="sc-price-block">\n'
    '      <span class="sc-was">&pound;139.97</span>\n'
    '      <span class="sc-price">&pound;107.98</span>\n'
    '      <span class="sc-badge">SAVE 23%</span>\n'
    '    </div>\n'
    '      <span class="stack-card-action">View stack →</span>\n'
    '    </div>\n'
    '  </a>\n'
    '</article>'
)

ADV_COG_CARD_ROOT = ADV_COG_CARD.replace(
    '../../assets/images/advancedcognativestack.png',
    '../assets/images/advancedcognativestack.png'
)

DIHEXA_CARD_DEEP = (
    '<article class="cc cc-cognitive ">\n'
    '  <a class="cc-img-link" href="/compounds/dihexa/" tabindex="-1" aria-hidden="true">\n'
    '    <div class="cc-img-wrap">\n'
    '      <img src="../../assets/images/dihexa.png" alt="Dihexa" class="cc-img">\n'
    '      <span class="cc-img-name">Dihexa</span>\n'
    '    </div>\n'
    '  </a>\n'
    '  <div class="cc-body">\n'
    '    <div class="cc-hdr">\n'
    '      <div class="cc-cat">Cognitive</div>\n'
    '    </div>\n'
    '    <a class="cc-name-link" href="/compounds/dihexa/">\n'
    '      <h3 class="cc-name">Dihexa</h3>\n'
    '    </a>\n'
    '    <div class="cc-ft">\n'
    '      <span class="cc-price">&pound;64.99</span>\n'
    '    </div>\n'
    '  </div>\n'
    '</article>'
)

DIHEXA_CARD_CAT = DIHEXA_CARD_DEEP.replace(
    '../../assets/images/dihexa.png',
    '../assets/images/dihexa.png'
)

KPV_CARD_DEEP = (
    '<article class="cc cc-healing ">\n'
    '  <a class="cc-img-link" href="/compounds/kpv/" tabindex="-1" aria-hidden="true">\n'
    '    <div class="cc-img-wrap">\n'
    '      <img src="../../assets/images/kpv10mg.png" alt="KPV" class="cc-img">\n'
    '      <span class="cc-img-name">KPV</span>\n'
    '    </div>\n'
    '  </a>\n'
    '  <div class="cc-body">\n'
    '    <div class="cc-hdr">\n'
    '      <div class="cc-cat">Healing &amp; Repair</div>\n'
    '    </div>\n'
    '    <a class="cc-name-link" href="/compounds/kpv/">\n'
    '      <h3 class="cc-name">KPV</h3>\n'
    '    </a>\n'
    '    <div class="cc-ft">\n'
    '      <span class="cc-price">&pound;34.99</span>\n'
    '    </div>\n'
    '  </div>\n'
    '</article>'
)

KPV_CARD_CAT = KPV_CARD_DEEP.replace(
    '../../assets/images/kpv10mg.png',
    '../assets/images/kpv10mg.png'
)

print("=== Phase 1: Remove Dihexa ===")

# ---------------------------------------------------------------------------
# 1. compounds/cognitive/index.html
# ---------------------------------------------------------------------------
p = os.path.join(BASE, "compounds", "cognitive", "index.html")
c = read_file(p)

c = c.replace(
    "Cognitive Research Peptides — DSIP, Selank, Semax, Dihexa",
    "Cognitive Research Peptides — DSIP, Selank, Semax"
)
c = replace_once(c,
    ', {"@type": "ListItem", "position": 4, "url": "https://veloxpeps.com/compounds/dihexa/", "name": "Angiotensin IV-Derived Oligopeptide"}',
    '', p)
c = c.replace(
    '"Velox Peptides supplies 4 research compounds in this category: DSIP, Selank, Semax, Dihexa.',
    '"Velox Peptides supplies 3 research compounds in this category: DSIP, Selank, Semax.'
)
c = c.replace('— CATEGORY \xb7 4 COMPOUNDS', '— CATEGORY \xb7 3 COMPOUNDS')
c = replace_once(c,
    '; and <strong>Dihexa</strong>, an angiotensin IV-derived oligopeptide investigated for its interaction with the HGF/c-Met synaptic signalling axis. Research models across this category typically examine BDNF expression, GABAergic and serotonergic modulation, dendritic spine density, and task-based cognitive performance in rodents.',
    '. Research models across this category typically examine BDNF expression, GABAergic and serotonergic modulation, and task-based cognitive performance in rodents.',
    p)
c = replace_once(c, DIHEXA_CARD_DEEP, '', p)
c = replace_once(c, ADV_COG_CARD, '', p)
c = c.replace(
    'Velox Peptides supplies 4 research compounds in this category: DSIP, Selank, Semax, Dihexa. All are HPLC-verified',
    'Velox Peptides supplies 3 research compounds in this category: DSIP, Selank, Semax. All are HPLC-verified'
)
c = c.replace('View all 10 research stacks &rarr;', 'View all 9 research stacks &rarr;')
write_file(p, c)
print("  OK compounds/cognitive/index.html")

# ---------------------------------------------------------------------------
# 2. compounds/index.html
# ---------------------------------------------------------------------------
p = os.path.join(BASE, "compounds", "index.html")
c = read_file(p)

c = c.replace(
    '{"@type": "ListItem", "position": 15, "url": "https://veloxpeps.com/compounds/dihexa/", "name": "Angiotensin IV-Derived Oligopeptide"}',
    '{"@type": "ListItem", "position": 15, "url": "https://veloxpeps.com/compounds/kpv/", "name": "Lys-Pro-Val Tripeptide"}'
)
c = replace_once(c, DIHEXA_CARD_CAT, '', p)

# Add KPV after the bpc157-tb500-mix card closing </article> that is followed by end of healing section
# The healing section ends with the bpc157-tb500-mix article then </div></div></section>
OLD_HEAL_END = (
    '<div class="cc-price-block">\n'
    '      <span class="cc-was">&pound;59.99</span>\n'
    '      <span class="cc-price">&pound;49.99</span>\n'
    '    </div>\n'
    '    </div>\n'
    '  </div>\n'
    '</article>\n'
    '    </div>\n'
    '  </div>\n'
    '</section>\n'
    '<div class="cat-divider cat-divider-growth"'
)
NEW_HEAL_END = (
    '<div class="cc-price-block">\n'
    '      <span class="cc-was">&pound;59.99</span>\n'
    '      <span class="cc-price">&pound;49.99</span>\n'
    '    </div>\n'
    '    </div>\n'
    '  </div>\n'
    '</article>' + KPV_CARD_CAT + '\n'
    '    </div>\n'
    '  </div>\n'
    '</section>\n'
    '<div class="cat-divider cat-divider-growth"'
)
c = replace_once(c, OLD_HEAL_END, NEW_HEAL_END, p)

write_file(p, c)
print("  OK compounds/index.html")

# ---------------------------------------------------------------------------
# 3. compounds/selank/index.html
# ---------------------------------------------------------------------------
p = os.path.join(BASE, "compounds", "selank", "index.html")
c = read_file(p)
c = replace_once(c, ADV_COG_CARD, '', p)
c = replace_once(c, DIHEXA_CARD_DEEP, '', p)
write_file(p, c)
print("  OK compounds/selank/index.html")

# ---------------------------------------------------------------------------
# 4. compounds/semax/index.html
# ---------------------------------------------------------------------------
p = os.path.join(BASE, "compounds", "semax", "index.html")
c = read_file(p)
c = replace_once(c, ADV_COG_CARD, '', p)
c = replace_once(c, DIHEXA_CARD_DEEP, '', p)
write_file(p, c)
print("  OK compounds/semax/index.html")

# ---------------------------------------------------------------------------
# 5. compounds/dsip/index.html
# ---------------------------------------------------------------------------
p = os.path.join(BASE, "compounds", "dsip", "index.html")
c = read_file(p)
c = replace_once(c, DIHEXA_CARD_DEEP, '', p)
write_file(p, c)
print("  OK compounds/dsip/index.html")

# ---------------------------------------------------------------------------
# 6. stacks/index.html
# ---------------------------------------------------------------------------
p = os.path.join(BASE, "stacks", "index.html")
c = read_file(p)

c = c.replace('10 curated multi-compound research stacks', '9 curated multi-compound research stacks')
c = c.replace('grouping 10 combinations of compounds commonly studied together in preclinical research',
              'grouping 9 combinations of compounds commonly studied together in preclinical research')
c = replace_once(c,
    ', {"@type": "ListItem", "position": 10, "url": "https://veloxpeps.com/stacks/advanced-cognitive/", "name": "Semax + Selank + Dihexa"}',
    '', p)
c = replace_once(c, ADV_COG_CARD_ROOT, '', p)

write_file(p, c)
print("  OK stacks/index.html")

# ---------------------------------------------------------------------------
# 7. stacks/advanced-cognitive/index.html — replace with redirect
# ---------------------------------------------------------------------------
p = os.path.join(BASE, "stacks", "advanced-cognitive", "index.html")
redirect_html = (
    '<!DOCTYPE html>\n'
    '<html lang="en-GB">\n'
    '<head>\n'
    '  <meta charset="UTF-8">\n'
    '  <meta http-equiv="refresh" content="0;url=/stacks/cognitive/">\n'
    '  <link rel="canonical" href="https://veloxpeps.com/stacks/cognitive/">\n'
    '  <title>Redirecting…</title>\n'
    '</head>\n'
    '<body>\n'
    '  <p>This page has moved. <a href="/stacks/cognitive/">View the Cognitive Stack</a>.</p>\n'
    '  <script>window.location.replace("/stacks/cognitive/");</script>\n'
    '</body>\n'
    '</html>\n'
)
write_file(p, redirect_html)
print("  OK stacks/advanced-cognitive/index.html (redirect)")

# ---------------------------------------------------------------------------
# 8. index.html (homepage)
# ---------------------------------------------------------------------------
p = os.path.join(BASE, "index.html")
c = read_file(p)

# Remove #dihexa from hash map, add #kpv
c = c.replace(
    '"#dihexa": "/compounds/dihexa/", ',
    '"#kpv": "/compounds/kpv/", '
)
write_file(p, c)
print("  OK index.html (hash map)")

# ---------------------------------------------------------------------------
# 9. about/coa-library/index.html
# ---------------------------------------------------------------------------
p = os.path.join(BASE, "about", "coa-library", "index.html")
c = read_file(p)

# Remove Dihexa CoA item
DIHEXA_COA = (
    '\n'
    '        <div class="coa-item">\n'
    '          <div class="coa-item-cat" style="color:#9B6DFF;">Cognitive</div>\n'
    '          <div class="coa-item-name">Dihexa</div>\n'
    '          <div class="coa-item-footer">\n'
    '            <span class="coa-pending-badge">CoA Pending</span>\n'
    '            <span class="coa-purity">98.5%</span>\n'
    '          </div>\n'
    '        </div>\n'
)
c = replace_once(c, DIHEXA_COA, '\n', p)

# Add KPV CoA item after BPC-157 & TB-500 item
KPV_COA = (
    '\n'
    '        <div class="coa-item">\n'
    '          <div class="coa-item-cat" style="color:#4FC3F7;">Healing &amp; Repair</div>\n'
    '          <div class="coa-item-name">KPV</div>\n'
    '          <div class="coa-item-footer">\n'
    '            <span class="coa-pending-badge">CoA Pending</span>\n'
    '            <span class="coa-purity">98.5%</span>\n'
    '          </div>\n'
    '        </div>\n'
)
OLD_AFTER_MIX = (
    '\n'
    '        <div class="coa-item">\n'
    '          <div class="coa-item-cat" style="color:#4FC3F7;">Healing &amp; Repair</div>\n'
    '          <div class="coa-item-name">GHK-Cu</div>\n'
)
NEW_AFTER_MIX = KPV_COA + (
    '\n'
    '        <div class="coa-item">\n'
    '          <div class="coa-item-cat" style="color:#4FC3F7;">Healing &amp; Repair</div>\n'
    '          <div class="coa-item-name">GHK-Cu</div>\n'
)
c = replace_once(c, OLD_AFTER_MIX, NEW_AFTER_MIX, p)
write_file(p, c)
print("  OK about/coa-library/index.html")

# ---------------------------------------------------------------------------
# 10. sitemap.xml
# ---------------------------------------------------------------------------
p = os.path.join(BASE, "sitemap.xml")
c = read_file(p)
c = c.replace('  <url><loc>https://veloxpeps.com/compounds/dihexa/</loc></url>\n', '')
c = c.replace('  <url><loc>https://veloxpeps.com/stacks/advanced-cognitive/</loc></url>\n', '')
c = c.replace(
    '  <url><loc>https://veloxpeps.com/compounds/melanotan-ii/</loc></url>\n',
    '  <url><loc>https://veloxpeps.com/compounds/melanotan-ii/</loc></url>\n'
    '  <url><loc>https://veloxpeps.com/compounds/kpv/</loc></url>\n'
)
write_file(p, c)
print("  OK sitemap.xml")

print("")
print("=== Phase 2: Add KPV ===")

# ---------------------------------------------------------------------------
# 11. compounds/healing-and-repair/index.html
# ---------------------------------------------------------------------------
p = os.path.join(BASE, "compounds", "healing-and-repair", "index.html")
c = read_file(p)

# Update eyebrow count and title/description
c = c.replace('— CATEGORY \xb7 3 COMPOUNDS', '— CATEGORY \xb7 4 COMPOUNDS')
c = c.replace(
    '<title>Healing &amp; Repair Research Peptides —',
    '<title>Healing &amp; Repair Research Peptides —'
)  # no-op placeholder - we'll handle more carefully
# Update FAQ compound count if present
c = c.replace(
    'Velox Peptides supplies 3 research compounds in this category: BPC-157, TB-500, BPC-157 &amp; TB-500 Mix.',
    'Velox Peptides supplies 4 research compounds in this category: BPC-157, TB-500, BPC-157 &amp; TB-500 Mix, KPV.'
)
c = c.replace(
    'Velox Peptides supplies 3 research compounds in this category: BPC-157, TB-500, BPC-157 &amp; TB-500 Mix. All are HPLC-verified',
    'Velox Peptides supplies 4 research compounds in this category: BPC-157, TB-500, BPC-157 &amp; TB-500 Mix, KPV. All are HPLC-verified'
)

# Add KPV card after the last product in the prod-grid (BPC-157 & TB-500 mix)
# Find the end of the healing prod-grid
OLD_HEAL_GRID_END = (
    '    </div>\n'
    '  </div>\n'
    '</section>\n'
    '<section class="cat-stacks"'
)
NEW_HEAL_GRID_END = (
    KPV_CARD_DEEP + '\n'
    '    </div>\n'
    '  </div>\n'
    '</section>\n'
    '<section class="cat-stacks"'
)
c = replace_once(c, OLD_HEAL_GRID_END, NEW_HEAL_GRID_END, p)
write_file(p, c)
print("  OK compounds/healing-and-repair/index.html")

# ---------------------------------------------------------------------------
# 12. compounds/bpc-157/index.html — Add KPV to related compounds
# ---------------------------------------------------------------------------
p = os.path.join(BASE, "compounds", "bpc-157", "index.html")
c = read_file(p)

# Current related compounds ends with bpc157-tb500-mix article then </div></section>
OLD_BPC_RELATED = (
    '    <h3 class="cc-name">BPC-157 &amp; TB-500</h3>\n'
    '    </a>\n'
    '    <div class="cc-ft">\n'
    '      <div class="cc-price-block">\n'
    '      <span class="cc-was">&pound;59.99</span>\n'
    '      <span class="cc-price">&pound;49.99</span>\n'
    '    </div>\n'
    '    </div>\n'
    '  </div>\n'
    '</article></div>\n'
    '</section>\n'
    '<section class="faq-sec"'
)
NEW_BPC_RELATED = (
    '    <h3 class="cc-name">BPC-157 &amp; TB-500</h3>\n'
    '    </a>\n'
    '    <div class="cc-ft">\n'
    '      <div class="cc-price-block">\n'
    '      <span class="cc-was">&pound;59.99</span>\n'
    '      <span class="cc-price">&pound;49.99</span>\n'
    '    </div>\n'
    '    </div>\n'
    '  </div>\n'
    '</article>' + KPV_CARD_DEEP + '</div>\n'
    '</section>\n'
    '<section class="faq-sec"'
)
c = replace_once(c, OLD_BPC_RELATED, NEW_BPC_RELATED, p)
write_file(p, c)
print("  OK compounds/bpc-157/index.html")

# ---------------------------------------------------------------------------
# 13. compounds/tb-500/index.html — Add KPV to related compounds
# ---------------------------------------------------------------------------
p = os.path.join(BASE, "compounds", "tb-500", "index.html")
c = read_file(p)

# TB-500 related compounds ends with bpc157-tb500-mix article
OLD_TB_RELATED_END = '</article></div>\n</section>\n<section class="faq-sec"'
if OLD_TB_RELATED_END in c:
    c = replace_once(c, OLD_TB_RELATED_END,
                     '</article>' + KPV_CARD_DEEP + '</div>\n</section>\n<section class="faq-sec"', p)
else:
    # Try different pattern - look for the end of the healing compound section
    OLD_TB_RELATED2 = '</article></div>\n</section>\n<section class="faq-sec" aria-labelledby="faq-heading">'
    c = replace_once(c, OLD_TB_RELATED2,
                     '</article>' + KPV_CARD_DEEP + '</div>\n</section>\n<section class="faq-sec" aria-labelledby="faq-heading">', p)

write_file(p, c)
print("  OK compounds/tb-500/index.html")

# ---------------------------------------------------------------------------
# 14. compounds/bpc157-tb500-mix/index.html — Add KPV to related compounds
# ---------------------------------------------------------------------------
p = os.path.join(BASE, "compounds", "bpc157-tb500-mix", "index.html")
c = read_file(p)

OLD_MIX_RELATED_END = '</article></div>\n</section>\n<section class="faq-sec"'
if OLD_MIX_RELATED_END in c:
    c = replace_once(c, OLD_MIX_RELATED_END,
                     '</article>' + KPV_CARD_DEEP + '</div>\n</section>\n<section class="faq-sec"', p)
else:
    OLD_MIX_RELATED2 = '</article></div>\n</section>\n<section class="faq-sec" aria-labelledby="faq-heading">'
    c = replace_once(c, OLD_MIX_RELATED2,
                     '</article>' + KPV_CARD_DEEP + '</div>\n</section>\n<section class="faq-sec" aria-labelledby="faq-heading">', p)

write_file(p, c)
print("  OK compounds/bpc157-tb500-mix/index.html")

print("")
print("=== All phases complete ===")
