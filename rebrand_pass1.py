import os, re, glob, shutil

BASE = "output"

CATS = [
    {
        'old_slug':       'cognitive',
        'new_slug':       'neuropeptide-research',
        'old_url':        '/compounds/cognitive/',
        'new_url':        '/compounds/neuropeptide-research/',
        'old_body':       'page-cat-cognitive',
        'new_body':       'page-cat-neuropeptide',
        'old_cc':         'cc-cognitive',
        'new_cc':         'cc-neuropeptide',
        'old_div':        'cat-divider-cognitive',
        'new_div':        'cat-divider-neuropeptide',
        'old_data_label': 'COGNITIVE',
        'new_data_label': 'NEUROPEPTIDE RESEARCH',
        'old_sec_id':     'cognitive',
        'new_sec_id':     'neuropeptide-research',
        'old_mob':        '— Cognitive',
        'new_mob':        '— Neuropeptide Research',
        'old_ft_text':    'Cognitive',
        'new_ft_text':    'Neuropeptide Research',
        'old_cc_cat':     'Cognitive',
        'new_cc_cat':     'Neuropeptide Research',
        'old_bc_text':    'Cognitive',
        'new_bc_text':    'Neuropeptide Research',
        'old_tile_text':  'Cognitive',
        'new_tile_text':  'Neuropeptide Research',
        'old_h1':         'Cognitive research peptides',
        'new_h1':         'Neuropeptide research compounds',
        'old_h2':         'Cognitive research peptides',
        'new_h2':         'Neuropeptide research compounds',
        'old_sec_in':     'Compounds in cognitive research',
        'new_sec_in':     'Compounds in neuropeptide research',
        'old_stk_sec':    'Stacks containing cognitive compounds',
        'new_stk_sec':    'Research bundles containing neuropeptide research compounds',
        'old_faq_head':   'Frequently asked \xe2\x80\x94 cognitive research',
        'new_faq_head':   'Frequently asked \xe2\x80\x94 neuropeptide research',
        'old_faq_html':   'cognitive research',
        'new_faq_html':   'neuropeptide research',
        'old_hub_link':   'View cognitive hub',
        'new_hub_link':   'View neuropeptide research hub',
        'seo_title':      'Neuropeptide Research Compounds | HPLC-Verified | Velox Peptides',
        'seo_desc':       'Browse HPLC-verified neuropeptide research compounds including Semax, Selank and DSIP. Batch CoA supplied. UK dispatch via Royal Mail Tracked 24.',
        'old_jsonld_nm':  'Cognitive Research Peptides',
        'new_jsonld_nm':  'Neuropeptide Research Compounds',
        'old_bc_json':    '"name": "Cognitive"',
        'new_bc_json':    '"name": "Neuropeptide Research"',
        'old_faq_json':   'cognitive research',
        'new_faq_json':   'neuropeptide research',
    },
    {
        'old_slug':       'metabolic',
        'new_slug':       'incretin-receptor-research',
        'old_url':        '/compounds/metabolic/',
        'new_url':        '/compounds/incretin-receptor-research/',
        'old_body':       'page-cat-metabolic',
        'new_body':       'page-cat-incretin',
        'old_cc':         'cc-metabolic',
        'new_cc':         'cc-incretin',
        'old_div':        'cat-divider-metabolic',
        'new_div':        'cat-divider-incretin',
        'old_data_label': 'METABOLIC',
        'new_data_label': 'INCRETIN &amp; RECEPTOR RESEARCH',
        'old_sec_id':     'metabolic',
        'new_sec_id':     'incretin-receptor-research',
        'old_mob':        '— Metabolic',
        'new_mob':        '— Incretin &amp; Receptor Research',
        'old_ft_text':    'Metabolic',
        'new_ft_text':    'Incretin &amp; Receptor Research',
        'old_cc_cat':     'Metabolic',
        'new_cc_cat':     'Incretin &amp; Receptor Research',
        'old_bc_text':    'Metabolic',
        'new_bc_text':    'Incretin &amp; Receptor Research',
        'old_tile_text':  'Metabolic',
        'new_tile_text':  'Incretin &amp; Receptor Research',
        'old_h1':         'Metabolic research peptides',
        'new_h1':         'Incretin &amp; receptor research compounds',
        'old_h2':         'Metabolic research peptides',
        'new_h2':         'Incretin &amp; receptor research compounds',
        'old_sec_in':     'Compounds in metabolic research',
        'new_sec_in':     'Compounds in incretin &amp; receptor research',
        'old_stk_sec':    'Stacks containing metabolic compounds',
        'new_stk_sec':    'Research bundles containing incretin &amp; receptor research compounds',
        'old_faq_head':   'Frequently asked \xe2\x80\x94 metabolic research',
        'new_faq_head':   'Frequently asked \xe2\x80\x94 incretin &amp; receptor research',
        'old_faq_html':   'metabolic research',
        'new_faq_html':   'incretin &amp; receptor research',
        'old_hub_link':   'View metabolic hub',
        'new_hub_link':   'View incretin &amp; receptor research hub',
        'seo_title':      'Incretin &amp; Receptor Research Compounds | GLP-1 GIP | Velox Peptides',
        'seo_desc':       'Research compounds studied across GLP-1, GIP and glucagon receptor pathways. Includes Retatrutide, MOTS-C and NAD+. HPLC-verified, batch tested.',
        'old_jsonld_nm':  'Metabolic Research Peptides',
        'new_jsonld_nm':  'Incretin & Receptor Research Compounds',
        'old_bc_json':    '"name": "Metabolic"',
        'new_bc_json':    '"name": "Incretin & Receptor Research"',
        'old_faq_json':   'metabolic research',
        'new_faq_json':   'incretin & receptor research',
    },
    {
        'old_slug':       'healing-and-repair',
        'new_slug':       'angiogenic-tissue-research',
        'old_url':        '/compounds/healing-and-repair/',
        'new_url':        '/compounds/angiogenic-tissue-research/',
        'old_body':       'page-cat-healing',
        'new_body':       'page-cat-angiogenic',
        'old_cc':         'cc-healing',
        'new_cc':         'cc-angiogenic',
        'old_div':        'cat-divider-healing',
        'new_div':        'cat-divider-angiogenic',
        'old_data_label': 'HEALING &amp; REPAIR',
        'new_data_label': 'ANGIOGENIC &amp; TISSUE RESEARCH',
        'old_sec_id':     'healing-and-repair',
        'new_sec_id':     'angiogenic-tissue-research',
        'old_mob':        '— Healing &amp; Repair',
        'new_mob':        '— Angiogenic &amp; Tissue Research',
        'old_ft_text':    'Healing &amp; Repair',
        'new_ft_text':    'Angiogenic &amp; Tissue Research',
        'old_cc_cat':     'Healing &amp; Repair',
        'new_cc_cat':     'Angiogenic &amp; Tissue Research',
        'old_bc_text':    'Healing &amp; Repair',
        'new_bc_text':    'Angiogenic &amp; Tissue Research',
        'old_tile_text':  'Healing &amp; Repair',
        'new_tile_text':  'Angiogenic &amp; Tissue Research',
        'old_h1':         'Healing &amp; Repair research peptides',
        'new_h1':         'Angiogenic &amp; tissue research compounds',
        'old_h2':         'Healing &amp; Repair research peptides',
        'new_h2':         'Angiogenic &amp; tissue research compounds',
        'old_sec_in':     'Compounds in healing &amp; repair research',
        'new_sec_in':     'Compounds in angiogenic &amp; tissue research',
        'old_stk_sec':    'Stacks containing healing &amp; repair compounds',
        'new_stk_sec':    'Research bundles containing angiogenic &amp; tissue research compounds',
        'old_faq_head':   'Frequently asked \xe2\x80\x94 healing &amp; repair research',
        'new_faq_head':   'Frequently asked \xe2\x80\x94 angiogenic &amp; tissue research',
        'old_faq_html':   'healing &amp; repair research',
        'new_faq_html':   'angiogenic &amp; tissue research',
        'old_hub_link':   'View healing &amp; repair hub',
        'new_hub_link':   'View angiogenic &amp; tissue research hub',
        'seo_title':      'Angiogenic &amp; Tissue Research Compounds | BPC-157 TB-500 | Velox Peptides',
        'seo_desc':       'HPLC-verified research compounds studied for angiogenic and tissue repair mechanisms including BPC-157, TB-500 and KPV. Batch CoA supplied.',
        'old_jsonld_nm':  'Healing & Repair Research Peptides',
        'new_jsonld_nm':  'Angiogenic & Tissue Research Compounds',
        'old_bc_json':    '"name": "Healing and Repair"',
        'new_bc_json':    '"name": "Angiogenic & Tissue Research"',
        'old_faq_json':   'healing and repair research',
        'new_faq_json':   'angiogenic & tissue research',
    },
    {
        'old_slug':       'growth',
        'new_slug':       'somatotropic-research',
        'old_url':        '/compounds/growth/',
        'new_url':        '/compounds/somatotropic-research/',
        'old_body':       'page-cat-growth',
        'new_body':       'page-cat-somatotropic',
        'old_cc':         'cc-growth',
        'new_cc':         'cc-somatotropic',
        'old_div':        'cat-divider-growth',
        'new_div':        'cat-divider-somatotropic',
        'old_data_label': 'GROWTH',
        'new_data_label': 'SOMATOTROPIC RESEARCH',
        'old_sec_id':     'growth',
        'new_sec_id':     'somatotropic-research',
        'old_mob':        '— Growth',
        'new_mob':        '— Somatotropic Research',
        'old_ft_text':    'Growth',
        'new_ft_text':    'Somatotropic Research',
        'old_cc_cat':     'Growth',
        'new_cc_cat':     'Somatotropic Research',
        'old_bc_text':    'Growth',
        'new_bc_text':    'Somatotropic Research',
        'old_tile_text':  'Growth',
        'new_tile_text':  'Somatotropic Research',
        'old_h1':         'Growth research peptides',
        'new_h1':         'Somatotropic research compounds',
        'old_h2':         'Growth research peptides',
        'new_h2':         'Somatotropic research compounds',
        'old_sec_in':     'Compounds in growth research',
        'new_sec_in':     'Compounds in somatotropic research',
        'old_stk_sec':    'Stacks containing growth compounds',
        'new_stk_sec':    'Research bundles containing somatotropic research compounds',
        'old_faq_head':   'Frequently asked \xe2\x80\x94 growth research',
        'new_faq_head':   'Frequently asked \xe2\x80\x94 somatotropic research',
        'old_faq_html':   'growth research',
        'new_faq_html':   'somatotropic research',
        'old_hub_link':   'View growth hub',
        'new_hub_link':   'View somatotropic research hub',
        'seo_title':      'Somatotropic Research Compounds | GH Axis Peptides | Velox Peptides',
        'seo_desc':       'Research compounds studied across the GH axis including Tesamorelin and CJC-1295 WO DAC. HPLC-verified, batch tested, UK dispatch.',
        'old_jsonld_nm':  'Growth Research Peptides',
        'new_jsonld_nm':  'Somatotropic Research Compounds',
        'old_bc_json':    '"name": "Growth"',
        'new_bc_json':    '"name": "Somatotropic Research"',
        'old_faq_json':   'growth research',
        'new_faq_json':   'somatotropic research',
    },
    {
        'old_slug':       'anti-ageing',
        'new_slug':       'oxidative-pathway-research',
        'old_url':        '/compounds/anti-ageing/',
        'new_url':        '/compounds/oxidative-pathway-research/',
        'old_body':       'page-cat-antiageing',
        'new_body':       'page-cat-oxidative',
        'old_cc':         'cc-antiageing',
        'new_cc':         'cc-oxidative',
        'old_div':        'cat-divider-antiageing',
        'new_div':        'cat-divider-oxidative',
        'old_data_label': 'ANTI-AGEING',
        'new_data_label': 'OXIDATIVE PATHWAY RESEARCH',
        'old_sec_id':     'anti-ageing',
        'new_sec_id':     'oxidative-pathway-research',
        'old_mob':        '— Anti-Ageing',
        'new_mob':        '— Oxidative Pathway Research',
        'old_ft_text':    'Anti-Ageing',
        'new_ft_text':    'Oxidative Pathway Research',
        'old_cc_cat':     'Anti-Ageing',
        'new_cc_cat':     'Oxidative Pathway Research',
        'old_bc_text':    'Anti-Ageing',
        'new_bc_text':    'Oxidative Pathway Research',
        'old_tile_text':  'Anti-Ageing',
        'new_tile_text':  'Oxidative Pathway Research',
        'old_h1':         'Anti-Ageing research peptides',
        'new_h1':         'Oxidative pathway research compounds',
        'old_h2':         'Anti-Ageing research peptides',
        'new_h2':         'Oxidative pathway research compounds',
        'old_sec_in':     'Compounds in anti-ageing research',
        'new_sec_in':     'Compounds in oxidative pathway research',
        'old_stk_sec':    'Stacks containing anti-ageing compounds',
        'new_stk_sec':    'Research bundles containing oxidative pathway research compounds',
        'old_faq_head':   'Frequently asked \xe2\x80\x94 anti-ageing research',
        'new_faq_head':   'Frequently asked \xe2\x80\x94 oxidative pathway research',
        'old_faq_html':   'anti-ageing research',
        'new_faq_html':   'oxidative pathway research',
        'old_hub_link':   'View anti-ageing hub',
        'new_hub_link':   'View oxidative pathway research hub',
        'seo_title':      'Oxidative Pathway Research Compounds | GHK-Cu NAD+ | Velox Peptides',
        'seo_desc':       'Research compounds studied for oxidative pathway mechanisms including GHK-Cu, Glutathione and NAD+. HPLC-verified, CoA supplied with every order.',
        'old_jsonld_nm':  'Anti-Ageing Research Peptides',
        'new_jsonld_nm':  'Oxidative Pathway Research Compounds',
        'old_bc_json':    '"name": "Anti-Ageing"',
        'new_bc_json':    '"name": "Oxidative Pathway Research"',
        'old_faq_json':   'anti-ageing research',
        'new_faq_json':   'oxidative pathway research',
    },
]

