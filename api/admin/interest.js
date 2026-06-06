/**
 * /api/admin/interest — ADMIN ONLY
 *
 * GET  → { products:[{product_slug, total, pending, notified}], recent:[{product_slug,email,created_at,notified_at}] }
 *        (the demand counter — how many researchers want each coming-soon product)
 * POST { action:'notify', product_slug } → emails all not-yet-notified registrants for that
 *        product that it's now available, marks them notified. Returns { ok, sent }.
 */
const { Resend } = require('resend');
const { renderEmail, emailParagraph } = require('../../lib/email-layout');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON         = process.env.SUPABASE_ANON_KEY;

const KNOWN_ADMIN_EMAILS = new Set([
  (process.env.ADMIN_EMAIL || '').toLowerCase(),
  'support@veloxpeps.com', 'veloxpeps@gmail.com',
].filter(Boolean));

// Pretty product names for the notification email (falls back to a title-cased slug).
const NAMES = {
  'ipamorelin': 'Ipamorelin',
  'epitalon': 'Epitalon (Epithalon)',
};
function pretty(slug) {
  return NAMES[slug] || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

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

const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

function notifyHtml(name) {
  return renderEmail({
    kicker: 'Back in stock',
    heading: `${name} is now available`,
    bodyHtml: emailParagraph(`You asked to be told when <strong style="color:#fff">${name}</strong> was in stock for research. It&rsquo;s now live on the Velox Peptides catalogue.`),
    cta: { href: 'https://veloxpeps.com/compounds/', label: 'VIEW THE CATALOGUE →' },
    preheader: `${name} is now available at Velox Peptides.`,
  });
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Not configured' });
  if (!(await isAdmin(req))) return res.status(401).json({ error: 'Unauthorized' });

  // ── GET: counts + recent ──────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/interest_registrations?select=product_slug,email,created_at,notified_at&order=created_at.desc`, { headers: sbHeaders });
      if (!r.ok) return res.status(502).json({ error: 'fetch failed' });
      const rows = await r.json();
      const agg = {};
      for (const row of rows) {
        const s = row.product_slug;
        agg[s] = agg[s] || { product_slug: s, name: pretty(s), total: 0, notified: 0, pending: 0 };
        agg[s].total++;
        if (row.notified_at) agg[s].notified++; else agg[s].pending++;
      }
      const products = Object.values(agg).sort((a, b) => b.total - a.total);
      return res.status(200).json({ products, recent: rows.slice(0, 50), generated_at: new Date().toISOString() });
    } catch (e) {
      console.error('[admin/interest GET]', e.message);
      return res.status(500).json({ error: 'Interest query failed' });
    }
  }

  // ── POST: notify a product's waitlist ───────────────────────────────────────
  if (req.method === 'POST') {
    const slug = String((req.body || {}).product_slug || '').trim().toLowerCase();
    if (!slug) return res.status(400).json({ error: 'Missing product_slug' });
    if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY not set' });
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/interest_registrations?product_slug=eq.${encodeURIComponent(slug)}&notified_at=is.null&select=id,email`, { headers: sbHeaders });
      if (!r.ok) return res.status(502).json({ error: 'fetch failed' });
      const rows = await r.json();
      if (!rows.length) return res.status(200).json({ ok: true, sent: 0, message: 'No one waiting to notify.' });

      const resend = new Resend(process.env.RESEND_API_KEY);
      const html = notifyHtml(pretty(slug));
      let sent = 0;
      const ids = [];
      for (const row of rows) {
        try {
          await resend.emails.send({
            from: 'Velox Peptides <orders@veloxpeps.com>',
            to: row.email,
            subject: `${pretty(slug)} is now available — Velox Peptides`,
            html,
          });
          sent++; ids.push(row.id);
        } catch (e) { console.error('[admin/interest] send failed', row.email, e.message); }
      }
      // Mark the ones we emailed as notified.
      if (ids.length) {
        const idList = ids.map((x) => `"${x}"`).join(',');
        await fetch(`${SUPABASE_URL}/rest/v1/interest_registrations?id=in.(${idList})`, {
          method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
          body: JSON.stringify({ notified_at: new Date().toISOString() }),
        });
      }
      return res.status(200).json({ ok: true, sent });
    } catch (e) {
      console.error('[admin/interest POST]', e.message);
      return res.status(500).json({ error: 'Notify failed' });
    }
  }

  return res.status(405).end();
};
