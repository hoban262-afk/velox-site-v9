/**
 * POST /api/send-payment-link — admin-only "email this customer a Fena payment link".
 *
 * The low-risk friction fix for the case where a customer's Pay-by-Bank attempt
 * failed, or they asked us to "send a payment link". Instead of adding a new
 * payment rail, this re-issues a fresh Fena hosted-payment link for an EXISTING
 * order and emails it to the customer. Because it reuses the normal Fena plumbing
 * (stores fena_payment_id on the order, points customRedirectUrl at
 * /checkout/payment-complete, and sets notes = the 12-char Fena reference), when
 * the customer pays, api/confirm-fena-payment.js (browser return) and
 * api/fena-webhook.js (server-to-server backstop) mark the order paid and fire
 * Click & Drop + Xero + emails exactly as a normal order — NO new confirmation
 * logic is needed here.
 *
 * Auth: internal task secret (x-internal-secret) OR a signed-in admin's Supabase
 * bearer token — same gate as api/send-dispatch.js (this endpoint emails an
 * address taken from stored order data and creates a payable link, so it must
 * never be public).
 *
 * Body: { order_id }  (UUID of an existing order; amount + email come from the
 *                       stored row, never the request, so a link can't be forged
 *                       for an arbitrary amount).
 * Response: { ok:true, paymentUrl, ref } | { ok:false, error }
 */
const { Resend } = require('resend');

const SB_URL     = process.env.SUPABASE_URL;
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FENA_ENDPOINT = 'https://epos.api.prod-gcp.fena.co/open/payments/single/create-and-process';
const LOGO = 'https://veloxpeps.com/assets/images/veloxpeps2.png';

// ── Admin / internal auth (mirrors api/send-dispatch.js) ──────────────────────
const KNOWN_ADMIN_EMAILS = new Set([
  (process.env.ADMIN_EMAIL || '').toLowerCase(),
  'support@veloxpeps.com',
  'veloxpeps@gmail.com',
].filter(Boolean));

