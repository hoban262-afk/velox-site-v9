/**
 * /api/admin/interest — ADMIN ONLY
 *
 * GET  → { products:[{product_slug, total, pending, notified}], recent:[{product_slug,email,created_at,notified_at}] }
 *        (the demand counter — how many researchers want each coming-soon product)
 * POST { action:'notify', product_slug } → emails all not-yet-notified registrants for that
 *        product that it's now available, marks them notified. Returns { ok, sent }.
 */
const { Resend } = require('resend');

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
  const url = `https://veloxpeps.com/compounds/`;
  return `<!DOCTYPE html><html><body style="margin:0;background:#030407;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#030407"><tr><td align="center" style="padding:32px 16px">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#0d0d0d;border:1px solid #1a1a1a;border-radius:8px;overflow:hidden">
  <tr><td style="background:#01D3A0;height:4px;font-size:0;line-height:0">&nbsp;</td></tr>
  <tr><td align="center" style="padding:32px 40px 8px"><img src="https://veloxpeps.com/assets/images/veloxpeps2.png" alt="Velox Peptides" width="160" style="display:block;border:0"></td></tr>
  <tr><td align="center" style="padding:0 40px 8px"><h1 style="margin:0;font-size:24px;color:#fff">${name} is now available</h1></td></tr>
  <tr><td align="center" style="padding:0 40px 24px"><p style="margin:0;font-size:15px;color:#9CA3AF;line-height:1.6">You asked to be told when <strong style="color:#fff">${name}</strong> was in stock for research. It&rsquo;s now live on the Velox Peptides catalogue.</p></td></tr>
  <tr><td align="center" style="padding:0 40px 28px"><a href="${url}" style="display:inline-block;background:#01D3A0;color:#030407;font-weight:700;font-size:15px;padding:14px 32px;border-radius:6px;text-decoration:none">View the catalogue &rarr;</a></td></tr>
  <tr><td style="border-top:1px solid #1a1a1a;padding:18px 40px"><p style="margin:0;font-size:11px;color:#555;line-height:1.6">Velox Peptides &mdash; CRP Labs Ltd &mdash; Company no. NI738125. For in vitro research use only. Not for human or veterinary consumption. You received this because you registered interest at veloxpeps.com.</p></td></tr>
</table></td></tr></table></body></html>`;
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
