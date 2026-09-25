/**
 * lib/force-oos.mjs — single source of truth for variants pulled from sale.
 *
 * The store runs an intentional OVERSELL policy: every catalogued variant stays
 * purchasable even when product_variants.in_stock is false (see the oversell
 * block in scripts/sync-stock.mjs — fulfilment of oversold orders is handled
 * operationally, not by the site). The ONLY exceptions are variants with a
 * genuine supply problem the owner has explicitly pulled from sale.
 *
 * This list is the one place that decides that. It is consumed by:
 *   • scripts/sync-stock.mjs        — bakes the "Out of stock" UI at build time
 *   • api/create-fena-payment.js    — blocks one-off checkout server-side
 *   • api/create-fena-recurring.js  — blocks subscribe/reorder checkout
 *
 * To pull a variant: add slug → [sizes]. To restock: remove it (and flip the
 * JSON-LD offer availability on that product page back to InStock).
 *
 * Keyed by product slug → array of sizes (matched case-insensitively).
 */
export const FORCE_OOS = {
  'bacteriostatic-water': ['10ml'], // supply issue, Sep 2026 (Declan)
};

/** True if this exact slug+size has been explicitly pulled from sale. */
export function isForcedOos(slug, size) {
  const sizes = FORCE_OOS[String(slug || '').toLowerCase()] || [];
  const target = String(size || '').toLowerCase();
  return sizes.some((s) => String(s).toLowerCase() === target);
}
