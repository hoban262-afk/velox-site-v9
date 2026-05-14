#!/usr/bin/env python3
"""
Update delivery messaging across all HTML files in the output/ directory.
Changes 48-hour dispatch -> 24-hour dispatch, 2-4 working days -> 1-2 working days, etc.
"""

import os
import re

OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")

# Order matters: more specific patterns first to avoid double-replacing
REPLACEMENTS = [
    # Specific multi-word patterns first
    (
        "within 48 hours of cleared bank transfer payment being received",
        "within 24 hours of payment confirmation",
    ),
    (
        "within 48 hours of cleared bank transfer payment",
        "within 24 hours of payment confirmation",
    ),
    (
        "within 48 hours of payment clearing",
        "within 24 hours of payment confirmation",
    ),
    (
        "within 48 hours (working days)",
        "within 24 hours (working days)",
    ),
    (
        "dispatch your order within 48 hours",
        "dispatch your order within 24 hours",
    ),
    (
        "dispatched within 48 hours",
        "dispatched within 24 hours",
    ),
    (
        "dispatch within 48 hours",
        "dispatch within 24 hours",
    ),
    (
        "dispatch within 48 hrs",
        "dispatch within 24 hrs",
    ),
    (
        "We’ll dispatch within 48 hours.",
        "We’ll dispatch within 24 hours.",
    ),
    (
        "We'll dispatch within 48 hours.",
        "We'll dispatch within 24 hours.",
    ),
    (
        "We&rsquo;ll dispatch within 48 hours.",
        "We&rsquo;ll dispatch within 24 hours.",
    ),
    # General 48-hour dispatch
    (
        "48-hour dispatch",
        "24-hour dispatch",
    ),
    # Working days (en-dash)
    (
        "2–4 working days",
        "1–2 working days",
    ),
    # Working days (hyphen)
    (
        "2-4 working days",
        "1-2 working days",
    ),
    # Working day singular (hyphen)
    (
        "2-4 working day",
        "1-2 working day",
    ),
    # Working days (text)
    (
        "2 to 4 working days",
        "1-2 working days",
    ),
    # Specific shipping page paragraphs
    (
        "<p>Tracked 48 is Royal Mail's 2-4 working day tracked service. Delivery is attempted by your local Royal Mail delivery office; if you are not in, a card is left and the parcel returned to the local office for collection or redelivery.</p>",
        "<p>Royal Mail Tracked 24 is the next-day tracked service. Delivery is attempted by your local Royal Mail delivery office; if you are not in, a card is left and the parcel returned to the local office for collection or redelivery.</p>",
    ),
    (
        "<p>Orders are dispatched within <strong>48 hours of cleared bank transfer payment</strong> (Monday to Friday, excluding UK public holidays).</p>",
        "<p>Orders are dispatched within <strong>24 hours of payment confirmation</strong> (Monday to Friday, excluding UK public holidays).</p>",
    ),
    (
        "<p>Tracked 48 parcels are normally delivered within 2-4 working days of dispatch. If your parcel is not received within 10 working days of the dispatch confirmation email, contact <a href=\"mailto:veloxpeps@gmail.com\">veloxpeps@gmail.com</a> with your order reference and tracking number.</p>",
        "<p>Tracked 24 parcels are normally delivered within 1-2 working days of dispatch. If your parcel is not received within 10 working days of the dispatch confirmation email, contact <a href=\"mailto:veloxpeps@gmail.com\">veloxpeps@gmail.com</a> with your order reference and tracking number.</p>",
    ),
    # FAQ JSON-LD and body text
    (
        "Orders are dispatched within 48 hours of cleared bank transfer payment being received, Monday to Friday. Standard delivery is 2-4 working days via Royal Mail Tracked 24.",
        "Orders are dispatched within 24 hours of payment confirmation, Monday to Friday. Standard delivery is 1-2 working days via Royal Mail Tracked 24.",
    ),
    # Checkout confirmation page
    (
        "<li>Once payment clears, we dispatch your order within 48 hours (working days).</li>",
        "<li>Once payment clears, we dispatch your order within 24 hours (working days).</li>",
    ),
    (
        "<li>Your order arrives within 2–4 working days via Royal Mail Tracked 24.</li>",
        "<li>Your order arrives within 1–2 working days via Royal Mail Tracked 24.</li>",
    ),
    # Payment-complete page
    (
        "<li>We prepare your order and dispatch within 48 hours (working days).</li>",
        "<li>We prepare your order and dispatch within 24 hours (working days).</li>",
    ),
    # Shipping meta description
    (
        "Royal Mail Tracked 24, UK only, 48-hour dispatch from Northern Ireland.",
        "Royal Mail Tracked 24, UK only, 24-hour dispatch from Northern Ireland.",
    ),
]

# Patterns to explicitly NOT replace (safety check)
DO_NOT_REPLACE = [
    "Faster Payments typically clear within 1",
    "Faster Payments typically clear within 2",
    "Royal Mail Tracked 24",
]


def apply_replacements(content):
    changes = []
    for old, new in REPLACEMENTS:
        if old in content:
            count = content.count(old)
            content = content.replace(old, new)
            changes.append((old, new, count))
    return content, changes


def process_files():
    total_files_changed = 0
    total_replacements = 0

    for root, dirs, files in os.walk(OUTPUT_DIR):
        for filename in files:
            if not filename.endswith(".html"):
                continue
            filepath = os.path.join(root, filename)
            with open(filepath, "r", encoding="utf-8") as f:
                original = f.read()

            updated, changes = apply_replacements(original)

            if changes:
                with open(filepath, "w", encoding="utf-8") as f:
                    f.write(updated)
                rel_path = os.path.relpath(filepath, os.path.dirname(OUTPUT_DIR))
                total_files_changed += 1
                print(f"\n[CHANGED] {rel_path}")
                for old, new, count in changes:
                    total_replacements += count
                    old_preview = old[:80].replace("\n", " ")
                    new_preview = new[:80].replace("\n", " ")
                    print(f"  x{count}  '{old_preview}' -> '{new_preview}'")

    print(f"\n{'='*60}")
    print(f"Done. {total_files_changed} file(s) changed, {total_replacements} replacement(s) made.")


if __name__ == "__main__":
    process_files()
