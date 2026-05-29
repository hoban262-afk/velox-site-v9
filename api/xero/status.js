/**
 * GET /api/xero/status  — report Xero connection state (ADMIN ONLY)
 *
 * The integration_tokens table is service-role-only, so the browser can't read
 * it directly — this endpoint checks it server-side and returns a safe summary
 * (never the tokens themselves).
 *
 * Returns: { configured, connected, org? }
 */
const x = require('./_client');

module.exports = async function handler(req, res) {
  const admin = await x.requireAdmin(req);
  if (!admin) return res.status(403).json({ error: 'Admin only' });

  if (!x.configured()) return res.status(200).json({ configured: false, connected: false });

  try {
    // A live token fetch proves the connection works (and refreshes if needed).
    const { accessToken, tenantId } = await x.getValidAccessToken();
    let org = null;
    try {
      const r = await fetch('https://api.xero.com/connections', {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      });
      const conns = await r.json().catch(() => []);
      const match = Array.isArray(conns) ? conns.find((c) => c.tenantId === tenantId) || conns[0] : null;
      org = match && (match.tenantName || null);
    } catch (e) { /* org name is best-effort */ }
    return res.status(200).json({ configured: true, connected: true, org });
  } catch (e) {
    return res.status(200).json({ configured: true, connected: false });
  }
};
