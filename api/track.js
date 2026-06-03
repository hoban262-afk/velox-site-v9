/**
 * POST /api/track — first-party page-view beacon (public, no PII).
 * Body: { sid, path?, ref? }  — sid is an anonymous per-browser id.
 * Inserts one row into `visits` via the service role. Fire-and-forget.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
  // Same-origin beacon; respond fast regardless.
  if (req.method !== 'POST') { res.status(405).end(); return; }
  if (!SUPABASE_URL || !SERVICE) { res.status(204).end(); return; }

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  const sid = String(b.sid || '').replace(/[^a-z0-9]/gi, '').slice(0, 40);
  if (!sid) { res.status(204).end(); return; }
  const path = b.path ? String(b.path).slice(0, 300) : null;
  const ref  = b.ref ? String(b.ref).slice(0, 300) : null;

  // Don't make the visitor wait on the DB write.
  res.status(204).end();
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/visits`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ sid, path, ref }),
    });
  } catch (e) { /* best-effort */ }
};
