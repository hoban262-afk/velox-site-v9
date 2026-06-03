export default async function handler(req, res) {
  const apiKey = process.env.KLAVIYO_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'KLAVIYO_API_KEY not found in environment variables' });
  }

  const results = [];

  for (const name of ['Started Checkout', 'Placed Order']) {
    const response = await fetch('https://a.klaviyo.com/api/events/', {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${apiKey}`,
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

    const status = response.status;
    let body = null;
    try { body = await response.json(); } catch (e) { body = 'no response body'; }

    results.push({ event: name, status, body });
  }

  return res.status(200).json({ apiKeyPrefix: apiKey.substring(0, 6) + '...', results });
}