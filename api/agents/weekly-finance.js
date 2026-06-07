/**
 * GET/POST /api/agents/weekly-finance — weekly reconciliation + VAT set-aside.
 *
 * Once a week it:
 *   • reconciles takings — flags any "paid" open-banking order with no Fena payment
 *     reference (the kind of mismatch you'd want to chase before it's forgotten),
 *   • totals the week's revenue,
 *   • shows quarter-to-date gross sales and an estimated VAT set-aside, so you're
 *     never surprised at quarter end.
 * Posts a "reconciliation" card to the Approvals inbox + a phone push.
 *
 * VAT estimate assumes prices are VAT-inclusive at 20% (VAT = gross ÷ 6). It's a
 * guide for you / your accountant, NOT a filing. Auth matches the other crons.
 */
const { proposeAction } = require('../../lib/agent-actions');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VAT_RATE     = Number(process.env.VAT_RATE || 20) / 100;
const PRICES_INC_VAT = (process.env.XERO_PRICES_INCLUDE_VAT || 'true') !== 'false';
const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

function authorised(req) {
  const auth = req.headers['authorization'] || '';
  const internal = req.headers['x-internal-secret'] || '';
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (process.env.INTERNAL_TASK_SECRET && internal === process.env.INTERNAL_TASK_SECRET) return true;
  if (!process.env.CRON_SECRET && !process.env.INTERNAL_TASK_SECRET) return false; // fail closed
  return false;
}
async function sbJson(path) {
  try { const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders }); return r.ok ? await r.json() : []; }
  catch { return []; }
}
const gbp = (v) => '£' + (Math.round(Number(v || 0) * 100) / 100).toFixed(2);
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorized' });

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const qStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
  const quarterStart = new Date(Date.UTC(now.getUTCFullYear(), qStartMonth, 1));

  const [weekOrders, qtdOrders, flagged] = await Promise.all([
    sbJson(`orders?status=in.(paid,dispatched,delivered)&created_at=gte.${weekAgo.toISOString()}&select=total`),
    sbJson(`orders?status=in.(paid,dispatched,delivered)&created_at=gte.${quarterStart.toISOString()}&select=total`),
    // Paid via open banking but no Fena payment reference recorded → reconcile.
    sbJson(`orders?status=in.(paid,dispatched,delivered)&payment_method=ilike.*open*&fena_payment_id=is.null&created_at=gte.${weekAgo.toISOString()}&select=notes,total,created_at`),
  ]);

  const weekRev = (weekOrders || []).reduce((s, o) => s + n(o.total), 0);
  const qtdRev  = (qtdOrders || []).reduce((s, o) => s + n(o.total), 0);
  const vatSetAside = PRICES_INC_VAT ? (qtdRev * VAT_RATE) / (1 + VAT_RATE) : qtdRev * VAT_RATE;

  const flags = (flagged || []);
  const qName = `Q${Math.floor(qStartMonth / 3) + 1} ${now.getUTCFullYear()}`;

  let reconLine;
  if (!flags.length) {
    reconLine = '✓ Reconciliation clean — every paid order this week has a payment reference.';
  } else {
    const list = flags.slice(0, 8).map((o) => `   – ${o.notes || '(no ref)'} · ${gbp(o.total)}`).join('\n');
    reconLine = `⚠ ${flags.length} paid order${flags.length === 1 ? '' : 's'} this week have no Fena payment reference — worth checking in your Fena dashboard:\n${list}`;
  }

  const body =
`Weekly finance — week to ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}

Revenue (last 7 days): ${gbp(weekRev)} from ${(weekOrders || []).length} orders.

${reconLine}

VAT set-aside (${qName} to date):
   Gross sales: ${gbp(qtdRev)}
   Estimated VAT to set aside: ${gbp(vatSetAside)}
   (Estimate only — assumes VAT-inclusive pricing at ${Math.round(VAT_RATE * 100)}%. Confirm with your accountant; this is not a filing.)`;

  await proposeAction({
    agent: 'weekly-finance',
    type: 'reconciliation',
    title: `Weekly finance — ${gbp(weekRev)} this week${flags.length ? ` · ${flags.length} to reconcile` : ' · reconciled'}`,
    summary: `Week ${gbp(weekRev)}. ${qName} VAT set-aside ~${gbp(vatSetAside)}.`,
    payload: { body, week_revenue: weekRev, qtd_revenue: qtdRev, vat_set_aside: vatSetAside, unreconciled: flags.length },
    notify: true,
    notifyTitle: 'Velox weekly finance',
  });

  return res.status(200).json({ ok: true, weekRev, qtdRev, vatSetAside, unreconciled: flags.length });
};
