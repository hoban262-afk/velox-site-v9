/**
 * Single Gmail endpoint — handles the OAuth lifecycle for server-side support
 * inbox access. Mirrors api/xero/[action].js.
 *   GET /api/gmail/connect   (admin)            → { url } to start Google OAuth
 *   GET /api/gmail/callback  (browser redirect) → stores tokens, 302 to /admin/
 *   GET /api/gmail/status    (admin)            → { configured, connected }
 *
 * Shared logic in /lib/gmail.js (outside /api so Vercel doesn't count it).
 */
const g = require('../../lib/gmail');

function redirect(res, status) {
  res.writeHead(302, { Location: `https://veloxpeps.com/admin/?gmail=${status}` });
  res.end();
}

module.exports = async function handler(req, res) {
  const action = (req.query && req.query.action) || '';

  if (action === 'callback') {
    if (!g.configured()) return redirect(res, 'failed');
    const { code, state, error } = req.query || {};
    if (error) return redirect(res, 'denied');
    if (!code || !g.verifyState(state)) return redirect(res, 'invalid');
    try {
      const tokens = await g.exchangeCode(code);
      if (!tokens.refresh_token) return redirect(res, 'norefresh'); // user didn't grant offline / re-consent
      await g.saveTokens({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_in: tokens.expires_in });
      return redirect(res, 'connected');
    } catch (e) {
      console.error('[gmail/callback]', e.message);
      return redirect(res, 'failed');
    }
  }

  if (action === 'connect') {
    if (!g.configured()) return res.status(500).json({ error: 'Gmail not configured' });
    if (!(await g.requireAdmin(req))) return res.status(403).json({ error: 'Admin only' });
    return res.status(200).json({ url: g.authorizeUrl() });
  }

  if (action === 'status') {
    if (!(await g.requireAdmin(req))) return res.status(403).json({ error: 'Admin only' });
    if (!g.configured()) return res.status(200).json({ configured: false, connected: false });
    return res.status(200).json({ configured: true, connected: await g.connected() });
  }

  return res.status(404).json({ error: 'Unknown action' });
};
