/**
 * GET /api/e/c?m=<messageId>&u=<signedToken> — click-tracking redirect.
 * Verifies the signed destination (so this can't be abused as an open redirect),
 * records a "click" event, then 302s to the real URL.
 */
const { recordEvent, verifyClickToken, SITE } = require('../../lib/mail');

module.exports = async function handler(req, res) {
  const m = (req.query && req.query.m) || '';
  const u = (req.query && req.query.u) || '';
  const url = verifyClickToken(u);

  if (!url) {
    // Bad/forged token — send them somewhere safe rather than erroring.
    res.writeHead(302, { Location: SITE });
    return res.end();
  }

  if (m) {
    try {
      await recordEvent(String(m), 'click', {
        url,
        ua: req.headers['user-agent'] || '',
        ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null,
      });
    } catch {}
  }

  res.writeHead(302, { Location: url, 'Cache-Control': 'no-store' });
  return res.end();
};
