/**
 * GET /api/e/o?m=<messageId> — open-tracking pixel.
 * Records an "open" event and returns a 1x1 transparent GIF. Always 200s.
 */
const { recordEvent } = require('../../lib/mail');

// 1x1 transparent GIF
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

module.exports = async function handler(req, res) {
  const m = (req.query && req.query.m) || '';
  if (m) {
    try {
      await recordEvent(String(m), 'open', {
        ua: req.headers['user-agent'] || '',
        ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null,
      });
    } catch {}
  }
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  return res.status(200).send(PIXEL);
};
