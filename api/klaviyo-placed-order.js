export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, firstName, items, total, orderId } = req.body;

  const response = await fetch('https://a.klaviyo.com/api/events/', {
    method: 'POST',
    headers: {
      'Authorization': `Klaviyo-API-Key ${process.env.KLAVIYO_API_KEY}`,
      'Content-Type': 'application/json',
      'revision': '2024-02-15'
    },
    body: JSON.stringify({
      data: {
        type: 'event',
        attributes: {
          metric: {
            data: { type: 'metric', attributes: { name: 'Placed Order' } }
          },
          profile: {
            data: { type: 'profile', attributes: { email, first_name: firstName } }
          },
          properties: {
            OrderId: orderId,
            ItemNames: items.map(i => i.name),
            Items: items.map(i => ({
              ProductName: i.name,
              Quantity: i.quantity,
              ItemPrice: i.price
            }))
          },
          value: total,
          unique_id: orderId
        }
      }
    })
  });

  if (response.status === 202) {
    return res.status(200).json({ success: true });
  } else {
    const err = await response.json();
    return res.status(500).json({ error: err });
  }
}