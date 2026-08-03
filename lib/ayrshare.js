/**
 * lib/ayrshare.js — thin, fail-safe client for the Ayrshare publishing API.
 *
 * One API, all networks. We only ever call it from an EXECUTOR — i.e. after a
 * human tapped Approve on a social_post card in the Approvals inbox. Nothing here
 * ever auto-publishes on its own.
 *
 * Lives OUTSIDE /api so Vercel never treats it as a serverless function.
 *
 * Env: AYRSHARE_API_KEY (set in Vercel — never in the repo, never in chat).
 *
 * Ayrshare docs: POST https://api.ayrshare.com/api/post
 *   { post, platforms:[...], mediaUrls?:[...], scheduleDate?, ... } (Bearer auth)
 */
const AYRSHARE_KEY = process.env.AYRSHARE_API_KEY;
const API = 'https://api.ayrshare.com/api';

// Platforms we support, matching what Ayrshare expects in the `platforms` array.
const SUPPORTED = new Set(['youtube', 'instagram', 'twitter', 'linkedin', 'facebook', 'pinterest']);

function configured() { return !!AYRSHARE_KEY; }

function normalisePlatforms(list) {
  return [...new Set((Array.isArray(list) ? list : [])
    .map((p) => String(p || '').toLowerCase().trim())
    // accept "x" / "x/twitter" as aliases for twitter
    .map((p) => (p === 'x' || p === 'x/twitter' || p === 'twitter/x') ? 'twitter' : p)
    .filter((p) => SUPPORTED.has(p)))];
}

/**
 * Publish (or schedule) a single post across one or more networks.
 * @param {object} o
 *   post       {string}   the copy                                     [required]
 *   platforms  {string[]} target networks                              [required]
 *   mediaUrls  {string[]} public image/video URLs (some nets require)  (optional)
 *   scheduleDate {string} ISO date to schedule instead of post now     (optional)
 *   platformOptions {object} per-network overrides (title, board, …)   (optional)
 * @returns {Promise<{ok:boolean, id?:string, status?:string, errors?:any, raw?:any}>}
 */
async function publishPost(o) {
  if (!configured()) return { ok: false, errors: 'AYRSHARE_API_KEY not set' };
  const post = String(o && o.post || '').trim();
  const platforms = normalisePlatforms(o && o.platforms);
  if (!post) return { ok: false, errors: 'empty post' };
  if (!platforms.length) return { ok: false, errors: 'no supported platforms' };

  const body = { post, platforms };
  if (Array.isArray(o.mediaUrls) && o.mediaUrls.length) body.mediaUrls = o.mediaUrls.slice(0, 10);
  if (o.scheduleDate) body.scheduleDate = o.scheduleDate;
  if (o.platformOptions && typeof o.platformOptions === 'object') Object.assign(body, o.platformOptions);

  try {
    const r = await fetch(`${API}/post`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${AYRSHARE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => null);
    // Ayrshare returns { status:'success'|'error', id, postIds:[...], errors:[...] }
    const ok = r.ok && d && d.status !== 'error' && !(Array.isArray(d.errors) && d.errors.length);
    return {
      ok: !!ok,
      id: d && (d.id || (Array.isArray(d.postIds) && d.postIds[0] && d.postIds[0].id)),
      status: d && d.status,
      errors: d && d.errors,
      raw: d,
    };
  } catch (e) {
    return { ok: false, errors: e.message };
  }
}

module.exports = { publishPost, normalisePlatforms, configured, SUPPORTED };
