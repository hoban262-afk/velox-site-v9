/**
 * Single Xero endpoint — handles four actions via the dynamic [action] segment:
 *   GET  /api/xero/connect         (admin)            → { url } to start OAuth
 *   GET  /api/xero/callback        (browser redirect) → stores tokens, 302 to /admin/
 *   GET  /api/xero/status          (admin)            → { configured, connected, org }
 *   POST /api/xero/create-invoice  (admin or internal)→ create/sync a Xero invoice
 *
 * Consolidated into one file so we add only ONE serverless function (Vercel
 * counts each file in /api). Shared logic lives in /lib/xero.js (outside /api).
 */
const x = require('../../lib/xero');

function redirect(res, status) {
  res.writeHead(302, { Location: `https://veloxpeps.com/admin/?xero=${status}` });
  res.end();
}

module.exports = async function handler(req, res) {
  const action = (req.query && req.query.action) || '';

  // ── callback: browser hits this from Xero; integrity via signed state ──
  if (action === 'callback') {
    if (!x.configured()) return redirect(res, 'failed');
    const { code, state, error } = req.query || {};
    if (error) return redirect(res, 'denied');
    if (!code || !x.verifyState(state)) return redirect(res, 'invalid');
    try {
      const tokens = await x.exchangeCode(code);
      const tenantId = await x.fetchTenantId(tokens.access_token);
      await x.saveTokens({
        access_token: tokens.access_token, refresh_token: tokens.refresh_token,
        expires_in: tokens.expires_in, tenant_id: tenantId,
      });
      return redirect(res, 'connected');
    } catch (e) {
      console.error('[xero/callback]', e.message);
      return redirect(res, 'failed');
    }
  }

  // ── connect: admin-only, returns the consent URL ──
  if (action === 'connect') {
    if (!x.configured()) return res.status(500).json({ error: 'Xero not configured' });
    if (!(await x.requireAdmin(req))) return res.status(403).json({ error: 'Admin only' });
    return res.status(200).json({ url: x.authorizeUrl() });
  }

  // ── status: admin-only connection summary (never returns tokens) ──
  if (action === 'status') {
    if (!(await x.requireAdmin(req))) return res.status(403).json({ error: 'Admin only' });
    if (!x.configured()) return res.status(200).json({ configured: false, connected: false });
    try {
      const { accessToken, tenantId } = await x.getValidAccessToken();
      let org = null;
      try {
        const r = await fetch(`${x.API_BASE}/connections`, {
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        });
        const conns = await r.json().catch(() => []);
        const match = Array.isArray(conns) ? (conns.find((c) => c.tenantId === tenantId) || conns[0]) : null;
        org = match && (match.tenantName || null);
      } catch (e) { /* org name best-effort */ }
      return res.status(200).json({ configured: true, connected: true, org });
    } catch (e) {
      return res.status(200).json({ configured: true, connected: false });
    }
  }

  // ── create-invoice: admin OR trusted internal secret (webhook/cron) ──
  if (action === 'create-invoice') {
    if (req.method !== 'POST') return res.status(405).end();
    if (!x.configured()) return res.status(500).json({ error: 'Xero not configured' });
    const internalSecret = process.env.INTERNAL_TASK_SECRET;
    const provided = req.headers['x-internal-secret'];
    const internalOk = internalSecret && provided && provided === internalSecret;
    if (!internalOk && !(await x.requireAdmin(req))) return res.status(403).json({ error: 'Admin only' });

    const orderId = (req.body || {}).order_id;
    if (!orderId) return res.status(400).json({ error: 'Missing order_id' });
    try {
      const result = await x.syncOrderToXero(orderId);
      return res.status(result.ok ? 200 : 400).json(result);
    } catch (e) {
      console.error('[xero/create-invoice]', e.message);
      return res.status(502).json({ error: 'Xero invoice failed', detail: e.message });
    }
  }

  return res.status(404).json({ error: 'Unknown action' });
};
