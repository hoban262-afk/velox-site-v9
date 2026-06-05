/**
 * GET/POST /api/recovery/restock-run — automated back-in-stock cron worker
 *
 * Compares each product's current stock against the stock_state snapshot. When a
 * product flips out-of-stock -> in-stock, it emails everyone on that product's
 * interest_registrations waitlist (who hasn't been notified) and marks them
 * notified. Then it refreshes the snapshot.
 *
 * First-ever run just seeds the snapshot (no prior state = no blast).
 * Auth + suppression match the other recovery workers.
 */
const crypto = require('crypto');
const { sendMail } = require('../../lib/mail');
const { recordRun } = require('../../lib/worker-log');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SITE         = process.env.NEXT_PUBLIC_SITE_URL || 'https://veloxpeps.com';
const MAX_EMAILS   = 200;

function authorised(req) {
  const auth = req.headers['authorization'] || '';
  const internal = req.headers['x-internal-secret'] || '';
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (process.env.INTERNAL_TASK_SECRET && internal === process.env.INTERNAL_TASK_SECRET) return true;
  return false;
}

const sbHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };
async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders });
  if (!r.ok) throw new Error(`Supabase GET ${path} -> ${r.status}`);
  return r.json();
}

function signEmailToken(email) {
  const e = String(email).toLowerCase();
  const sig = crypto.createHmac('sha256', SERVICE).update(e).digest('hex').slice(0, 32);
  return `${Buffer.from(e, 'utf-8').toString('base64url')}.${sig}`;
}

