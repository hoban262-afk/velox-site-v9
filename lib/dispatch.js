/**
 * lib/dispatch.js — mark one order dispatched + fire the customer dispatch email.
 *
 * Shared by the packer view's manual "Mark dispatched" button and the automatic
 * Royal Mail despatch-sync cron, so both paths behave identically.
 *
 * Idempotent: an order that already has dispatched_at is never re-emailed.
 * The dispatch email is sent by calling the existing /api/send-dispatch template
 * with the internal task secret, so we don't duplicate the email HTML.
 *
 * Lives OUTSIDE /api so Vercel never treats it as a serverless function.
 */
const SUPABASE_URL    = process.env.SUPABASE_URL;
const SERVICE         = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE            = process.env.NEXT_PUBLIC_SITE_URL || 'https://veloxpeps.com';
const INTERNAL_SECRET = process.env.INTERNAL_TASK_SECRET;

const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

function parseItems(order) {
  let items = order.items;
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = null; } }
  return Array.isArray(items) ? items : [];
}

function orderRef(order) {
  return order.notes || ('VELOX-' + String(order.id).slice(0, 8).toUpperCase());
}

/**
 * @param {object} order  full orders row (must include id, customer_email, ship_* , items, notes)
 * @param {string} tracking  Royal Mail tracking number (may be empty)
 * @param {object} [opts]  { carrier, source }
 * @returns {Promise<{ok:boolean, skipped?:boolean, emailed?:boolean, error?:string}>}
 */
async function markOrderDispatched(order, tracking, opts = {}) {
  if (!order || !order.id) return { ok: false, error: 'no order' };
  if (order.dispatched_at) return { ok: true, skipped: true };

  const carrier = opts.carrier || 'Royal Mail Tracked 24';
  const patch = {
    status: 'dispatched',
    tracking_number: tracking || null,
    carrier,
    dispatched_at: new Date().toISOString(),
  };

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(order.id)}`, {
      method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(patch),
    });
    if (!r.ok) return { ok: false, error: `db patch ${r.status}` };
  } catch (e) { return { ok: false, error: e.message }; }

  // Fire the dispatch email via the existing template endpoint (best-effort).
  let emailed = false;
  if (order.customer_email && INTERNAL_SECRET) {
    const address = [order.ship_line1, order.ship_line2, order.ship_city, order.ship_postcode, order.ship_country]
      .filter((p) => p && String(p).trim()).join(', ');
    const items = parseItems(order).map((it) => ({
      name: (it.name || it.title || 'Item') + (it.size ? ` (${it.size})` : ''),
      qty: it.qty || it.quantity || 1,
    }));
    try {
      const r = await fetch(`${SITE}/api/send-dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
        body: JSON.stringify({
          order_number: orderRef(order),
          customer_email: order.customer_email,
          customer_name: order.customer_name || '',
          tracking_number: tracking || '',
          address,
          items,
        }),
      });
      emailed = r.ok;
    } catch (e) { console.error('[dispatch] email failed', e.message); }
  }

  return { ok: true, emailed };
}

module.exports = { markOrderDispatched, orderRef, parseItems };
