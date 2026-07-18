/**
 * lib/restock.js — shared restock model (cadence-driven)
 *
 * Single source of truth for the restock nudge, used by BOTH the daily email
 * cron (api/recovery/reorder-run.js) and the in-scheduler offer endpoint
 * (api/recovery/restock-offer.js) so they can never drift.
 *
 * TIMING comes from the cadence the customer enters in the Protocol Scheduler —
 * the cycle-end date of each compound (persisted in research_cadence). We fire
 * ~LEAD_DAYS before that cycle-end.
 *
 * FRAUD GATE ("order check"): a code is only ever issued for a compound the
 * customer has actually PURCHASED (a paid/dispatched order containing it), and
 * the code is bound to that order's email + that purchase. Single-use, expiring.
 *
 * COMPLIANCE: supply-continuity / research-register framing only. The cadence is
 * the customer's own research register; no dosing or human-use is implied.
 */

const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;

const LEAD_DAYS = 7;                 // nudge this many days before the entered cycle-end
const GRACE_DAYS = 14;               // still offer shortly after cycle-end (they may be late)
const PURCHASE_LOOKBACK_DAYS = 365;  // how far back to look for a matching purchase
const CODE_PCT = 20;
const CODE_TTL_DAYS = 14;

const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

// Normalise a compound name/slug to a stable key for matching + storage.
function normalizeKey(s) {
  return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// A cadence row is "due" from LEAD_DAYS before its cycle-end until GRACE_DAYS after.
function cadenceDue(row, now) {
  const t = (now == null ? Date.now() : now);
  const end = new Date(row.cycle_end).getTime();
  if (isNaN(end)) return false;
  return t >= end - LEAD_DAYS * 864e5 && t <= end + GRACE_DAYS * 864e5;
}

function itemMatchesKey(it, key) {
  if (!key || key.length < 3) return false;
  const a = normalizeKey(it.slug || it.id || '');
  const b = normalizeKey(it.name || it.title || it.product || '');
  return a === key || b === key ||
         (a && (a.includes(key) || key.includes(a))) ||
         (b && (b.includes(key) || key.includes(b)));
}

async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders });
  if (!r.ok) throw new Error(`Supabase GET ${path} -> ${r.status}`);
  return r.json();
}

// THE ORDER CHECK: find a paid/dispatched order for this email that actually
// contains the cadence compound. Returns the most recent such order, or null.
// The discount can only ever exist for something the customer really bought.
async function findPurchaseOrder(email, compoundKey) {
  if (!email || !compoundKey) return null;
  const oldest = new Date(Date.now() - PURCHASE_LOOKBACK_DAYS * 864e5).toISOString();
  let rows = [];
  try {
    rows = await sbGet(
      `orders?customer_email=eq.${encodeURIComponent(String(email).toLowerCase())}` +
      `&status=in.(paid,dispatched)&created_at=gte.${encodeURIComponent(oldest)}` +
      `&select=id,created_at,customer_email,items,reorder_nudged_at&order=created_at.desc&limit=50`
    );
  } catch (e) { return null; }
  if (!Array.isArray(rows)) return null;
  for (const o of rows) {
    if (Array.isArray(o.items) && o.items.some((it) => itemMatchesKey(it, compoundKey))) return o;
  }
  return null;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no ambiguous 0/O/1/I
function genCode() {
  let out = ''; const b = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[b[i] % CODE_ALPHABET.length];
  return 'VELOX-' + out;
}

// Mint (or reuse) the bound single-use restock code for a purchase order. Reuses
// recovery_codes so it validates at checkout via /api/newsletter/validate.
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
  LEAD_DAYS, GRACE_DAYS, PURCHASE_LOOKBACK_DAYS, CODE_PCT, CODE_TTL_DAYS,
  normalizeKey, cadenceDue, findPurchaseOrder, genCode, restockCodeFor,
};
