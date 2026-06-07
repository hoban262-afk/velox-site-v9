/**
 * GET/POST /api/agents/content-draft — monthly AI newsletter drafter.
 *
 * Drafts a research-education newsletter edition in the Velox voice, grounded in
 * real catalogue + best-seller data, then runs it through the SAME MHRA
 * compliance gate as the rest of the site (lib/compliance). Only a CLEAN draft is
 * posted to the Approvals inbox for one-tap review; a draft that trips the gate is
 * still surfaced but clearly flagged "withheld — failed compliance", so the gate
 * is provably in the loop before anything marketing-facing reaches you.
 *
 * Nothing is ever auto-sent to your list. Auth matches the other cron workers.
 */
const { askClaude, extractJson, configured } = require('../../lib/llm');
const { scanText } = require('../../lib/compliance');
const { proposeAction } = require('../../lib/agent-actions');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

function authorised(req) {
  const auth = req.headers['authorization'] || '';
  const internal = req.headers['x-internal-secret'] || '';
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (process.env.INTERNAL_TASK_SECRET && internal === process.env.INTERNAL_TASK_SECRET) return true;
  if (!process.env.CRON_SECRET && !process.env.INTERNAL_TASK_SECRET) return false; // fail closed
  return false;
}
async function sbJson(p) { try { const r = await fetch(`${SUPABASE_URL}/rest/v1/${p}`, { headers: sbHeaders }); return r.ok ? await r.json() : []; } catch { return []; } }

const SYSTEM = `You are the email copywriter for Velox Peptides, a UK research-peptides supplier (veloxpeps.com).
Write a short monthly newsletter for the research-customer mailing list.

ABSOLUTE COMPLIANCE RULES — products are sold "for in vitro research use only":
- NEVER give or imply human or animal use, dosing, reconstitution amounts, administration, cycles, or medical/health benefits.
- NEVER claim our products treat, cure, prevent any condition, or are approved by the FDA/MHRA.
- You MAY talk about: third-party HPLC purity / Certificates of Analysis, batch testing, new batch releases, restocks, research-education topics framed academically, UK same/next-day dispatch, and the guides library.
Voice: clear, credible, a little warm; no hype, no emojis. UK English.

Return ONLY a JSON object: {"subject": "...", "preview": "...", "body": "..."}
- subject: < 60 chars, no clickbait.
- preview: one-line preheader.
- body: 120-200 words of plain text (paragraphs separated by blank lines), ending with a soft CTA to browse the shop or guides. No markdown, no HTML.`;

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!configured()) return res.status(200).json({ ok: true, skipped: 'no ANTHROPIC_API_KEY' });

  // Ground the draft in real data.
  const [variants, recentOrders, dealRows] = await Promise.all([
    sbJson('product_variants?select=name,slug&order=sort_order.asc'),
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

  const context = { products, bestSellers, deal, month: new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) };
  const reply = await askClaude(SYSTEM, 'Catalogue + signals (JSON):\n```json\n' + JSON.stringify(context, null, 2) + '\n```\nWrite this month\'s edition.');
  const draft = extractJson(reply);
  if (!draft || !draft.subject || !draft.body) {
    return res.status(200).json({ ok: false, error: 'draft unpar_seable' });
  }

  // The gate: marketing copy must pass MHRA compliance before it can reach the owner ready-to-send.
  const scan = scanText(`${draft.subject} ${draft.preview || ''} ${draft.body}`);
  const compliant = scan.hard.length === 0;

  await proposeAction({
    agent: 'content-draft',
    type: 'content_draft',
    title: compliant
      ? `Newsletter draft ready: "${String(draft.subject).slice(0, 60)}"`
      : `Newsletter draft WITHHELD (failed compliance) — needs redraft`,
    summary: compliant
      ? 'AI-drafted monthly newsletter, compliance-checked. Review and send from Campaigns.'
      : 'AI draft tripped the compliance gate: ' + scan.hard.map((h) => h.label).join(', '),
    payload: { subject: draft.subject, preview: draft.preview || '', body: draft.body, compliant, compliance_issues: scan.hard },
    notify: true,
    notifyTitle: 'Velox newsletter draft',
  });

  return res.status(200).json({ ok: true, compliant, subject: draft.subject });
};
