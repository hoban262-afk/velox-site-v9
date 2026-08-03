/**
 * GET/POST /api/agents/social-draft — daily social-media drafter (Opus).
 *
 * Drafts ONE ready-to-publish social post in the Velox voice, grounded in real
 * catalogue + Deal-of-the-Week + best-seller data (hero product: Retatrutide),
 * then runs it through the SAME MHRA compliance gate as the rest of the site
 * (lib/compliance). A CLEAN draft is dropped into the Approvals inbox as a
 * `social_post` card for one-tap review; tapping Approve publishes it across the
 * selected networks via Ayrshare (lib/action-executors → lib/ayrshare). A draft
 * that trips the gate is still surfaced, but flagged and refused at publish time.
 *
 * Nothing is EVER auto-published. Uses Opus (SOCIAL_MODEL) for the copy because it
 * goes public. Auth matches the other cron workers (CRON_SECRET / INTERNAL_TASK_SECRET).
 *
 * Optional body: { platforms?:[...], mediaUrls?:[...] }
 *   platforms defaults to the text-safe set (twitter, facebook, linkedin) — image-
 *   first networks (instagram, pinterest, youtube) need a mediaUrl, so they're only
 *   added automatically when mediaUrls are supplied.
 */
const { askClaude, extractJson, configured, OPUS_MODEL } = require('../../lib/llm');
const { scanText } = require('../../lib/compliance');
const { proposeAction } = require('../../lib/agent-actions');
const { normalisePlatforms } = require('../../lib/ayrshare');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

const TEXT_SAFE = ['twitter', 'facebook', 'linkedin']; // publish fine without media
const IMAGE_FIRST = ['instagram', 'pinterest', 'youtube']; // need a mediaUrl

function authorised(req) {
  const auth = req.headers['authorization'] || '';
  const internal = req.headers['x-internal-secret'] || '';
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (process.env.INTERNAL_TASK_SECRET && internal === process.env.INTERNAL_TASK_SECRET) return true;
  if (!process.env.CRON_SECRET && !process.env.INTERNAL_TASK_SECRET) return false; // fail closed
  return false;
}
async function sbJson(p) { try { const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { headers: sbHeaders }); return r.ok ? await r.json() : []; } catch { return []; } }

const SYSTEM = `You are the social-media copywriter for Velox Peptides, a UK research-peptides supplier (veloxpeps.com).
Write ONE short social post for the day, aimed at a research-education audience.

ABSOLUTE COMPLIANCE RULES — products are sold "for in vitro research use only":
- NEVER give or imply human or animal use, dosing, reconstitution amounts, administration, cycles, before/after, or medical/health/weight-loss benefits to a person.
- NEVER claim our products treat, cure, or prevent any condition, or are approved by the FDA/MHRA.
- You MAY talk about: third-party HPLC purity / Certificates of Analysis, batch testing, new batch releases / restocks, research-education framed academically, UK same/next-day tracked dispatch, worldwide shipping, and the guides library.
Voice: clear, credible, confident, a touch warm. Minimal hype. UK English. At most one tasteful emoji, or none.

The post must read naturally on X/Twitter, Facebook and LinkedIn at once, so keep it <= 270 characters INCLUDING hashtags, and end with the link https://veloxpeps.com. Use 1-3 relevant hashtags max.

Return ONLY a JSON object:
{"post": "...", "angle": "...", "suggested_media": "..."}
- post: the copy (<=270 chars, includes the https://veloxpeps.com link).
- angle: 3-6 word internal label for what this post is about (e.g. "Retatrutide batch COA").
- suggested_media: one short sentence describing an image/video that would suit it (for the human to attach).`;

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!configured()) return res.status(200).json({ ok: true, skipped: 'no ANTHROPIC_API_KEY' });

  const body = req.body || {};

  // Ground the draft in real data (hero product first).
  const [variants, recentOrders, dealRows] = await Promise.all([
    sbJson('product_variants?select=name,slug,size,in_stock&order=sort_order.asc'),
    sbJson(`orders?status=in.(paid,dispatched,delivered)&created_at=gte.${new Date(Date.now() - 30 * 86400000).toISOString()}&select=items`),
    sbJson('deal_of_day?select=slug,discount_pct,headline&active=eq.true&limit=1'),
  ]);
  const products = [...new Set((variants || []).map((v) => v.name).filter(Boolean))].slice(0, 24);
  const tally = {};
  for (const o of (recentOrders || [])) {
    let items = o.items; if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
    for (const it of (Array.isArray(items) ? items : [])) tally[it.name || it.slug] = (tally[it.name || it.slug] || 0) + (it.qty || 1);
  }
  const bestSellers = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n]) => n);
  const deal = (dealRows || [])[0] || null;

  const context = {
    hero_product: 'Retatrutide (our flagship — feature it often, framed as research only)',
    products, bestSellers, deal,
    date: new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  };
  const reply = await askClaude(
    SYSTEM,
    'Catalogue + signals (JSON):\n```json\n' + JSON.stringify(context, null, 2) + '\n```\nWrite today\'s post.',
    900,
    OPUS_MODEL,
  );
  const draft = extractJson(reply);
  if (!draft || !draft.post) {
    return res.status(200).json({ ok: false, error: 'draft unparseable' });
  }

  // The gate: public marketing copy must pass MHRA compliance.
  const scan = scanText(String(draft.post));
  const compliant = scan.hard.length === 0;

  // Decide target networks. Media-less by default → text-safe networks only.
  const mediaUrls = Array.isArray(body.mediaUrls) ? body.mediaUrls.filter(Boolean) : [];
  let platforms = normalisePlatforms(body.platforms);
  if (!platforms.length) platforms = mediaUrls.length ? [...TEXT_SAFE, ...IMAGE_FIRST] : [...TEXT_SAFE];

  const mediaNote = mediaUrls.length
    ? ''
    : `\n\nNote: no image attached, so this will publish to ${TEXT_SAFE.join(', ')} only. Instagram / Pinterest / YouTube need a media URL — re-run with mediaUrls to include them.`;

  await proposeAction({
    agent: 'social-draft',
    type: 'social_post',
    title: compliant
      ? `Social post ready: ${String(draft.angle || draft.post).slice(0, 60)}`
      : `Social post WITHHELD (failed compliance) — needs redraft`,
    summary: compliant
      ? `Publishes to ${platforms.join(', ')} on approve. Suggested image: ${draft.suggested_media || '—'}`
      : 'AI draft tripped the compliance gate: ' + scan.hard.map((h) => h.label).join(', '),
    payload: {
      // Rendered in the inbox (admin.js shows payload.body) + used by the executor.
      body: String(draft.post) + mediaNote,
      post: String(draft.post),
      platforms,
      mediaUrls,
      angle: draft.angle || '',
      suggested_media: draft.suggested_media || '',
      compliant,
      compliance_issues: scan.hard,
    },
    // One post per day: dedupe so re-triggers on the same day don't stack cards.
    dedupeKey: 'social-' + new Date().toISOString().slice(0, 10),
    notify: true,
    notifyTitle: 'Velox social post',
  });

  return res.status(200).json({ ok: true, compliant, platforms, post: draft.post });
};
