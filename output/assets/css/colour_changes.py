with open('core.css', 'r', encoding='utf-8') as f:
    css = f.read()

changes = [
    # 1. Default cc-cat: add pill badge background (teal 10%)
    (
        '.cc-cat {\n  font-size: 10px !important;\n  font-weight: 700 !important;\n  letter-spacing: .1em !important;\n  color: #01D3A0 !important;\n  text-transform: uppercase !important;\n}',
        '.cc-cat {\n  font-size: 10px !important;\n  font-weight: 700 !important;\n  letter-spacing: .1em !important;\n  color: #01D3A0 !important;\n  text-transform: uppercase !important;\n  background: rgba(1,211,160,.10) !important;\n  padding: 2px 8px !important;\n  border-radius: 3px !important;\n  display: inline-block !important;\n}'
    ),
    # 2. Nav stacks: full orange to rgba 75%
    (
        '.nav-links a.nl-stacks {\n  color: #FF6B00 !important;',
        '.nav-links a.nl-stacks {\n  color: rgba(255,107,0,.75) !important;'
    ),
    (
        '.mob-menu a.mob-nl-stacks {\n  color: #FF6B00 !important;',
        '.mob-menu a.mob-nl-stacks {\n  color: rgba(255,107,0,.75) !important;'
    ),
    # 3. Category hub card borders: full to 50% opacity
    (
        'a.cat-tile[href*="/cognitive/"]      { border-top: 4px solid #9B6DFF !important; }',
        'a.cat-tile[href*="/cognitive/"]      { border-top: 4px solid rgba(155,109,255,.5) !important; }'
    ),
    (
        'a.cat-tile[href*="/metabolic/"]      { border-top: 4px solid #FFE500 !important; }',
        'a.cat-tile[href*="/metabolic/"]      { border-top: 4px solid rgba(255,229,0,.5) !important; }'
    ),
    (
        'a.cat-tile[href*="/healing-and-repair/"] { border-top: 4px solid #4FC3F7 !important; }',
        'a.cat-tile[href*="/healing-and-repair/"] { border-top: 4px solid rgba(79,195,247,.5) !important; }'
    ),
    (
        'a.cat-tile[href*="/growth/"]         { border-top: 4px solid #69D98C !important; }',
        'a.cat-tile[href*="/growth/"]         { border-top: 4px solid rgba(105,217,140,.5) !important; }'
    ),
    (
        'a.cat-tile[href*="/anti-ageing/"]    { border-top: 4px solid #FF6B9D !important; }',
        'a.cat-tile[href*="/anti-ageing/"]    { border-top: 4px solid rgba(255,107,157,.5) !important; }'
    ),
    # 4. Product card top borders: full to 60% opacity
    (
        '.cc.cc-cognitive  { border-top-color: #9B6DFF !important; }',
        '.cc.cc-cognitive  { border-top-color: rgba(155,109,255,.6) !important; }'
    ),
    (
        '.cc.cc-metabolic  { border-top-color: #FFE500 !important; }',
        '.cc.cc-metabolic  { border-top-color: rgba(255,229,0,.6) !important; }'
    ),
    (
        '.cc.cc-healing    { border-top-color: #4FC3F7 !important; }',
        '.cc.cc-healing    { border-top-color: rgba(79,195,247,.6) !important; }'
    ),
    (
        '.cc.cc-growth     { border-top-color: #69D98C !important; }',
        '.cc.cc-growth     { border-top-color: rgba(105,217,140,.6) !important; }'
    ),
    (
        '.cc.cc-antiageing { border-top-color: #FF6B9D !important; }',
        '.cc.cc-antiageing { border-top-color: rgba(255,107,157,.6) !important; }'
    ),
    # 5. Product card cc-cat: add category-specific badge backgrounds
    (
        '.cc.cc-cognitive  .cc-cat { color: #9B6DFF !important; }',
        '.cc.cc-cognitive  .cc-cat { color: #9B6DFF !important; background: rgba(155,109,255,.12) !important; }'
    ),
    (
        '.cc.cc-metabolic  .cc-cat { color: #FFE500 !important; }',
        '.cc.cc-metabolic  .cc-cat { color: #FFE500 !important; background: rgba(255,229,0,.12) !important; }'
    ),
    (
        '.cc.cc-healing    .cc-cat { color: #4FC3F7 !important; }',
        '.cc.cc-healing    .cc-cat { color: #4FC3F7 !important; background: rgba(79,195,247,.12) !important; }'
    ),
    (
        '.cc.cc-growth     .cc-cat { color: #69D98C !important; }',
        '.cc.cc-growth     .cc-cat { color: #69D98C !important; background: rgba(105,217,140,.12) !important; }'
    ),
    (
        '.cc.cc-antiageing .cc-cat { color: #FF6B9D !important; }',
        '.cc.cc-antiageing .cc-cat { color: #FF6B9D !important; background: rgba(255,107,157,.12) !important; }'
    ),
    # 6. Product card hover glows: 0.35 to 0.15
    (
        '.cc.cc-cognitive:hover  { border-color: #9B6DFF !important; box-shadow: 0 0 14px rgba(155,109,255,0.35), 0 4px 20px rgba(155,109,255,0.10) !important; }',
        '.cc.cc-cognitive:hover  { border-color: rgba(155,109,255,.7) !important; box-shadow: 0 0 14px rgba(155,109,255,0.15), 0 4px 20px rgba(155,109,255,0.08) !important; }'
    ),
    (
        '.cc.cc-metabolic:hover  { border-color: #FFE500 !important; box-shadow: 0 0 14px rgba(255,229,0,0.35),  0 4px 20px rgba(255,229,0,0.10)  !important; }',
        '.cc.cc-metabolic:hover  { border-color: rgba(255,229,0,.7) !important; box-shadow: 0 0 14px rgba(255,229,0,0.15),  0 4px 20px rgba(255,229,0,0.08)  !important; }'
    ),
    (
        '.cc.cc-healing:hover    { border-color: #4FC3F7 !important; box-shadow: 0 0 14px rgba(79,195,247,0.35),  0 4px 20px rgba(79,195,247,0.10)  !important; }',
        '.cc.cc-healing:hover    { border-color: rgba(79,195,247,.7) !important; box-shadow: 0 0 14px rgba(79,195,247,0.15),  0 4px 20px rgba(79,195,247,0.08)  !important; }'
    ),
    (
        '.cc.cc-growth:hover     { border-color: #69D98C !important; box-shadow: 0 0 14px rgba(105,217,140,0.35), 0 4px 20px rgba(105,217,140,0.10) !important; }',
        '.cc.cc-growth:hover     { border-color: rgba(105,217,140,.7) !important; box-shadow: 0 0 14px rgba(105,217,140,0.15), 0 4px 20px rgba(105,217,140,0.08) !important; }'
    ),
    (
        '.cc.cc-antiageing:hover { border-color: #FF6B9D !important; box-shadow: 0 0 14px rgba(255,107,157,0.35), 0 4px 20px rgba(255,107,157,0.10) !important; }',
        '.cc.cc-antiageing:hover { border-color: rgba(255,107,157,.7) !important; box-shadow: 0 0 14px rgba(255,107,157,0.15), 0 4px 20px rgba(255,107,157,0.08) !important; }'
    ),
    # 7. Product detail eyebrow: full to 70% opacity
    (
        'body.page-cat-cognitive  .cp-eyebrow { color: #9B6DFF !important; }',
        'body.page-cat-cognitive  .cp-eyebrow { color: rgba(155,109,255,.7) !important; }'
    ),
    (
        'body.page-cat-metabolic  .cp-eyebrow { color: #FFE500 !important; }',
        'body.page-cat-metabolic  .cp-eyebrow { color: rgba(255,229,0,.7) !important; }'
    ),
    (
        'body.page-cat-healing    .cp-eyebrow { color: #4FC3F7 !important; }',
        'body.page-cat-healing    .cp-eyebrow { color: rgba(79,195,247,.7) !important; }'
    ),
    (
        'body.page-cat-growth     .cp-eyebrow { color: #69D98C !important; }',
        'body.page-cat-growth     .cp-eyebrow { color: rgba(105,217,140,.7) !important; }'
    ),
    (
        'body.page-cat-antiageing .cp-eyebrow { color: #FF6B9D !important; }',
        'body.page-cat-antiageing .cp-eyebrow { color: rgba(255,107,157,.7) !important; }'
    ),
    # 8. Stack tile borders: full to 60% opacity
    (
        'article.stack-card:has(a[href*="/stacks/cognitive/"]),\narticle.stack-card:has(a[href*="/stacks/cognitive-and-sleep/"]),\narticle.stack-card:has(a[href*="/stacks/advanced-cognitive/"]) { border-top: 4px solid #9B6DFF !important; }',
        'article.stack-card:has(a[href*="/stacks/cognitive/"]),\narticle.stack-card:has(a[href*="/stacks/cognitive-and-sleep/"]),\narticle.stack-card:has(a[href*="/stacks/advanced-cognitive/"]) { border-top: 4px solid rgba(155,109,255,.6) !important; }'
    ),
    (
        'article.stack-card:has(a[href*="/stacks/metabolic/"]),\narticle.stack-card:has(a[href*="/stacks/gh-and-metabolic/"]) { border-top: 4px solid #FFE500 !important; }',
        'article.stack-card:has(a[href*="/stacks/metabolic/"]),\narticle.stack-card:has(a[href*="/stacks/gh-and-metabolic/"]) { border-top: 4px solid rgba(255,229,0,.6) !important; }'
    ),
    (
        'article.stack-card:has(a[href*="/stacks/repair-and-metabolic/"]),\narticle.stack-card:has(a[href*="/stacks/ultimate-repair/"]) { border-top: 4px solid #4FC3F7 !important; }',
        'article.stack-card:has(a[href*="/stacks/repair-and-metabolic/"]),\narticle.stack-card:has(a[href*="/stacks/ultimate-repair/"]) { border-top: 4px solid rgba(79,195,247,.6) !important; }'
    ),
    (
        'article.stack-card:has(a[href*="/stacks/gh-peptide/"]) { border-top: 4px solid #69D98C !important; }',
        'article.stack-card:has(a[href*="/stacks/gh-peptide/"]) { border-top: 4px solid rgba(105,217,140,.6) !important; }'
    ),
    (
        'article.stack-card:has(a[href*="/stacks/skin-and-aesthetic/"]),\narticle.stack-card:has(a[href*="/stacks/anti-ageing/"]) { border-top: 4px solid #FF6B9D !important; }',
        'article.stack-card:has(a[href*="/stacks/skin-and-aesthetic/"]),\narticle.stack-card:has(a[href*="/stacks/anti-ageing/"]) { border-top: 4px solid rgba(255,107,157,.6) !important; }'
    ),
    # 9. Stack tile hover glows: 0.35 to 0.15
    (
        'article.stack-card:has(a[href*="/stacks/cognitive/"]):hover,\narticle.stack-card:has(a[href*="/stacks/cognitive-and-sleep/"]):hover,\narticle.stack-card:has(a[href*="/stacks/advanced-cognitive/"]):hover { border-color: #9B6DFF !important; box-shadow: 0 0 14px rgba(155,109,255,0.35), 0 4px 20px rgba(155,109,255,0.10) !important; transform: translateY(-2px) !important; }',
        'article.stack-card:has(a[href*="/stacks/cognitive/"]):hover,\narticle.stack-card:has(a[href*="/stacks/cognitive-and-sleep/"]):hover,\narticle.stack-card:has(a[href*="/stacks/advanced-cognitive/"]):hover { border-color: rgba(155,109,255,.7) !important; box-shadow: 0 0 14px rgba(155,109,255,0.15), 0 4px 20px rgba(155,109,255,0.08) !important; transform: translateY(-2px) !important; }'
    ),
    (
        'article.stack-card:has(a[href*="/stacks/metabolic/"]):hover,\narticle.stack-card:has(a[href*="/stacks/gh-and-metabolic/"]):hover { border-color: #FFE500 !important; box-shadow: 0 0 14px rgba(255,229,0,0.35), 0 4px 20px rgba(255,229,0,0.10) !important; transform: translateY(-2px) !important; }',
        'article.stack-card:has(a[href*="/stacks/metabolic/"]):hover,\narticle.stack-card:has(a[href*="/stacks/gh-and-metabolic/"]):hover { border-color: rgba(255,229,0,.7) !important; box-shadow: 0 0 14px rgba(255,229,0,0.15), 0 4px 20px rgba(255,229,0,0.08) !important; transform: translateY(-2px) !important; }'
    ),
    (
        'article.stack-card:has(a[href*="/stacks/repair-and-metabolic/"]):hover,\narticle.stack-card:has(a[href*="/stacks/ultimate-repair/"]):hover { border-color: #4FC3F7 !important; box-shadow: 0 0 14px rgba(79,195,247,0.35), 0 4px 20px rgba(79,195,247,0.10) !important; transform: translateY(-2px) !important; }',
        'article.stack-card:has(a[href*="/stacks/repair-and-metabolic/"]):hover,\narticle.stack-card:has(a[href*="/stacks/ultimate-repair/"]):hover { border-color: rgba(79,195,247,.7) !important; box-shadow: 0 0 14px rgba(79,195,247,0.15), 0 4px 20px rgba(79,195,247,0.08) !important; transform: translateY(-2px) !important; }'
    ),
    (
        'article.stack-card:has(a[href*="/stacks/gh-peptide/"]):hover { border-color: #69D98C !important; box-shadow: 0 0 14px rgba(105,217,140,0.35), 0 4px 20px rgba(105,217,140,0.10) !important; transform: translateY(-2px) !important; }',
        'article.stack-card:has(a[href*="/stacks/gh-peptide/"]):hover { border-color: rgba(105,217,140,.7) !important; box-shadow: 0 0 14px rgba(105,217,140,0.15), 0 4px 20px rgba(105,217,140,0.08) !important; transform: translateY(-2px) !important; }'
    ),
    (
        'article.stack-card:has(a[href*="/stacks/skin-and-aesthetic/"]):hover,\narticle.stack-card:has(a[href*="/stacks/anti-ageing/"]):hover { border-color: #FF6B9D !important; box-shadow: 0 0 14px rgba(255,107,157,0.35), 0 4px 20px rgba(255,107,157,0.10) !important; transform: translateY(-2px) !important; }',
        'article.stack-card:has(a[href*="/stacks/skin-and-aesthetic/"]):hover,\narticle.stack-card:has(a[href*="/stacks/anti-ageing/"]):hover { border-color: rgba(255,107,157,.7) !important; box-shadow: 0 0 14px rgba(255,107,157,0.15), 0 4px 20px rgba(255,107,157,0.08) !important; transform: translateY(-2px) !important; }'
    ),
    # 10. Stacks orange tile border: full to 50% opacity
    (
        'a.cat-tile[href="/stacks/"]               { border-top: 4px solid #FF6B00 !important; }',
        'a.cat-tile[href="/stacks/"]               { border-top: 4px solid rgba(255,107,0,.5) !important; }'
    ),
    # 11. Stacks hub hover glow: 0.35 to 0.15
    (
        'body.page-stacks-root article.stack-card:hover { border-color: #FF6B00 !important; box-shadow: 0 0 14px rgba(255,107,0,0.35), 0 4px 20px rgba(255,107,0,0.10) !important; transform: translateY(-2px) !important; }',
        'body.page-stacks-root article.stack-card:hover { border-color: rgba(255,107,0,.75) !important; box-shadow: 0 0 14px rgba(255,107,0,0.15), 0 4px 20px rgba(255,107,0,0.08) !important; transform: translateY(-2px) !important; }'
    ),
    # 12. hp-stacks-block top border: full to 75%
    (
        '.hp-stacks-block {\n  border-top-color: #FF6B00 !important;\n}',
        '.hp-stacks-block {\n  border-top-color: rgba(255,107,0,.75) !important;\n}'
    ),
]

applied = 0
missed = []
for old, new in changes:
    if old in css:
        css = css.replace(old, new, 1)
        applied += 1
    else:
        missed.append(old[:80])

with open('core.css', 'w', encoding='utf-8') as f:
    f.write(css)

print(f'Applied {applied}/{len(changes)} changes')
if missed:
    print('MISSED:')
    for m in missed:
        print('  >' + m)
