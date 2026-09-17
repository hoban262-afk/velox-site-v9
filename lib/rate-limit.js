/**
 * lib/rate-limit.js — shared per-IP throttle for public, unauthenticated endpoints.
 *
 * Backed by the `check_rate_limit(p_key, p_limit, p_window_seconds)` Postgres
 * function, which returns false once the caller is over budget. That function
 * already existed and was used by /api/interest.js and /api/review.js; this
 * module exists so the remaining public endpoints stop hand-rolling it.
 *
 * Lives in /lib (not /api) so it is bundled into callers rather than deployed
 * as its own Vercel serverless function.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Best-effort client IP. Vercel always sets x-forwarded-for. */
function clientIp(req) {
  const fwd = String((req.headers && req.headers['x-forwarded-for']) || '').split(',')[0].trim();
  return fwd || (req.headers && req.headers['x-real-ip']) || 'unknown';
}

/**
 * Consume one unit of budget for `bucket`.
 *
 * @param {string}  bucket         namespace, e.g. 'newsletter-signup'
 * @param {string}  identifier     usually an IP, sometimes an email
 * @param {number}  limit          max hits per window
 * @param {number}  windowSeconds  window length
 * @param {boolean} failOpen       what to do when the check itself errors.
 *   true  — allow the request (availability first; right for low-value actions)
 *   false — deny the request (safety first; right when the action creates an
 *           account, sends mail, or costs money)
 * @returns {Promise<boolean>} true if the request is within budget.
 */
async function allow(bucket, identifier, limit, windowSeconds, failOpen = true) {
  if (!SUPABASE_URL || !SERVICE) return failOpen;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_rate_limit`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_key: `${bucket}:${identifier}`,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      }),
    });
    if (!r.ok) throw new Error(`check_rate_limit -> ${r.status}`);
    // The RPC returns a bare boolean; anything non-false means "within budget".
    const verdict = await r.json();
    return verdict !== false;
  } catch (e) {
    console.error(`[rate-limit] ${bucket} check failed:`, e.message);
    return failOpen;
  }
}

module.exports = { allow, clientIp };
