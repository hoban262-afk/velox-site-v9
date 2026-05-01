import os
import glob

# Card placeholder (32x32) — inside .cc-img-wrap, followed by cc-img-name span
SVG_32 = '      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#01D3A0" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'

# Hero placeholder (40x40) — inside .cp-img-placeholder, followed by cp-img-label span
SVG_40 = '      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#01D3A0" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'

# HTML name (as it appears in the span) -> image filename
MAPPING = {
    'BPC-157':                    'bpc157.png',
    'BPC-157 &amp; TB-500 Mix':   'bpc157tb500.png',
    'CJC-1295 wo DAC':            'cjc1295wodac.png',
    'Dihexa':                     'dihexa.png',
    'DSIP':                       'dsip.png',
    'GHK-Cu':                     'ghkcu.png',
    'Glutathione':                 'glutathione.png',
    'Mots-C':                     'motsc.png',
    'Melanotan II':               'mt2.png',
    'Retatrutide':                'retatrutide.png',
    'Selank':                     'selank.png',
    'Semax':                      'semax.png',
    'TB-500':                     'tb500.png',
    'Tesamorelin':                'tesamorelin.png',
    'NAD+':                       'nadplus.png',
}

base = os.path.join(os.path.dirname(__file__), 'output')
html_files = glob.glob(os.path.join(base, '**', '*.html'), recursive=True)

total_replacements = 0
files_changed = 0

for filepath in html_files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    for name, imgfile in MAPPING.items():
        # 1. Product grid cards — SVG_32 + cc-img-name span
        old_card = '{}\n      <span class="cc-img-name">{}</span>'.format(SVG_32, name)
        new_card = '      <img src="/assets/images/{}" alt="{}" class="cc-img">\n      <span class="cc-img-name">{}</span>'.format(imgfile, name, name)
        count = content.count(old_card)
        if count:
            content = content.replace(old_card, new_card)
            total_replacements += count
            print('  [card] {} x{} — {}'.format(name, count, os.path.relpath(filepath, base)))

        # 2. Product hero section — SVG_40 + cp-img-label span
        old_hero = '{}\n      <span class="cp-img-label">{}</span>'.format(SVG_40, name)
        new_hero = '      <img src="/assets/images/{}" alt="{}" class="cp-prod-img">\n      <span class="cp-img-label">{}</span>'.format(imgfile, name, name)
        count = content.count(old_hero)
        if count:
            content = content.replace(old_hero, new_hero)
            total_replacements += count
            print('  [hero] {} x{} — {}'.format(name, count, os.path.relpath(filepath, base)))

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        files_changed += 1

print('\nDone: {} replacement(s) across {} file(s).'.format(total_replacements, files_changed))
