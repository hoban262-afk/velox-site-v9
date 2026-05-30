/**
 * GET /api/recovery/reorder?token=<base64url(orderId)>.<hmac>
 *
 * The "REORDER THESE" link in the replenishment email. Verifies the token,
 * loads the original order's items, and returns a tiny page that writes them
 * into the site cart (localStorage 'vp_cart', the exact shape the site's own
 * account "Reorder" button uses) then redirects to /cart/ — where current
 * catalogue pricing applies before checkout.
 *
 * We deliberately do NOT auto-charge here: the customer reviews their basket
 * at current prices and checks out normally.
 */

const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;

function verifyReorderToken(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 2) return null;
    const id = Buffer.from(parts[0], 'base64url').toString('utf-8');
    const expected = crypto.createHmac('sha256', SERVICE).update(`reorder:${id}`).digest('hex').slice(0, 32);
    return expected === parts[1] ? id : null;
  } catch { return null; }
}

function errorPage(msg) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Reorder — Velox Peptides</title></head>' +
    '<body style="margin:0;background:#030407;color:#9CA3AF;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">' +
    '<div style="max-width:420px;text-align:center;padding:40px">' +
    '<div style="font-size:18px;font-weight:800;color:#fff;letter-spacing:.04em;margin-bottom:16px">VELOX PEPTIDES</div>' +
    '<p style="font-size:15px;line-height:1.7">' + msg + '</p>' +
    '<a href="https://veloxpeps.com" style="color:#01D3A0;text-decoration:none;font-size:14px">Browse the catalogue &rarr;</a>' +
    '</div></body></html>';
}

// Map a stored order item to the site's vp_cart shape:
//   { slug, name, size, price, qty, url }
function toCartItem(it) {
  const slug = it.slug || '';
  return {
    slug,
    name:  it.name || it.title || it.product || 'Item',
    size:  it.size || '',
    price: Number(it.price != null ? it.price : (it.line_total != null ? it.line_total : 0)) || 0,
    qty:   Number(it.qty || it.quantity || 1) || 1,
    url:   '/compounds/' + slug + '/',
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (!SUPABASE_URL || !SERVICE) return res.status(500).send(errorPage('Service temporarily unavailable. Please try again shortly.'));

  const orderId = verifyReorderToken((req.query && req.query.token) || '');
  if (!orderId) return res.status(400).send(errorPage('This reorder link is invalid or has expired. You can browse the catalogue to order again.'));

  let order;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=items&limit=1`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
    const rows = r.ok ? await r.json() : [];
    order = Array.isArray(rows) ? rows[0] : null;
  } catch (e) {
    console.error('[recovery/reorder] lookup failed:', e.message);
    return res.status(500).send(errorPage('We couldn\'t load your previous order just now. Please try again shortly.'));
  }

  let items = order && order.items;
  if (typeof items === 'string') { try { items = JSON.parse(items); } catch { items = null; } }
  if (!Array.isArray(items) || !items.length) {
    return res.status(404).send(errorPage('We couldn\'t rebuild that order. You can browse the catalogue to order again.'));
  }

  const cart = items.map(toCartItem).filter((c) => c.name && c.price >= 0);
  const cartJson = JSON.stringify(cart).replace(/</g, '\\u003c'); // safe to embed in <script>

  // Write the cart and bounce to /cart/. noscript fallback links to the catalogue.
  return res.status(200).send(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Loading your basket… — Velox Peptides</title></head>' +
    '<body style="margin:0;background:#030407;color:#9CA3AF;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">' +
    '<div style="text-align:center;padding:40px"><div style="font-size:18px;font-weight:800;color:#fff;letter-spacing:.04em;margin-bottom:14px">VELOX PEPTIDES</div>' +
    '<p style="font-size:15px">Loading your basket&hellip;</p>' +
    '<noscript><a href="https://veloxpeps.com" style="color:#01D3A0">Continue to the catalogue &rarr;</a></noscript></div>' +
    '<script>try{localStorage.setItem("vp_cart", JSON.stringify(' + cartJson + '));}catch(e){}' +
    'window.location.replace("/cart/");</script>' +
    '</body></html>'
  );
};
