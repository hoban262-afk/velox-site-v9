/**
 * POST /api/admin/overheads  — ADMIN ONLY — edit fixed monthly overheads.
 *
 * Body:
 *   { action:'upsert', id?, name, monthly_cost, active?, note? }
 *   { action:'delete', id }
 *
 * Writes to the private business_overheads table (service-role only).
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON         = process.env.SUPABASE_ANON_KEY;

const KNOWN_ADMIN_EMAILS = new Set([
  (process.env.ADMIN_EMAIL || '').toLowerCase(),
  'support@veloxpeps.com',
  'veloxpeps@gmail.com',
].filter(Boolean));

async function isAdmin(req) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token || !SUPABASE_URL) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: ANON || SERVICE || '' },
    });
    if (!r.ok) return false;
    const user = await r.json();
    return !!user && KNOWN_ADMIN_EMAILS.has((user.email || '').toLowerCase());
  } catch { return false; }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'Unauthorized' });

  const b = req.body || {};
  const headers = {
    apikey: SERVICE, Authorization: `Bearer ${SERVICE}`,
    'Content-Type': 'application/json', Prefer: 'return=representation',
  };

  try {
    if (b.action === 'delete') {
      if (!b.id) return res.status(400).json({ error: 'Missing id' });
      const r = await fetch(`${SUPABASE_URL}/rest/v1/business_overheads?id=eq.${encodeURIComponent(b.id)}`, {
        method: 'DELETE', headers,
      });
      if (!r.ok) return res.status(502).json({ error: 'Delete failed' });
      return res.status(200).json({ ok: true });
    }

    if (b.action === 'upsert') {
      const name = String(b.name || '').trim();
      const cost = Number(b.monthly_cost);
      if (!name) return res.status(400).json({ error: 'Missing name' });
      if (!Number.isFinite(cost) || cost < 0) return res.status(400).json({ error: 'Invalid monthly_cost' });
      const row = {
        name,
        monthly_cost: Number(cost.toFixed(2)),
        active: b.active !== false,
        note: b.note != null ? String(b.note) : null,
        updated_at: new Date().toISOString(),
      };
      let r;
      if (b.id) {
        r = await fetch(`${SUPABASE_URL}/rest/v1/business_overheads?id=eq.${encodeURIComponent(b.id)}`, {
          method: 'PATCH', headers, body: JSON.stringify(row),
        });
      } else {
        r = await fetch(`${SUPABASE_URL}/rest/v1/business_overheads`, {
          method: 'POST', headers, body: JSON.stringify(row),
        });
      }
      if (!r.ok) return res.status(502).json({ error: 'Save failed', detail: (await r.text()).slice(0, 200) });
      const data = await r.json().catch(() => null);
      return res.status(200).json({ ok: true, row: Array.isArray(data) ? data[0] : data });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    console.error('[admin/overheads]', e.message);
    return res.status(500).json({ error: 'Overheads update failed' });
  }
};
