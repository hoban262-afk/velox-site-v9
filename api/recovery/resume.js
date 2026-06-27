/**
 * GET /api/recovery/resume?token=<base64url(orderId)>.<hmac>
 *
 * The "COMPLETE MY ORDER" link in recovery emails. Verifies the token,
 * loads the original pending order, and — rather than make the customer
 * rebuild their basket — creates a fresh Fena payment for that SAME order
 * and 302-redirects straight to Fena's hosted payment page. One tap from
 * the email to the bank approval screen.
 *
 * If the order has already been paid/dispatched (or cancelled), we show a
 * friendly page instead of charging again.
 *
 * Reuses the exact Fena endpoint + payload shape proven in
 * api/create-fena-payment.js, but PATCHes the existing order (new reference
 * + fena_payment_id) instead of inserting a new one — so no duplicate orders.
 */

const crypto = require('crypto');

const FENA_ENDPOINT = 'https://epos.api.prod-gcp.fena.co/open/payments/single/create-and-process';
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE       = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE          = process.env.NEXT_PUBLIC_SITE_URL || 'https://veloxpeps.com';

function verifyOrderToken(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 2) return null;
    const id = Buffer.from(parts[0], 'base64url').toString('utf-8');
    const expected = crypto.createHmac('sha256', SERVICE).update(`recover:${id}`).digest('hex').slice(0, 32);
    return expected === parts[1] ? id : null;
  } catch { return null; }
}

function page(title, msg, cta) {
  const button = cta
    ? `<a href="${cta}" style="display:inline-block;margin-top:18px;padding:13px 30px;background:#01D3A0;color:#030407;font-weight:700;text-decoration:none;border-radius:4px;font-size:14px;letter-spacing:.05em">CONTINUE SHOPPING &rarr;</a>`
    : `<a href="https://veloxpeps.com" style="color:#01D3A0;text-decoration:none;font-size:14px">Return to site &rarr;</a>`;
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>${title} — Velox Peptides</title></head>` +
    '<body style="margin:0;background:#030407;color:#9CA3AF;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">' +
    '<div style="max-width:440px;text-align:center;padding:40px">' +
    '<div style="font-size:18px;font-weight:800;color:#fff;letter-spacing:.04em;margin-bottom:16px">VELOX PEPTIDES</div>' +
    `<p style="font-size:15px;line-height:1.7">${msg}</p>${button}</div></body></html>`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!SUPABASE_URL || !SERVICE) return res.status(500).send(page('Unavailable', 'Service temporarily unavailable. Please try again shortly.'));

  const token = (req.query && req.query.token) || '';
  const orderId = verifyOrderToken(token);
  if (!orderId) return res.status(400).send(page('Invalid link', 'This link is invalid or has expired. You can start a fresh order on our site.'));

  const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

  // Load the order
  let order;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=*&limit=1`, { headers: sbHeaders });
    const rows = r.ok ? await r.json() : [];
    order = Array.isArray(rows) ? rows[0] : null;
  } catch (e) {
    console.error('[recovery/resume] lookup failed:', e.message);
    return res.status(500).send(page('Unavailable', 'We couldn\'t load your order just now. Please try again shortly.'));
  }

  if (!order) return res.status(404).send(page('Not found', 'We couldn\'t find this order. You can start a fresh order on our site.'));

  if (order.status === 'paid' || order.status === 'dispatched') {
    return res.status(200).send(page('Already complete', 'Good news — this order has already been paid and is being processed. There\'s nothing more to do.'));
  }
  // Cancelled cart being recovered: the customer explicitly clicked "complete my
  // order", so revive it to 'pending' and let them re-pay the SAME order instead
  // of dead-ending. (Fena marks abandoned Pay-by-Bank attempts cancelled fast.)
  if (order.status === 'cancelled') {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(order.id)}`, {
        method: 'PATCH',
        headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'pending' }),
      });
      order.status = 'pending';
    } catch (e) {
      console.error('[recovery/resume] revive failed:', e.message);
    }
  }

  // Build a fresh Fena payment for the SAME order
  const ID = process.env.FENA_CLIENT_ID, SECRET = process.env.FENA_CLIENT_SECRET;
  if (!ID || !SECRET) return res.status(500).send(page('Unavailable', 'Payments are temporarily unavailable. Please try again shortly.'));

  const amountStr = (Number(order.total) || 0).toFixed(2);
  if (!(Number(amountStr) > 0)) return res.status(400).send(page('Unavailable', 'There was a problem with this order total. Please contact us and we\'ll help.'));

  const paymentRef = ('VP' + Date.now().toString(36)).replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || 'VP';
  const redirectUrl = `${SITE}/checkout/payment-complete/?order_id=${encodeURIComponent(order.id)}&ref=${encodeURIComponent(paymentRef)}&method=fena`;

  try {
    const fenaRes = await fetch(FENA_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'integration-id': ID, 'secret-key': SECRET },
      body: JSON.stringify({
        reference: paymentRef,
        amount: amountStr,
        customerEmail: order.customer_email || '',
        customerName: order.customer_name || '',
        items: [],
        customRedirectUrl: redirectUrl,
      }),
    });
    const rawText = await fenaRes.text();
    let data = {}; try { data = JSON.parse(rawText); } catch { data = {}; }
    const paymentUrl = data.result && data.result.link;
    const fenaPaymentId = data.result && data.result.id;

    if (!fenaRes.ok || !data.created || !paymentUrl) {
      console.error('[recovery/resume] Fena failed:', fenaRes.status, rawText.slice(0, 200));
      return res.status(502).send(page('Try again', 'We couldn\'t start the payment just now. Please try the link again in a moment, or reply to your email and we\'ll help.'));
    }

    // Point the existing order at the new payment reference (no new order row).
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(order.id)}`, {
        method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ notes: paymentRef, fena_payment_id: fenaPaymentId ? String(fenaPaymentId) : order.fena_payment_id }),
      });
    } catch (e) { console.error('[recovery/resume] patch ref failed (non-fatal):', e.message); }

    console.log(`[recovery/resume] order ${order.id} -> Fena ${fenaPaymentId} (£${amountStr})`);
    res.writeHead(302, { Location: paymentUrl });
    return res.end();
  } catch (e) {
    console.error('[recovery/resume] threw:', e.message);
    return res.status(500).send(page('Try again', 'Something went wrong starting your payment. Please try the link again shortly.'));
  }
};
