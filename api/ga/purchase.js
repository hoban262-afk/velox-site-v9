/**
 * POST /api/ga/purchase — INTERNAL ONLY (INTERNAL_TASK_SECRET).
 *
 * Fires a GA4 server-side `purchase` for a paid order. Called by fena-webhook.js
 * when the browser-independent webhook wins the pending→paid race (the customer
 * closed the tab before Fena redirected them back, so confirm-fena-payment never
 * ran to fire the purchase in-process). Loads the full order by id, then hands it
 * to lib/ga-mp. No _ga cookie is available on this server-to-server path, so
 * attribution falls back to (direct); the conversion + revenue still register.
 *
 * Body: { order_id }
 */
const { sendPurchase } = require('../../lib/ga-mp');

const SB_URL     = process.env.SUPABASE_URL;
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const internalSecret = process.env.INTERNAL_TASK_SECRET;
  const provided = req.headers['x-internal-secret'];
  if (!internalSecret || !provided || provided !== internalSecret) {
    return res.status(403).json({ error: 'Internal only' });
  }
  if (!SB_URL || !SB_SERVICE) return res.status(500).json({ error: 'Not configured' });

  const orderId = (req.body || {}).order_id;
  if (!orderId) return res.status(400).json({ error: 'Missing order_id' });

  try {
    const r = await fetch(`${SB_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=*&limit=1`, {
      headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` },
    });
    const rows = r.ok ? await r.json() : [];
    const order = Array.isArray(rows) ? rows[0] : null;
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const result = await sendPurchase(order, {});
    return res.status(result.ok ? 200 : 200).json(result);
  } catch (e) {
    console.error('[ga/purchase]', e && e.message);
    return res.status(500).json({ error: 'purchase_failed' });
  }
};
