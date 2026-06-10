/**
 * GET /api/recovery/restock-offer — in-scheduler restock offer (authenticated)
 *
 * Returns the logged-in user's current restock offer, if any: a compound from a
 * past paid order that's estimated to be ~LEAD_DAYS from running low, plus the
 * bound single-use discount code (the SAME code the email cron would mint, via
 * lib/restock). Used by the Protocol Scheduler to surface a "restock" card.
 *
 * SECURITY: requires the user's Supabase access token (Authorization: Bearer).
 * It verifies the token against Supabase Auth and only ever reads orders for
 * THAT verified email — never anyone else's. No token / not logged in ->
 * { due:false } (quiet, never errors the page).
 *
 * COMPLIANCE: supply-continuity framing only. No dosing/human-use language.
 */

const {
  isDue, depletionTime, restockCodeFor, primaryCompound,
  CODE_PCT, CODE_TTL_DAYS, MAX_AGE_DAYS,
} = require('../../lib/restock');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON         = process.env.SUPABASE_ANON_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ due: false });
  if (!SUPABASE_URL || !SERVICE) return res.status(200).json({ due: false });

  // ── Verify the caller ──────────────────────────────────────────────────────
  const authz = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!authz) return res.status(200).json({ due: false });

  let email = '';
  try {
    const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${authz}`, apikey: ANON || SERVICE },
    });
    if (u.ok) { const j = await u.json(); email = j && j.email ? String(j.email).toLowerCase() : ''; }
  } catch (e) { /* fall through */ }
  if (!email) return res.status(200).json({ due: false });

  // ── That user's recent paid/dispatched orders only ─────────────────────────
  let orders = [];
  try {
    const oldest = new Date(Date.now() - MAX_AGE_DAYS * 864e5).toISOString();
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?customer_email=eq.${encodeURIComponent(email)}` +
      `&status=in.(paid,dispatched)&created_at=gte.${encodeURIComponent(oldest)}` +
      `&select=id,created_at,customer_email,items&order=created_at.desc&limit=50`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }
    );
    orders = r.ok ? await r.json() : [];
  } catch (e) { return res.status(200).json({ due: false }); }

  const now = Date.now();
  const due = orders.filter((o) => isDue(o, now)).sort((a, b) => depletionTime(a) - depletionTime(b));
  if (!due.length) return res.status(200).json({ due: false });

  // If they've already placed a newer order than the due one, they've restocked.
  const offer = due[0];
  const offerT = new Date(offer.created_at).getTime();
  if (orders.some((o) => new Date(o.created_at).getTime() > offerT)) {
    return res.status(200).json({ due: false });
  }

  let code = '';
  try { code = await restockCodeFor(offer); }
  catch (e) { return res.status(200).json({ due: false }); }

  return res.status(200).json({
    due: true,
    compound: primaryCompound(offer.items),
    code: code,
    pct: CODE_PCT,
    expiresInDays: CODE_TTL_DAYS,
  });
};
