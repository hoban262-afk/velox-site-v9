/**
 * POST /api/track — first-party beacon (public, no PII).
 * Page view:  { sid, path?, ref? }            → inserts one row into `visits`.
 * Funnel event:{ sid, event, path? }          → inserts one row into `events`
 *   (event ∈ add_to_cart | begin_checkout). Kept in a separate table so it does
 *   not inflate page-view/traffic counts. Fire-and-forget.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOWED_EVENTS = new Set(['add_to_cart', 'begin_checkout']);

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
  const event = b.event ? String(b.event).slice(0, 40) : null;

  // Don't make the visitor wait on the DB write.
  res.status(204).end();
  const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  try {
    if (event && ALLOWED_EVENTS.has(event)) {
      await fetch(`${SUPABASE_URL}/rest/v1/events`, {
        method: 'POST', headers: sbHeaders,
        body: JSON.stringify({ sid, event, path }),
      });
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/visits`, {
        method: 'POST', headers: sbHeaders,
        body: JSON.stringify({ sid, path, ref }),
      });
    }
  } catch (e) { /* best-effort */ }
};
