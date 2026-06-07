/**
 * GET/POST /api/indexnow — submit URLs to IndexNow (Bing/Yandex/etc.).
 *
 * - No body / GET: submits every URL in the live sitemap (full refresh).
 * - POST { "urls": ["https://veloxpeps.com/design-lab/", ...] }: submits just
 *   those URLs (use this to push brand-new/changed pages immediately).
 *
 * Auth matches the other cron workers: CRON_SECRET (Bearer) or
 * INTERNAL_TASK_SECRET (x-internal-secret). Runs on the daily Vercel cron and
 * can also be called on-demand from the admin "run flow" trigger.
 */
const { submitUrls, urlsFromSitemap } = require('../lib/indexnow');
const { recordRun } = require('../lib/worker-log');

function authorised(req) {
  const auth = req.headers['authorization'] || '';
  const internal = req.headers['x-internal-secret'] || '';
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (process.env.INTERNAL_TASK_SECRET && internal === process.env.INTERNAL_TASK_SECRET) return true;
  return false;
}

module.exports = async function handler(req, res) {
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorised' });

  let urls = [];
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (Array.isArray(body.urls) && body.urls.length) {
      urls = body.urls;
    } else {
      urls = await urlsFromSitemap();
    }
  } catch (e) {
    return res.status(400).json({ error: 'bad request', detail: e.message });
  }

  const result = await submitUrls(urls);
  const summary = { submitted: result.submitted, status: result.status, ok: result.ok, source: urls.length && req.method === 'POST' ? 'body' : 'sitemap' };
  await recordRun('indexnow', result.ok, summary);
  console.log('[indexnow] done', JSON.stringify(summary));

  return res.status(result.ok ? 200 : 502).json({ ok: result.ok, ...summary, error: result.error });
};
