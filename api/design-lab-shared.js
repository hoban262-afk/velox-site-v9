/**
 * GET /api/design-lab-shared — public list of shareable Design Lab runs.
 * Powers the affiliate "Content kit": each run becomes a ready-to-post link the
 * affiliate can stamp with their ?ref= code. Returns light, non-sensitive fields.
 */
const SB_URL  = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
let closestCompound;
try { ({ closestCompound } = require('../lib/design-nurture-emails')); } catch (e) { closestCompound = null; }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://veloxpeps.com');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method' });
  if (!SB_URL || !SERVICE) return res.status(500).json({ error: 'not_configured' });

  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/design_lab_runs?is_shared=eq.true&select=name,target,brief,candidates,share_token,created_at&order=created_at.desc&limit=40`,
      { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }
    );
    const rows = r.ok ? await r.json() : [];
    const designs = (Array.isArray(rows) ? rows : []).filter((x) => x.share_token).map((run) => {
      const cands = Array.isArray(run.candidates) ? run.candidates : [];
      const mech = (run.brief && run.brief.target_mechanism) || run.target || '';
      let closest = null;
      try { const c = closestCompound && closestCompound(run); if (c) closest = c.n; } catch (e) { /* ignore */ }
      return {
        name: run.name || (cands[0] && cands[0].name) || 'Untitled design',
        mech: String(mech).slice(0, 120),
        token: run.share_token,
        closest,
      };
    });
    return res.status(200).json({ designs, generated_at: new Date().toISOString() });
  } catch (e) {
    console.error('[design-lab-shared]', e.message);
    return res.status(502).json({ error: 'query_failed' });
  }
};
