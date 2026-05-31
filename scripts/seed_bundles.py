#!/usr/bin/env python3
"""
Seed generator for bundles + bundle_components (migration 012).

Scrapes each stack page for: bundle slug/name, its current "SAVE X%", and its
components (size from the price pills, slug from the component links). Emits the
INSERT statements. Bundle prices are NOT stored — they auto-compute from live
component prices via public.bundle_price().

Run:  python3 scripts/seed_bundles.py > supabase/seed_bundles.sql
"""
import glob, re, html, sys

def esc(s): return s.replace("'", "''")

bundles = []      # (slug, name, discount_pct, order)
components = []    # (bundle_slug, product_slug, size, qty, order)

for i, f in enumerate(sorted(glob.glob("output/stacks/*/index.html"))):
    s = open(f, encoding="utf-8").read()
    form = re.search(r'<form class="cp-order-form"[^>]*data-compound="([^"]+)"[^>]*data-name="([^"]+)"', s)
    if not form:
        continue
    slug, name = form.group(1), html.unescape(form.group(2))
    m_save = re.search(r'cp-size-badge[^>]*>\s*SAVE\s+([0-9.]+)%', s)
    discount = float(m_save.group(1)) if m_save else 0.0
    bundles.append((slug, name, discount, i))

    # component sizes (in order) from the price pills
    pill_sizes = re.findall(r'csp-pill"><span class="csp-name">[^<]+</span>.*?csp-size">([^<]+)</span>', s, re.DOTALL)
    # component slugs (in order) from the component article links
    comp_slugs = re.findall(r'stack-comp-name"><a href="/compounds/([^/"]+)/"', s)
    for j, (size, cslug) in enumerate(zip(pill_sizes, comp_slugs)):
        components.append((slug, cslug, html.unescape(size).strip(), 1, j))

print("-- Seed bundles + bundle_components from current stack pages (generated).")
print("-- Bundle prices auto-compute from live component base prices; tune the")
print("-- discount_pct per bundle in the admin Pricing tab afterward.")
print("insert into public.bundles (slug, name, discount_pct, sort_order) values")
print(",\n".join("  ('%s', '%s', %.2f, %d)" % (esc(s), esc(n), d, o) for (s, n, d, o) in bundles))
print("on conflict (slug) do update set name = excluded.name, discount_pct = excluded.discount_pct, sort_order = excluded.sort_order;")
print()
print("insert into public.bundle_components (bundle_slug, product_slug, size, qty, sort_order) values")
print(",\n".join("  ('%s', '%s', '%s', %d, %d)" % (esc(b), esc(p), esc(sz), q, o) for (b, p, sz, q, o) in components))
print(";")
print(f"-- {len(bundles)} bundles, {len(components)} components", file=sys.stderr)
