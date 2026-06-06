/**
 * POST /api/order-status — public self-serve order tracking.
 *
 * Body: { ref, email }
 * Returns a SAFE status summary for the order whose reference + email BOTH match
 * (requiring the email stops anyone enumerating other people's orders with just a
 * reference). No prices, no addresses — just where the parcel is.
 *
 * This deflects the single most common support email ("where's my order?") so it
 * never reaches a human.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;

const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

function parseItems(order) {
  let items = order.items;
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = null; } }
  return Array.isArray(items) ? items : [];
}

const STATUS_COPY = {
  pending:    { label: 'Order received', note: 'We have your order and are waiting for payment to confirm.', step: 1 },
  open:       { label: 'Order received', note: 'We have your order and are waiting for payment to confirm.', step: 1 },
  paid:       { label: 'Paid — preparing your parcel', note: 'Payment confirmed. Your parcel is being packed and will be dispatched shortly.', step: 2 },
  dispatched: { label: 'Dispatched', note: 'Your parcel is on its way with Royal Mail.', step: 3 },
  delivered:  { label: 'Delivered', note: 'Royal Mail has marked this as delivered.', step: 4 },
  cancelled:  { label: 'Cancelled', note: 'This order was cancelled. If that is unexpected, contact support@veloxpeps.com.', step: 0 },
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  const ref = String(b.ref || '').trim().replace(/^#/, '');
  const email = String(b.email || '').trim().toLowerCase();
  if (!ref || !email) return res.status(400).json({ error: 'Enter your order reference and email.' });

  let order = null;
  try {
    const url = `${SUPABASE_URL}/rest/v1/orders` +
      `?notes=ilike.${encodeURIComponent(ref)}` +
      `&customer_email=ilike.${encodeURIComponent(email)}` +
      `&select=notes,status,created_at,dispatched_at,tracking_number,carrier,items&limit=1`;
    const r = await fetch(url, { headers: sbHeaders });
    const rows = r.ok ? await r.json() : [];
    order = Array.isArray(rows) ? rows[0] : null;
  } catch (e) {
    return res.status(500).json({ error: 'Lookup failed' });
  }

  // Generic miss — never reveal whether the ref or the email was the mismatch.
  if (!order) return res.status(200).json({ found: false });

  const copy = STATUS_COPY[order.status] || { label: order.status, note: '', step: 1 };
  const tracking = order.tracking_number || null;
  const trackingUrl = tracking
    ? `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(tracking.replace(/\s+/g, ''))}`
    : null;

  return res.status(200).json({
    found: true,
    ref: order.notes,
    status: order.status,
    label: copy.label,
    note: copy.note,
    step: copy.step,
    placed_at: order.created_at,
    dispatched_at: order.dispatched_at,
    tracking_number: tracking,
    tracking_url: trackingUrl,
    carrier: order.carrier || (tracking ? 'Royal Mail' : null),
    items: parseItems(order).map((it) => ({
      name: (it.name || it.title || 'Item') + (it.size ? ` (${it.size})` : ''),
      qty: it.qty || it.quantity || 1,
    })),
  });
};
