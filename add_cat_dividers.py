"""
add_cat_dividers.py
Inserts styled category divider elements before each cat-group section
in output/compounds/index.html.
"""
import re, os

base = os.path.dirname(os.path.abspath(__file__))
fp = os.path.join(base, 'output', 'compounds', 'index.html')

with open(fp, encoding='utf-8') as f:
    txt = f.read()

# Map section id -> (divider class, data-label)
DIVIDERS = {
    'cognitive':         ('cat-divider-cognitive',  'COGNITIVE'),
    'metabolic':         ('cat-divider-metabolic',  'METABOLIC'),
    'healing-and-repair':('cat-divider-healing',    'HEALING &amp; REPAIR'),
    'growth':            ('cat-divider-growth',      'GROWTH'),
    'anti-ageing':       ('cat-divider-antiageing',  'ANTI-AGEING'),
}

for sec_id, (cls, label) in DIVIDERS.items():
    pattern = rf'(<section class="cat-group" id="{re.escape(sec_id)}">)'
    divider_html = f'<div class="cat-divider {cls}" data-label="{label}"></div>\n'
    txt = re.sub(pattern, divider_html + r'\1', txt)

with open(fp, 'w', encoding='utf-8') as f:
    f.write(txt)

print('Done — divider elements inserted.')
