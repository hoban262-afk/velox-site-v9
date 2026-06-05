# Velox Peptides — Accounts & Loyalty System

A customer account + loyalty-points system built **on the existing stack** (static
site on Vercel + serverless functions + Supabase). **Guest checkout is always
available** — accounts are optional and additive.

> Architecture note: the original spec assumed a Node/Express backend. There
> isn't one — this is Vercel static hosting + serverless functions + Supabase.
> So auth is **Supabase Auth** (not hand-rolled bcrypt/JWT), and per-user access
> is enforced by **Postgres Row-Level Security** (stronger than route middleware).

---

## How it fits together

| Concern | Implementation |
|---|---|
| Register / login / logout | Supabase Auth (`signUp`, `signInWithPassword`, `signOut`) |
| Sessions / JWT | Supabase Auth (tokens managed by supabase-js) |
| "Remember me" | 30-day persistent session (default) vs session-only (cleared on browser close) — see `account.js` |
| Password reset | Supabase `resetPasswordForEmail` → recovery link back to `/account/` |
| `requireAuth` / `optionalAuth` | Session check in the page + **RLS** policies at the DB |
| Rate limiting | Supabase Auth built-in limits on auth endpoints |
| Never leak password hashes | Passwords live in `auth.users` (managed by Supabase), never in our tables |
| CSRF | N/A for the bearer-token pattern (tokens in `Authorization`, not cookies) |

---

## Data model (`supabase/migrations/002_accounts_loyalty.sql`)

**`profiles`** (1:1 with `auth.users`, auto-created on signup via trigger):
`name, email, saved_addresses (jsonb, max 5), default_address_id,
loyalty_points (balance), lifetime_points (drives tier), loyalty_tier
(generated), created_at, last_login_at, deleted_at`.

**`orders`** gained: `user_id`, `subtotal` (pre-discount, drives points),
`points_awarded` (idempotency flag), `points_redeemed`.

**RLS:** customers can read only their own profile + orders. Admin access is
scoped to the owner email via `is_admin()`. (This replaced the old
"any authenticated user can read everything" policies — important now that
customers can log in.)

---

## Loyalty engine

Runs as a **Postgres trigger** (`orders_loyalty`) on order status change —
server-authoritative and idempotent, fires no matter how the status changes
(admin dashboard, Fena webhook, etc.):

- **Earn:** on status → `paid`/`dispatched`, award `floor(subtotal) × tier
  multiplier`. Multipliers: Bronze 1×, Silver 1.25×, Gold 1.5×, Platinum 2×.
  Awarded **once per order** (`points_awarded` flag).
- **Tiers** (lifetime points): Bronze 0–499, Silver 500–1,499, Gold 1,500–4,999,
  Platinum 5,000+.
- **Redeem:** 100 pts = £1, min 500 pts. Redemption amount is stored on the order
  (`points_redeemed`) at checkout and **deducted on completion** (not placement).
- **Cancel/refund:** status → `cancelled`/`refunded` restores redeemed points and
  removes awarded points.

### API endpoints (`/api/loyalty/`)
- `POST /api/loyalty/redeem` — validates a redemption against the live balance (auth required), returns the £ discount quote.
- `POST /api/loyalty/award` — idempotent manual award hook (the trigger normally handles this automatically).
- `GET  /api/loyalty/balance` — points + tier for the signed-in user.

Profile/orders/addresses reads & writes are done **directly via supabase-js + RLS**
from the client (this *is* the API — Supabase's PostgREST), so there are no
redundant CRUD endpoints to maintain. RLS guarantees a user only ever touches
their own rows.

---

## Frontend

- **`/account/`** — one protected page. Logged out → login / register / reset /
  set-new-password. Logged in → dashboard tabs: **Overview** (tier, balance,
  points-to-next-tier, recent orders), **Orders** (full history + reorder),
  **Addresses** (book, max 5, CRUD), **Settings** (name/email/password, delete
  account). Styled to match the site (`#030407` / `#01D3A0`).
- **Checkout** (`output/assets/js/checkout.js`): unchanged for guests. If signed
  in, the delivery form pre-fills from the profile; the order is linked
  (`user_id`) so points award on payment. After a guest order, a non-blocking
  "Save your details & earn points" card appears. On signup, prior guest orders
  are linked by email via `link_my_orders()`.

---

## Deferred / follow-up

1. **Redemption UI at checkout** — the engine, the `/api/loyalty/redeem`
   endpoint, and the `orders.points_redeemed` column are all built. Wiring the
   redemption *input + line-item discount* into the live payment page was left as
   a separate, isolated change because it modifies live checkout pricing (UK/EU
   currency logic) and warrants its own focused test pass.
2. **Account nav link** — add an "Account" link to the site header/nav for
   discoverability (the page is live at `/account/`).
3. **Full auth-user disable on delete** — soft-delete anonymises the profile +
   order PII today; fully disabling the Supabase Auth login would be a small
   service-role function follow-up.
4. **Enable leaked-password protection** in Supabase Auth settings (dashboard →
   Auth → Passwords) — recommended now that customers set passwords.

---

## Env vars
See `.env.example`. The account system adds **no new env vars** — it reuses the
existing `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`.
