"""
rewrite_descriptions.py
Rewrites the cp-lede hero paragraph and Research Overview paragraph on every
compound detail page. Plain English, MHRA-compliant. Specs/tables untouched.
"""

import os, re

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'output', 'compounds')

# ---------------------------------------------------------------------------
# REWRITES  {slug: (new_lede, new_overview_p)}
# Only the *first* <p> inside the overview section is replaced.
# ---------------------------------------------------------------------------

REWRITES = {

# ── BPC-157 ──────────────────────────────────────────────────────────────────
'bpc-157': (
  # lede
  'BPC-157 is a short chain of 15 amino acids (the basic building blocks of proteins) made entirely in a laboratory — it does not occur in nature. Studies in rodents have investigated how it interacts with tissue-repair processes, including wound healing, the growth of new blood vessels, and the protection of the stomach lining from experimentally induced damage.',
  # overview
  'BPC-157 is a synthetic peptide — a short chain of 15 amino acids made in a laboratory. It does not occur naturally. Preclinical studies have investigated its role in several tissue-response processes. Rodent studies have looked into its effects on angiogenesis (the growth of new blood vessels into damaged tissue), wound tissue closure, and protecting the stomach and intestinal lining from experimentally induced damage. Research has also examined how it interacts with tendons and ligaments, and how it affects growth signals such as VEGF (a protein that triggers blood vessel growth). For research use only. Not for human or veterinary consumption.'
),

# ── BPC-157 & TB-500 MIX ────────────────────────────────────────────────────
'bpc157-tb500-mix': (
  # lede
  'A single vial containing 10mg of BPC-157 and 10mg of TB-500 — two of the most widely studied tissue-repair peptides in preclinical research. Combining them in one vial means researchers only need to reconstitute (dissolve and prepare) the compound once to work with both together.',
  # overview
  'This vial contains 10mg of BPC-157 and 10mg of TB-500 combined — two widely studied peptides (short chains of amino acids) that appear frequently in tissue-repair research. BPC-157 (Body Protection Compound-157) is a 15-amino-acid synthetic peptide. Rodent studies have looked into its effects on angiogenesis (new blood vessel growth), wound closure, and gut lining protection. TB-500 is a synthetic version of a small part of a protein called Thymosin Beta-4. Preclinical studies have investigated its role in regulating actin (a structural protein that controls how cells move), and how cells migrate to sites of tissue damage. Combining both in one vial simplifies research protocols where both are needed together. Supplied as a single 20mg co-lyophilised (freeze-dried) vial, with 10mg of each compound. For research use only. Not for human or veterinary consumption.'
),

# ── CJC-1295 ────────────────────────────────────────────────────────────────
'cjc-1295': (
  # lede
  'CJC-1295 (without DAC) is a synthetic version of a signal molecule the brain naturally uses to trigger growth hormone release. Without the DAC (Drug Affinity Complex — a chemical attachment that makes some versions last much longer in the body), this compound produces a short, sharp pulse of growth hormone — more like the natural pattern the body uses.',
  # overview
  'CJC-1295 (without DAC) is a synthetic analogue of GHRH (Growth Hormone-Releasing Hormone — the natural signal the brain uses to tell the body to make growth hormone). Without the DAC (Drug Affinity Complex — a chemical attachment that extends the compound\'s lifespan in the body), this version produces a brief, concentrated pulse of growth hormone release rather than a prolonged one. This makes it more similar to the natural pattern of growth hormone secretion. Animal studies have measured how it affects levels of GH (growth hormone) and IGF-1 (a related signalling protein that responds to growth hormone). Researchers often study it alongside another compound called Ipamorelin in growth hormone secretion research. For research use only. Not for human or veterinary consumption.'
),

# ── DIHEXA ──────────────────────────────────────────────────────────────────
'dihexa': (
  # lede
  'Dihexa is a small synthetic peptide (a short chain of amino acids made in a lab) based on a modified version of a naturally occurring compound called angiotensin IV. It has been engineered to resist being broken down too quickly inside biological systems. Preclinical studies have investigated how it interacts with the HGF/c-Met signalling pathway — a communication route in cells linked to how connections between brain cells are formed and strengthened.',
  # overview
  'Dihexa is a small synthetic peptide based on a modified version of angiotensin IV — a naturally occurring compound in the body. It has been engineered to resist enzymatic breakdown, which helps it remain stable for longer in biological environments. Preclinical research has investigated how it interacts with the HGF/c-Met signalling pathway — a communication route between cells associated with the formation and strengthening of synapses (the junctions where brain cells connect and pass signals to each other). Rodent experiments have examined dendritic spine density (the number of tiny branch-like structures on brain cells, which is a physical marker of how well-connected they are) and performance on spatial memory tasks in animal models. Dihexa is among the newer compounds being studied in cognitive neuroscience peptide research. For research use only. Not for human or veterinary consumption.'
),

# ── DSIP ────────────────────────────────────────────────────────────────────
'dsip': (
  # lede
  'DSIP is a short neuropeptide (a type of small protein used for signalling between brain cells) made up of just 9 amino acids. It was first isolated from rabbit blood during deep sleep. Animal studies have investigated how it interacts with the structure of sleep — particularly the deep, slow-wave stages — and how it affects the body\'s stress-response systems.',
  # overview
  'DSIP (Delta Sleep-Inducing Peptide) is a naturally occurring neuropeptide — a small protein that carries signals between brain cells — consisting of just 9 amino acids (the building blocks of proteins). It was first isolated from the blood of rabbits observed during deep sleep states. Animal studies have investigated its effects on sleep architecture, particularly slow-wave and delta sleep stages (the deepest phases of sleep, associated with physical recovery and memory). Research has also looked at how it interacts with the body\'s stress-response axis — the hormonal system that controls how the body reacts to stress. Researchers study DSIP as a naturally occurring signal that may be involved in sleep regulation and hormonal balance. For research use only. Not for human or veterinary consumption.'
),

# ── GHK-Cu ──────────────────────────────────────────────────────────────────
'ghk-cu': (
  # lede
  'GHK-Cu is a tiny naturally occurring molecule made of just three amino acids, found in mammalian blood, where it is bound to a copper atom. In skin cell and animal studies, research has investigated how it affects the genes that produce collagen and elastin — the proteins that give skin and tissue their strength and flexibility.',
  # overview
  'GHK-Cu is a naturally occurring tripeptide (a molecule made of just three amino acids) found in mammalian blood. It naturally carries a copper atom, which is important for how it interacts with cells. In skin cell and animal research models, studies have investigated its effects on the activity of genes responsible for producing collagen and elastin — two structural proteins that give tissue its strength and stretchiness (think of them as the scaffolding and elastic bands inside skin and connective tissue). Research has also examined its antioxidant activity (its ability to neutralise free radicals — damaging molecules that can harm cells) and its role in regulating enzymes involved in tissue remodelling. It is one of the most widely studied copper-peptide compounds in skin and tissue biology research. For research use only. Not for human or veterinary consumption.'
),

# ── GLUTATHIONE ─────────────────────────────────────────────────────────────
'glutathione': (
  # lede
  'Glutathione is a small molecule made of three amino acids, found naturally in almost every cell in the body. It acts as one of the cell\'s main defences against oxidative damage — a process where unstable molecules called free radicals can harm DNA and cell structures. Studies have investigated its role in how cells produce energy and maintain their internal chemical balance.',
  # overview
  'Glutathione is a naturally occurring antioxidant (a molecule that protects cells from damage) made up of three amino acids: glutamate, cysteine, and glycine. It is found in virtually every mammalian cell, where it plays a central role in neutralising free radicals — unstable molecules that can damage DNA, proteins, and cell membranes. It is also essential for mitochondrial function (mitochondria are the parts of a cell that produce energy, often described as the cell\'s power stations) and cellular redox balance (the internal chemical balance that keeps cells functioning correctly). Research in aged animal models has documented measurable declines in glutathione levels over time, and studies have examined whether restoring those levels affects DNA repair activity and markers of oxidative stress. Glutathione is a widely used research reagent in ageing, mitochondrial biology, and cellular protection studies. For research use only. Not for human or veterinary consumption.'
),

# ── MELANOTAN II ────────────────────────────────────────────────────────────
'melanotan-ii': (
  # lede
  'Melanotan II is a synthetic compound based on a naturally occurring hormone called alpha-MSH. It has been studied for its ability to bind to multiple melanocortin receptors (specialised docking points on cells) at the same time. These receptors are involved in several biological processes including skin pigmentation (colour), energy balance, and signalling in the nervous system.',
  # overview
  'Melanotan II is a synthetic analogue — a man-made version with some modifications — of alpha-MSH (alpha-Melanocyte-Stimulating Hormone, a naturally occurring hormone involved in skin pigmentation and other biological processes). It binds to multiple melanocortin receptors simultaneously — MC1R, MC3R, MC4R, and MC5R (specialised docking points found on different types of cells throughout the body). These receptors are involved in several biological processes, including skin colour (pigmentation), energy regulation, and signalling in the nervous system. Animal studies have examined its effects on melanin production pathways (the biological process that creates skin pigment) and on how these receptors signal across different tissue systems. Its ability to interact with multiple receptor types at once makes it a useful research tool for studying how these pathways interconnect. For research use only. Not for human or veterinary consumption.'
),

# ── MOTS-C ──────────────────────────────────────────────────────────────────
'mots-c': (
  # lede
  'Mots-C is a small peptide (16 amino acids long) with an unusual origin: its instructions are encoded in the DNA found inside mitochondria (the parts of a cell that produce energy), not in the cell\'s main DNA. Under metabolic stress, studies have investigated how it travels to the cell\'s nucleus and activates AMPK — an enzyme that acts like a fuel gauge for the cell, sensing how much energy is available and adjusting the cell\'s behaviour.',
  # overview
  'Mots-C is a 16-amino-acid peptide with a unique origin. While most proteins are encoded in the DNA inside the cell nucleus, Mots-C is encoded in the DNA found inside mitochondria — the parts of a cell that convert food into usable energy (often described as the cell\'s power stations). Under conditions of metabolic stress — such as when the cell is low on energy — research suggests that Mots-C travels to the cell\'s nucleus and activates AMPK (AMP-activated protein kinase — an enzyme that acts like a fuel gauge for the cell, detecting how much energy is available and signalling the cell to adjust its behaviour accordingly). Animal studies have examined its influence on glucose metabolism (how the body processes sugar) and on the activity of genes involved in energy management. It is an active subject of research in mitochondrial biology and metabolic pathway studies. For research use only. Not for human or veterinary consumption.'
),

# ── NAD+ ────────────────────────────────────────────────────────────────────
'nad-plus': (
  # lede
  'NAD+ (Nicotinamide Adenine Dinucleotide) is a molecule found in every living cell. It plays a central role in how cells produce energy inside mitochondria (the cell\'s power stations). It is also essential for activating sirtuins — a family of proteins involved in repairing DNA, regulating genes, and helping cells respond to stress.',
  # overview
  'NAD+ (Nicotinamide Adenine Dinucleotide) is a coenzyme — a small helper molecule — found in every living cell. It is essential for mitochondrial energy production (the process inside mitochondria, the cell\'s power stations, that converts nutrients into usable energy). It is also required for the activity of sirtuins — a family of proteins that help regulate genes, repair DNA damage, and support the cell\'s response to stress. Research in aged animal models has documented measurable declines in NAD+ levels over time, and studies have examined whether restoring NAD+ levels in cells influences DNA repair activity and mitochondrial function. NAD+ is one of the most widely used research reagents in studies of cellular metabolism and ageing biology. For research use only. Not for human or veterinary consumption.'
),

# ── RETATRUTIDE ─────────────────────────────────────────────────────────────
'retatrutide': (
  # lede
  'Retatrutide is a synthetic peptide that activates three different metabolic receptors (specialised docking points on cells) at the same time: GLP-1, GIP, and glucagon receptors. Each of these is involved in how the body manages energy, responds to insulin (the hormone that controls blood sugar), and processes fat. By targeting all three at once, it gives researchers a tool for studying how these pathways work together.',
  # overview
  'Retatrutide is a synthetic peptide that simultaneously activates three distinct metabolic receptors: GLP-1 (Glucagon-Like Peptide-1), GIP (Glucose-dependent Insulinotropic Polypeptide), and glucagon receptors. Think of receptors like locks on the surface of a cell — this compound acts as a key that opens all three at once. Each receptor is involved in a different aspect of metabolic regulation: GLP-1 receptors are linked to insulin release and appetite signalling, GIP receptors to insulin response and fat storage, and glucagon receptors to blood sugar regulation and fat breakdown. Because it can activate all three pathways simultaneously, it gives researchers a tool for studying how these systems interact — something single-receptor compounds cannot replicate. It is among the most actively investigated next-generation metabolic research peptides. For research use only. Not for human or veterinary consumption.'
),

# ── SELANK ──────────────────────────────────────────────────────────────────
'selank': (
  # lede
  'Selank is a synthetic peptide made up of 7 amino acids, based on a fragment of tuftsin — a small protein naturally involved in immune function. In rodent studies, researchers have observed calmer animal behaviour without the sedation (drowsiness) typically seen with classical anxiety-reducing compounds, making it a distinctive tool for studying stress and anxiety pathways in the brain.',
  # overview
  'Selank is a synthetic 7-amino-acid peptide — a short chain of amino acids made in a laboratory — based on a fragment of tuftsin, a naturally occurring protein involved in immune function. In rodent studies, researchers have documented calmer behaviour in treated animals without the sedation (drowsiness or reduced activity) typically associated with classical anxiolytic compounds (substances studied for their effects on anxiety). This profile makes Selank a distinctive research tool for studying stress and anxiety pathways. Studies have also examined its effects on BDNF (Brain-Derived Neurotrophic Factor — a protein that supports brain cell survival, growth, and connectivity) levels in neuronal tissue, alongside its interactions with the GABAergic system (the brain\'s main calming signalling network) and serotonergic pathways (the brain\'s serotonin signalling system). For research use only. Not for human or veterinary consumption.'
),

# ── SEMAX ───────────────────────────────────────────────────────────────────
'semax': (
  # lede
  'Semax is a synthetic peptide made up of 7 amino acids, based on a fragment of ACTH (Adrenocorticotropic Hormone — a naturally occurring stress hormone). A short chemical tail has been added to make it more stable and longer-lasting inside biological systems. Preclinical studies have investigated its effects on BDNF (Brain-Derived Neurotrophic Factor — a protein that supports brain cell growth and survival) levels in neuronal tissue.',
  # overview
  'Semax is a synthetic 7-amino-acid peptide based on a segment of ACTH (Adrenocorticotropic Hormone — a hormone the body naturally produces in response to stress). A stabilising chemical tail (Pro-Gly-Pro) has been added to the molecule to slow its breakdown and extend how long it remains active in biological systems. Preclinical studies have measured increased BDNF (Brain-Derived Neurotrophic Factor — a protein that supports brain cell growth, survival, and the formation of new connections between cells) expression in neuronal tissue. Research has also examined potential neuroprotective effects (the ability to protect nerve cells from damage) in animal models of experimentally induced brain ischaemia (a state where brain tissue is temporarily deprived of blood flow). Semax has been widely studied in neuroscience research, particularly in Eastern European scientific institutions. For research use only. Not for human or veterinary consumption.'
),

# ── TB-500 ──────────────────────────────────────────────────────────────────
'tb-500': (
  # lede
  'TB-500 is a synthetic version of Thymosin Beta-4, a protein found naturally in mammalian tissue. Preclinical studies have investigated how it interacts with actin — a structural protein that controls how cells move and organise themselves, particularly during tissue repair.',
  # overview
  'TB-500 is a synthetic version of Thymosin Beta-4 — a protein found naturally in mammalian tissue. Preclinical studies have investigated its role in regulating actin — a structural protein that works a bit like scaffolding inside cells, controlling how they move, divide, and organise themselves during repair. Animal studies have examined its effects on connective tissue response (how the body\'s supporting tissues react to damage), the migration of repair cells to injury sites, and cardiac tissue (heart muscle) following experimentally induced damage. For research use only. Not for human or veterinary consumption.'
),

# ── TESAMORELIN ─────────────────────────────────────────────────────────────
'tesamorelin': (
  # lede
  'Tesamorelin is a synthetic version of GHRH (Growth Hormone-Releasing Hormone — the signal the brain uses to trigger growth hormone production). Structural modifications have been added to slow how quickly it breaks down in the body, giving it a longer active window. Research has investigated its effects on GH (growth hormone) and IGF-1 (a related signalling protein) levels, and studies have examined its influence on fat distribution around the abdominal area in animal models.',
  # overview
  'Tesamorelin is a synthetic analogue — a man-made version with structural modifications — of GHRH (Growth Hormone-Releasing Hormone, the natural signal the brain uses to tell the body to produce growth hormone). The modifications slow its enzymatic breakdown, meaning it remains active in biological systems for longer than the natural version. Research has investigated its effects on GH (growth hormone) and IGF-1 (Insulin-Like Growth Factor 1 — a signalling protein that responds to growth hormone and is involved in cell growth and metabolism) levels. Studies have also examined its effects on visceral fat distribution — how fat is stored around the internal organs in the abdominal area. It is one of the most extensively studied GHRH analogues available in preclinical research. For research use only. Not for human or veterinary consumption.'
),

}  # end REWRITES