function pretty(slug, name) {
  if (name) return name;
  return String(slug).replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function isUnsubscribed(email) {
  const e = encodeURIComponent(String(email).toLowerCase());
  try {
    const [a, b] = await Promise.all([
      sbGet(`subscribers?email=eq.${e}&unsubscribed_at=not.is.null&select=email&limit=1`).catch(() => []),
      sbGet(`newsletter_codes?email=eq.${e}&unsubscribed_at=not.is.null&select=email&limit=1`).catch(() => []),
    ]);
    return (Array.isArray(a) && a.length) || (Array.isArray(b) && b.length);
  } catch { return false; }
}

function restockHtml(name, slug, unsubUrl) {
  const url = `${SITE}/compounds/${slug}/`;
  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"></head>' +
  '<body style="margin:0;padding:0;background:#030407;font-family:Arial,Helvetica,sans-serif">' +
  '<table width="100%" cellpadding="0" cellspacing="0" style="background:#030407"><tr><td style="padding:32px 16px">' +
  '<table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#0d1117;border:1px solid rgba(1,211,160,.2);border-radius:12px;overflow:hidden">' +
    '<tr><td style="background:#01D3A0;height:4px;font-size:0;line-height:0">&nbsp;</td></tr>' +
    '<tr><td style="padding:30px 32px 6px"><div style="font-size:20px;font-weight:800;color:#fff;letter-spacing:.04em">VELOX PEPTIDES</div>' +
      '<div style="font-size:11px;color:#01D3A0;letter-spacing:.14em;text-transform:uppercase;margin-top:4px">Back in stock</div></td></tr>' +
    '<tr><td style="padding:16px 32px 8px"><h1 style="font-size:23px;color:#fff;margin:0 0 10px">' + name + ' is back in stock</h1>' +
      '<p style="font-size:14px;color:#9CA3AF;line-height:1.65;margin:0 0 20px">You asked to be told when <strong style="color:#fff">' + name + '</strong> was available again. It&rsquo;s live now &mdash; HPLC-verified with a batch-specific CoA. Stock can move fast, so don&rsquo;t wait too long.</p>' +
      '<a href="' + url + '" style="display:inline-block;background:#01D3A0;color:#021;text-decoration:none;font-weight:700;font-size:14px;padding:13px 28px;border-radius:8px">Shop ' + name + ' &rarr;</a></td></tr>' +
    '<tr><td style="border-top:1px solid #1a1a1a;padding:18px 32px;margin-top:18px">' +
      '<p style="font-size:11px;color:#6B7280;line-height:1.6;margin:0">Velox Peptides &middot; CRP Labs Ltd, Northern Ireland (NI738125). For research use only. Not for human or veterinary consumption. ' +
      '<a href="' + unsubUrl + '" style="color:#6B7280;text-decoration:underline">Unsubscribe</a>.</p></td></tr>' +
  '</table></td></tr></table></body></html>';
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Supabase not configured' });
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorised' });
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'Resend not configured' });

  const summary = { products_checked: 0, flipped: 0, emailed: 0, skipped_unsub: 0, seeded: false, errors: 0 };

  // 1) Current stock per product (in stock if ANY variant is in stock).
  let variants = [];
  try { variants = await sbGet('product_variants?select=slug,name,in_stock'); }
  catch (e) { return res.status(500).json({ error: 'variants query failed', detail: e.message }); }

  const cur = {};   // slug -> { in_stock, name }
  for (const v of variants) {
    const s = v.slug;
    if (!cur[s]) cur[s] = { in_stock: false, name: v.name };
    if (v.in_stock) cur[s].in_stock = true;
    if (v.name && !cur[s].name) cur[s].name = v.name;
  }
  summary.products_checked = Object.keys(cur).length;

  // 2) Prior snapshot.
  let prevRows = [];
  try { prevRows = await sbGet('stock_state?select=slug,in_stock'); } catch { prevRows = []; }
  const prev = {};
  for (const r of prevRows) prev[r.slug] = !!r.in_stock;
  const firstRun = prevRows.length === 0;
  if (firstRun) summary.seeded = true;

  // 3) Detect flips false -> true and email waitlists (unless this is the seed run).
  for (const slug of Object.keys(cur)) {
    const wasInStock = prev[slug];
    const nowInStock = cur[slug].in_stock;
    const flipped = wasInStock === false && nowInStock === true;
    if (firstRun || !flipped) continue;

    summary.flipped++;
    let waiters = [];
    try { waiters = await sbGet(`interest_registrations?product_slug=eq.${encodeURIComponent(slug)}&notified_at=is.null&select=id,email`); }
    catch { waiters = []; }

    const name = pretty(slug, cur[slug].name);
    // Mark each registrant notified immediately after their send, so a mid-run
    // timeout can never re-blast someone who already received the email.
    const markNotified = (id) => fetch(`${SUPABASE_URL}/rest/v1/interest_registrations?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ notified_at: new Date().toISOString() }),
    }).catch(() => {});
    for (const w of waiters) {
      if (summary.emailed >= MAX_EMAILS) break;
      if (!w.email) continue;
      if (await isUnsubscribed(w.email)) { summary.skipped_unsub++; await markNotified(w.id); continue; }
      const unsubUrl = `${SITE}/api/newsletter/unsubscribe?token=${encodeURIComponent(signEmailToken(w.email))}`;
      const r = await sendMail({
        to: w.email, subject: `${name} is back in stock — Velox Peptides`,
        html: restockHtml(name, slug, unsubUrl),
        text: `${name} is back in stock.\n\nShop: ${SITE}/compounds/${slug}/\n\nFor research use only. Unsubscribe: ${unsubUrl}`,
        flow: 'back_in_stock', productSlug: slug,
        headers: { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      });
      if (r.ok) { summary.emailed++; await markNotified(w.id); } else { summary.errors++; }
    }
  }

  // 4) Refresh the snapshot (upsert on slug).
  try {
    const rows = Object.keys(cur).map((slug) => ({ slug, in_stock: cur[slug].in_stock, updated_at: new Date().toISOString() }));
    if (rows.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/stock_state?on_conflict=slug`, {
        method: 'POST', headers: { ...sbHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows),
      });
    }
  } catch (e) { console.error('[restock-run] snapshot upsert failed', e.message); }

  console.log('[restock-run] done', JSON.stringify(summary));
  await recordRun('restock', summary.errors === 0, summary);
  return res.status(200).json({ ok: true, ...summary });
};
