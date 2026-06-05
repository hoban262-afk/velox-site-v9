#!/usr/bin/env python3
"""
Seed generator for product_variants (migration 011).

Scrapes the CURRENT hardcoded prices out of each product page's buy box and
emits INSERT statements, so the database starts as an exact mirror of what's
live today. base_price = the strikethrough "was" (or the price itself when
there's no deal); sale_price = the current selling price when a deal is shown.

Run:  python3 scripts/seed_product_variants.py > supabase/seed_product_variants.sql
"""
import glob, re, html, sys

def esc(s):
    return s.replace("'", "''")

rows = []
for f in sorted(glob.glob("output/compounds/*/index.html")):
    s = open(f, encoding="utf-8").read()
    form = re.search(r'<form class="cp-order-form"[^>]*data-compound="([^"]+)"[^>]*data-name="([^"]+)"', s)
    if not form:
        continue
    slug, name = form.group(1), html.unescape(form.group(2))
    # Each vial size is a <label class="cp-size-opt"> ... </label> block.
    for i, block in enumerate(re.findall(r'<label class="cp-size-opt">.*?</label>', s, re.DOTALL)):
        m_price = re.search(r'name="size"\s+value="([^"]+)"\s+data-price="([0-9.]+)"', block)
        if not m_price:
            continue
        size = html.unescape(m_price.group(1)).strip()
        cur  = float(m_price.group(2))                       # current selling price
        m_was = re.search(r'cp-size-was">\s*&pound;([0-9.]+)', block)
        was = float(m_was.group(1)) if m_was else None       # strikethrough
        m_badge = re.search(r'cp-size-badge[^>]*>([^<]+)<', block)
        badge = (m_badge.group(1) if m_badge else "")
        is_deal = "DEAL" in badge.upper()                    # only "DEAL ..." = active deal-of-week
        # base_price = normal selling price; sale_price = active deal; compare_at = RRP strikethrough
        if was and was > cur and is_deal:
            base, sale, compare = was, cur, None             # genuine deal: was -> deal price
        elif was and was > cur:
            base, sale, compare = cur, None, was             # standing markdown: price + RRP anchor
        else:
            base, sale, compare = cur, None, None            # plain price
        discountable = "false" if re.search(r'pen', size, re.I) else "true"
        deal_flag = "true" if is_deal else "false"
        rows.append((slug, name, size, base, sale, compare, discountable, deal_flag, i))

print("-- Seed product_variants from current storefront prices (generated).")
print("-- Review base_price values in the admin Pricing tab afterward — especially")
print("-- where an earlier deal changed the strikethrough (e.g. Retatrutide RRP).")
print("insert into public.product_variants")
print("  (slug, name, size, base_price, sale_price, compare_at, discountable, deal_flag, sort_order) values")
vals = []
for (slug, name, size, base, sale, compare, disc, deal, order) in rows:
    sale_sql = "null" if sale is None else f"{sale:.2f}"
    comp_sql = "null" if compare is None else f"{compare:.2f}"
    vals.append(f"  ('{esc(slug)}', '{esc(name)}', '{esc(size)}', {base:.2f}, {sale_sql}, {comp_sql}, {disc}, {deal}, {order})")
print(",\n".join(vals))
print("on conflict (slug, size) do update set")
print("  name = excluded.name, base_price = excluded.base_price, sale_price = excluded.sale_price,")
print("  compare_at = excluded.compare_at, discountable = excluded.discountable,")
print("  deal_flag = excluded.deal_flag, sort_order = excluded.sort_order;")
print(f"-- {len(rows)} variants across {len(set(r[0] for r in rows))} products", file=sys.stderr)
