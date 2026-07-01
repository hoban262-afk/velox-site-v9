/**
 * discount-codes.js — Velox Peptides discount code configuration
 *
 * HOW TO ADD A NEW CODE:
 *   Copy one of the objects below, paste it in the array, and update the fields.
 *
 * FIELDS:
 *   code   — the string customers type in (matched case-insensitively)
 *   type   — "percentage" = % off the order subtotal | "fixed" = £ off the subtotal
 *   value  — numeric value (10 = 10% off or £10 off)
 *   active — set to false to silently disable without deleting
 *
 * EXAMPLES:
 *   { code: "SUMMER20", type: "percentage", value: 20, active: true }
 *   { code: "FLAT5",    type: "fixed",      value: 5,  active: true }
 *   { code: "OLDCODE",  type: "percentage", value: 15, active: false }  // disabled
 */

var DISCOUNT_CODES = [
  // ── Active codes ──────────────────────────────────────────────────────────
  // (Old promo codes removed. Newsletter welcome codes — VELOX-XXXXXX — are
  //  validated server-side via /api/newsletter/validate, not listed here.)

  // ── Add codes below in the same format ─────────────────────────────────────
  // { code: "EXAMPLE", type: "percentage", value: 15, active: true },
  { code: "JOSIE20", type: "percentage", value: 20, active: true },
  // Public 20%-off promo. Percentage codes apply to the subtotal AFTER volume
  // discounts, so this stacks on top of vial-volume and 10-pack pricing. No
  // usage cap and no per-customer check — anyone can use it, unlimited times.
  { code: "RETA20", type: "percentage", value: 20, active: true },
  // Newsletter subscriber thank-you code (sale week broadcast). Stacks on the
  // catalogue Deal of the Week pricing. Disable (active:false) after the sale.
  { code: "INSIDER10", type: "percentage", value: 10, active: true },
  // NOTE: DESIGN10 (Design Lab first-order code) is intentionally NOT here —
  // it is validated server-side per customer via /api/first-order/validate so it
  // only works on a first order, not as a reusable public code.
];
