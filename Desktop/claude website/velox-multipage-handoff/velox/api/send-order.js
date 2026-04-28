import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Vercel does not auto-parse JSON — collect and parse the body manually
  const raw = await new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });

  let d;
  try {
    d = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const itemsHtml = d.order_items
    .split('\n')
    .map(l => `<li style="margin:4px 0;">${l}</li>`)
    .join('');

  await resend.emails.send({
    from: 'Velox Peptides <orders@veloxpeps.com>',
    to: 'veloxpeps@gmail.com',
    subject: `New Order ${d.order_number} — £${d.order_total}`,
    html: `<h2>New Order Received</h2>
      <p><strong>Order:</strong> ${d.order_number}</p>
      <p><strong>Customer:</strong> ${d.customer_name}</p>
      <p><strong>Email:</strong> ${d.customer_email}</p>
      <p><strong>Phone:</strong> ${d.customer_phone}</p>
      <p><strong>Address:</strong> ${d.shipping_address}</p>
      <p><strong>Shipping:</strong> ${d.shipping_method}</p>
      <hr/>
      <ul>${itemsHtml}</ul>
      <p><strong>Subtotal:</strong> £${d.order_subtotal}</p>
      <p><strong>Shipping:</strong> £${d.shipping_cost}</p>
      <p><strong>Total:</strong> £${d.order_total}</p>`
  });

  await resend.emails.send({
    from: 'Velox Peptides <orders@veloxpeps.com>',
    to: d.customer_email,
    subject: `Order Confirmed — ${d.order_number}`,
    html: `<h2>Order Confirmed</h2>
      <p>Hi ${d.customer_name}, thank you for your order.</p>
      <p><strong>Order number:</strong> ${d.order_number}</p>
      <ul>${itemsHtml}</ul>
      <p><strong>Total:</strong> £${d.order_total}</p>
      <hr/>
      <p>Please complete your bank transfer using your order number <strong>${d.order_number}</strong> as the reference.</p>
      <p>Your order will be dispatched within 48 hours of payment being confirmed.</p>
      <p style="font-size:11px;color:#999;">For research use only. Not for human consumption. CRP Labs Ltd.</p>`
  });

  res.status(200).json({ ok: true });
} 
