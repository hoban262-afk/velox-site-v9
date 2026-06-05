/**
 * GET/POST /api/admin/insights-run — weekly AI margin digest (cron worker)
 *
 * Aggregates margin metrics (NO customer PII — only product slugs, quantities,
 * money totals), asks Claude for a short business digest (what's going well,
 * risks to watch, suggested improvements), and stores it in margin_insights.
 *
 * Auth: Vercel Cron `Authorization: Bearer $CRON_SECRET`, or
 *       `x-internal-secret: $INTERNAL_TASK_SECRET`, or a signed-in admin token
 *       (so the "Analyse now" button in the admin panel can trigger it).
 *
 * Requires ANTHROPIC_API_KEY in the project env.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON         = process.env.SUPABASE_ANON_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL        = process.env.INSIGHTS_MODEL || 'claude-haiku-4-5-20251001';

// Cost assumptions (mirror the dashboard defaults; override via env if needed)
const POSTAGE  = Number(process.env.MARGIN_POSTAGE  || 3.80);
const PACKAGING = Number(process.env.MARGIN_PACKAGING || 2.50);
const FENA_PCT = Number(process.env.MARGIN_FENA_PCT || 2.5) / 100;

const KNOWN_ADMIN_EMAILS = new Set([
  (process.env.ADMIN_EMAIL || '').toLowerCase(),
  'support@veloxpeps.com', 'veloxpeps@gmail.com',
].filter(Boolean));

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

async function authorised(req) {
  const auth = req.headers['authorization'] || '';
  const internal = req.headers['x-internal-secret'] || '';
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (process.env.INTERNAL_TASK_SECRET && internal === process.env.INTERNAL_TASK_SECRET) return true;
  // admin bearer (manual trigger)
  const token = auth.replace(/^Bearer\s+/i, '');
  if (token && SUPABASE_URL) {
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: ANON || SERVICE || '' } });
      if (r.ok) { const u = await r.json(); if (u && KNOWN_ADMIN_EMAILS.has((u.email || '').toLowerCase())) return true; }
    } catch { /* fall through */ }
  }
  return false;
}

const sb = (path) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });

function feeFor(method, total) {
  return (String(method || '').toLowerCase().indexOf('bank') > -1) ? 0 : total * FENA_PCT;
}

