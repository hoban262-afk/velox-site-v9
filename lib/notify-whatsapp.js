/**
 * lib/notify-whatsapp.js — send a WhatsApp message to the team (owner + Luke).
 *
 * Uses Twilio's WhatsApp API. Fully fail-safe: if the env isn't configured, or a
 * send fails, it logs and returns — it NEVER throws, so an order or signup can
 * never be broken by a notification problem.
 *
 * Env:
 *   TWILIO_ACCOUNT_SID      — Twilio account SID (starts AC…)
 *   TWILIO_AUTH_TOKEN       — Twilio auth token
 *   TWILIO_WHATSAPP_FROM    — sender, e.g. "whatsapp:+14155238886" (sandbox) or your approved number
 *   WHATSAPP_ALERT_NUMBERS  — comma-separated recipients, e.g. "+447111111111,+447222222222"
 *                             (the "whatsapp:" prefix is added automatically)
 */
function normalise(num) {
  num = String(num || '').trim();
  if (!num) return '';
  return num.startsWith('whatsapp:') ? num : `whatsapp:${num}`;
}

async function sendWhatsApp(message) {
  const SID   = process.env.TWILIO_ACCOUNT_SID;
  const TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const FROM  = process.env.TWILIO_WHATSAPP_FROM;
  const TO    = (process.env.WHATSAPP_ALERT_NUMBERS || '')
    .split(',').map(normalise).filter(Boolean);

  if (!SID || !TOKEN || !FROM || !TO.length) {
    console.warn('[whatsapp] not configured (need TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, WHATSAPP_ALERT_NUMBERS) — skipping');
    return { ok: false, skipped: true };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`;
  const auth = 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64');
  let sent = 0;
  for (const to of TO) {
    try {
      const body = new URLSearchParams({ From: normalise(FROM), To: to, Body: message });
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (r.ok) { sent++; }
      else { console.error('[whatsapp] send failed', to, r.status, (await r.text()).slice(0, 200)); }
    } catch (e) {
      console.error('[whatsapp] send threw', to, e.message);
    }
  }
  return { ok: sent > 0, sent };
}

module.exports = { sendWhatsApp };