# ---------------------------------------------------------------------------
# Apply rewrites
# ---------------------------------------------------------------------------

changed = 0
for slug, (new_lede, new_overview) in REWRITES.items():
    fp = os.path.join(BASE, slug, 'index.html')
    if not os.path.exists(fp):
        print(f'  SKIP (not found): {slug}')
        continue

    with open(fp, encoding='utf-8') as f:
        txt = f.read()

    orig = txt

    # 1. Replace cp-lede paragraph content
    txt = re.sub(
        r'(<p class="cp-lede">).*?(</p>)',
        lambda m: m.group(1) + new_lede + m.group(2),
        txt,
        count=1,
        flags=re.DOTALL
    )

    # 2. Replace the first <p> inside the overview section
    #    The overview section starts with id="overview"; the first <p> is the body text.
    #    We stop before the cp-source-note paragraph.
    txt = re.sub(
        r'(id="overview">\s*<h2[^>]*>.*?</h2>\s*)<p>(.*?)</p>',
        lambda m: m.group(1) + '<p>' + new_overview + '</p>',
        txt,
        count=1,
        flags=re.DOTALL
    )

    if txt != orig:
        with open(fp, 'w', encoding='utf-8') as f:
            f.write(txt)
        print(f'  Updated: {slug}')
        changed += 1
    else:
        print(f'  No change: {slug}')

print(f'\nDone. {changed}/{len(REWRITES)} pages updated.')
