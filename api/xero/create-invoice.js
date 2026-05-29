/**
 * Create a Xero sales invoice (ACCREC) for a paid order.
 *
 * Two entry points:
 *   • HTTP:  POST /api/xero/create-invoice  { order_id }   (ADMIN ONLY) — manual sync/re-sync.
 *   • Internal: require('./create-invoice').syncOrderToXero(orderId)
 *               — call from the Fena/payment webhook when an order becomes paid.
 *
 * Idempotent: if the order already has xero_invoice_id, it is a no-op.
 *
 * Accounting safety: line items are normalised from the order's `items` jsonb
 * (whatever shape it has). The sum of (qty × unit) is validated against the
 * order total; if they disagree by more than 1p we fall back to a SINGLE summary
 * line at the exact order total, so the Xero invoice always reconciles.
 *
 * Optional env:
 *   XERO_SALES_ACCOUNT_CODE  (default '200')          — revenue account
 *   XERO_BANK_ACCOUNT_CODE                            — if set, the invoice is
 *       also marked paid by creating a Payment against this bank account.
 *   XERO_PRICES_INCLUDE_VAT  ('true' | 'false', default 'true')
 */
const x = require('./_client');

const SALES_ACCOUNT = process.env.XERO_SALES_ACCOUNT_CODE || '200';
const BANK_ACCOUNT  = process.env.XERO_BANK_ACCOUNT_CODE || '';
const INCLUSIVE     = (process.env.XERO_PRICES_INCLUDE_VAT || 'true') !== 'false';

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

// Normalise the order's items jsonb into Xero line items, defensively.
function buildLineItems(order) {
  let items = order.items;
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = null; } }
  const lines = [];
  if (Array.isArray(items)) {
    for (const it of items) {
      if (!it || typeof it !== 'object') continue;
      const desc = it.name || it.title || it.product || it.description || it.sku || 'Item';
      const size = it.size || it.variant || '';
      const qty  = num(it.qty || it.quantity || it.q || 1) || 1;
      let unit   = num(it.price ?? it.unitAmount ?? it.unit_price ?? it.unitPrice ?? it.amount);
      if (!unit && (it.lineTotal || it.total)) unit = num(it.lineTotal || it.total) / qty;
      lines.push({
        Description: size ? `${desc} (${size})` : String(desc),
        Quantity: qty,
        UnitAmount: Number(unit.toFixed(2)),
        AccountCode: SALES_ACCOUNT,
      });
    }
  }
  // Validate reconciliation against the order total
  const total = num(order.total);
  const sum = lines.reduce((s, l) => s + l.Quantity * l.UnitAmount, 0);
  if (!lines.length || Math.abs(sum - total) > 0.01) {
    return [{
      Description: `Velox Peptides order ${String(order.id).slice(0, 8)}`,
      Quantity: 1,
      UnitAmount: Number(total.toFixed(2)),
      AccountCode: SALES_ACCOUNT,
    }];
  }
  return lines;
}

async function getOrder(orderId) {
  const rows = await x.sbGet(`orders?id=eq.${orderId}&select=*&limit=1`);
  return Array.isArray(rows) ? rows[0] : null;
}

/** Core: create (or skip) the Xero invoice for one order. Returns a result object. */
async function syncOrderToXero(orderId) {
  const order = await getOrder(orderId);
  if (!order) return { ok: false, error: 'Order not found' };
  if (order.xero_invoice_id) return { ok: true, skipped: true, invoice_id: order.xero_invoice_id };

  const today = new Date().toISOString().slice(0, 10);
  const invoicePayload = {
    Invoices: [{
      Type: 'ACCREC',
      Contact: { Name: order.customer_name || order.customer_email || 'Website customer', EmailAddress: order.customer_email || undefined },
      Date: today,
      DueDate: today,
      Reference: `VELOX-${String(order.id).slice(0, 8)}`,
      LineAmountTypes: INCLUSIVE ? 'Inclusive' : 'Exclusive',
      LineItems: buildLineItems(order),
      Status: 'AUTHORISED',
    }],
  };

  const created = await x.xeroFetch('/api.xro/2.0/Invoices', { method: 'POST', body: invoicePayload });
  const inv = created && created.Invoices && created.Invoices[0];
  if (!inv || !inv.InvoiceID) throw new Error('Xero did not return an invoice id');

  // Optionally mark paid by recording a payment against the configured bank account.
  let paid = false;
  if (BANK_ACCOUNT) {
    try {
      await x.xeroFetch('/api.xro/2.0/Payments', {
        method: 'PUT',
        body: { Payments: [{
          Invoice: { InvoiceID: inv.InvoiceID },
          Account: { Code: BANK_ACCOUNT },
          Date: today,
          Amount: num(order.total),
        }] },
      });
      paid = true;
    } catch (e) {
      console.error('[xero/create-invoice] payment step failed (invoice still created):', e.message);
    }
  }

  await x.sbWrite(`orders?id=eq.${orderId}`, 'PATCH', {
    xero_invoice_id: inv.InvoiceID,
    xero_synced_at: new Date().toISOString(),
  }, 'return=minimal');

  return { ok: true, invoice_id: inv.InvoiceID, invoice_number: inv.InvoiceNumber, marked_paid: paid };
}

// HTTP handler — accepts EITHER admin auth (manual re-sync from /admin/)
// OR a trusted internal secret (so the payment webhook / cron can trigger it).
async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!x.configured()) return res.status(500).json({ error: 'Xero not configured' });

  const internalSecret = process.env.INTERNAL_TASK_SECRET;
  const provided = req.headers['x-internal-secret'];
  const internalOk = internalSecret && provided && provided === internalSecret;

  if (!internalOk) {
    const admin = await x.requireAdmin(req);
    if (!admin) return res.status(403).json({ error: 'Admin only' });
  }

  const orderId = (req.body || {}).order_id;
  if (!orderId) return res.status(400).json({ error: 'Missing order_id' });
  try {
    const result = await syncOrderToXero(orderId);
    return res.status(result.ok ? 200 : 400).json(result);
  } catch (e) {
    console.error('[xero/create-invoice]', e.message);
    return res.status(502).json({ error: 'Xero invoice failed', detail: e.message });
  }
}

module.exports = handler;
module.exports.syncOrderToXero = syncOrderToXero;
