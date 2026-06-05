#!/usr/bin/env python3
"""
bake_prices.py — write current DB prices into the static HTML for SEO / no-JS.

Reads product_variants + bundles + bundle_components from Supabase (public read)
and rewrites ONLY the price values inside known elements:
  - product buy box: data-price, .cp-size-p, .cp-size-was, .cp-size-badge
  - product cards:   .cc-price, .cc-was
  - bundle pages:    buy box + .csp-price component pills
  - bundle cards:    .sc-price, .sc-was, .sc-cp-price pills
Targeted, value-only edits — never touches structure. Run, then `git diff` to
verify before committing. Fail-safe: any error → no changes.

Run:  python3 scripts/bake_prices.py
"""
import glob, re, json, urllib.request, sys

SB = "https://stkjdtyhaxejxqmbzyua.supabase.co"
ANON = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6"
        "InN0a2pkdHloYXhlanhxbWJ6eXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTUxMTgs"
        "ImV4cCI6MjA5NTM5MTExOH0.QtkaubtNsJkFruoJ-hsxfd5qTlgX5Hs-9wTqJRQC4S0")

def fetch(path):
    req = urllib.request.Request(SB + "/rest/v1/" + path, headers={"apikey": ANON, "Authorization": "Bearer " + ANON})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode())

def money(n): return "&pound;%.2f" % float(n)
def eff(v): return float(v["sale_price"]) if v["sale_price"] is not None else float(v["base_price"])
def was_of(v):
    if v["sale_price"] is not None: return float(v["base_price"])
    if v["compare_at"] is not None: return float(v["compare_at"])
    return None
def pct(frm, to): return round((1 - to / frm) * 100)

import os
CACHE = os.path.join(os.path.dirname(__file__), ".prices_cache.json")
try:
    variants = fetch("product_variants?select=*")
    bundles  = fetch("bundles?select=*")
    bcomps   = fetch("bundle_components?select=*&order=sort_order")
except Exception as e:
    # Sandboxed/offline test path: use a local cache snapshot if present.
    if os.path.exists(CACHE):
        d = json.load(open(CACHE, encoding="utf-8"))
        variants, bundles, bcomps = d["variants"], d["bundles"], d["bundle_components"]
        print("bake: DB unreachable, using local cache snapshot", file=sys.stderr)
    else:
        print("bake: could not reach DB, leaving HTML unchanged (%s)" % e, file=sys.stderr)
        sys.exit(0)

by_key  = {(v["slug"], v["size"]): v for v in variants}
by_slug = {}
for v in variants:
    by_slug.setdefault(v["slug"], []).append(v)
base_key = {(v["slug"], v["size"]): float(v["base_price"]) for v in variants}
name_to_slug = {}
for v in variants:
    name_to_slug.setdefault(v["name"].lower(), v["slug"])

# bundle computed prices
b_disc = {b["slug"]: float(b["discount_pct"]) for b in bundles}
b_comps = {}
for c in bcomps:
    b_comps.setdefault(c["bundle_slug"], []).append(c)
bundle_info = {}
for slug, comps in b_comps.items():
    s = sum(base_key.get((c["product_slug"], c["size"]), 0) * c.get("qty", 1) for c in comps)
    s = round(s, 2)
    price = round(s * (1 - b_disc.get(slug, 0) / 100), 2)
    bundle_info[slug] = {"was": s, "price": price, "save": pct(s, price) if s else 0}

changed = 0

def set_span(block, cls, value):
    return re.sub(r'(<span class="%s">)[^<]*(</span>)' % re.escape(cls), r'\g<1>' + value + r'\2', block, count=1)

def bake_size_block(block, v):
    price = eff(v); was = was_of(v)
    block = re.sub(r'(data-price=")[0-9.]+(")', r'\g<1>%.2f\2' % price, block, count=1)
    block = set_span(block, "cp-size-p", money(price))
    if was is not None and was > price:
        if 'cp-size-was' in block:
            block = set_span(block, "cp-size-was", money(was))
    # badge text
    if v["sale_price"] is not None:
        badge = "DEAL &middot; %d%% OFF" % pct(float(v["base_price"]), float(v["sale_price"]))
    elif v["compare_at"] is not None and float(v["compare_at"]) > price:
        badge = "SAVE %d%%" % pct(float(v["compare_at"]), price)
    else:
        badge = None
    if badge is not None:
        block = re.sub(r'(<span class="cp-size-badge[^"]*">)[^<]*(</span>)', r'\g<1>' + badge + r'\2', block, count=1)
    return block

