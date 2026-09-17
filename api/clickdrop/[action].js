/**
 * Single Royal Mail Click & Drop endpoint — actions via the [action] segment:
 *   GET  /api/clickdrop/status   (admin)             → { configured, connected }
 *   POST /api/clickdrop/push     (admin OR internal) → push one paid order
 *                                                       into Click & Drop
 *
 * One file = one Vercel serverless function. Shared logic lives in
 * /lib/clickdrop.js (outside /api, so it isn't counted as a function).
 */
const cd = require('../../lib/clickdrop');

module.exports = async function handler(req, res) {
  const action = (req.query && req.query.action) || '';

  // ── status: admin-only connectivity summary (never returns the key) ──
  if (action === 'status') {
    if (!(await cd.requireAdmin(req))) return res.status(403).json({ error: 'Admin only' });
    if (!cd.configured()) return res.status(200).json({ configured: false, connected: false });
    try {
      return res.status(200).json(await cd.testConnection());
    } catch (e) {
      return res.status(200).json({ configured: true, connected: false });
    }
  }

  // ── info: admin-only live label status for one/more C&D order identifiers ──
  //   GET /api/clickdrop/info?id=1046   → { ok, status, count, orders:[{ orderIdentifier,
  //     orderReference, printedOn, manifestedOn, shippedOn, trackingNumber, ... }] }
  // Read-only diagnostic so the admin can see whether a label has printed and what
  // tracking number Royal Mail assigned, without waiting on the despatch-sync cron.
  if (action === 'info') {
    if (!(await cd.requireAdmin(req))) return res.status(403).json({ error: 'Admin only' });
    if (!cd.configured()) return res.status(500).json({ error: 'Click & Drop not configured' });
    const raw = (req.query && (req.query.id || req.query.ids)) || (req.body && (req.body.id || req.body.ids)) || '';
    const ids = String(raw).split(',').map((s) => s.trim()).filter(Boolean);
    if (!ids.length) return res.status(400).json({ error: 'Missing id' });
    try {
      return res.status(200).json(await cd.getOrdersInfoDiag(ids));
    } catch (e) {
      return res.status(502).json({ error: 'Lookup failed', detail: e.message });
    }
  }

  // ── push: admin OR trusted internal secret (fena-webhook / cron) ──
  if (action === 'push') {
    if (req.method !== 'POST') return res.status(405).end();
    if (!cd.configured()) return res.status(500).json({ error: 'Click & Drop not configured' });
    const internalSecret = process.env.INTERNAL_TASK_SECRET;
    const provided = req.headers['x-internal-secret'];
    const internalOk = internalSecret && provided && provided === internalSecret;
    if (!internalOk && !(await cd.requireAdmin(req))) return res.status(403).json({ error: 'Admin only' });

    const orderId = (req.body || {}).order_id;
    if (!orderId) return res.status(400).json({ error: 'Missing order_id' });
    try {
      const result = await cd.pushOrderToClickAndDrop(orderId);
      return res.status(result.ok ? 200 : 400).json(result);
    } catch (e) {
      console.error('[clickdrop/push]', e.message);
      return res.status(502).json({ error: 'Click & Drop push failed', detail: e.message });
    }
  }

  return res.status(404).json({ error: 'Unknown action' });
};
