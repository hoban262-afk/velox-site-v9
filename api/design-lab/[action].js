/**
 * /api/design-lab/[action] — the gated Velox Design Lab backend.
 *
 *   GET  /api/design-lab/quota          (auth) → { tier, limit, used, remaining, refinementsUsed, refinementLimit }
 *   POST /api/design-lab/generate       (auth) { target } → { runId, brief, candidates, quota }
 *   GET  /api/design-lab/runs           (auth) → [{ id, name, target, candidates, created_at, is_shared }]
 *   GET  /api/design-lab/run?r=TOKEN    (public) → { run } — shared run view
 *   GET  /api/design-lab/run?id=ID      (auth)   → { run } — own run by id
 *   PATCH /api/design-lab/run          (auth) { id, name?, is_shared? } → { run }
 *   DELETE /api/design-lab/run         (auth) { id } → { ok }
 *   POST /api/design-lab/refine        (auth) { runId, candidateId, instruction } → { candidates, refinementsRemaining }
 *   POST /api/design-lab/synthesis     (any)  { sequence, ... } → { id }
 *
 * Runs generation on VELOX's Anthropic key, gated by the signed-in user's Pro
 * tier (free=1 lifetime, solo=4/mo, group=20/mo, lab=unlimited).
 * Refinement limits: free=1/mo, solo=3/mo, group=5/mo, lab=10/mo.
 * All outputs are computational predictions for in vitro research only.
 */
const dl = require('../../lib/design-lab');

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE       = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON          = process.env.SUPABASE_ANON_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const sbH = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

// ── Refinement quota limits per tier ─────────────────────────────────────────
const REFINE_LIMITS = { free: 1, solo: 3, group: 5, lab: 10 };

// ── Auth ──────────────────────────────────────────────────────────────────────
async function authUser(req) {
  const token = (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!token || !SUPABASE_URL) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: ANON || SERVICE || '' },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? { id: u.id, email: (u.email || '').toLowerCase(), token } : null;
  } catch { return null; }
}

// ── Tier helpers ──────────────────────────────────────────────────────────────
async function getTier(userId) {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&kind=eq.pro&status=eq.active&select=tier&order=created_at.desc&limit=1`,
      { headers: sbH }
    );
    const rows = r.ok ? await r.json() : [];
    const t = Array.isArray(rows) && rows[0] && rows[0].tier;
    return (t === 'solo' || t === 'group' || t === 'lab') ? t : 'free';
  } catch { return 'free'; }
}

async function usedCount(userId, window, table = 'design_lab_usage') {
  let filter = '';
  if (window === 'month') {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    filter = `&created_at=gte.${start}`;
  }
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${userId}${filter}&select=id`,
      { headers: { ...sbH, Prefer: 'count=exact' } }
    );
    if (!r.ok) return 0;
    const cr = r.headers.get('content-range');
    if (cr && cr.includes('/')) { const n = parseInt(cr.split('/')[1], 10); if (Number.isFinite(n)) return n; }
    const rows = await r.json(); return Array.isArray(rows) ? rows.length : 0;
  } catch { return 0; }
}

async function quotaFor(userId) {
  const tier = await getTier(userId);
  const lim = dl.limitsFor(tier);
  const used = await usedCount(userId, lim.window, 'design_lab_usage');
  const unlimited = !Number.isFinite(lim.limit);
  const refineLimit = REFINE_LIMITS[tier] ?? REFINE_LIMITS.free;
  const refineUsed = await usedCount(userId, 'month', 'design_lab_refinements');
  return {
    tier, tierLabel: lim.label, window: lim.window,
    limit: unlimited ? null : lim.limit, used,
    remaining: unlimited ? null : Math.max(0, lim.limit - used),
    unlimited,
    refineLimit, refineUsed,
    refineRemaining: Math.max(0, refineLimit - refineUsed),
  };
}

// ── Anthropic call ────────────────────────────────────────────────────────────
async function claudeOnce(prompt, maxTokens) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: dl.MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok || (d && d.type === 'error')) {
    const msg = (d && d.error && d.error.message) || `Anthropic HTTP ${r.status}`;
    const err = new Error(msg); err.status = r.status;
    err.transient = r.status === 429 || r.status === 529 || r.status >= 500; throw err;
  }
  const text = ((d && d.content) || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (!text) throw new Error('Empty response from the model');
  return text;
}

async function claude(prompt, maxTokens, tries = 2) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try { return await claudeOnce(prompt, maxTokens); }
    catch (e) {
      lastErr = e;
      const retryable = e.transient || /fetch failed|ECONN|ETIMEDOUT|network|socket/i.test(String(e.message || ''));
      if (i < tries - 1 && retryable) { await new Promise((r) => setTimeout(r, 600 * (i + 1) + Math.random() * 400)); continue; }
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

// ── Supabase helpers ──────────────────────────────────────────────────────────
async function sbFetch(path, opts = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: { ...sbH, ...(opts.headers || {}) },
  });
}