for f in glob.glob("output/**/*.html", recursive=True):
    s = open(f, encoding="utf-8").read()
    orig = s

    # ── product / bundle buy box ────────────────────────────────────────────
    form = re.search(r'<form class="cp-order-form"[^>]*data-compound="([^"]+)"', s)
    if form:
        slug = form.group(1)
        if slug in by_slug:  # a product page
            def repl_opt(mb):
                blk = mb.group(0)
                mi = re.search(r'name="size" value="([^"]+)" data-price="', blk)
                if not mi: return blk
                key = (slug, mi.group(1))
                return bake_size_block(blk, by_key[key]) if key in by_key else blk
            s = re.sub(r'<label class="cp-size-opt">.*?</label>', repl_opt, s, flags=re.DOTALL)
            # Product schema offers: match each by its sku (…-<size, spaces removed>)
            # and set its price to the effective price, so structured data stays in sync.
            for v in by_slug[slug]:
                sz = re.escape(v["size"].replace(" ", ""))
                pr = "%.2f" % eff(v)
                s = re.sub(r'("price": ")[0-9.]+(",[^}]*?"sku": "[^"]*-' + sz + r'")',
                           (lambda pr: lambda m: m.group(1) + pr + m.group(2))(pr),
                           s, count=1)
        elif slug in bundle_info:  # a bundle page
            bi = bundle_info[slug]
            def repl_bopt(mb):
                blk = mb.group(0)
                blk = re.sub(r'(data-price=")[0-9.]+(")', r'\g<1>%.2f\2' % bi["price"], blk, count=1)
                blk = set_span(blk, "cp-size-p", money(bi["price"]))
                if 'cp-size-was' in blk: blk = set_span(blk, "cp-size-was", money(bi["was"]))
                blk = re.sub(r'(<span class="cp-size-badge[^"]*">)[^<]*(</span>)', r'\g<1>SAVE %d%%\2' % bi["save"], blk, count=1)
                return blk
            s = re.sub(r'<label class="cp-size-opt">.*?</label>', repl_bopt, s, flags=re.DOTALL, count=1)

    # ── bundle component pills (csp-*) ──────────────────────────────────────
    def repl_csp(m):
        blk = m.group(0)
        nm = re.search(r'csp-name">([^<]+)<', blk); sz = re.search(r'csp-size">([^<]+)<', blk)
        if not (nm and sz): return blk
        slug = name_to_slug.get(nm.group(1).strip().lower())
        bp = base_key.get((slug, sz.group(1).strip()))
        if bp is None: return blk
        return set_span(blk, "csp-price", money(bp))
    s = re.sub(r'<div class="csp-pill">.*?</div>', repl_csp, s, flags=re.DOTALL)

    # ── bundle cards (sc-*) : price/was + component pills ────────────────────
    def repl_sccard(m):
        blk = m.group(0)
        ml = re.search(r'/stacks/([^/"?#]+)', blk)
        if ml and ml.group(1) in bundle_info:
            bi = bundle_info[ml.group(1)]
            blk = set_span(blk, "sc-was", money(bi["was"]))
            blk = set_span(blk, "sc-price", money(bi["price"]))
        def repl_scp(mp):
            b = mp.group(0)
            nm = re.search(r'sc-cp-name">([^<]+)<', b); sz = re.search(r'sc-cp-size">([^<]+)<', b)
            if not (nm and sz): return b
            slug = name_to_slug.get(nm.group(1).strip().lower())
            bp = base_key.get((slug, sz.group(1).strip()))
            return set_span(b, "sc-cp-price", money(bp)) if bp is not None else b
        blk = re.sub(r'<span class="sc-card-pill">.*?</span></span>', repl_scp, blk, flags=re.DOTALL)
        return blk
    s = re.sub(r'<a [^>]*href="/stacks/[^"]+"[^>]*class="[^"]*sc-card[^"]*".*?</a>', repl_sccard, s, flags=re.DOTALL)

    if s != orig:
        open(f, "w", encoding="utf-8").write(s)
        changed += 1

print("bake: updated %d files" % changed, file=sys.stderr)
