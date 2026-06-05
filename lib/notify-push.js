/**
 * lib/notify-push.js — send a Web Push notification to all subscribed admin devices.
 *
 * Fail-safe: if VAPID isn't configured or sends fail, it logs and returns — it
 * never throws, so an order can't be broken by a push problem. Dead subscriptions
 * (410/404) are pruned automatically.
 *
 * Env:
 *   VAPID_PUBLIC_KEY   (defaults to the embedded app key below)
 *   VAPID_PRIVATE_KEY  (required — set in Vercel env)
 *   VAPID_SUBJECT      (defaults to mailto:support@veloxpeps.com)
 */
let webpush = null;
try { webpush = require('web-push'); } catch (e) { /* dependency installed on deploy */ }

// Public key is safe to embed (it's public by design). Must match the key the
// browser subscribes with in admin.js.
const DEFAULT_PUBLIC = 'BB2LHMCFOvkgS5qsI8tsrOcHD_4aI8rc5l-GBVduJ5o-SjsI61Ck2iUqtLrVmdRzU1gC9TubyBlEsmedPyL1VFA';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sendPush(payload) {
  const PUBLIC  = process.env.VAPID_PUBLIC_KEY || DEFAULT_PUBLIC;
  const PRIVATE = process.env.VAPID_PRIVATE_KEY;
  const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@veloxpeps.com';

  if (!webpush) { console.warn('[push] web-push module unavailable — skipping'); return { skipped: true }; }
  if (!PRIVATE) { console.warn('[push] VAPID_PRIVATE_KEY not set — skipping'); return { skipped: true }; }
  if (!SUPABASE_URL || !SERVICE) { console.warn('[push] Supabase not configured — skipping'); return { skipped: true }; }

  webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
  const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

  let subs = [];
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?select=id,endpoint,p256dh,auth`, { headers: sbHeaders });
    subs = r.ok ? await r.json() : [];
  } catch (e) { console.error('[push] sub fetch failed', e.message); return { ok: false }; }
  if (!subs.length) return { ok: true, sent: 0 };

  const body = JSON.stringify(payload);
  let sent = 0; const dead = [];
  await Promise.all(subs.map(async (s) => {
    const sub = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
    try {
      await webpush.sendNotification(sub, body);
      sent++;
    } catch (e) {
      const code = e && e.statusCode;
      if (code === 404 || code === 410) dead.push(s.id);
      else console.error('[push] send failed', code, (e && e.message || '').slice(0, 120));
    }
  }));

  // Prune expired subscriptions
  if (dead.length) {
    const idList = dead.map((x) => `"${x}"`).join(',');
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?id=in.(${idList})`, { method: 'DELETE', headers: sbHeaders });
    } catch (e) { /* best-effort */ }
  }
  return { ok: true, sent, pruned: dead.length };
}

module.exports = { sendPush };
