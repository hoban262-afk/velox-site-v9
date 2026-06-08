#!/usr/bin/env python3
"""
DEPRECATED — DO NOT RUN.

This script used to regenerate output/sitemap.xml from a hardcoded URL list.
It is now stale: it omits newer pages (design-lab, the tirzepatide/ipamorelin
guides, the compare + scheduler tools) and still lists the old /*-research/
category slugs that now 301-redirect. Running it would OVERWRITE and regress
the live sitemap.

output/sitemap.xml is now the source of truth and is maintained by hand +
scripts/refresh-sitemap-lastmod.js (which only bumps <lastmod>). Edit that file
directly. To bump freshness after a change:

    node scripts/refresh-sitemap-lastmod.js /design-lab/ /compounds/cognitive/

If you ever want a real generator again, rebuild it to enumerate the actual
published pages (and emit only canonical, 200-status, query-string-free URLs).
"""
import sys

print(__doc__)
print("Refusing to run so the live sitemap isn't clobbered. See output/sitemap.xml.")
sys.exit(1)
