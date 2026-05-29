/**
 * GET /api/xero/connect  — start the Xero OAuth flow (ADMIN ONLY)
 *
 * Auth: Authorization: Bearer <admin access token>.
 * Returns: { url } — the admin page redirects the browser to this Xero consent URL.
 * (Returning JSON rather than a 302 lets us keep the admin bearer-token check.)
 */
const x = require('./_client');

module.exports = async function handler(req, res) {
  if (!x.configured()) return res.status(500).json({ error: 'Xero not configured' });
  const admin = await x.requireAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Admin only' });
  try {
    return res.status(200).json({ url: x.authorizeUrl() });
  } catch (e) {
    console.error('[xero/connect]', e.message);
    return res.status(500).json({ error: 'Could not start Xero connection' });
  }
};
