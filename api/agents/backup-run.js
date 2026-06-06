/**
 * GET/POST /api/agents/backup-run — weekly off-site backup of your business data.
 *
 * Exports the irreplaceable tables (orders, subscribers, catalogue, affiliates,
 * discount codes) to a single JSON file and emails it to the owner, so there's
 * always a copy outside Supabase. NEVER includes secrets (integration_tokens),
 * auth (profiles), or device push tokens.
 *
 * This supplements — does not replace — Supabase's own backups. Auth matches the
 * other cron workers (CRON_SECRET / INTERNAL_TASK_SECRET).
 */
const { Resend } = require('resend');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OWNER_EMAIL  = (process.env.BACKUP_EMAIL || process.env.ADMIN_EMAIL || 'veloxpeps@gmail.com').toLowerCase();
const FROM         = process.env.BACKUP_FROM || 'Velox Peptides <orders@veloxpeps.com>';
const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

// Curated: business records worth keeping. No secrets, no auth, no big log tables.
const TABLES = ['orders', 'subscribers', 'product_variants', 'affiliates', 'newsletter_codes', 'recovery_codes'];

function authorised(req) {
  const auth = req.headers['authorization'] || '';
  const internal = req.headers['x-internal-secret'] || '';
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (process.env.INTERNAL_TASK_SECRET && internal === process.env.INTERNAL_TASK_SECRET) return true;
  if (!process.env.CRON_SECRET && !process.env.INTERNAL_TASK_SECRET) return true;
  return false;
}

async function dumpTable(t) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${t}?select=*`, { headers: sbHeaders });
    return r.ok ? await r.json() : { error: `HTTP ${r.status}` };
  } catch (e) { return { error: e.message }; }
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not set' });

  const stamp = new Date().toISOString().slice(0, 10);
  const data = { generated_at: new Date().toISOString(), tables: {} };
  const counts = {};
  for (const t of TABLES) {
    const rows = await dumpTable(t);
    data.tables[t] = rows;
    counts[t] = Array.isArray(rows) ? rows.length : 0;
  }

  const json = JSON.stringify(data, null, 2);
  const summary = Object.entries(counts).map(([t, c]) => `${t}: ${c}`).join(' · ');

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: FROM,
      to: OWNER_EMAIL,
      subject: `Velox data backup — ${stamp}`,
      html: `<p>Weekly Velox backup attached (<code>velox-backup-${stamp}.json</code>).</p>
             <p><strong>Rows:</strong> ${summary}</p>
             <p style="color:#888;font-size:12px">Keep this email — it's your off-site copy. Secrets and login data are deliberately excluded.</p>`,
      attachments: [{ filename: `velox-backup-${stamp}.json`, content: Buffer.from(json, 'utf-8') }],
    });
  } catch (e) {
    console.error('[backup-run] email failed', e.message);
    return res.status(502).json({ error: 'Backup email failed: ' + e.message });
  }

  return res.status(200).json({ ok: true, counts, emailed_to: OWNER_EMAIL });
};
