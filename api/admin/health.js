/**
 * GET /api/admin/health — ADMIN ONLY.
 * Reports the last run of each background worker (from worker_runs) and which
 * integrations are configured (env presence only — never the secret values).
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON         = process.env.SUPABASE_ANON_KEY;

const KNOWN_ADMIN_EMAILS = new Set([
  (process.env.ADMIN_EMAIL || '').toLowerCase(),
  'support@veloxpeps.com', 'veloxpeps@gmail.com',
].filter(Boolean));

const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

// The workers we expect to run, with a human label + schedule.
const WORKERS = [
  { key: 'abandoned', label: 'Abandoned checkout', schedule: 'every 5 min' },
  { key: 'welcome',   label: 'Welcome series',     schedule: 'hourly' },
  { key: 'restock',   label: 'Back in stock',      schedule: 'every 15 min' },
  { key: 'reorder',   label: 'Replenishment',      schedule: 'daily' },
  { key: 'review',    label: 'Review request',     schedule: 'daily' },
];

async function isAdmin(req) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token || !SUPABASE_URL) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: ANON || SERVICE || '' } });
    if (!r.ok) return false;
    const u = await r.json();
    return !!u && KNOWN_ADMIN_EMAILS.has((u.email || '').toLowerCase());
  } catch { return false; }
}

const has = (name) => !!process.env[name];

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'Unauthorized' });

  // Latest run per worker.
  let rows = [];
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/worker_runs?select=worker,ran_at,ok,summary&order=ran_at.desc&limit=400`, { headers: sbHeaders });
    rows = r.ok ? await r.json() : [];
  } catch {}
  const latest = {};
  for (const row of rows) { if (!latest[row.worker]) latest[row.worker] = row; }

  const workers = WORKERS.map((w) => ({
    key: w.key, label: w.label, schedule: w.schedule,
    last: latest[w.key] ? { ran_at: latest[w.key].ran_at, ok: latest[w.key].ok, summary: latest[w.key].summary } : null,
  }));

  const integrations = [
    { key: 'resend',    label: 'Resend (email)',        ok: has('RESEND_API_KEY') },
    { key: 'cron',      label: 'Cron secret',           ok: has('CRON_SECRET') || has('INTERNAL_TASK_SECRET') },
    { key: 'push',      label: 'Web push (VAPID)',      ok: has('VAPID_PRIVATE_KEY') },
    { key: 'marketing', label: 'Marketing sender',      ok: has('MARKETING_FROM'), note: has('MARKETING_FROM') ? null : 'using default news@veloxpeps.com' },
    { key: 'anthropic', label: 'AI insights (Anthropic)', ok: has('ANTHROPIC_API_KEY') },
    { key: 'xero',      label: 'Xero accounting',       ok: has('XERO_CLIENT_ID') && has('XERO_CLIENT_SECRET') },
    { key: 'clickdrop', label: 'Royal Mail Click & Drop', ok: has('CLICKANDDROP_API_KEY') },
    { key: 'whatsapp',  label: 'WhatsApp alerts',       ok: has('TWILIO_ACCOUNT_SID') && has('TWILIO_AUTH_TOKEN') },
  ];

  return res.status(200).json({ workers, integrations, generated_at: new Date().toISOString() });
};
