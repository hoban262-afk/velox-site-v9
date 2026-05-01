import re, glob, os

base = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output')
os.chdir(base)

SKIP = {'stacks', 'checkout', 'cart', 'legal', 'about', 'faq',
        'contact', 'tools', 'shipping', 'research', 'confirmation'}

removed_best = removed_new = 0
for fp in sorted(glob.glob('**/*.html', recursive=True)):
    parts = fp.replace('\\', '/').split('/')
    if any(s in parts for s in SKIP):
        continue
    with open(fp, encoding='utf-8') as f:
        txt = f.read()

    # Only touch files that contain product cards
    if 'cc cc-' not in txt and 'class="cc "' not in txt:
        continue

    orig = txt
    n_best = txt.count('cc-badge cc-badge-best')
    txt = re.sub(r'\s*<span class="cc-badge cc-badge-best">BEST PRICE</span>', '', txt)
    removed_best += n_best

    n_new = txt.count('cc-tag cc-tag-new')
    txt = re.sub(r'\s*<span class="cc-tag cc-tag-new">NEW</span>', '', txt)
    removed_new += n_new

    if txt != orig:
        with open(fp, 'w', encoding='utf-8') as f:
            f.write(txt)
        print(f'  {fp}: -{n_best} BEST PRICE, -{n_new} NEW')

print(f'\nDone. Removed {removed_best} BEST PRICE badges, {removed_new} NEW tags.')
