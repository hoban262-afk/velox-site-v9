/**
 * POST /api/affiliate/signup — public affiliate application.
 *
 * Creates the Supabase Auth user (email auto-confirmed so they can sign in
 * immediately) AND a linked `pending_approval` affiliate row. No code or
 * commission is assigned until an admin approves them.
 *
 * Body: { name, email, password, payout_details, promo_method? }
 *
 * Done server-side with the service role so affiliate rows can't be forged
 * from the browser and user_id is always linked correctly. If the affiliate
 * row fails to insert, the just-created auth user is rolled back.
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE      = process.env.SUPABASE_SERVICE_ROLE_KEY;

function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '')); }

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!SUPABASE_URL || !SERVICE) return res.status(500).json({ error: 'Service not configured' });

  const b = req.body || {};
  const name    = String(b.name || '').trim();
  const email   = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const payout  = String(b.payout_details || '').trim();
  const promo   = String(b.promo_method || '').trim();

  if (!name) return res.status(400).json({ error: 'Name is required.' });
  if (!isEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (!payout) return res.status(400).json({ error: 'Payout details are required.' });

  const sHeaders = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' };

  try {
    // 1) Create the auth user (auto-confirmed).
    const ures = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST', headers: sHeaders,
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name, role: 'affiliate' } }),
    });
    const user = await ures.json().catch(() => null);
    if (!ures.ok || !user || !user.id) {
      const m = (user && (user.msg || user.message || user.error_description || user.error)) || '';
      if (/already|exists|registered/i.test(m)) {
        return res.status(409).json({ error: 'An account with this email already exists — please sign in instead.' });
      }
      console.error('[affiliate/signup] createUser failed:', m);
      return res.status(502).json({ error: 'Could not create your account.' });
    }

    // 2) Create the affiliate row (pending approval; no code/commission yet).
    const ins = await fetch(`${SUPABASE_URL}/rest/v1/affiliates`, {
      method: 'POST', headers: { ...sHeaders, Prefer: 'return=representation' },
      body: JSON.stringify([{
        user_id: user.id, name, email,
        payout_details: payout, promo_method: promo || null,
        status: 'pending_approval', commission_type: 'percentage',
        // Default split of the 30% pool (DB constraint chk_aff_total_30 requires
        // discount_pct + commission_pct = 30). The affiliate can re-split it in
        // their portal once approved. commission_pct is the live field read by
        // /api/affiliate/validate; commission_rate is the legacy mirror.
        commission_rate: 20, commission_pct: 20, discount_pct: 10,
      }]),
    });
    if (!ins.ok) {
      const detail = await ins.text().catch(() => '');
      // roll back the orphaned auth user
      await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: sHeaders }).catch(() => {});
      if (/duplicate|unique/i.test(detail)) {
        return res.status(409).json({ error: 'An affiliate application already exists for this email.' });
      }
      console.error('[affiliate/signup] affiliate insert failed:', detail);
      return res.status(502).json({ error: 'Could not submit your application.' });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[affiliate/signup]', e.message);
    return res.status(500).json({ error: 'Could not submit your application.' });
  }
};
