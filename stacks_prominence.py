import os, re, glob

base = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output')

# ─────────────────────────────────────────────────────────────────────────────
# STACK IMAGE PLACEHOLDER — inserted at top of every stack-card link
# ─────────────────────────────────────────────────────────────────────────────
PLACEHOLDER = (
    '<div class="sc-img-placeholder">'
    '<img src="" alt="Stack image" class="sc-prod-img">'
    '<span class="sc-img-label">STACK IMAGE</span>'
    '</div>'
)

link_re = re.compile(r'(<a class="stack-card-link" href="[^"]*">)')

# ─────────────────────────────────────────────────────────────────────────────
# TASK 1 — Add placeholder to every stack-card on:
#   • stacks/index.html
#   • all compound detail pages that have related-stacks
#   • all category hub pages that have cat-stacks
# Skip files that already have sc-img-placeholder
# ─────────────────────────────────────────────────────────────────────────────
all_html = glob.glob(os.path.join(base, '**', '*.html'), recursive=True)

placeholder_count = 0
for fp in sorted(all_html):
    with open(fp, encoding='utf-8') as fh:
        content = fh.read()
    if 'stack-card-link' not in content:
        continue
    if 'sc-img-placeholder' in content:
        continue
    new = link_re.sub(lambda m: m.group(0) + PLACEHOLDER, content)
    if new != content:
        with open(fp, 'w', encoding='utf-8') as fh:
            fh.write(new)
        placeholder_count += 1
        print('  placeholder →', os.path.relpath(fp, base))

print(f'\nTask 1 done: placeholders added to {placeholder_count} file(s)')

# ─────────────────────────────────────────────────────────────────────────────
# TASK 2 — Move related-stacks BEFORE related-compounds on compound detail pages
# ─────────────────────────────────────────────────────────────────────────────
compounds_re = re.compile(
    r'<section class="cp-section" id="related-compounds">.*?</section>',
    re.DOTALL
)
stacks_re = re.compile(
    r'<section class="cp-section" id="related-stacks">.*?</section>',
    re.DOTALL
)

reorder_count = 0
for fp in glob.glob(os.path.join(base, 'compounds', '*', 'index.html')):
    with open(fp, encoding='utf-8') as fh:
        content = fh.read()

    mc = compounds_re.search(content)
    ms = stacks_re.search(content)
    if not mc or not ms:
        continue
    if ms.start() < mc.start():
        continue  # already correct order

    c_html = mc.group(0)
    s_html = ms.group(0)
    separator = content[mc.end():ms.start()]   # whitespace/newline between sections

    old_block = c_html + separator + s_html
    new_block = s_html + separator + c_html

    new_content = content.replace(old_block, new_block, 1)
    if new_content != content:
        with open(fp, 'w', encoding='utf-8') as fh:
            fh.write(new_content)
        reorder_count += 1
        print('  reordered →', os.path.relpath(fp, base))

print(f'\nTask 2 done: sections reordered in {reorder_count} file(s)')

# ─────────────────────────────────────────────────────────────────────────────
# TASK 3 — Add "View all stacks" CTA banner after cat-stacks section
#           on category hub pages
# ─────────────────────────────────────────────────────────────────────────────
CTA = (
    '\n<section class="hp-sec cat-stacks-cta-sec">\n'
    '  <div class="sec-i">\n'
    '    <div class="cat-stacks-cta">\n'
    '      <span class="cat-stacks-cta-label">Explore all curated multi-compound bundles</span>\n'
    '      <a href="/stacks/" class="btn-p cat-stacks-cta-btn">View all 10 research stacks →</a>\n'
    '    </div>\n'
    '  </div>\n'
    '</section>'
)

cat_stacks_full_re = re.compile(
    r'(<section class="cat-stacks">.*?</section>)',
    re.DOTALL
)

cta_count = 0
for fp in glob.glob(os.path.join(base, 'compounds', '*', 'index.html')):
    with open(fp, encoding='utf-8') as fh:
        content = fh.read()
    if 'cat-stacks' not in content or 'cat-stacks-cta-sec' in content:
        continue
    new_content = cat_stacks_full_re.sub(lambda m: m.group(0) + CTA, content, count=1)
    if new_content != content:
        with open(fp, 'w', encoding='utf-8') as fh:
            fh.write(new_content)
        cta_count += 1
        print('  CTA added →', os.path.relpath(fp, base))

print(f'\nTask 3 done: Stacks CTA added to {cta_count} category hub page(s)')

# ─────────────────────────────────────────────────────────────────────────────
# TASK 4 — Nav styling: add nl-stacks class + elevate mobile menu item
#           across ALL html files
# ─────────────────────────────────────────────────────────────────────────────
# Desktop nav: class="nl " → class="nl nl-stacks"
nav_desk_re  = re.compile(r'<a class="nl " href="/stacks/">Stacks</a>')
nav_desk_rep = '<a class="nl nl-stacks" href="/stacks/">Stacks</a>'

# Active variant (on the stacks page itself)
nav_act_re  = re.compile(r'<a class="nl active" href="/stacks/">Stacks</a>')
nav_act_rep = '<a class="nl active nl-stacks" href="/stacks/">Stacks</a>'

# Mobile menu: demote from sub to its own top-level styled link
mob_re  = re.compile(r'<a href="/stacks/" class="mob-nl mob-nl-sub">— Stacks</a>')
mob_rep = '<a href="/stacks/" class="mob-nl mob-nl-stacks">Stacks</a>'

nav_count = 0
for fp in sorted(set(all_html)):
    with open(fp, encoding='utf-8') as fh:
        content = fh.read()
    new = nav_desk_re.sub(nav_desk_rep, content)
    new = nav_act_re.sub(nav_act_rep, new)
    new = mob_re.sub(mob_rep, new)
    if new != content:
        with open(fp, 'w', encoding='utf-8') as fh:
            fh.write(new)
        nav_count += 1
        print('  nav styled →', os.path.relpath(fp, base))

print(f'\nTask 4 done: nav updated in {nav_count} file(s)')
print('\nAll tasks complete.')
