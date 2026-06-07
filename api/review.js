/**
 * POST /api/review — public product-review submission.
 *
 * Body: { product_slug, product_name?, author_name, rating, title?, body }
 * Inserts a row into `reviews` with status='pending' via the service role, so the
 * public site never writes to the table directly (matches how orders, newsletter
 * and interest submit). Reviews appear on the page only after admin approval.
 *
 * No auth (public form). Validated + length-capped here; the table stays
 * service-role-only so anon can only reach it through this endpoint.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

  // Per-IP rate limit (anti-spam). Fails open on any error.
  try {
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.headers['x-real-ip'] || 'unknown';
    const rl = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_key: `review:${ip}`, p_limit: 6, p_window_seconds: 60 }),
    });
    if (rl.ok && (await rl.json().catch(() => true)) === false) {
      return res.status(429).json({ error: 'Too many submissions. Please wait a moment.' });
    }
  } catch (e) { /* non-fatal */ }

  const b = req.body || {};
  const slug   = String(b.product_slug || '').trim().toLowerCase().slice(0, 80);
  const pname  = b.product_name ? String(b.product_name).trim().slice(0, 160) : null;
  const author = String(b.author_name || '').trim().slice(0, 60);
  const title  = b.title ? String(b.title).trim().slice(0, 120) : null;
  const body   = String(b.body || '').trim().slice(0, 1200);
  const rating = parseInt(b.rating, 10);

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: 'Invalid product.' });
  if (!author)                              return res.status(400).json({ error: 'Please add your name.' });
  if (!(rating >= 1 && rating <= 5))        return res.status(400).json({ error: 'Please choose a star rating.' });
  if (body.length < 4)                      return res.status(400).json({ error: 'Please write a short review.' });

  const headers = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

  try {
    const ins = await fetch(`${SUPABASE_URL}/rest/v1/reviews`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        product_slug: slug, product_name: pname, author_name: author,
        rating, title: title || null, body, status: 'pending',
      }),
    });
    if (!ins.ok) {
      console.error('[review] insert failed', ins.status, (await ins.text()).slice(0, 200));
      return res.status(502).json({ error: 'Could not submit your review, please try again.' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[review]', e.message);
    return res.status(500).json({ error: 'Could not submit your review, please try again.' });
  }
};
