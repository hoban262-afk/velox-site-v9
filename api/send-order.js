const { Resend } = require('resend');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const resend = new Resend(process.env.RESEND_API_KEY);
  const d = req.body;

  const itemsHtml = (d.order_items || '')
    .split('\n')
    .map(l => `<li style="margin:4px 0;">${l}</li>`)
    .join('');

  try {
    await resend.emails.send({
      from: 'Velox Peptides <orders@veloxpeps.com>',
      to: 'veloxpeps@gmail.com',
      subject: `New Order ${d.order_number} — £${d.order_total}`,
      html: `<h2>New Order</h2><p><strong>Order:</strong> ${d.order_number}</p><p><strong>Customer:</strong> ${d.customer_name}</p><p><strong>Email:</strong> ${d.customer_email}</p><ul>${itemsHtml}</ul><p><strong>Total:</strong> £${d.order_total}</p>`
    });

    await resend.emails.send({
      from: 'Velox Peptides <orders@veloxpeps.com>',
      to: d.customer_email,
      subject: `Order Confirmed — ${d.order_number}`,
      html: `<h2>Order Confirmed</h2><p>Hi ${d.customer_name}, thank you for your order.</p><p><strong>Order:</strong> ${d.order_number}</p><ul>${itemsHtml}</ul><p><strong>Total:</strong> £${d.order_total}</p><p>Please bank transfer using order number as reference. Dispatched within 48hrs of payment.</p>`
    });

    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};