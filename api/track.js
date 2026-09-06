/**
 * POST /api/track — first-party beacon (public, no PII).
 * Page view:  { sid, path?, ref?, utm? }      → inserts one row into `visits`.
 *   `utm` is the campaign snapshot for a landing hit (utm_* without the prefix,
 *   plus gclid/fbclid/ttclid/msclkid). Present only on paid/tagged arrivals.
 * Funnel event:{ sid, event, path?, meta? }    → inserts one row into `events`
 *   (event ∈ product_view | add_to_cart | begin_checkout |
 *    payment_method_selected | purchase). Kept in a separate table so it does
 *   not inflate page-view/traffic counts. Optional `meta` (jsonb) carries small
 *   non-PII context, e.g. { method:'fena' }, so per-method funnel drop-off can
 *   be measured. Fire-and-forget.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ALLOWED_EVENTS = new Set(['product_view', 'add_to_cart', 'begin_checkout', 'payment_method_selected', 'purchase']);

// Keep meta tiny and non-PII: only a short string `method`, plus a short `ref`.
function cleanMeta(m) {
  if (!m || typeof m !== 'object') return null;
  const out = {};
  if (m.method != null) out.method = String(m.method).replace(/[^a-z0-9_-]/gi, '').slice(0, 24);
  if (m.ref != null)    out.ref    = String(m.ref).replace(/[^a-z0-9_-]/gi, '').slice(0, 32);
  return Object.keys(out).length ? out : null;
}

// Campaign attribution for a landing hit. This endpoint is public and unsigned,
// so the shape is whitelisted rather than trusted: fixed key set, no nesting,
// hard length caps. Anything else a caller sends is dropped.
const UTM_KEYS = ['source', 'medium', 'campaign', 'content', 'term', 'gclid', 'fbclid', 'ttclid', 'msclkid', 'landing'];
function cleanUtm(u) {
  if (!u || typeof u !== 'object' || Array.isArray(u)) return null;
  const out = {};
  for (const k of UTM_KEYS) {
    if (u[k] == null) continue;
    const v = String(u[k]).replace(/[^\w .:/+-]/g, '').slice(0, 120);
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

module.exports = async function handler(req, res) {
  // Same-origin beacon; respond fast regardless.
  if (req.method !== 'POST') { res.status(405).end(); return; }
  if (!SUPABASE_URL || !SERVICE) { res.status(204).end(); return; }

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  b = b || {};
  const sid = String(b.sid || '').replace(/[^a-z0-9]/gi, '').slice(0, 40);
  if (!sid) { res.status(204).end(); return; }
  const path = b.path ? String(b.path).slice(0, 300) : null;
  const ref  = b.ref ? String(b.ref).slice(0, 300) : null;
  const event = b.event ? String(b.event).slice(0, 40) : null;
  const meta  = cleanMeta(b.meta);
  const utm   = cleanUtm(b.utm);

  // Don't make the visitor wait on the DB write.
  res.status(204).end();
  const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  try {
    if (event && ALLOWED_EVENTS.has(event)) {
      await fetch(`${SUPABASE_URL}/rest/v1/events`, {
        method: 'POST', headers: sbHeaders,
        body: JSON.stringify(meta ? { sid, event, path, meta } : { sid, event, path }),
      });
    } else {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/visits`, {
        method: 'POST', headers: sbHeaders,
        body: JSON.stringify(utm ? { sid, path, ref, utm } : { sid, path, ref }),
      });
      // Self-heal: a `visits` schema drift (e.g. the optional `ref`/`utm` column
      // being dropped/renamed) would otherwise make every insert 400 and silently
      // freeze ALL visit logging. Surface it, then degrade one column at a time
      // rather than straight to the minimum, so a missing `utm` doesn't also cost
      // us `ref`. Last resort is (sid, path); created_at defaults server-side.
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        console.error('[track] visits insert failed', r.status, detail.slice(0, 200));
        if (r.status === 400 || r.status === 404) {
          let ok = false;
          if (utm) {
            const r2 = await fetch(`${SUPABASE_URL}/rest/v1/visits`, {
              method: 'POST', headers: sbHeaders,
              body: JSON.stringify({ sid, path, ref }),
            });
            ok = r2.ok;
          }
          if (!ok) {
            await fetch(`${SUPABASE_URL}/rest/v1/visits`, {
              method: 'POST', headers: sbHeaders,
              body: JSON.stringify({ sid, path }),
            });
          }
        }
      }
    }
  } catch (e) { console.error('[track] beacon error', e && e.message); }
};
