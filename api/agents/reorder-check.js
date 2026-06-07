/**
 * GET/POST /api/agents/reorder-check — the first Approval-Inbox producer.
 *
 * Scans product_variants for anything flagged low_stock = true and posts a
 * "Reorder needed" approval card per SKU (deduped, so a daily run never spams
 * the same card twice). Approving the card emails the OWNER a ready-to-send
 * purchase-order draft — the owner then places the actual order with the
 * supplier. Nothing here spends money on its own.
 *
 * Auth matches the other cron workers (CRON_SECRET / INTERNAL_TASK_SECRET).
 * Wired in vercel.json to run daily.
 */
const { proposeAction } = require('../../lib/agent-actions');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OWNER_EMAIL  = (process.env.ADMIN_EMAIL || 'veloxpeps@gmail.com').toLowerCase();

function authorised(req) {
  const auth = req.headers['authorization'] || '';
  const internal = req.headers['x-internal-secret'] || '';
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (process.env.INTERNAL_TASK_SECRET && internal === process.env.INTERNAL_TASK_SECRET) return true;
  // Vercel cron also pins a header; allow when no secret is configured (dev).
  if (!process.env.CRON_SECRET && !process.env.INTERNAL_TASK_SECRET) return false; // fail closed
  return false;
}

const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

function pretty(slug, name) {
  if (name) return name;
  return String(slug).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorized' });

  let lows = [];
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/product_variants?select=slug,name,size,stock_qty,low_stock,in_stock&low_stock=eq.true`,
      { headers: sbHeaders }
    );
    lows = r.ok ? await r.json() : [];
  } catch (e) {
    console.error('[reorder-check] fetch failed', e.message);
    return res.status(502).json({ error: 'Fetch failed' });
  }

  let posted = 0, deduped = 0;
  for (const v of lows) {
    const name = pretty(v.slug, v.name);
    const label = `${name} ${v.size || ''}`.trim();
    const stockTxt = (v.stock_qty == null) ? 'low (flagged)' : `${v.stock_qty} units left`;
    const dedupeKey = `reorder:${v.slug}:${v.size || ''}`;

    const body =
`Reorder request — ${label}

Current stock: ${stockTxt}
SKU: ${v.slug} / ${v.size || '-'}

Suggested action: place a restock order with the supplier for ${label}.
This card was raised automatically because the item is flagged low stock.

(You're receiving this because you approved the reorder card in the Velox admin.
No order has been placed — review and order with your supplier as usual.)`;

    const r = await proposeAction({
      agent: 'reorder-check',
      type: 'reorder',
      title: `Reorder needed: ${label} (${stockTxt})`,
      summary: `${label} is flagged low stock. Approve to email yourself a purchase-order draft.`,
      payload: {
        to: OWNER_EMAIL,
        subject: `Reorder draft: ${label}`,
        body,
        slug: v.slug,
        size: v.size || null,
      },
      dedupeKey,
      notify: true,
    });
    if (r && r.deduped) deduped++;
    else if (r && r.ok) posted++;
  }

  return res.status(200).json({ ok: true, scanned: lows.length, posted, deduped });
};
