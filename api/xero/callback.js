/**
 * GET /api/xero/callback?code=...&state=...  — OAuth redirect target.
 *
 * Verifies the signed state (CSRF), exchanges the code for tokens, resolves the
 * organisation (tenant) id, persists everything to the service-role-only
 * integration_tokens table, then bounces back to the admin dashboard.
 *
 * This endpoint is hit by the browser (no bearer header), so it relies on the
 * signed `state` parameter for integrity rather than admin auth.
 */
const x = require('./_client');

function redirect(res, status) {
  res.writeHead(302, { Location: `https://veloxpeps.com/admin/?xero=${status}` });
  res.end();
}

module.exports = async function handler(req, res) {
  if (!x.configured()) return res.status(500).json({ error: 'Xero not configured' });
  const { code, state, error } = req.query || {};
  if (error) return redirect(res, 'denied');
  if (!code || !x.verifyState(state)) return redirect(res, 'invalid');

  try {
    const tokens = await x.exchangeCode(code);
    const tenantId = await x.fetchTenantId(tokens.access_token);
    await x.saveTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      tenant_id: tenantId,
    });
    return redirect(res, 'connected');
  } catch (e) {
    console.error('[xero/callback]', e.message);
    return redirect(res, 'failed');
  }
};
