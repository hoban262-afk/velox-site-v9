/**
 * /api/pack/[action] — the packer console backend. PIN-gated, NOT admin.
 *
 *   POST /api/pack/auth      { pin }                 → { ok, token }   (12h signed token)
 *   GET  /api/pack/queue     (x-pack-token header)   → { orders: [...] } safe fields only
 *   POST /api/pack/label     { order_id }            → push to Click & Drop (label ready)
 *   POST /api/pack/dispatch  { order_id, tracking }  → mark dispatched + email customer
 *
 * The packer never gets a Supabase admin session, never sees prices/margins/
 * revenue/customer history — only what's needed to pack and ship today's orders.
 *
 * Auth model: a single shared PIN (env PACKER_PIN). On success we return a short-
 * lived HMAC token (signed with the service key); every other call must present it
 * in the x-pack-token header. No token is ever stored; it just expires.
 */
const crypto = require('crypto');
const cd = require('../../lib/clickdrop');
const { markOrderDispatched } = require('../../lib/dispatch');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PACKER_PIN   = (process.env.PACKER_PIN || '').trim();
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

// ── PIN token (HMAC, self-expiring) ─────────────────────────────────────────
function signToken(expMs) {
  const payload = `pack.${expMs}`;
  const sig = crypto.createHmac('sha256', SERVICE).update(payload).digest('hex').slice(0, 32);
  return Buffer.from(payload, 'utf-8').toString('base64url') + '.' + sig;
}
function validToken(token) {
  const [enc, sig] = String(token || '').split('.');
  if (!enc || !sig) return false;
  let payload;
  try { payload = Buffer.from(enc, 'base64url').toString('utf-8'); } catch { return false; }
  const good = crypto.createHmac('sha256', SERVICE).update(payload).digest('hex').slice(0, 32);
  if (sig !== good) return false;
  const m = payload.match(/^pack\.(\d+)$/);
  return !!m && Date.now() < Number(m[1]);
}
function timingSafeEq(a, b) {
  const ab = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

async function getOrder(orderId) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=*&limit=1`, { headers: sbHeaders });
  const rows = r.ok ? await r.json() : [];
  return Array.isArray(rows) ? rows[0] : null;
}

// Strip an order down to only what the packer needs (no prices/revenue/email-history).
function safeOrder(o) {
  let items = o.items;
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = []; } }
  items = Array.isArray(items) ? items.map((it) => ({
    name: it.name || it.title || 'Item',
    size: it.size || null,
    qty: it.qty || it.quantity || 1,
  })) : [];
  return {
    id: o.id,
    ref: o.notes || ('VELOX-' + String(o.id).slice(0, 8).toUpperCase()),
    customer_name: o.customer_name || o.ship_name || '',
    ship: {
      name: o.ship_name || o.customer_name || '',
      line1: o.ship_line1 || '', line2: o.ship_line2 || '',
      city: o.ship_city || '', postcode: o.ship_postcode || '',
      country: o.ship_country || 'GB', phone: o.ship_phone || '',
    },
    items,
    created_at: o.created_at,
    status: o.status,
    has_label: !!o.clickdrop_order_identifier,
    label_error: o.clickdrop_error || null,
    tracking_number: o.tracking_number || null,
  };
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  const action = String((req.query && req.query.action) || '').toLowerCase();

  // ── auth: exchange PIN for a token ──
  if (action === 'auth') {
    if (req.method !== 'POST') return res.status(405).end();
    if (!PACKER_PIN) return res.status(503).json({ error: 'Packer access not set up. Ask the owner to set a PACKER_PIN.' });
    const pin = String((req.body && req.body.pin) || '').trim();
    if (!pin || !timingSafeEq(pin, PACKER_PIN)) return res.status(401).json({ error: 'Wrong PIN' });
    return res.status(200).json({ ok: true, token: signToken(Date.now() + TOKEN_TTL_MS) });
  }

  // every other action requires a valid pack token
  if (!validToken(req.headers['x-pack-token'])) return res.status(401).json({ error: 'Locked. Enter the PIN again.' });

  // ── queue: today's paid + not-yet-dispatched orders ──
  if (action === 'queue') {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/orders?status=eq.paid&dispatched_at=is.null&select=*&order=created_at.asc`,
      { headers: sbHeaders }
    );
    const rows = r.ok ? await r.json() : [];
    return res.status(200).json({ orders: (Array.isArray(rows) ? rows : []).map(safeOrder) });
  }

  // ── label: push one order into Click & Drop ──
  if (action === 'label') {
    if (req.method !== 'POST') return res.status(405).end();
    const orderId = String((req.body && req.body.order_id) || '').trim();
    if (!orderId) return res.status(400).json({ error: 'Missing order_id' });
    if (!cd.configured()) return res.status(503).json({ error: 'Click & Drop not connected yet (owner must set the API key).' });
    const out = await cd.pushOrderToClickAndDrop(orderId);
    return res.status(out.ok ? 200 : 502).json(out);
  }

  // ── dispatch: manual fallback — mark dispatched + email customer ──
  if (action === 'dispatch') {
    if (req.method !== 'POST') return res.status(405).end();
    const orderId = String((req.body && req.body.order_id) || '').trim();
    const tracking = String((req.body && req.body.tracking) || '').trim();
    if (!orderId) return res.status(400).json({ error: 'Missing order_id' });
    const order = await getOrder(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const out = await markOrderDispatched(order, tracking, { source: 'packer' });
    return res.status(out.ok ? 200 : 502).json(out);
  }

  return res.status(404).json({ error: 'Unknown action' });
};