async function isAuthorized(req) {
  const INTERNAL_SECRET = process.env.INTERNAL_TASK_SECRET;
  if (INTERNAL_SECRET && (req.headers['x-internal-secret'] || '') === INTERNAL_SECRET) return true;

  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token || !SB_URL) return false;
  try {
    const ures = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: process.env.SUPABASE_ANON_KEY || SB_SERVICE || '' },
    });
    if (!ures.ok) return false;
    const user = await ures.json();
    return !!user && KNOWN_ADMIN_EMAILS.has((user.email || '').toLowerCase());
  } catch { return false; }
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Branded "complete your payment" email. Kept self-contained (matches the inline
// style tokens used by send-dispatch.js) — this is a transactional receipt-style
// mail, so it sends direct via Resend from orders@, not through the marketing
// lib/mail pipeline.
function buildEmailHtml(customerName, ref, amountStr, paymentUrl) {
  const first = String(customerName || '').trim().split(/\s+/)[0] || 'there';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><title>Complete your payment</title>
<style>:root{color-scheme:dark;supported-color-schemes:dark}</style></head>
<body style="margin:0;padding:0;background:#030407;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#030407">
<tr><td align="center" style="padding:32px 16px">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#0d0d0d;border:1px solid #1a1a1a;border-radius:8px;overflow:hidden">
  <tr><td style="background:#01D3A0;height:4px;font-size:0;line-height:0">&nbsp;</td></tr>
  <tr><td align="center" style="padding:32px 40px 20px">
    <img src="${LOGO}" alt="Velox Peptides" width="160" style="max-width:160px;height:auto;display:block;border:0"></td></tr>
  <tr><td style="padding:0 40px 8px">
    <p style="margin:0 0 14px;font-size:15px;color:#fff">Hi ${esc(first)},</p>
    <p style="margin:0 0 14px;font-size:14px;color:#c7ccd4;line-height:1.6">
      Here's a secure link to complete payment for your Velox Peptides order
      <strong style="color:#fff">${esc(ref)}</strong>. Payment is handled by Fena open banking —
      you authorise it directly in your own banking app, and no card or bank details are stored on our site.</p></td></tr>
  <tr><td align="center" style="padding:8px 40px 6px">
    <a href="${esc(paymentUrl)}" style="display:inline-block;background:#01D3A0;color:#021;text-decoration:none;font-weight:700;font-size:15px;padding:14px 34px;border-radius:8px">
      Pay £${esc(amountStr)} securely →</a></td></tr>
  <tr><td align="center" style="padding:2px 40px 22px">
    <p style="margin:0;font-size:11px;color:#6b7280">If the button doesn't work, paste this into your browser:<br>
      <span style="color:#9ca3af;word-break:break-all">${esc(paymentUrl)}</span></p></td></tr>
  <tr><td style="padding:0 40px 30px">
    <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6">
      Prefer to pay another way, or having trouble? Just reply to this email and we'll help.
      This link is for order ${esc(ref)} only.</p></td></tr>
</table></td></tr></table></body></html>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!SB_URL || !SB_SERVICE) return res.status(500).json({ ok: false, error: 'Server not configured' });
  if (!(await isAuthorized(req))) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  const orderId = String(b.order_id || '').trim();
  if (!orderId) return res.status(400).json({ ok: false, error: 'Missing order_id' });

  const ID     = process.env.FENA_CLIENT_ID;
  const SECRET = process.env.FENA_CLIENT_SECRET;
  const BASE   = process.env.NEXT_PUBLIC_SITE_URL || 'https://veloxpeps.com';
  if (!ID || !SECRET) return res.status(500).json({ ok: false, error: 'Payment service not configured' });

  const sbHeaders = { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` };

  // ── Load the order — amount + email come from the DB, never the request ──────
  let order = null;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&select=*&limit=1`, { headers: sbHeaders });
    const rows = r.ok ? await r.json() : [];
    order = Array.isArray(rows) ? rows[0] : null;
  } catch (e) {
    console.error('[send-payment-link] order lookup threw:', e.message);
  }
  if (!order) return res.status(404).json({ ok: false, error: 'Order not found' });

  // Never re-issue a link for money we've already collected.
  if (order.status === 'paid' || order.status === 'dispatched') {
    return res.status(409).json({ ok: false, error: `Order is already ${order.status} — not sending a payment link.` });
  }

  const email = String(order.customer_email || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Order has no valid customer email to send the link to.' });
  }

  const amountStr = (Number(order.total) || 0).toFixed(2);
  if (!(Number(amountStr) > 0)) {
    return res.status(400).json({ ok: false, error: 'Order total is zero or invalid.' });
  }

  // Fresh 12-char alnum Fena reference. We store it back in notes so the
  // server-to-server webhook (which matches by notes = reference) resolves this
  // order, alongside the order_id carried in the redirect URL.
  const paymentRef = ('VP' + Date.now().toString(36)).replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || 'VP';
  const redirectUrl = `${BASE}/checkout/payment-complete/?order_id=${encodeURIComponent(orderId)}&ref=${encodeURIComponent(paymentRef)}&method=fena`;

  // ── Create the Fena hosted payment ──────────────────────────────────────────
  let paymentUrl = '', fenaPaymentId = '';
  try {
    const fenaRes = await fetch(FENA_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'integration-id': ID, 'secret-key': SECRET },
      body: JSON.stringify({
        reference:         paymentRef,
        amount:            amountStr,
        customerEmail:     email,
        customerName:      order.customer_name || '',
        items:             [],
        customRedirectUrl: redirectUrl,
      }),
    });
    const raw = await fenaRes.text();
    let data = {};
    try { data = JSON.parse(raw); } catch { data = { _raw: raw }; }
    if (!fenaRes.ok || !data.created) {
      console.error('[send-payment-link] Fena error:', fenaRes.status, raw.slice(0, 300));
      return res.status(502).json({ ok: false, error: data.message || data.error || `Fena HTTP ${fenaRes.status}` });
    }
    paymentUrl    = data.result && data.result.link;
    fenaPaymentId = data.result && data.result.id;
    if (!paymentUrl) return res.status(502).json({ ok: false, error: 'No payment URL returned by Fena' });
  } catch (e) {
    console.error('[send-payment-link] Fena fetch threw:', e.message);
    return res.status(502).json({ ok: false, error: 'Could not reach the payment service' });
  }

  // ── Point the order at this payment so confirm/webhook can settle it ─────────
  // Conditional on the order still being unpaid so we can't clobber a row that a
  // webhook flipped to paid in the same moment.
  try {
    const patch = { payment_method: 'fena', notes: paymentRef, fena_payment_id: String(fenaPaymentId), status: 'pending' };
    await fetch(`${SB_URL}/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}&status=in.(pending,cancelled,superseded)`, {
      method: 'PATCH',
      headers: { ...sbHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    });
  } catch (e) {
    console.error('[send-payment-link] order PATCH threw (non-fatal):', e.message);
  }

  // ── Email the link ───────────────────────────────────────────────────────────
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ ok: false, error: 'Email service not configured', paymentUrl });
  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from:     'Velox Peptides <orders@veloxpeps.com>',
      to:       email,
      reply_to: 'support@veloxpeps.com',
      subject:  `Complete your payment — order ${paymentRef}`,
      html:     buildEmailHtml(order.customer_name, paymentRef, amountStr, paymentUrl),
    });
    console.log(`[send-payment-link] Link emailed for order ${orderId} (${paymentRef}) to ${email}`);
  } catch (e) {
    console.error('[send-payment-link] email send failed:', e.message);
    // The link is valid even if the email failed — hand it back so admin can copy it.
    return res.status(200).json({ ok: true, paymentUrl, ref: paymentRef, emailed: false, warning: 'Link created but the email failed to send — copy it manually.' });
  }

  return res.status(200).json({ ok: true, paymentUrl, ref: paymentRef, emailed: true });
};
