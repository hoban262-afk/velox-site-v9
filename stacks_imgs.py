import re, glob, os

SLUG_IMG = {
    'cognitive':            'cognativestack.png',
    'cognitive-and-sleep':  'cognativesleepstack.png',
    'anti-ageing':          'antiagingstack.png',
    'metabolic':            'metabolicstack.png',
    'repair-and-metabolic': 'repairmetabolicstack.png',
    'gh-peptide':           'ghpeptidestack.png',
    'skin-and-aesthetic':   'skinaestheticstack.png',
    'gh-and-metabolic':     'ghmetabolicstack.png',
    'advanced-cognitive':   'advancedcognativestack.png',
    'ultimate-repair':      'ultimaterepairstack.png',
}

base = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output')
os.chdir(base)

placeholder_re = re.compile(
    r'(<a class="stack-card-link" href="/stacks/([^"]+)/"><div class="sc-img-placeholder"><img) src=""'
)

total = 0
for fp in sorted(glob.glob('**/*.html', recursive=True)):
    with open(fp, encoding='utf-8') as fh:
        content = fh.read()
    if 'sc-img-placeholder' not in content:
        continue

    # depth: stacks/index.html -> 1 dir -> prefix '../'
    #        compounds/bpc-157/index.html -> 2 dirs -> prefix '../../'
    depth = len(fp.replace('\\', '/').split('/')) - 1
    prefix = '../' * depth

    def replacer(m):
        slug = m.group(2)
        img  = SLUG_IMG.get(slug)
        if not img:
            return m.group(0)
        return m.group(1) + ' src="' + prefix + 'assets/images/' + img + '"'

    new = placeholder_re.sub(replacer, content)
    if new != content:
        with open(fp, 'w', encoding='utf-8') as fh:
            fh.write(new)
        total += 1
        print('updated:', fp)

print('\nDone:', total, 'files updated.')
