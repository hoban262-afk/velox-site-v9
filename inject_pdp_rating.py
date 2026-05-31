#!/usr/bin/env python3
"""
inject_pdp_rating.py — places a star-rating summary directly below the product
image on every Velox product page, and de-dupes the badge row.

The stars are populated at runtime by reviews.js from the SAME approved-review
data used by the bottom reviews section, so they always reflect real ratings:
- with reviews  -> filled stars + average + count
- no reviews    -> grey outline stars + "No reviews yet — be the first"
No ratings are hard-coded. Idempotent (safe to re-run).
"""
import glob, os

ROOT = os.path.join(os.path.dirname(__file__), "output", "compounds")
CATEGORY_INDEXES = {
    "index", "neuropeptide-research", "incretin-receptor-research",
    "angiogenic-tissue-research", "somatotropic-research", "oxidative-pathway-research",
}
MARKER = "cp-rating-summary"

# Anchor = the close of .cp-img-badges + close of .cp-img-col, right before the text column.
ANCHOR = '''    </div>
  </div>

  <div class="cp-hero-main">'''

RATING = '''    </div>
    <a class="cp-rating-summary" id="cp-rating-summary" href="#reviews" aria-label="Read researcher reviews">
      <span class="rv-star">★</span><span class="rv-star">★</span><span class="rv-star">★</span><span class="rv-star">★</span><span class="rv-star">★</span>
      <span class="crs-text">Reviews</span>
    </a>
  </div>

  <div class="cp-hero-main">'''

# De-dupe the badge row (HPLC VERIFIED appears twice on the generated pages).
DUP_BADGE = ('      <span class="cp-badge">HPLC VERIFIED</span>\n'
             '      <span class="cp-badge">HPLC VERIFIED</span>')
FIX_BADGE = ('      <span class="cp-badge">HPLC VERIFIED</span>\n'
             '      <span class="cp-badge">CoA SUPPLIED</span>')

added, badge_fixed, skipped, noanchor = [], [], [], []
for path in sorted(glob.glob(os.path.join(ROOT, "*", "index.html"))):
    slug = os.path.basename(os.path.dirname(path))
    if slug in CATEGORY_INDEXES:
        continue
    html = open(path, encoding="utf-8").read()
    orig = html

    if DUP_BADGE in html:
        html = html.replace(DUP_BADGE, FIX_BADGE, 1)
        badge_fixed.append(slug)

    if MARKER in html:
        skipped.append(slug)
    elif ANCHOR in html:
        html = html.replace(ANCHOR, RATING, 1)
        added.append(slug)
    else:
        noanchor.append(slug)

    if html != orig:
        open(path, "w", encoding="utf-8").write(html)

print("RATING ADDED (%d): %s" % (len(added), ", ".join(added)))
print("BADGE DE-DUPED (%d): %s" % (len(badge_fixed), ", ".join(badge_fixed)))
print("RATING SKIPPED already-present (%d): %s" % (len(skipped), ", ".join(skipped)))
print("NO ANCHOR (%d): %s" % (len(noanchor), ", ".join(noanchor)))
