/**
 * POST /api/sub-cancel  (auth) { id }
 * Marks the signed-in user's subscription as cancelled in OUR records so the
 * fulfilment cron (sub-fulfil-run) — which only processes status in (active,paid)
 * — stops creating future orders for it.
 *
 * IMPORTANT: this does NOT stop the bank standing order. Fena open-banking
 * recurring payments are authorised in the customer's banking app and can only
 * be cancelled there; we surface that clearly in the UI. This endpoint only
 * tells our side not to send the next order.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON         = process.env.SUPABASE_ANON_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });

  // Resolve the signed-in user from their Supabase token.
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Please sign in.' });
  let user = null;
  try {
    const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: ANON || SERVICE } });
    if (u.ok) user = await u.json();
  } catch { /* */ }
  if (!user || !user.id) return res.status(401).json({ error: 'Please sign in.' });

  const id = String((req.body && req.body.id) || '').trim();
  if (!id) return res.status(400).json({ error: 'Missing subscription id.' });

  const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
  try {
    // Ownership-scoped update: only the user's own subscription can be cancelled.
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(user.id)}`,
      {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=representation' },
        body: JSON.stringify({ status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
      }
    );
    if (!r.ok) return res.status(502).json({ error: 'Could not cancel — please try again.' });
    const rows = await r.json().catch(() => []);
    if (!Array.isArray(rows) || !rows.length) return res.status(404).json({ error: 'Subscription not found.' });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[sub-cancel]', e.message);
    return res.status(502).json({ error: 'Could not cancel — please try again.' });
  }
};