async function buildMetrics() {
  const [oRes, cRes, ovRes] = await Promise.all([
    sb('orders?status=in.(paid,dispatched,delivered)&select=id,created_at,payment_method,total,subtotal,discount,shipping,items&order=created_at.asc'),
    sb('product_costs?select=slug,size,cost_price'),
    sb('business_overheads?active=eq.true&select=name,monthly_cost'),
  ]);
  const orders = oRes.ok ? await oRes.json() : [];
  const costs  = cRes.ok ? await cRes.json() : [];
  const overheads = ovRes.ok ? await ovRes.json() : [];

  const costMap = {};
  costs.forEach((c) => { costMap[`${c.slug}|${c.size || ''}`] = n(c.cost_price); });

  const sku = {};
  let rev = 0, cogs = 0, units = 0, feeT = 0, grossMerch = 0, discT = 0, shipT = 0;
  const months = {};
  const ordList = [];
  for (const o of orders) {
    let items = o.items; if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
    if (!Array.isArray(items)) items = [];
    const total = n(o.total);
    const subtotal = n(o.subtotal);
    const discount = n(o.discount);
    const shipping = n(o.shipping);
    // order-level discount factor (exact, from stored discount): scales list prices
    const f = subtotal > 0 ? Math.max(0, (subtotal - discount) / subtotal) : 1;
    let oc = 0, ou = 0;
    for (const it of items) {
      const slug = it.slug || ''; const size = it.size || '';
      const q = n(it.qty || it.quantity) || 1; const price = n(it.price);
      const cp = costMap[`${slug}|${size}`] || 0;
      oc += q * cp; ou += q;
      const k = `${slug} ${size}`.trim();
      sku[k] = sku[k] || { units: 0, rev: 0, cogs: 0 };
      sku[k].units += q; sku[k].rev += q * price * f; sku[k].cogs += q * cp;
    }
    const fee = feeFor(o.payment_method, total);
    const contrib = total - oc - POSTAGE - PACKAGING - fee;
    rev += total; cogs += oc; units += ou; feeT += fee;
    grossMerch += subtotal;
    discT += discount;
    shipT += shipping;
    const mk = String(o.created_at).slice(0, 7);
    months[mk] = months[mk] || { revenue: 0, contribution: 0, orders: 0 };
    months[mk].revenue += total; months[mk].contribution += contrib; months[mk].orders += 1;
    ordList.push({ date: String(o.created_at).slice(0, 10), method: o.payment_method, revenue: +total.toFixed(2), contribution: +contrib.toFixed(2) });
  }
  const nOrders = orders.length;
  const fixed = nOrders * (POSTAGE + PACKAGING);
  const contribution = rev - cogs - fixed - feeT;
  const ohTotal = overheads.reduce((s, o) => s + n(o.monthly_cost), 0);
  const avgContrib = nOrders ? contribution / nOrders : 0;

  const skuArr = Object.keys(sku).map((k) => ({ product: k, units: sku[k].units, revenue: +sku[k].rev.toFixed(2), cost: +sku[k].cogs.toFixed(2), gross_profit: +(sku[k].rev - sku[k].cogs).toFixed(2), margin_pct: sku[k].rev ? +(100 * (sku[k].rev - sku[k].cogs) / sku[k].rev).toFixed(1) : 0 }))
    .sort((a, b) => b.gross_profit - a.gross_profit);

  return {
    period_through: new Date().toISOString().slice(0, 10),
    totals: {
      orders: nOrders, units,
      gross_merchandise: +grossMerch.toFixed(2),
      discounts_given: +discT.toFixed(2),
      shipping_charged: +shipT.toFixed(2),
      revenue: +rev.toFixed(2), cogs: +cogs.toFixed(2),
      gross_profit: +(rev - cogs).toFixed(2),
      gross_margin_pct: rev ? +(100 * (rev - cogs) / rev).toFixed(1) : 0,
      postage_packaging: +fixed.toFixed(2), payment_fees: +feeT.toFixed(2),
      contribution: +contribution.toFixed(2),
      contribution_margin_pct: rev ? +(100 * contribution / rev).toFixed(1) : 0,
      avg_order_value: nOrders ? +(rev / nOrders).toFixed(2) : 0,
      avg_contribution_per_order: +avgContrib.toFixed(2),
    },
    monthly: months,
    overheads: { monthly_total: +ohTotal.toFixed(2), items: overheads, break_even_orders_per_month: avgContrib > 0 ? Math.ceil(ohTotal / avgContrib) : null },
    products: skuArr,
    orders: ordList,
    assumptions: { postage_per_order: POSTAGE, packaging_per_order: PACKAGING, fena_fee_pct: FENA_PCT * 100 },
  };
}

async function callClaude(metrics) {
  const system = [
    'You are a sharp, practical ecommerce business analyst for Velox Peptides, a small UK direct-to-consumer research-peptide store (sole product = vials shipped via Royal Mail; payment via open banking).',
    'You will receive aggregated margin metrics as JSON. There is NO customer data.',
    'Write a concise weekly digest in GitHub-flavoured markdown with exactly these sections:',
    '## What\'s going well  — 2-4 bullets grounded in the numbers.',
    '## Watch-outs  — 2-4 risks/issues to monitor (margin erosion, fee creep, low-margin or loss-making lines, over-reliance on one product, postage eating small orders, overheads vs volume).',
    '## Do next  — 2-4 specific, actionable suggestions (pricing, bundling, minimum order value, product mix, cost negotiation).',
    'Rules: be specific and quantitative, cite the actual figures. If the order count is very low, say so plainly and keep conclusions tentative. No fluff, no preamble, no medical/health claims. Keep under ~300 words.',
  ].join('\n');

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 900, system, messages: [{ role: 'user', content: 'Here are the latest metrics:\n\n```json\n' + JSON.stringify(metrics, null, 2) + '\n```\n\nWrite the digest.' }] }),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${JSON.stringify(data).slice(0, 200)}`);
  const text = data && data.content && data.content[0] && data.content[0].text;
  if (!text) throw new Error('No content from model');
  return text;
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!(await authorised(req))) return res.status(401).json({ error: 'Unauthorized' });
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  try {
    const metrics = await buildMetrics();
    const content = await callClaude(metrics);
    await fetch(`${SUPABASE_URL}/rest/v1/margin_insights`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ content, metrics, model: MODEL }),
    });
    return res.status(200).json({ ok: true, content });
  } catch (e) {
    console.error('[insights-run]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
