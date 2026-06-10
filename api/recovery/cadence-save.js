/**
 * POST /api/recovery/cadence-save — persist a logged-in user's scheduler cadence
 *
 * Called by the Protocol Scheduler when a signed-in user generates a calendar.
 * Stores, per compound, the cycle-end date they entered, so the restock nudge
 * (email + in-scheduler card) can fire ~7 days before THAT date.
 *
 * Body: { rows: [{ name, cycleEnd (ISO) }, ...] }
 * SECURITY: requires the user's Supabase access token; writes are bound to the
 * verified email only. COMPLIANCE: stores the customer's own research register
 * cadence; no dosing/human-use implied.
 */
const { normalizeKey } = require('../../lib/restock');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON         = process.env.SUPABASE_ANON_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  if (!SUPABASE_URL || !SERVICE) return res.status(200).json({ ok: false });

  const authz = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!authz) return res.status(200).json({ ok: false, reason: 'no_auth' });

  let email = '';
  try {
    const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${authz}`, apikey: ANON || SERVICE },
    });
    if (u.ok) { const j = await u.json(); email = j && j.email ? String(j.email).toLowerCase() : ''; }
  } catch (e) { /* fall through */ }
  if (!email) return res.status(200).json({ ok: false, reason: 'unverified' });

  const body = req.body || {};
  const inputRows = Array.isArray(body.rows) ? body.rows : [];
  const nowIso = new Date().toISOString();
  const seen = {};
  const rows = [];
  for (const r of inputRows) {
    const name = (r && r.name ? String(r.name) : '').trim();
    const key  = normalizeKey(name);
    const end  = r && r.cycleEnd ? new Date(r.cycleEnd) : null;
    if (!key || key.length < 3 || !end || isNaN(end.getTime())) continue;
    if (seen[key]) continue; seen[key] = true;
    rows.push({
      email, compound_key: key, compound_name: name.slice(0, 80),
      cycle_end: end.toISOString(),
      nudge_sent_at: null, code: null, updated_at: nowIso,   // new cycle → re-arm the nudge
    });
  }
  if (!rows.length) return res.status(200).json({ ok: true, saved: 0 });

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/research_cadence?on_conflict=email,compound_key`,
      {
        method: 'POST',
        headers: {
          apikey: SERVICE, Authorization: `Bearer ${SERVICE}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(rows),
      }
    );
    if (!r.ok) {
      console.error('[cadence-save] upsert failed', r.status, (await r.text()).slice(0, 200));
      return res.status(200).json({ ok: false });
    }
  } catch (e) {
    console.error('[cadence-save] threw', e.message);
    return res.status(200).json({ ok: false });
  }
  return res.status(200).json({ ok: true, saved: rows.length });
};
