/**
 * GET /api/loyalty/balance  — current points + tier for the signed-in user
 *
 * Auth: Authorization: Bearer <user access token>
 * Returns: { loyalty_points, lifetime_points, loyalty_tier, points_to_next_tier }
 *
 * (The account dashboard also reads this directly via supabase-js + RLS; this
 * endpoint exists for parity with the documented API surface.)
 */
const TIERS = [
  { name: 'Bronze',   min: 0 },
  { name: 'Silver',   min: 500 },
  { name: 'Gold',     min: 1500 },
  { name: 'Platinum', min: 5000 },
];

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANON         = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Loyalty service not configured' });

  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  try {
    const ures = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: ANON || SERVICE },
    });
    if (!ures.ok) return res.status(401).json({ error: 'Invalid session' });
    const user = await ures.json();
    if (!user || !user.id) return res.status(401).json({ error: 'Invalid session' });

    const pres = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=loyalty_points,lifetime_points,loyalty_tier`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }
    );
    const rows = await pres.json();
    const p = (rows && rows[0]) || { loyalty_points: 0, lifetime_points: 0, loyalty_tier: 'Bronze' };

    const next = TIERS.find(function (t) { return t.min > p.lifetime_points; });
    return res.status(200).json({
      loyalty_points:  p.loyalty_points,
      lifetime_points: p.lifetime_points,
      loyalty_tier:    p.loyalty_tier,
      points_to_next_tier: next ? (next.min - p.lifetime_points) : 0,
      next_tier: next ? next.name : null,
    });
  } catch (e) {
    console.error('[loyalty/balance]', e.message);
    return res.status(500).json({ error: 'Balance lookup failed' });
  }
};
