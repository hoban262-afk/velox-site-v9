"""
strip_card_badges2.py
Removes ALL cc-badge and cc-tag elements from product card tiles.
Leaves cp-size-badge / cp-badge (order panel on detail pages) untouched.
"""
import re, glob, os

base = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output')
os.chdir(base)

SKIP = {'stacks', 'checkout', 'cart', 'legal', 'about', 'faq',
        'contact', 'tools', 'shipping', 'research', 'confirmation'}

total = 0
for fp in sorted(glob.glob('**/*.html', recursive=True)):
    parts = fp.replace('\\', '/').split('/')
    if any(s in parts for s in SKIP):
        continue
    with open(fp, encoding='utf-8') as f:
        txt = f.read()

    # Only process files that contain product cards
    if 'cc cc-' not in txt and 'class="cc "' not in txt:
        continue

    orig = txt
    # Remove any <span class="cc-badge ...">...</span>
    txt, n1 = re.subn(r'\s*<span class="cc-badge[^"]*">[^<]*</span>', '', txt)
    # Remove any <span class="cc-tag ...">...</span>
    txt, n2 = re.subn(r'\s*<span class="cc-tag[^"]*">[^<]*</span>', '', txt)

    removed = n1 + n2
    total += removed
    if txt != orig:
        with open(fp, 'w', encoding='utf-8') as f:
            f.write(txt)
        print(f'  {fp}: -{removed} badge/tag elements')

print(f'\nDone. {total} badge/tag elements removed from product card tiles.')
