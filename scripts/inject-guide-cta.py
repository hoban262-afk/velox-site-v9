#!/usr/bin/env python3
"""Inject an above-the-fold inline shop CTA into guide articles.

Why: the guide layout puts the product "order card" in a right sidebar that,
on mobile (<=960px), renders *after* the entire article. Mobile organic readers
bounce before ever seeing a buy button. This injects a compact CTA right under
the TL;DR capsule so it's above the fold on phones.

Idempotent: skips any file already carrying `rl-inline-cta`.
Per-guide: mirrors the featured compound the sidebar already chose.
"""
import glob
import os
import re

CATEGORIES = {"recovery", "metabolic", "cognitive", "growth", "antioxidant"}
DEFAULT_PURITY = "&ge;99% HPLC, batch-verified"

def extract(html, pattern, default=""):
    m = re.search(pattern, html)
    return m.group(1).strip() if m else default

def build_cta(name, href, purity):
    href = href or "/compounds/"
    slug = href.rstrip("/").split("/")[-1] if href.startswith("/compounds/") else ""
    is_product = href.startswith("/compounds/") and href != "/compounds/" and slug not in CATEGORIES

    if name:
        headline = f"{name} &mdash; {purity or DEFAULT_PURITY}"
        if is_product:
            primary_label = f"Order {name} &rarr;"
        else:
            primary_label = f"View {name} &rarr;"
    else:
        headline = "Research-grade peptides &mdash; batch-verified"
        primary_label = "Browse research compounds &rarr;"
        href = "/compounds/"

    secondary = ""
    if href != "/compounds/":
        secondary = (
            '\n                <a href="/compounds/" style="display:block;text-align:center;'
            'background:transparent;color:#9CA3AF;font-size:0.8rem;padding:7px 16px;'
            'border:1px solid #232732;border-radius:8px;text-decoration:none;">Browse all compounds</a>'
        )

    return (
        '\n          <!-- Inline shop CTA (auto-injected; sidebar order-card renders below the full article on mobile) -->\n'
        '          <div class="rl-inline-cta" style="margin:18px 0 6px;padding:16px 18px;background:#0a0d12;'
        'border:1px solid #1a1d24;border-left:3px solid #01D3A0;border-radius:10px;">\n'
        '            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:12px 16px;justify-content:space-between;">\n'
        '              <div style="min-width:180px;flex:1;">\n'
        '                <div style="color:#01D3A0;font-size:0.7rem;font-weight:700;letter-spacing:0.08em;'
        'text-transform:uppercase;margin-bottom:4px;">Available to order</div>\n'
        f'                <div style="color:#F3F4F6;font-size:1.02rem;font-weight:600;line-height:1.4;">{headline}</div>\n'
        '                <div style="color:#6B7280;font-size:0.78rem;margin-top:3px;">Research reagent for '
        '<em>in vitro</em> laboratory use only. Not for human or veterinary use.</div>\n'
        '              </div>\n'
        '              <div style="display:flex;flex-direction:column;gap:8px;min-width:150px;">\n'
        f'                <a href="{href}" style="display:block;text-align:center;background:#01D3A0;color:#030407;'
        f'font-weight:700;font-size:0.875rem;padding:10px 18px;border-radius:8px;text-decoration:none;">{primary_label}</a>'
        f'{secondary}\n'
        '              </div>\n'
        '            </div>\n'
        '          </div>\n'
    )

def inject(html, cta):
    # Preferred anchor: right after the rl-lead (TL;DR) capsule closes.
    m = re.search(r'(<div class="rl-lead"[\s\S]*?</div>\s*\n)', html)
    if m:
        idx = m.end()
        return html[:idx] + cta + html[idx:], "after-lead"
    # Fallback: after the *article* header closes (not the site nav <header>).
    m = re.search(r'<article class="rl-article"[\s\S]*?</header>\s*\n', html)
    if m:
        idx = m.end()
        return html[:idx] + cta + html[idx:], "after-article-header"
    return html, None

def main():
    root = os.path.join(os.path.dirname(__file__), "..", "output", "guides")
    files = sorted(glob.glob(os.path.join(root, "*", "index.html")))
    modified, skipped = [], []
    for f in files:
        html = open(f, encoding="utf-8").read()
        base = os.path.basename(os.path.dirname(f))
        if "rl-inline-cta" in html:
            skipped.append((base, "already has CTA")); continue
        if "rl-article" not in html:
            skipped.append((base, "not an article template")); continue
        name = extract(html, r'rl-sb-compound-name">([^<]*)')
        href = extract(html, r'rl-sb-btn" href="([^"]*)"')
        purity = extract(html, r'rl-sb-purity">([^<]*)') or DEFAULT_PURITY
        cta = build_cta(name, href, purity)
        new_html, where = inject(html, cta)
        if where is None:
            skipped.append((base, "no anchor found")); continue
        open(f, "w", encoding="utf-8").write(new_html)
        modified.append((base, where, name or "(generic)", href or "/compounds/"))
    print(f"Modified {len(modified)} guides:")
    for b, w, n, h in modified:
        print(f"  + {b:<48} [{w}] {n} -> {h}")
    print(f"\nSkipped {len(skipped)}:")
    for b, why in skipped:
        print(f"  - {b:<48} {why}")

if __name__ == "__main__":
    main()
