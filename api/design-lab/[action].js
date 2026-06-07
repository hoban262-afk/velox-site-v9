/**
 * /api/design-lab/[action] — the gated Velox Design Lab backend.
 *
 *   GET  /api/design-lab/quota     (auth) → { tier, limit, used, remaining }
 *   POST /api/design-lab/generate  (auth) { target } → { brief, candidates, quota }
 *
 * Runs generation on VELOX's Anthropic key, gated by the signed-in user's Pro
 * tier (free=1 lifetime, solo=4/mo, group=20/mo, lab=unlimited). Every run is
 * recorded in design_lab_usage. All outputs are computational predictions for in
 * vitro research only.
 */
const dl = require('../../lib/design-lab');

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE       = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON          = process.env.SUPABASE_ANON_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

async function authUser(req) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token || !SUPABASE_URL) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: ANON || SERVICE || '' } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? { id: u.id, email: (u.email || '').toLowerCase() } : null;
  } catch { return null; }
}

async function getTier(userId) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&kind=eq.pro&status=eq.active&select=tier&order=created_at.desc&limit=1`, { headers: sbHeaders });
    const rows = r.ok ? await r.json() : [];
    const t = Array.isArray(rows) && rows[0] && rows[0].tier;
    return (t === 'solo' || t === 'group' || t === 'lab') ? t : 'free';
  } catch { return 'free'; }
}

async function usedCount(userId, window) {
  let filter = '';
  if (window === 'month') {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    filter = `&created_at=gte.${start}`;
  }
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/design_lab_usage?user_id=eq.${userId}${filter}&select=id`, { headers: { ...sbHeaders, Prefer: 'count=exact' } });
    if (!r.ok) return 0;
    const cr = r.headers.get('content-range'); // "0-24/25"
    if (cr && cr.includes('/')) { const n = parseInt(cr.split('/')[1], 10); if (Number.isFinite(n)) return n; }
    const rows = await r.json(); return Array.isArray(rows) ? rows.length : 0;
  } catch { return 0; }
}

async function quotaFor(userId) {
  const tier = await getTier(userId);
  const lim = dl.limitsFor(tier);
  const used = await usedCount(userId, lim.window);
  const unlimited = !Number.isFinite(lim.limit);
  return { tier, tierLabel: lim.label, window: lim.window, limit: unlimited ? null : lim.limit, used, remaining: unlimited ? null : Math.max(0, lim.limit - used), unlimited };
}

async function claudeOnce(prompt, maxTokens) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: dl.MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || (d && d.type === 'error')) {
    const msg = (d && d.error && d.error.message) || `Anthropic HTTP ${r.status}`;
    const err = new Error(msg); err.status = r.status; err.transient = r.status === 429 || r.status === 529 || r.status >= 500; throw err;
  }
  const text = ((d && d.content) || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (!text) throw new Error('Empty response from the model');
  return text;
}

// Retry transient Anthropic failures (overloaded / rate-limit / 5xx / network) with backoff.
async function claude(prompt, maxTokens, tries = 2) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await claudeOnce(prompt, maxTokens); }
    catch (e) {
      lastErr = e;
      const retryable = e.transient || /fetch failed|ECONN|ETIMEDOUT|network|socket/i.test(String(e.message || ''));
      if (i < tries - 1 && retryable) { await new Promise((r) => setTimeout(r, 500 * (i + 1) + Math.random() * 300)); continue; }
      throw e;
    }
  }
  throw lastErr;
}

function parseCandidates(raw) {
  let arr = dl.extractJSON(raw);
  if (!Array.isArray(arr) || !arr.length) arr = dl.salvageObjects(raw);
  if (!Array.isArray(arr)) return [];
  return arr.map((c) => ({ ...c, sequence: dl.sanitizeSeq(c.sequence) }))
    .filter((c) => c.sequence && c.sequence.length >= 4 && c.sequence.length <= 26)
    .map((c) => ({ ...c, scores: dl.score(c.sequence), novelty: dl.checkNovelty(c.sequence) }));
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  const action = String((req.query && req.query.action) || '').toLowerCase();

  const user = await authUser(req);
  if (!user) return res.status(401).json({ error: 'Please sign in to use Velox Design Lab.' });

  if (action === 'quota') {
    return res.status(200).json(await quotaFor(user.id));
  }

  if (action === 'generate') {
    if (req.method !== 'POST') return res.status(405).end();
    if (!ANTHROPIC_KEY) return res.status(503).json({ error: 'Design Lab is not configured yet.' });
    const target = String((req.body && req.body.target) || '').trim();
    if (target.length < 6) return res.status(400).json({ error: 'Describe your research target in a sentence or two.' });
    if (target.length > 1200) return res.status(400).json({ error: 'Please keep the description under 1200 characters.' });

    const q = await quotaFor(user.id);
    if (!q.unlimited && q.remaining <= 0) {
      return res.status(403).json({ error: 'limit_reached', message: `You've used all ${q.limit} of your ${q.tierLabel} designs ${q.window === 'month' ? 'this month' : ''}. Upgrade your Velox Pro tier for more.`, quota: q });
    }

    // Brief stage: best-effort. We NEVER reject the user over wording — if the model's
    // brief can't be parsed (or the model is briefly down), we synthesise a minimal brief
    // straight from their own words and proceed to generation anyway.
    let brief, candidates = [];
    try {
      const briefRaw = await claude(dl.briefPrompt(target), 1400);
      brief = dl.extractJSON(briefRaw) || (dl.salvageObjects(briefRaw) || [])[0];
    } catch (e) {
      console.error('[design-lab] brief stage error (falling back to raw target):', e && e.message);
    }
    if (!brief || typeof brief !== 'object' || Array.isArray(brief)) {
      brief = { target_mechanism: target, desired_properties: [], reference_compounds: [], optimal_length: { min: 6, max: 20 }, key_residues: [], design_rationale: '', scaffold_classes: [] };
    }

    // Generate, with one full re-roll if the first attempt yields no usable candidates.
    let genErr;
    for (let attempt = 0; attempt < 2 && !candidates.length; attempt++) {
      try {
        const raw = await claude(dl.generatePrompt(brief), 5200);
        candidates = parseCandidates(raw);
        if (!candidates.length) console.error(`[design-lab] generate attempt ${attempt + 1}: 0 candidates from ${raw.length} chars`);
      } catch (e) {
        genErr = e;
        console.error(`[design-lab] generate attempt ${attempt + 1} failed:`, e && e.message);
      }
    }
    if (!candidates.length) {
      return res.status(502).json({ error: 'The designer hiccuped on that one — please try again.', detail: genErr && genErr.message });
    }

    // Record the run (counts against quota).
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/design_lab_usage`, {
        method: 'POST', headers: { ...sbHeaders, Prefer: 'return=minimal' },
        body: JSON.stringify({ user_id: user.id, target: target.slice(0, 500), candidate_count: candidates.length, tier_at_run: q.tier }),
      });
    } catch (e) { /* best-effort */ }

    const after = await quotaFor(user.id);
    return res.status(200).json({ brief, candidates, quota: after });
  }

  return res.status(404).json({ error: 'Unknown action' });
};
