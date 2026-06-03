export default async function handler(req, res) {
  const events = ['Started Checkout', 'Placed Order'];

  for (const name of events) {
    await fetch('https://a.klaviyo.com/api/events/', {
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
            metric: { data: { type: 'metric', attributes: { name } } },
            profile: { data: { type: 'profile', attributes: { email: 'test@veloxpeptides.com' } } },
            properties: { OrderId: 'TEST-001', ItemNames: ['BPC-157 (5mg)'] },
            value: 29.99,
            unique_id: `test-${name}-${Date.now()}`
          }
        }
      })
    });
  }

  return res.status(200).json({ success: true, message: 'Both metrics created' });
}