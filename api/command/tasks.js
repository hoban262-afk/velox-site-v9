/**
 * /api/command/tasks — ADMIN ONLY. Unified personal + business to-do list.
 *   GET                 → list (open first, newest first)
 *   POST   {title,kind} → add
 *   PATCH  {id,done?,title?,kind?} → update
 *   DELETE {id}         → remove
 * Service-role; gated on admin auth.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON         = process.env.SUPABASE_ANON_KEY;

const KNOWN_ADMIN_EMAILS = new Set([
  (process.env.ADMIN_EMAIL || '').toLowerCase(),
  'support@veloxpeps.com', 'veloxpeps@gmail.com',
].filter(Boolean));

async function isAdmin(req) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token || !SUPABASE_URL) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: ANON || SERVICE || '' },
    });
    if (!r.ok) return false;
    const u = await r.json();
    return !!u && KNOWN_ADMIN_EMAILS.has((u.email || '').toLowerCase());
  } catch { return false; }
}

const REST = () => `${SUPABASE_URL}/rest/v1/command_tasks`;
const headers = (extra) => ({ apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, ...extra });

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return {};
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (req.method === 'GET') {
      const r = await fetch(`${REST()}?select=*&order=done.asc,created_at.desc&limit=500`, { headers: headers() });
      const rows = r.ok ? await r.json() : [];
      return res.status(200).json({ tasks: rows });
    }

    if (req.method === 'POST') {
      const b = readBody(req);
      const title = (b.title || '').trim();
      if (!title) return res.status(400).json({ error: 'Title required' });
      const kind = b.kind === 'business' ? 'business' : 'personal';
      const r = await fetch(REST(), {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify({ title: title.slice(0, 300), kind, due: b.due || null }),
      });
      const rows = r.ok ? await r.json() : [];
      return res.status(r.ok ? 200 : 500).json({ task: rows[0] || null });
    }

    if (req.method === 'PATCH') {
      const b = readBody(req);
      if (!b.id) return res.status(400).json({ error: 'id required' });
      const patch = {};
      if (typeof b.done === 'boolean') { patch.done = b.done; patch.done_at = b.done ? new Date().toISOString() : null; }
      if (typeof b.title === 'string' && b.title.trim()) patch.title = b.title.trim().slice(0, 300);
      if (b.kind === 'business' || b.kind === 'personal') patch.kind = b.kind;
      if (b.due !== undefined) patch.due = b.due || null;
      if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update' });
      const r = await fetch(`${REST()}?id=eq.${encodeURIComponent(b.id)}`, {
        method: 'PATCH',
        headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify(patch),
      });
      const rows = r.ok ? await r.json() : [];
      return res.status(r.ok ? 200 : 500).json({ task: rows[0] || null });
    }

    if (req.method === 'DELETE') {
      const b = readBody(req);
      const id = b.id || (req.query || {}).id;
      if (!id) return res.status(400).json({ error: 'id required' });
      const r = await fetch(`${REST()}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: headers() });
      return res.status(r.ok ? 200 : 500).json({ ok: r.ok });
    }

    return res.status(405).end();
  } catch (e) {
    return res.status(500).json({ error: 'Tasks request failed' });
  }
};
