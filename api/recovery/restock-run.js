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
const { renderEmail, emailParagraph } = require('../../lib/email-layout');

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
  return renderEmail({
    kicker: 'Back in stock',
    heading: name + ' is back in stock',
    bodyHtml: emailParagraph('You asked to be told when <strong style="color:#fff">' + name + '</strong> was available again. It&rsquo;s live now &mdash; HPLC-verified with a batch-specific CoA. Stock can move fast, so don&rsquo;t wait too long.'),
    cta: { href: url, label: 'SHOP ' + name.toUpperCase() + ' →' },
    unsubscribeUrl: unsubUrl,
    preheader: name + ' is back in stock at Velox Peptides.',
  });
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
  return res.status(200).json({ ok: true, ...summary });
};