async function saveRun({ userId, target, brief, candidates, tier, sid }) {
  const r = await sbFetch('design_lab_runs', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: userId, target: target.slice(0, 1000), brief, candidates, tier_at_run: tier, sid: sid || null }),
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return Array.isArray(rows) ? rows[0] : rows;
}

async function recordUsage(userId, target, candidateCount, tier) {
  await sbFetch('design_lab_usage', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: userId, target: target.slice(0, 500), candidate_count: candidateCount, tier_at_run: tier }),
  });
}

// ── Handler ────────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  const action = String((req.query && req.query.action) || '').toLowerCase();
  const method = req.method || 'GET';

  // ── quota ──────────────────────────────────────────────────────────────────
  if (action === 'quota') {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in.' });
    return res.status(200).json(await quotaFor(user.id));
  }

  // ── generate ───────────────────────────────────────────────────────────────
  if (action === 'generate') {
    if (method !== 'POST') return res.status(405).end();
    if (!ANTHROPIC_KEY) return res.status(503).json({ error: 'Design Lab is not configured yet.' });
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in to use Velox Design Lab.' });

    const target = String((req.body && req.body.target) || '').trim();
    if (target.length < 6) return res.status(400).json({ error: 'Describe your research target in a sentence or two.' });
    if (target.length > 1200) return res.status(400).json({ error: 'Please keep the description under 1200 characters.' });

    const q = await quotaFor(user.id);
    if (!q.unlimited && q.remaining <= 0) {
      return res.status(403).json({
        error: 'limit_reached',
        message: `You've used all ${q.limit} of your ${q.tierLabel} designs${q.window === 'month' ? ' this month' : ''}. Upgrade your Velox Pro tier for more.`,
        quota: q,
      });
    }

    // Brief stage
    let brief;
    try {
      const briefRaw = await claude(dl.briefPrompt(target), 700);
      brief = dl.extractJSON(briefRaw) || (dl.salvageObjects(briefRaw) || [])[0];
      if (!brief) throw new Error('Could not interpret that target — try rephrasing it.');
    } catch (e) {
      console.error('[design-lab] brief stage failed:', e && e.message);
      return res.status(502).json({ error: "Couldn't read that target — please rephrase and try again." });
    }

    // Generate stage (one re-roll if 0 usable candidates)
    let candidates = [], genErr;
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
      return res.status(502).json({ error: 'The designer hiccuped — please try again.', detail: genErr && genErr.message });
    }

    // Record usage and save the run (parallel)
    const sid = String((req.body && req.body.sid) || '').replace(/[^a-z0-9]/gi, '').slice(0, 40) || null;
    const [, savedRun] = await Promise.allSettled([
      recordUsage(user.id, target, candidates.length, q.tier),
      saveRun({ userId: user.id, target, brief, candidates, tier: q.tier, sid }),
    ]);

    const run = savedRun.status === 'fulfilled' ? savedRun.value : null;
    const after = await quotaFor(user.id);
    return res.status(200).json({ runId: run && run.id, shareToken: run && run.share_token, brief, candidates, quota: after });
  }

  // ── runs (list library) ────────────────────────────────────────────────────
  if (action === 'runs') {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in.' });
    try {
      const r = await sbFetch(
        `design_lab_runs?user_id=eq.${user.id}&select=id,name,target,is_shared,share_token,tier_at_run,created_at,candidates&order=created_at.desc&limit=50`
      );
      const rows = r.ok ? await r.json() : [];
      // Return light version — strip full candidate detail for list view
      const list = (Array.isArray(rows) ? rows : []).map((row) => ({
        ...row,
        candidates: Array.isArray(row.candidates)
          ? row.candidates.map(({ id, name, sequence, scores, novelty }) => ({ id, name, sequence, scores, novelty }))
          : [],
      }));
      return res.status(200).json({ runs: list });
    } catch (e) {
      return res.status(502).json({ error: 'Could not load library.' });
    }
  }

  // ── run (get one — own by id or shared by token) ───────────────────────────
  if (action === 'run' && method === 'GET') {
    const { r: shareToken, id: runId } = req.query || {};
    if (shareToken) {
      // Public shared view — no auth required
      const r = await sbFetch(`design_lab_runs?share_token=eq.${shareToken}&is_shared=eq.true&select=*&limit=1`);
      const rows = r.ok ? await r.json() : [];
      const run = Array.isArray(rows) && rows[0];
      if (!run) return res.status(404).json({ error: 'Run not found or not shared.' });
      return res.status(200).json({ run });
    }
    if (runId) {
      const user = await authUser(req);
      if (!user) return res.status(401).json({ error: 'Please sign in.' });
      const r = await sbFetch(`design_lab_runs?id=eq.${runId}&user_id=eq.${user.id}&select=*&limit=1`);
      const rows = r.ok ? await r.json() : [];
      const run = Array.isArray(rows) && rows[0];
      if (!run) return res.status(404).json({ error: 'Run not found.' });
      return res.status(200).json({ run });
    }
    return res.status(400).json({ error: 'Provide ?r=shareToken or ?id=runId' });
  }

  // ── run (update — name or share toggle) ───────────────────────────────────
  if (action === 'run' && method === 'PATCH') {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in.' });
    const { id, name, is_shared } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Missing run id.' });
    const patch = {};
    if (typeof name === 'string') patch.name = name.slice(0, 120);
    if (typeof is_shared === 'boolean') patch.is_shared = is_shared;
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update.' });
    const r = await sbFetch(
      `design_lab_runs?id=eq.${id}&user_id=eq.${user.id}`,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) }
    );
    const rows = r.ok ? await r.json() : [];
    const run = Array.isArray(rows) && rows[0];
    if (!run) return res.status(404).json({ error: 'Run not found.' });
    return res.status(200).json({ run });
  }

  // ── run (delete) ───────────────────────────────────────────────────────────
  if (action === 'run' && method === 'DELETE') {
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in.' });
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Missing run id.' });
    await sbFetch(`design_lab_runs?id=eq.${id}&user_id=eq.${user.id}`, { method: 'DELETE' });
    return res.status(200).json({ ok: true });
  }

  // ── refine ─────────────────────────────────────────────────────────────────
  if (action === 'refine') {
    if (method !== 'POST') return res.status(405).end();
    if (!ANTHROPIC_KEY) return res.status(503).json({ error: 'Design Lab is not configured yet.' });
    const user = await authUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in.' });

    const { runId, candidateId, instruction } = req.body || {};
    if (!instruction || String(instruction).trim().length < 3) return res.status(400).json({ error: 'Describe what to change.' });

    const q = await quotaFor(user.id);
    if (q.refineRemaining <= 0) {
      return res.status(403).json({
        error: 'refine_limit',
        message: `You've used all ${q.refineLimit} refinements for your ${q.tierLabel} tier this month.`,
        quota: q,
      });
    }

    // Fetch the parent run to get the brief + candidate being refined
    let parentBrief = null, parentCandidate = null;
    if (runId) {
      const r = await sbFetch(`design_lab_runs?id=eq.${runId}&user_id=eq.${user.id}&select=brief,candidates&limit=1`);
      const rows = r.ok ? await r.json() : [];
      const run = Array.isArray(rows) && rows[0];
      if (run) {
        parentBrief = run.brief;
        if (candidateId && Array.isArray(run.candidates)) {
          parentCandidate = run.candidates.find((c) => c.id === candidateId) || null;
        }
      }
    }

    let candidates = [];
    try {
      const raw = await claude(dl.refinePrompt(parentBrief, parentCandidate, String(instruction).trim()), 3500);
      candidates = parseCandidates(raw);
      if (!candidates.length) throw new Error('No usable sequences in refinement output.');
    } catch (e) {
      console.error('[design-lab] refine failed:', e && e.message);
      return res.status(502).json({ error: 'Refinement failed — please try again or rephrase.' });
    }

    // Record the refinement
    await sbFetch('design_lab_refinements', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: user.id, run_id: runId || null, instruction: String(instruction).trim().slice(0, 500),
        parent_candidate_id: candidateId || null, candidates, tier_at_run: q.tier,
      }),
    });

    const after = await quotaFor(user.id);
    return res.status(200).json({ candidates, quota: after });
  }

  // ── synthesis enquiry ──────────────────────────────────────────────────────
  if (action === 'synthesis') {
    if (method !== 'POST') return res.status(405).end();
    const user = await authUser(req).catch(() => null);
    const body = req.body || {};
    const { email, full_name, sequence, candidate_name, candidate_data, quantity_mg, purity, modifications, notes } = body;
    if (!email || !sequence) return res.status(400).json({ error: 'Email and sequence are required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email.' });

    try {
      const r = await sbFetch('synthesis_enquiries', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          user_id: user ? user.id : null, email, full_name: full_name || null,
          sequence: String(sequence).replace(/[^ACDEFGHIKLMNPQRSTVWY]/gi, '').toUpperCase().slice(0, 60),
          candidate_name: candidate_name || null, candidate_data: candidate_data || null,
          quantity_mg: quantity_mg ? parseInt(quantity_mg, 10) : null,
          purity: purity || null,
          modifications: Array.isArray(modifications) ? modifications : [],
          notes: notes ? String(notes).slice(0, 2000) : null,
        }),
      });
      if (!r.ok) throw new Error('DB insert failed');
      const rows = await r.json();
      const enquiry = Array.isArray(rows) ? rows[0] : rows;

      // Fire notification email via send-order mailer (best-effort)
      try {
        const INTERNAL = process.env.INTERNAL_TASK_SECRET;
        if (INTERNAL) {
          await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://veloxpeps.com'}/api/send-order`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-secret': INTERNAL },
            body: JSON.stringify({
              _type: 'synthesis_enquiry',
              enquiry_id: enquiry && enquiry.id,
              email, full_name, sequence, candidate_name, quantity_mg, purity, modifications, notes,
            }),
          });
        }
      } catch { /* best-effort */ }

      return res.status(200).json({ ok: true, id: enquiry && enquiry.id });
    } catch (e) {
      console.error('[design-lab/synthesis]', e.message);
      return res.status(502).json({ error: 'Could not save your enquiry — please try again.' });
    }
  }

  return res.status(404).json({ error: 'Unknown action' });
};
