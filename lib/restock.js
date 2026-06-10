/**
 * lib/restock.js — shared restock/reorder model
 *
 * Single source of truth for: when a paid order is estimated to run low, and the
 * bound single-use discount code that goes with it. Used by BOTH the daily email
 * cron (api/recovery/reorder-run.js) and the in-scheduler offer endpoint
 * (api/recovery/restock-offer.js) so timing and codes can never drift.
 *
 * COMPLIANCE: a supply-continuity / research-register model only. The "cycle" is
 * a neutral reorder-cadence estimate, NOT dosing guidance. No human/veterinary
 * use implied anywhere.
 *
 * FRAUD MODEL: depletion is derived from the ACTUAL order (compound + quantity)
 * and the purchase date — never from anything a customer types into the
 * scheduler — so a self-declared cycle can't move the discount. The code is
 * minted from a real paid order and bound to that order's email; single-use and
 * expiring (recovery_codes enforces single-use via used_at).
 */

const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ── Tunable model ────────────────────────────────────────────────────────────
const CYCLE_DAYS_PER_UNIT = 28;                           // neutral monthly default
const CYCLE_OVERRIDES = {};                               // per-slug, e.g. { 'retatrutide': 56 }
const SUPPLY_SLUGS = new Set(['bacteriostatic-water']);   // supplies don't drive a restock
const LEAD_DAYS = 7;                                      // nudge this many days before depletion
const MAX_AGE_DAYS = 150;                                 // never act on very old orders
const CODE_PCT = 20;
const CODE_TTL_DAYS = 14;

const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

function orderCycleDays(items) {
  if (!Array.isArray(items)) return CYCLE_DAYS_PER_UNIT;
  let max = 0;
  items.forEach(function (it) {
    const slug = (it.slug || it.id || '').toString().toLowerCase();
    if (SUPPLY_SLUGS.has(slug)) return;
    const qty = Math.max(1, Number(it.qty || it.quantity || 1) || 1);
    const per = CYCLE_OVERRIDES[slug] || CYCLE_DAYS_PER_UNIT;
    max = Math.max(max, per * qty);
  });
  return max || CYCLE_DAYS_PER_UNIT;
}

function depletionTime(order) {
  return new Date(order.created_at).getTime() + orderCycleDays(order.items) * 864e5;
}

// Within LEAD_DAYS of estimated depletion, and not older than MAX_AGE_DAYS.
function isDue(order, now) {
  const t = (now == null ? Date.now() : now);
  const created = new Date(order.created_at).getTime();
  if (t - created > MAX_AGE_DAYS * 864e5) return false;
  return t >= depletionTime(order) - LEAD_DAYS * 864e5;
}

// Representative compound for copy: the longest-lasting consumable, whose
// depletion drives the nudge.
function primaryCompound(items) {
  if (!Array.isArray(items) || !items.length) return 'your research peptides';
  let best = null, bestDays = -1;
  items.forEach(function (it) {
    const slug = (it.slug || it.id || '').toString().toLowerCase();
    if (SUPPLY_SLUGS.has(slug)) return;
    const qty = Math.max(1, Number(it.qty || it.quantity || 1) || 1);
    const days = (CYCLE_OVERRIDES[slug] || CYCLE_DAYS_PER_UNIT) * qty;
    if (days > bestDays) { bestDays = days; best = it.name || it.title || it.product || null; }
  });
  return best || 'your research peptides';
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no ambiguous 0/O/1/I
function genCode() {
  let out = ''; const b = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[b[i] % CODE_ALPHABET.length];
  return 'VELOX-' + out;
}

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders });
  if (!r.ok) throw new Error(`Supabase GET ${path} -> ${r.status}`);
  return r.json();
}

// Mint (or reuse) the bound, single-use restock code for an order. Reuses
// recovery_codes so it validates at checkout via /api/newsletter/validate with
// no new plumbing. Idempotent per order_id — email and scheduler card always
// show the SAME code.
async function restockCodeFor(order) {
  const oid = encodeURIComponent(String(order.id));
  try {
    const existing = await sbGet(`recovery_codes?order_id=eq.${oid}&select=code&limit=1`);
    if (Array.isArray(existing) && existing.length && existing[0].code) return existing[0].code;
  } catch (e) { /* fall through to mint */ }
  const expires = new Date(Date.now() + CODE_TTL_DAYS * 864e5).toISOString();
  const body = {
    email: String(order.customer_email).toLowerCase(),
    code: genCode(), order_id: String(order.id),
    discount_pct: CODE_PCT, expires_at: expires,
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/recovery_codes`, {
      method: 'POST', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(body),
    });
    if (r.ok) return body.code;
    if (r.status === 409) { body.code = genCode(); continue; }
    throw new Error(`recovery_codes insert -> ${r.status}`);
  }
  throw new Error('recovery_codes insert failed after retry');
}

module.exports = {
  CYCLE_DAYS_PER_UNIT, CYCLE_OVERRIDES, SUPPLY_SLUGS, LEAD_DAYS, MAX_AGE_DAYS, CODE_PCT, CODE_TTL_DAYS,
  orderCycleDays, depletionTime, isDue, primaryCompound, genCode, restockCodeFor,
};
