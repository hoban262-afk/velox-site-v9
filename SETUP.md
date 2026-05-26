# Velox Peptides — Full Stack Setup Guide

## What was built

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Database | Supabase (PostgreSQL) | Orders, subscribers, affiliates |
| Auth | Supabase Auth | Secure admin login |
| Payments | Fena Pay by Bank | UK open banking checkout |
| Edge Functions | Vercel (`/api/`) | Keep Fena credentials server-side |
| Hosting | Vercel + GitHub | Auto-deploy on push |

---

## Step 1 — Supabase project (already done)

The Supabase project `veloxpeps` has been created and the migration has been applied.

- **Project URL:** `https://stkjdtyhaxejxqmbzyua.supabase.co`
- **Region:** eu-west-2 (London)
- **Migration applied:** `001_initial_schema` — creates orders, subscribers, affiliates, affiliate_referrals tables with RLS

The admin auth user `veloxpeps@gmail.com` has been created. See the password at the bottom of this document.

---

## Step 2 — Get the Supabase service role key

The service role key is used by the Fena webhook to update order status (bypasses RLS). It must **never** be in client-side code.

1. Go to: https://supabase.com/dashboard/project/stkjdtyhaxejxqmbzyua/settings/api
2. Copy the **service_role** key (under "Project API keys")
3. Add it to Vercel (Step 4)

---

## Step 3 — Get your Fena credentials

1. Log in to the Fena developer portal: https://app.fena.co/developers
2. Copy your **Client ID** and **Client Secret**
3. Add them to Vercel (Step 4)

### About the Fena endpoint

The edge function (`api/create-fena-payment.js`) calls:
```
POST https://app.fena.co/api/single-immediate-payment-initiation-requests
```
with headers `client_id` and `client_secret` and a JSON body.

**Before going live**, test this in the Fena sandbox and verify:
- The endpoint URL is correct for your account type
- The request headers match what Fena expects
- The response contains a `payment_url` (or `url` / `link`) field

If the field names differ, update the fallback chain in `api/create-fena-payment.js`:
```js
const paymentUrl = data.payment_url || data.url || data.link || data.hostedPaymentUrl || data.checkout_url;
```

### About the Fena webhook

The webhook (`api/fena-webhook.js`) expects Fena to POST a JWT as:
```
Content-Type: application/x-www-form-urlencoded
body: token=<jwt>
```
The JWT payload should contain `order_id` (the Supabase UUID) and `status`.

Fena embeds `order_id` in the `redirect_url` we send when creating the payment — it should reflect it back in the webhook payload. Verify this in Fena's docs and update the payload field extraction in `api/fena-webhook.js` if needed:
```js
const orderId = payload.order_id || payload.metadata?.order_id || null;
```

**JWT signature verification:** The webhook currently only decodes the JWT payload. For production, add HMAC-SHA256 signature verification using `FENA_CLIENT_SECRET` once you confirm Fena's signing algorithm.

---

## Step 4 — Add environment variables to Vercel

Go to: https://vercel.com/dashboard → your project → Settings → Environment Variables

Add all of these:

| Variable | Value | Where to get it |
|----------|-------|----------------|
| `SUPABASE_URL` | `https://stkjdtyhaxejxqmbzyua.supabase.co` | Already known |
| `SUPABASE_ANON_KEY` | (see `.env.local`) | Supabase dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | (secret — get from Step 2) | Supabase dashboard → Settings → API |
| `FENA_CLIENT_ID` | your Fena client ID | Fena developer portal |
| `FENA_CLIENT_SECRET` | your Fena client secret | Fena developer portal |
| `NEXT_PUBLIC_SITE_URL` | `https://veloxpeps.com` | Fixed |

Set all variables for **Production**, **Preview**, and **Development** environments.

---

## Step 5 — Push and redeploy

```bash
git add -A
git commit -m "add Supabase + Fena full-stack integration"
git push
```

Vercel will automatically redeploy. Check the deployment logs for any errors.

---

## Step 6 — Test in Fena sandbox

Before accepting real payments:

1. Switch your Fena credentials to sandbox mode in the Fena developer portal
2. Place a test order on the site
3. Verify the checkout redirects to Fena's bank selection page
4. Complete the test payment
5. Verify you land on `/checkout/payment-complete/` and the confirmation shows
6. Check the admin dashboard at `/admin/` — the order should appear with status `pending` (or `paid` if the webhook fired)
7. Check order emails arrive via Resend

Once sandbox tests pass, switch `FENA_CLIENT_ID` and `FENA_CLIENT_SECRET` to your live credentials in Vercel and redeploy.

---

## Admin dashboard

URL: `https://veloxpeps.com/admin/`

- Sign in with `veloxpeps@gmail.com` and the password below
- **Overview** tab: stats + recent orders
- **Orders** tab: all orders, update status (pending → paid → dispatched)
- **Subscribers** tab: newsletter sign-ups
- **Affiliates** tab: affiliate applications, approve/reject

---

## RLS security note

The Supabase **anon key** is safe in client-side code because Row Level Security policies restrict anonymous access to INSERT-only on all tables. Anonymous users cannot read, update, or delete any data. Full access requires an authenticated admin session (Supabase Auth).

The **service_role key** bypasses RLS entirely. It is only used in the Fena webhook edge function running server-side on Vercel — it never appears in browser code.

---

## What stays as localStorage

These two items intentionally remain in `localStorage` (browser-local, not server data):

| Key | Purpose |
|-----|---------|
| `vp_cart` | Shopping cart contents |
| `vp_entry` | Age/eligibility gate confirmation (cookie) |

---

## Files changed

| File | Change |
|------|--------|
| `supabase/migrations/001_initial_schema.sql` | New — database schema |
| `api/create-fena-payment.js` | Rewritten as Vercel Edge Function |
| `api/fena-webhook.js` | Rewritten as Vercel Edge Function (updates Supabase) |
| `assets/js/supabase-client.js` | New — shared Supabase client |
| `assets/js/checkout.js` | Updated payment submit: saves to Supabase, calls Fena |
| `assets/js/core.js` | Added newsletter subscribe handler |
| `assets/js/payment-complete.js` | New — handles Fena redirect landing |
| `assets/js/admin.js` | New — admin dashboard logic |
| `checkout/payment-complete/index.html` | New — Fena return page |
| `admin/index.html` | New — admin dashboard |
| `index.html` | Added Supabase CDN for newsletter |
| `checkout/payment/index.html` | Added Supabase CDN for order save |
| `.gitignore` | Added `.env.local` |
| `.env.local` | New — local dev env var template |

---

## Generated admin password

```
Vx!P3p5NI#2026
```

**Change this after first login** via Supabase dashboard:
https://supabase.com/dashboard/project/stkjdtyhaxejxqmbzyua/auth/users