def repl(html, c):
    h = html

    # URLs
    h = h.replace('href="%s"' % c['old_url'], 'href="%s"' % c['new_url'])

    # Body class
    h = h.replace(c['old_body'], c['new_body'])

    # Article cc- class
    h = h.replace('class="cc %s"' % c['old_cc'], 'class="cc %s"' % c['new_cc'])
    h = h.replace('class="cc %s ' % c['old_cc'], 'class="cc %s ' % c['new_cc'])

    # Mobile menu text
    h = h.replace(c['old_mob'], c['new_mob'])

    # cc-cat div content
    h = h.replace('<div class="cc-cat">%s</div>' % c['old_cc_cat'],
                  '<div class="cc-cat">%s</div>' % c['new_cc_cat'])

    # Cat-divider CSS class
    h = h.replace(c['old_div'], c['new_div'])

    # data-label
    h = h.replace('data-label="%s"' % c['old_data_label'],
                  'data-label="%s"' % c['new_data_label'])

    # cat-group section id
    h = h.replace('class="cat-group" id="%s"' % c['old_sec_id'],
                  'class="cat-group" id="%s"' % c['new_sec_id'])

    # Footer link (now pointing to new_url already)
    h = h.replace('>%s<' % c['old_ft_text'], '>%s<' % c['new_ft_text'])

    # Breadcrumb current
    h = h.replace(
        '<span class="bc-current" aria-current="page">%s</span>' % c['old_bc_text'],
        '<span class="bc-current" aria-current="page">%s</span>' % c['new_bc_text']
    )

    # Category tile h3
    h = h.replace('<h3 class="cat-tile-name">%s</h3>' % c['old_tile_text'],
                  '<h3 class="cat-tile-name">%s</h3>' % c['new_tile_text'])

    # H1 and h2 headings
    h = h.replace('<h1 class="page-h1">%s</h1>' % c['old_h1'],
                  '<h1 class="page-h1">%s</h1>' % c['new_h1'])
    h = h.replace('<h2 class="sec-t">%s</h2>' % c['old_h2'],
                  '<h2 class="sec-t">%s</h2>' % c['new_h2'])

    # Section headings
    h = h.replace(c['old_sec_in'], c['new_sec_in'])
    h = h.replace(c['old_stk_sec'], c['new_stk_sec'])

    # FAQ headings (HTML)
    h = h.replace(c['old_faq_head'], c['new_faq_head'])
    h = h.replace(c['old_faq_html'], c['new_faq_html'])

    # Hub link text
    h = h.replace(c['old_hub_link'], c['new_hub_link'])

    # JSON-LD: CollectionPage name + URL
    h = h.replace('"name": "%s"' % c['old_jsonld_nm'],
                  '"name": "%s"' % c['new_jsonld_nm'])
    h = h.replace('"url": "https://veloxpeps.com%s"' % c['old_url'],
                  '"url": "https://veloxpeps.com%s"' % c['new_url'])

    # JSON-LD: BreadcrumbList item name
    h = h.replace(c['old_bc_json'], c['new_bc_json'])

    # JSON-LD: FAQ text
    h = h.replace(c['old_faq_json'], c['new_faq_json'])

    return h


all_html = glob.glob('%s/**/*.html' % BASE, recursive=True)
print('Total HTML files: %d' % len(all_html))

changed = 0
for path in all_html:
    with open(path, 'r', encoding='utf-8') as f:
        orig = f.read()
    html = orig
    for c in CATS:
        html = repl(html, c)

    # Stacks -> Research Bundles (display only, keep /stacks/ URL)
    html = html.replace('mob-nl-stacks">Stacks</a>', 'mob-nl-stacks">Research Bundles</a>')
    html = html.replace('>Stacks</a>', '>Research Bundles</a>')
    html = html.replace('View all 9 research stacks', 'View all 9 research bundles')
    html = html.replace('research stacks &rarr;', 'research bundles &rarr;')
    html = html.replace('<h3 class="cat-tile-name">Stacks</h3>', '<h3 class="cat-tile-name">Research Bundles</h3>')
    html = html.replace('ft-col-h">Stacks</div>', 'ft-col-h">Research Bundles</div>')  # footer col header if any

    if html != orig:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(html)
        changed += 1

print('Changed: %d/%d' % (changed, len(all_html)))
