"""
add_stack_cat_classes.py
Stamps page-cat-* body class onto each stack detail page based on URL slug.
"""
import os, glob

base = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output')

SLUG_MAP = {
    'cognitive':           'page-cat-cognitive',
    'cognitive-and-sleep': 'page-cat-cognitive',
    'advanced-cognitive':  'page-cat-cognitive',
    'metabolic':           'page-cat-metabolic',
    'gh-and-metabolic':    'page-cat-metabolic',
    'repair-and-metabolic':'page-cat-healing',
    'ultimate-repair':     'page-cat-healing',
    'gh-peptide':          'page-cat-growth',
    'skin-and-aesthetic':  'page-cat-antiageing',
    'anti-ageing':         'page-cat-antiageing',
}

updated = 0
for fp in sorted(glob.glob(os.path.join(base, 'stacks', '*', 'index.html'))):
    slug = os.path.basename(os.path.dirname(fp))
    cat_class = SLUG_MAP.get(slug)
    if not cat_class:
        print(f'  SKIP (no mapping): {slug}')
        continue

    with open(fp, encoding='utf-8') as f:
        content = f.read()

    # Already tagged — skip
    if cat_class in content:
        print(f'  already tagged: {slug}')
        continue

    # Add cat class to <body class="page-stack">
    new_content = content.replace(
        'class="page-stack"',
        f'class="page-stack {cat_class}"',
        1
    )

    if new_content != content:
        with open(fp, 'w', encoding='utf-8') as f:
            f.write(new_content)
        updated += 1
        print(f'  updated: stacks/{slug}/')
    else:
        print(f'  WARNING: body tag not found in {slug}')

print(f'\nDone. {updated} stack detail pages tagged.')
