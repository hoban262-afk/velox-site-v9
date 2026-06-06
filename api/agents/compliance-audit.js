/**
 * GET/POST /api/agents/compliance-audit — weekly LIVE compliance drift check.
 *
 * Fetches the published product, guide and stack pages from the live sitemap and
 * runs them through lib/compliance.js (the same MHRA research-use rules as the
 * pre-deploy linter). If anything non-compliant has slipped onto the live site
 * (a manual edit, a concurrent change), it posts an Approval card naming the
 * pages. Stays silent when everything's clean — no weekly noise.
 *
 * Auth matches the other cron workers (CRON_SECRET / INTERNAL_TASK_SECRET).
 */
const { scanHtml, pathNeedsDisclaimer } = require('../../lib/compliance');
const { proposeAction } = require('../../lib/agent-actions');

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://veloxpeps.com';
const MAX_PAGES = 40;

function authorised(req) {
  const auth = req.headers['authorization'] || '';
  const internal = req.headers['x-internal-secret'] || '';
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (process.env.INTERNAL_TASK_SECRET && internal === process.env.INTERNAL_TASK_SECRET) return true;
  if (!process.env.CRON_SECRET && !process.env.INTERNAL_TASK_SECRET) return true;
  return false;
}

module.exports = async function handler(req, res) {
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorized' });

  // Pull the sitemap and keep only the risk pages (products / guides / stacks).
  let urls = [];
  try {
    const r = await fetch(`${SITE}/sitemap.xml`);
    const xml = r.ok ? await r.text() : '';
    urls = (xml.match(/<loc>([^<]+)<\/loc>/g) || [])
      .map((l) => l.replace(/<\/?loc>/g, '').trim())
      .filter((u) => /\/(compounds|guides|stacks)\//.test(u))
      .slice(0, MAX_PAGES);
  } catch (e) {
    return res.status(502).json({ error: 'Sitemap fetch failed' });
  }
  if (!urls.length) return res.status(200).json({ ok: true, scanned: 0, note: 'no risk pages in sitemap' });

  const offenders = [];
  for (const u of urls) {
    try {
      const r = await fetch(u);
      if (!r.ok) continue;
      const html = await r.text();
      const path = u.replace(SITE, '') || '/';
      const out = scanHtml(html, { requireDisclaimer: pathNeedsDisclaimer(path) });
      if (out.hard.length || out.missingDisclaimer) {
        offenders.push({
          path,
          issues: out.missingDisclaimer
            ? ['Missing research-use disclaimer', ...out.hard.map((h) => `${h.label}: "${h.match}"`)]
            : out.hard.map((h) => `${h.label}: "${h.match}"`),
        });
      }
    } catch (e) { /* skip a page that failed to fetch */ }
  }

  if (offenders.length) {
    const body = 'Live compliance check found issues on these published pages:\n\n' +
      offenders.map((o) => `• ${o.path}\n   - ${o.issues.join('\n   - ')}`).join('\n\n') +
      '\n\nReview and fix before the MHRA framing is at risk.';
    await proposeAction({
      agent: 'compliance-audit',
      type: 'anomaly',
      title: `Compliance: ${offenders.length} page${offenders.length === 1 ? '' : 's'} need review`,
      summary: offenders.map((o) => o.path).join(', ').slice(0, 200),
      payload: { body, offenders },
      notify: true,
      notifyTitle: 'Velox compliance alert',
    });
  }

  return res.status(200).json({ ok: true, scanned: urls.length, flagged: offenders.length });
};
