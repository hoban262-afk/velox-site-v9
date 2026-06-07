/**
 * GET /api/admin/design-lab — ADMIN ONLY
 *
 * Design Lab funnel + usage for the admin dashboard. Reads the service-role-only
 * `design_lab_funnel` view plus run counts and a recent-runs feed. Read-only.
 *   { funnel, runsThisMonth, runsAllTime, sharedRuns, tierBreakdown, recent[], generated_at }
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON         = process.env.SUPABASE_ANON_KEY;

const KNOWN_ADMIN_EMAILS = new Set([
  (process.env.ADMIN_EMAIL || '').toLowerCase(),
  'support@veloxpeps.com',
  'veloxpeps@gmail.com',
].filter(Boolean));

async function isAdmin(req) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token || !SUPABASE_URL) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: ANON || SERVICE || '' },
    });
    if (!r.ok) return false;
    const u = await r.json();
    return !!u && KNOWN_ADMIN_EMAILS.has((u.email || '').toLowerCase());
  } catch { return false; }
}

async function countRuns(sb, filter) {
  const r = await sb(`design_lab_runs?select=id${filter}`, { Prefer: 'count=exact' });
  if (!r.ok) return 0;
  const cr = r.headers.get('content-range');
  if (cr && cr.includes('/')) { const n = parseInt(cr.split('/')[1], 10); if (Number.isFinite(n)) return n; }
  return 0;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'Unauthorized' });

  const sb = (path, extra) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, ...(extra || {}) },
  });

  try {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    const [funnelRes, recentRes, tierRes] = await Promise.all([
      sb('design_lab_funnel?select=*&limit=1'),
      sb('design_lab_runs?select=target,tier_at_run,is_shared,created_at&order=created_at.desc&limit=15'),
      sb('design_lab_runs?select=tier_at_run'),
    ]);

    const funnel = funnelRes.ok ? (await funnelRes.json())[0] || {} : {};
    const recent = recentRes.ok ? await recentRes.json() : [];
    const tierRows = tierRes.ok ? await tierRes.json() : [];

    const [runsThisMonth, runsAllTime] = await Promise.all([
      countRuns(sb, `&created_at=gte.${monthStart}`),
      countRuns(sb, ''),
    ]);

    const tierBreakdown = { free: 0, solo: 0, group: 0, lab: 0, other: 0 };
    (Array.isArray(tierRows) ? tierRows : []).forEach((r) => {
      const t = (r.tier_at_run || 'other').toLowerCase();
      if (tierBreakdown[t] == null) tierBreakdown.other++; else tierBreakdown[t]++;
    });
    const shared = (Array.isArray(recent) ? recent : []).filter((r) => r.is_shared).length;

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      funnel,
      runsThisMonth,
      runsAllTime,
      tierBreakdown,
      recentSharedVisible: shared,
      recent: (Array.isArray(recent) ? recent : []).map((r) => ({
        target: String(r.target || '').slice(0, 120),
        tier: r.tier_at_run || '',
        is_shared: !!r.is_shared,
        created_at: r.created_at,
      })),
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[admin/design-lab]', e.message);
    return res.status(500).json({ error: 'Design Lab query failed' });
  }
};
