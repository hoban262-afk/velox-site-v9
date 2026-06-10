/**
 * GET /api/recovery/restock-offer — in-scheduler restock offer (authenticated)
 *
 * Returns the logged-in user's current restock offer, if any: a compound whose
 * scheduler cycle-end (research_cadence) is ~LEAD_DAYS away AND which they have
 * actually purchased (the order check), plus the bound single-use code (same one
 * the email cron mints). Used by the Protocol Scheduler to show a restock card.
 *
 * SECURITY: requires the user's Supabase access token; only ever reads that
 * verified email's cadence + orders. No token -> { due:false } (quiet).
 * COMPLIANCE: research-register supply-continuity framing only.
 */
const {
  cadenceDue, findPurchaseOrder, restockCodeFor,
  LEAD_DAYS, GRACE_DAYS, CODE_PCT, CODE_TTL_DAYS,
} = require('../../lib/restock');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON         = process.env.SUPABASE_ANON_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ due: false });
  if (!SUPABASE_URL || !SERVICE) return res.status(200).json({ due: false });

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

  const now = Date.now();
  const upper = new Date(now + LEAD_DAYS * 864e5).toISOString();
  const lower = new Date(now - GRACE_DAYS * 864e5).toISOString();

  let cadences = [];
  try {
    cadences = await fetch(
      `${SUPABASE_URL}/rest/v1/research_cadence?email=eq.${encodeURIComponent(email)}` +
      `&cycle_end=lte.${encodeURIComponent(upper)}&cycle_end=gte.${encodeURIComponent(lower)}` +
      `&select=compound_key,compound_name,cycle_end&order=cycle_end.asc&limit=20`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }
    ).then((r) => (r.ok ? r.json() : []));
  } catch (e) { return res.status(200).json({ due: false }); }

  if (!Array.isArray(cadences) || !cadences.length) return res.status(200).json({ due: false });

  // Soonest due cadence that the user has actually purchased.
  for (const row of cadences) {
    if (!cadenceDue(row, now)) continue;
    let order = null;
    try { order = await findPurchaseOrder(email, row.compound_key); } catch (e) { order = null; }
    if (!order) continue;
    let code = '';
    try { code = await restockCodeFor(order); } catch (e) { continue; }
    return res.status(200).json({
      due: true,
      compound: row.compound_name || 'your research stock',
      code: code, pct: CODE_PCT, expiresInDays: CODE_TTL_DAYS,
    });
  }
  return res.status(200).json({ due: false });
};
