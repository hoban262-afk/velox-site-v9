/**
 * GET/POST /api/recovery/sub-fulfil-run — subscribe-&-save fulfilment cron
 *
 * Once a day, finds active subscribe-&-save reorder subscriptions whose next
 * delivery is due and creates a PENDING order for each (priced from
 * product_variants at the locked member/sub discount, shipped to the customer's
 * saved default address), then advances next_expected_date by one month.
 *
 * Why PENDING (not paid): a bank standing order pays the merchant directly and
 * banks don't reliably webhook each individual charge, so we can't auto-confirm
 * payment per cycle. The order is created PENDING so an admin reconciles it
 * against the bank statement, then marks it paid — which fires the normal
 * Click & Drop + Xero dispatch flow. Fena 'warning'/'cancelled' webhooks flip
 * the subscription out of 'active', so this stops creating orders for lapses.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_PER_RUN  = 100;

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
async function sbPost(path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST', headers: { ...sbHeaders, Prefer: 'return=representation' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase POST ${path} -> ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function sbPatch(path, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH', headers: { ...sbHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Supabase PATCH ${path} -> ${r.status}`);
}

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
function addMonths(d, m) { const x = new Date(d); x.setMonth(x.getMonth() + m); return x; }
function ymd(d) { return new Date(d).toISOString().slice(0, 10); }

// Pull a usable shipping address from a profile (defensive about field names).
async function addressFor(userId) {
  if (!userId) return null;
  try {
    const rows = await sbGet(`profiles?id=eq.${userId}&select=name,saved_addresses,default_address_id`);
    const p = Array.isArray(rows) ? rows[0] : null;
    if (!p || !Array.isArray(p.saved_addresses) || !p.saved_addresses.length) return { name: p && p.name };
    const a = p.saved_addresses.find((x) => x && (x.id === p.default_address_id)) || p.saved_addresses[0];
    if (!a) return { name: p.name };
    return {
      name: p.name || a.name || null,
      line1: a.line1 || a.addr1 || a.address1 || null,
      line2: a.line2 || a.addr2 || a.address2 || null,
      city: a.city || a.town || null,
      postcode: a.postcode || a.postal_code || a.zip || null,
      country: a.country || 'GB',
      phone: a.phone || null,
    };
  } catch { return null; }
}

module.exports = async function handler(req, res) {
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Supabase not configured' });
  if (!authorised(req)) return res.status(401).json({ error: 'Unauthorised' });

  const summary = { scanned: 0, created: 0, skipped_not_due: 0, skipped_no_items: 0, errors: 0 };
  const today = ymd(Date.now());

  // Price map (effective price per variant).
  let priceMap = {};
  try {
    const variants = await sbGet('product_variants?select=slug,size,base_price,sale_price');
    variants.forEach((v) => { priceMap[`${v.slug}|${v.size}`] = (v.sale_price != null ? Number(v.sale_price) : Number(v.base_price)); });
  } catch (e) {
    return res.status(500).json({ error: 'variant price load failed', detail: e.message });
  }

  let subs = [];
  try {
    subs = await sbGet('subscriptions?kind=eq.reorder&status=in.(active,paid)&select=*&order=created_at.asc&limit=300');
  } catch (e) {
    return res.status(500).json({ error: 'subscriptions query failed', detail: e.message });
  }

  for (const sub of subs) {
    if (summary.created >= MAX_PER_RUN) break;
    summary.scanned++;

    const dueDate = sub.next_expected_date || sub.first_payment_date;
    if (!dueDate || ymd(dueDate) > today) { summary.skipped_not_due++; continue; }

    const items = Array.isArray(sub.items) ? sub.items : [];
    if (!items.length) { summary.skipped_no_items++; continue; }

    try {
      let subtotal = 0;
      const lineItems = items.map((it) => {
        const unit = priceMap[`${it.slug || ''}|${it.size || ''}`] || 0;
        const qty = Number(it.qty) || 1;
        subtotal += unit * qty;
        return { slug: it.slug, name: it.name || it.slug, size: it.size, qty, price: unit };
      });
      const disc = n(sub.discount_percent);
      const total = Math.round(subtotal * (1 - disc / 100) * 100) / 100;
      const addr = await addressFor(sub.user_id);

      await sbPost('orders', {
        customer_name: (addr && addr.name) || 'Subscriber',
        customer_email: sub.customer_email,
        items: lineItems,
        subtotal: Math.round(subtotal * 100) / 100,
        total,
        discount: Math.round((subtotal - total) * 100) / 100,
        shipping: 0,                       // subscribe-&-save members ship free
        status: 'pending',                 // admin confirms the standing-order charge, then dispatches
        payment_method: 'fena-sub',
        notes: `SUBSCRIPTION ${sub.reference || sub.id}`,
        user_id: sub.user_id || null,
        ship_name: (addr && addr.name) || null,
        ship_line1: addr && addr.line1, ship_line2: addr && addr.line2,
        ship_city: addr && addr.city, ship_postcode: addr && addr.postcode,
        ship_country: (addr && addr.country) || 'GB', ship_phone: addr && addr.phone,
      });

      const base = sub.next_expected_date || sub.first_payment_date || today;
      await sbPatch(`subscriptions?id=eq.${sub.id}`, {
        next_expected_date: ymd(addMonths(base, 1)),
        updated_at: new Date().toISOString(),
      });
      summary.created++;
      console.log(`[sub-fulfil] created pending order for sub ${sub.id} (${sub.customer_email})`);
    } catch (e) {
      console.error('[sub-fulfil] failed sub', sub.id, e.message);
      summary.errors++;
    }
  }

  console.log('[sub-fulfil] done', JSON.stringify(summary));
  return res.status(200).json({ ok: true, ...summary });
};
