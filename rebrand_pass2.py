"""
Pass 2: Update SEO meta on old hub pages, then copy to new URL directories.
"""
import os, re, shutil

BASE = "output"

HUB_META = [
    {
        'old_slug': 'cognitive',
        'new_slug': 'neuropeptide-research',
        'new_url':  'https://veloxpeps.com/compounds/neuropeptide-research/',
        'title':    'Neuropeptide Research Compounds | HPLC-Verified | Velox Peptides',
        'desc':     'Browse HPLC-verified neuropeptide research compounds including Semax, Selank and DSIP. Batch CoA supplied. UK dispatch via Royal Mail Tracked 24.',
        'og_title': 'Neuropeptide Research Compounds | HPLC-Verified | Velox Peptides',
    },
    {
        'old_slug': 'metabolic',
        'new_slug': 'incretin-receptor-research',
        'new_url':  'https://veloxpeps.com/compounds/incretin-receptor-research/',
        'title':    'Incretin & Receptor Research Compounds | GLP-1 GIP | Velox Peptides',
        'desc':     'Research compounds studied across GLP-1, GIP and glucagon receptor pathways. Includes Retatrutide, MOTS-C and NAD+. HPLC-verified, batch tested.',
        'og_title': 'Incretin & Receptor Research Compounds | GLP-1 GIP | Velox Peptides',
    },
    {
        'old_slug': 'healing-and-repair',
        'new_slug': 'angiogenic-tissue-research',
        'new_url':  'https://veloxpeps.com/compounds/angiogenic-tissue-research/',
        'title':    'Angiogenic & Tissue Research Compounds | BPC-157 TB-500 | Velox Peptides',
        'desc':     'HPLC-verified research compounds studied for angiogenic and tissue repair mechanisms including BPC-157, TB-500 and KPV. Batch CoA supplied.',
        'og_title': 'Angiogenic & Tissue Research Compounds | BPC-157 TB-500 | Velox Peptides',
    },
    {
        'old_slug': 'growth',
        'new_slug': 'somatotropic-research',
        'new_url':  'https://veloxpeps.com/compounds/somatotropic-research/',
        'title':    'Somatotropic Research Compounds | GH Axis Peptides | Velox Peptides',
        'desc':     'Research compounds studied across the GH axis including Tesamorelin and CJC-1295 WO DAC. HPLC-verified, batch tested, UK dispatch.',
        'og_title': 'Somatotropic Research Compounds | GH Axis Peptides | Velox Peptides',
    },
    {
        'old_slug': 'anti-ageing',
        'new_slug': 'oxidative-pathway-research',
        'new_url':  'https://veloxpeps.com/compounds/oxidative-pathway-research/',
        'title':    'Oxidative Pathway Research Compounds | GHK-Cu NAD+ | Velox Peptides',
        'desc':     'Research compounds studied for oxidative pathway mechanisms including GHK-Cu, Glutathione and NAD+. HPLC-verified, CoA supplied with every order.',
        'og_title': 'Oxidative Pathway Research Compounds | GHK-Cu NAD+ | Velox Peptides',
    },
]

def update_seo(html, m):
    h = html

    # <title>
    h = re.sub(r'<title>.*?</title>', '<title>%s</title>' % m['title'], h, flags=re.DOTALL)

    # <meta name="description"
    h = re.sub(r'<meta name="description" content="[^"]*"',
               '<meta name="description" content="%s"' % m['desc'], h)

    # <link rel="canonical"
    h = re.sub(r'<link rel="canonical" href="[^"]*"',
               '<link rel="canonical" href="%s"' % m['new_url'], h)

    # og:url
    h = re.sub(r'<meta property="og:url" content="[^"]*"',
               '<meta property="og:url" content="%s"' % m['new_url'], h)

    # og:title
    h = re.sub(r'<meta property="og:title" content="[^"]*"',
               '<meta property="og:title" content="%s"' % m['og_title'], h)

    # og:description
    h = re.sub(r'<meta property="og:description" content="[^"]*"',
               '<meta property="og:description" content="%s"' % m['desc'], h)

    # twitter:title
    h = re.sub(r'<meta name="twitter:title" content="[^"]*"',
               '<meta name="twitter:title" content="%s"' % m['og_title'], h)

    # twitter:description
    h = re.sub(r'<meta name="twitter:description" content="[^"]*"',
               '<meta name="twitter:description" content="%s"' % m['desc'], h)

    return h

for m in HUB_META:
    old_path = os.path.join(BASE, 'compounds', m['old_slug'], 'index.html')
    new_dir  = os.path.join(BASE, 'compounds', m['new_slug'])
    new_path = os.path.join(new_dir, 'index.html')

    with open(old_path, 'r', encoding='utf-8') as f:
        html = f.read()

    updated = update_seo(html, m)

    # Write back to old path (also updates SEO there before redirecting)
    with open(old_path, 'w', encoding='utf-8') as f:
        f.write(updated)

    # Create new directory and write new hub page
    os.makedirs(new_dir, exist_ok=True)
    with open(new_path, 'w', encoding='utf-8') as f:
        f.write(updated)

    print('Created: %s' % new_path)

print('Done.')
