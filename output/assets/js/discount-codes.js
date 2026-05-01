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
  { code: "VELOX10",   type: "percentage", value: 10, active: true },
  { code: "Anisha15%", type: "percentage", value: 15, active: true }

  // ── Add more codes below in the same format ───────────────────────────────
  // { code: "EXAMPLE", type: "percentage", value: 15, active: true },
];
