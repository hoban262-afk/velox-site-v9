/**
 * POST /api/presence — live-presence heartbeat (public, no PII).
 * Body: { sid } — anonymous per-browser id (same one used by /api/track).
 * Upserts the device's last_seen into `site_presence` via the service role.
 * Fire-and-forget; powers the admin "live on site" counter.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).end(); return; }
  if (!SUPABASE_URL || !SERVICE) { res.status(204).end(); return; }

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  const sid = String(b.sid || '').replace(/[^a-z0-9]/gi, '').slice(0, 40);
  if (!sid) { res.status(204).end(); return; }

  // Write BEFORE responding — on Vercel, work after res.end() can be frozen and
  // never complete. The client uses sendBeacon, so it doesn't wait on this anyway.
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/site_presence?on_conflict=sid`, {
      method: 'POST',
      headers: {
        apikey: SERVICE, Authorization: `Bearer ${SERVICE}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ sid, last_seen: new Date().toISOString() }),
    });
    if (!r.ok) {
      const t = await r.text().catch(function () { return ''; });
      console.error('[presence] write failed', r.status, t);
    }
  } catch (e) { console.error('[presence]', e.message); }
  res.status(204).end();
};

