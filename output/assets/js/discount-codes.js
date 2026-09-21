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
  { code: "CLAIREAYR20", type: "percentage", value: 20, active: true },
  // Newsletter subscriber thank-you code (sale week broadcast). Stacks on the
  // catalogue Deal of the Week pricing. Disable (active:false) after the sale.
  { code: "INSIDER10", type: "percentage", value: 10, active: true },
  { code: "BIG30WEEK", type: "percentage", value: 30, active: true, expires: "2026-10-01T23:59:59+01:00" },
  // Big 30%-off public sale — broadcast to the full subscriber + customer list
  // (Sep 2026) and openly shareable with friends & family. Percentage code
  // applies to the subtotal (after volume pricing), no usage cap, no per-customer
  // check — anyone can use it, unlimited times.
  // Runs to 1 Oct 23:59 so end-of-month payday lands inside the window.
  // SELF-EXPIRING: `expires` switches it off automatically at that deadline
  // (shared with the countdown bar in core.js and the sale popup in
  // newsletter-popup.js) — no deploy needed. Remove the entry when you next
  // tidy this file.
  // NOTE: DESIGN10 (Design Lab first-order code) is intentionally NOT here —
  // it is validated server-side per customer via /api/first-order/validate so it
  // only works on a first order, not as a reusable public code.
];

// ── Auto-expiry ─────────────────────────────────────────────────────────────
// Optional `expires` field (any Date.parse-able string, e.g. an ISO timestamp
// with an explicit offset). Once the moment passes, the code is flipped to
// active:false right here at load time — so every consumer that already tests
// `.active` (assets/js/checkout.js and /checkout/payment/) honours the deadline
// with no changes of their own. A code with no `expires` runs until you disable
// it by hand, exactly as before.
(function () {
  try {
    var now = Date.now();
    for (var i = 0; i < DISCOUNT_CODES.length; i++) {
      var c = DISCOUNT_CODES[i];
      if (!c || !c.expires) continue;
      var t = Date.parse(c.expires);
      if (!isNaN(t) && now >= t) c.active = false;
    }
  } catch (e) { /* never block checkout over promo config */ }
}());
