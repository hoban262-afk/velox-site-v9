/**
 * POST /api/interest — public "register interest" capture for coming-soon products.
 *
 * Body: { product_slug, email, source? }
 * Stores a deduped row in interest_registrations (service-role). Returns { ok, count }
 * where count = how many researchers have registered for that product (so the widget
 * can show social proof if desired).
 *
 * No auth (public form), but the table itself is locked to service-role — anon can
 * only reach it through this validated endpoint, never directly.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_ORIGIN = 'https://veloxpeps.com';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });

  const b = req.body || {};
  const slug  = String(b.product_slug || '').trim().toLowerCase().slice(0, 80);
  const email = String(b.email || '').trim().toLowerCase().slice(0, 254);
  const source = b.source ? String(b.source).slice(0, 80) : null;

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: 'Invalid product' });
  if (!email || !EMAIL_RE.test(email))      return res.status(400).json({ error: 'Please enter a valid email address.' });

  const headers = {
    apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json',
  };

  try {
    // Insert, ignoring duplicates on (product_slug, email).
    const ins = await fetch(`${SUPABASE_URL}/rest/v1/interest_registrations?on_conflict=product_slug,email`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ product_slug: slug, email, source }),
    });
    if (!ins.ok && ins.status !== 409) {
      console.error('[interest] insert failed', ins.status, (await ins.text()).slice(0, 200));
      return res.status(502).json({ error: 'Could not register interest, please try again.' });
    }

    // Count current registrations for this product (head request with exact count).
    let count = null;
    try {
      const cr = await fetch(`${SUPABASE_URL}/rest/v1/interest_registrations?product_slug=eq.${encodeURIComponent(slug)}&select=id`, {
        headers: { ...headers, Prefer: 'count=exact', Range: '0-0' },
      });
      const cr_range = cr.headers.get('content-range') || '';
      const m = cr_range.match(/\/(\d+)$/);
      if (m) count = Number(m[1]);
    } catch { /* count is best-effort */ }

    return res.status(200).json({ ok: true, count });
  } catch (e) {
    console.error('[interest]', e.message);
    return res.status(500).json({ error: 'Could not register interest, please try again.' });
  }
};
