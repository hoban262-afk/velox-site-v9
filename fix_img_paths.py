import os
import glob

base = os.path.join(os.path.dirname(__file__), 'output')
html_files = glob.glob(os.path.join(base, '**', '*.html'), recursive=True)
html_files += glob.glob(os.path.join(base, '*.html'))

total_replacements = 0
files_changed = 0

for filepath in sorted(set(html_files)):
    rel = os.path.relpath(filepath, base)          # e.g. "compounds/bpc-157/index.html"
    parts = rel.replace('\\', '/').split('/')
    depth = len(parts) - 1                          # number of directories above the file

    if depth == 0:
        # Root-level: leave untouched
        continue

    # Build the correct relative prefix: "../" * depth
    prefix = '../' * depth                          # depth=1 → "../"  depth=2 → "../../"

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # Replace src="/assets/images/ with src="<prefix>assets/images/
    old = 'src="/assets/images/'
    new = 'src="{}assets/images/'.format(prefix)
    count = content.count(old)
    if count:
        content = content.replace(old, new)
        total_replacements += count
        print('  depth={} ({} x{}) — {}'.format(depth, prefix + 'assets/images/', count, rel))

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        files_changed += 1

print('\nDone: {} replacement(s) across {} file(s).'.format(total_replacements, files_changed))
