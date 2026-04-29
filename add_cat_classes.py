"""
add_cat_classes.py
Adds category-specific CSS classes to:
  1. Every <article class="cc"> across all HTML files
     (class added based on the cc-cat text inside the article)
  2. <body> of every product detail page (page-compound)
     (class added based on cp-eyebrow text)
  3. <body> of every category hub page (page-category)
     (class added based on file path slug)
"""
import os, re, glob

base = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output')

# cc-cat inner HTML  →  article CSS class
CC_CAT_MAP = {
    'Cognitive':              'cc-cognitive',
    'Metabolic':              'cc-metabolic',
    'Healing &amp; Repair':   'cc-healing',
    'Growth':                 'cc-growth',
    'Anti-Ageing':            'cc-antiageing',
}

# cp-eyebrow inner HTML  →  body CSS class
EYEBROW_MAP = {
    '&#8212; Cognitive':           'page-cat-cognitive',
    '&#8212; Metabolic':           'page-cat-metabolic',
    '&#8212; Healing &amp; Repair':'page-cat-healing',
    '&#8212; Growth':              'page-cat-growth',
    '&#8212; Anti-Ageing':         'page-cat-antiageing',
    # em-dash written as the literal character (some pages use it directly)
    '— Cognitive':            'page-cat-cognitive',
    '— Metabolic':            'page-cat-metabolic',
    '— Healing &amp; Repair': 'page-cat-healing',
    '— Growth':               'page-cat-growth',
    '— Anti-Ageing':          'page-cat-antiageing',
    # plain hyphen-dash form used in the HTML
    '— Cognitive':                 'page-cat-cognitive',
    '— Metabolic':                 'page-cat-metabolic',
    '— Healing &amp; Repair':      'page-cat-healing',
    '— Growth':                    'page-cat-growth',
    '— Anti-Ageing':               'page-cat-antiageing',
}

# compounds/{slug}  →  body CSS class
HUB_SLUG_MAP = {
    'cognitive':          'page-cat-cognitive',
    'metabolic':          'page-cat-metabolic',
    'healing-and-repair': 'page-cat-healing',
    'growth':             'page-cat-growth',
    'anti-ageing':        'page-cat-antiageing',
}

# Regex: capture opening article tag + all content up to </article>
ARTICLE_RE = re.compile(
    r'(<article\s+class="cc([^"]*)"[^>]*>)([\s\S]*?)</article>',
    re.DOTALL
)

total_files = 0
total_articles = 0

for fp in sorted(glob.glob(os.path.join(base, '**', '*.html'), recursive=True)):
    with open(fp, encoding='utf-8') as f:
        content = f.read()

    new_content = content
    fp_norm = fp.replace('\\', '/')

    # ── 1. Tag every <article class="cc ..."> with a category class ──────────
    def add_article_cat(m):
        global total_articles
        open_tag   = m.group(1)   # e.g. <article class="cc ">
        extra_cls  = m.group(2)   # whatever follows "cc" inside the class attr
        body       = m.group(3)   # everything between open and </article>

        for cc_text, cc_class in CC_CAT_MAP.items():
            if f'class="cc-cat">{cc_text}<' in body:
                if cc_class in extra_cls:
                    # already tagged — leave untouched
                    return m.group(0)
                # Insert category class right after "cc"
                new_open = open_tag.replace(
                    f'class="cc{extra_cls}"',
                    f'class="cc {cc_class}{extra_cls}"',
                    1
                )
                total_articles += 1
                return new_open + body + '</article>'
        return m.group(0)

    new_content = ARTICLE_RE.sub(add_article_cat, new_content)

    # ── 2. Add category class to <body> of product detail pages ─────────────
    if 'class="page-compound"' in new_content and 'page-cat-' not in new_content:
        for eyebrow_text, body_class in EYEBROW_MAP.items():
            if eyebrow_text in new_content:
                new_content = new_content.replace(
                    'class="page-compound"',
                    f'class="page-compound {body_class}"',
                    1
                )
                break

    # ── 3. Add category class to <body> of category hub pages ────────────────
    if 'class="page-category"' in new_content and 'page-cat-' not in new_content:
        for slug, body_class in HUB_SLUG_MAP.items():
            if f'/compounds/{slug}/' in fp_norm:
                new_content = new_content.replace(
                    'class="page-category"',
                    f'class="page-category {body_class}"',
                    1
                )
                break

    if new_content != content:
        with open(fp, 'w', encoding='utf-8') as f:
            f.write(new_content)
        total_files += 1
        print(f'updated: {os.path.relpath(fp, base)}')

print(f'\nDone. {total_files} files updated, {total_articles} article tags tagged.')
