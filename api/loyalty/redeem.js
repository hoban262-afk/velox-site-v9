/**
 * POST /api/loyalty/redeem  — validate & quote a points redemption at checkout
 *
 * Auth: requires the signed-in user's Supabase access token in the
 *       Authorization: Bearer <token> header.
 * Body: { points: number }
 * Returns: { ok, points, discount, balance } | { error }
 *
 * This does NOT deduct points. The redemption amount is stored on the order
 * (orders.points_redeemed) at checkout; the loyalty trigger deducts it from the
 * balance only when the order is marked paid/dispatched (and restores on cancel).
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANON         = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Loyalty service not configured' });

  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Sign in to redeem points' });

  const pts = parseInt((req.body || {}).points, 10);
  if (!pts || pts < 500)   return res.status(400).json({ error: 'Minimum redemption is 500 points' });
  if (pts % 100 !== 0)     return res.status(400).json({ error: 'Points must be redeemed in multiples of 100' });

  try {
    // Verify the session and resolve the user id
    const ures = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: ANON || SERVICE },
    });
    if (!ures.ok) return res.status(401).json({ error: 'Invalid or expired session' });
    const user = await ures.json();
    if (!user || !user.id) return res.status(401).json({ error: 'Invalid session' });

    // Read the authoritative balance with the service role
    const pres = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=loyalty_points`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }
    );
    const rows = await pres.json();
    const balance = (rows && rows[0] && rows[0].loyalty_points) || 0;

    if (pts > balance) return res.status(400).json({ error: 'Not enough points', balance });

    return res.status(200).json({
      ok: true,
      points: pts,
      discount: Number((pts / 100).toFixed(2)),  // 100 pts = £1
      balance,
    });
  } catch (e) {
    console.error('[loyalty/redeem]', e.message);
    return res.status(500).json({ error: 'Redemption check failed' });
  }
};
