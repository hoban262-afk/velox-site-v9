/**
 * GET /api/admin/journeys?days=30 — ADMIN ONLY
 *
 * Per-order pre-purchase journeys for the admin "Journeys" tab:
 * for each recent order, the referral source, landing page, and the full
 * page-by-page path the visitor took before ordering.
 *
 * Matching:
 *   - exact:  order.sid (captured at checkout since Jun 2026) → visits/events by sid
 *   - approx: older orders without sid → nearest begin_checkout event within
 *             ±45 min of order creation, then that event's sid
 *   - none:   no session data found
 *
 * Read-only, service-role. No PII beyond what orders already hold.
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

const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

async function sb(pathAndQuery) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, { headers: sbHeaders });
  if (!r.ok) throw new Error(`supabase ${r.status} on ${pathAndQuery.split('?')[0]}`);
  return r.json();
}

// Normalise a referrer into a readable source bucket (same buckets as stats.js).
function refSource(ref) {
  if (!ref) return 'Direct / none';
  try {
    const u = new URL(ref);
    const h = u.hostname.replace(/^www\./, '');
    if (/google\./.test(h))               return 'Google';
    if (/bing\./.test(h))                 return 'Bing';
    if (/duckduckgo\./.test(h))           return 'DuckDuckGo';
    if (/chatgpt\.|openai\./.test(h))     return 'ChatGPT';
    if (/perplexity\./.test(h))           return 'Perplexity';
    if (/instagram\./.test(h))            return 'Instagram';
    if (/t\.co$|twitter\.|x\.com/.test(h))return 'X / Twitter';
    if (/facebook\.|fb\./.test(h))        return 'Facebook';
    if (/reddit\./.test(h))               return 'Reddit';
    if (/t\.me$|telegram\./.test(h))      return 'Telegram';
    if (/discord\./.test(h))              return 'Discord';
    if (/youtube\.|youtu\.be/.test(h))    return 'YouTube';
    if (/fena\./.test(h))                 return 'Fena (payment return)';
    if (/veloxpeps\.com/.test(h))         return 'Internal';
    return h;
  } catch { return String(ref).slice(0, 40); }
}

function buildJourney(rows) {
  // rows: visits for one sid, ascending. Collapse consecutive duplicates.
  const steps = [];
  let firstExternalRef = '';
  for (const v of rows) {
    if (!firstExternalRef && v.ref && !/veloxpeps\.com/.test(v.ref)) firstExternalRef = v.ref;
    const last = steps[steps.length - 1];
    if (last && last.path === v.path) { last.views++; continue; }
    steps.push({ path: v.path, at: v.created_at, views: 1 });
  }
  const first = rows[0], last = rows[rows.length - 1];
  return {
    source:      refSource(firstExternalRef),
    sourceRef:   firstExternalRef || null,
    landing:     first ? first.path : null,
    steps:       steps.slice(0, 60),
    pageviews:   rows.length,
    firstSeen:   first ? first.created_at : null,
    lastSeen:    last ? last.created_at : null,
    durationMin: (first && last) ? Math.round((new Date(last.created_at) - new Date(first.created_at)) / 60000) : null,
  };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'supabase env missing' });
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'unauthorised' });

  const days  = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
  const since = new Date(Date.now() - days * 864e5).toISOString();

  try {
    const orders = await sb(
      `orders?created_at=gte.${since}` +
      `&select=id,created_at,customer_name,customer_email,total,status,payment_method,sid,affiliate_code_used,welcome_code` +
      `&order=created_at.desc&limit=60`
    );

    // Approx-match orders without sid via begin_checkout events near order time.
    const noSid = orders.filter(o => !o.sid);
    let checkoutEvents = [];
    if (noSid.length) {
      const oldest = new Date(Math.min(...noSid.map(o => +new Date(o.created_at))) - 45 * 60000).toISOString();
      checkoutEvents = await sb(
        `events?event=eq.begin_checkout&created_at=gte.${oldest}&select=sid,created_at&order=created_at.asc&limit=1000`
      );
    }
    const matches = {}; // orderId -> { sid, how }
    for (const o of orders) {
      if (o.sid) { matches[o.id] = { sid: o.sid, how: 'exact' }; continue; }
      const t = +new Date(o.created_at);
      let best = null, bestGap = 45 * 60000 + 1;
      for (const ev of checkoutEvents) {
        const gap = Math.abs(+new Date(ev.created_at) - t);
        if (gap < bestGap) { best = ev; bestGap = gap; }
      }
      if (best) matches[o.id] = { sid: best.sid, how: 'approx' };
    }

    // Batch-fetch visits for every matched sid.
    const sids = [...new Set(Object.values(matches).map(m => m.sid))];
    let visitsBySid = {};
    if (sids.length) {
      const list = sids.map(s => `"${String(s).replace(/[^\w-]/g, '')}"`).join(',');
      const visits = await sb(
        `visits?sid=in.(${list})&select=sid,path,ref,created_at&order=created_at.asc&limit=5000`
      );
      for (const v of visits) (visitsBySid[v.sid] = visitsBySid[v.sid] || []).push(v);
    }

    const out = orders.map(o => {
      const m = matches[o.id];
      const rows = m ? (visitsBySid[m.sid] || []) : [];
      return {
        id: o.id, created_at: o.created_at,
        customer_name: o.customer_name, customer_email: o.customer_email,
        total: o.total, status: o.status, payment_method: o.payment_method,
        affiliate_code_used: o.affiliate_code_used, welcome_code: o.welcome_code,
        match: m ? m.how : 'none',
        journey: rows.length ? buildJourney(rows) : null,
      };
    });

    // Source rollup for the header strip.
    const bySource = {};
    for (const o of out) {
      const s = o.journey ? o.journey.source : 'Unknown (no session data)';
      (bySource[s] = bySource[s] || { orders: 0, revenue: 0 });
      bySource[s].orders++; bySource[s].revenue += Number(o.total) || 0;
    }

    return res.status(200).json({ days, orders: out, bySource });
  } catch (e) {
    console.error('[admin/journeys]', e.message);
    return res.status(500).json({ error: e.message });
  }
};
