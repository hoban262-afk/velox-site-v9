import os, re

base = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output')

# slug -> (display name for aria/alt, image filename)
STACKS = {
    'cognitive':            ('Cognitive Stack',                'cognativestack.png'),
    'cognitive-and-sleep':  ('Cognitive &amp; Sleep Stack',   'cognativesleepstack.png'),
    'gh-peptide':           ('GH Peptide Stack',               'ghpeptidestack.png'),
    'anti-ageing':          ('Anti-Ageing Stack',              'antiagingstack.png'),
    'metabolic':            ('Metabolic Stack',                'metabolicstack.png'),
    'repair-and-metabolic': ('Repair &amp; Metabolic Stack',   'repairmetabolicstack.png'),
    'skin-and-aesthetic':   ('Skin &amp; Aesthetic Stack',     'skinaestheticstack.png'),
    'gh-and-metabolic':     ('GH &amp; Metabolic Stack',       'ghmetabolicstack.png'),
    'advanced-cognitive':   ('Advanced Cognitive Stack',       'advancedcognativestack.png'),
    'ultimate-repair':      ('Ultimate Repair Stack',          'ultimaterepairstack.png'),
}

for slug, (name, img) in STACKS.items():
    fp = os.path.join(base, 'stacks', slug, 'index.html')
    if not os.path.exists(fp):
        print('MISSING FILE:', fp)
        continue

    with open(fp, encoding='utf-8') as fh:
        content = fh.read()

    if 'cp-img-col' in content:
        print('already has img-col, skipping:', slug)
        continue

    # All stack detail pages are at stacks/SLUG/index.html — depth 2
    img_src = '../../assets/images/' + img

    img_col = (
        '\n  <div class="cp-img-col">\n'
        '    <div class="cp-img-placeholder" aria-label="Stack image — ' + name + '">\n'
        '      <img src="' + img_src + '" alt="' + name + '" class="cp-prod-img">\n'
        '      <span class="cp-img-label">' + name + '</span>\n'
        '      <span class="cp-img-sub">STACK IMAGE</span>\n'
        '    </div>\n'
        '    <div class="cp-img-badges">\n'
        '      <span class="cp-badge">BATCH COA SUPPLIED</span>\n'
        '      <span class="cp-badge">HPLC VERIFIED</span>\n'
        '      <span class="cp-badge cp-badge-purity">RESEARCH USE ONLY</span>\n'
        '    </div>\n'
        '  </div>\n'
    )

    # Insert the image column before <div class="cp-hero-main">
    marker = '  <div class="cp-hero-main">'
    if marker not in content:
        print('WARN: insertion point not found in', slug)
        continue

    new_content = content.replace(marker, img_col + marker, 1)

    with open(fp, 'w', encoding='utf-8') as fh:
        fh.write(new_content)
    print('updated:', slug)

print('\nDone.')
