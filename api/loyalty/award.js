/**
 * POST /api/loyalty/award  — award points for a completed order (idempotent)
 *
 * Body: { order_id }
 *
 * NOTE: Awarding normally happens AUTOMATICALLY via the `orders_loyalty`
 * Postgres trigger whenever an order's status becomes paid/dispatched (whether
 * from the admin dashboard or the Fena webhook). This endpoint is a manual /
 * explicit hook that calls the same idempotent server-authoritative function.
 *
 * Safe to call repeatedly: award_order_points() only credits an order once,
 * only when its status is paid/dispatched, and only when it has a user_id.
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Loyalty service not configured' });

  const orderId = (req.body || {}).order_id;
  if (!orderId) return res.status(400).json({ error: 'Missing order_id' });

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/award_order_points`, {
      method: 'POST',
      headers: {
        apikey: SERVICE,
        Authorization: `Bearer ${SERVICE}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_order_id: orderId }),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) return res.status(502).json({ error: 'Award failed', detail: data });
    return res.status(200).json({ ok: true, points_awarded: data });
  } catch (e) {
    console.error('[loyalty/award]', e.message);
    return res.status(500).json({ error: 'Award failed' });
  }
};
