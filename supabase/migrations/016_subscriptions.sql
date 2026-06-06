-- 016_subscriptions.sql
-- Velox Peps Pro: 3-tier membership (Solo / Group / Lab) + Subscribe-&-Save reorders,
-- billed via Fena recurring payments (UK bank standing orders).
--
-- Fena model notes (these shape the columns):
--   * A standing order is initiated ONCE by the customer in their bank. After that
--     the bank runs it; Fena/merchant cannot change or cancel it. Amount is FIXED.
--   * Fena emits webhooks on status change: sent/pending/active/paid/warning/
--     cancelled/rejected/overdue. We mirror that in `status`.
--   * We grant access on `active` and revoke on `warning`/`cancelled`.

-- ── Tier config (editable without code deploys: prices + discount live here) ──────
create table if not exists public.membership_tiers (
  key                 text primary key check (key in ('solo','group','lab')),
  name                text not null,
  discount_pct        integer not null,            -- sitewide auto-discount for members
  monthly_price_pence integer not null,
  annual_price_pence  integer not null,
  free_shipping       boolean not null default true,
  sort_order          integer not null default 0,
  active              boolean not null default true
);

insert into public.membership_tiers (key, name, discount_pct, monthly_price_pence, annual_price_pence, free_shipping, sort_order)
values
  ('solo',  'Solo Researcher',   5,   699,  5900, true, 1),
  ('group', 'Group Researchers', 10, 1999, 17900, true, 2),
  ('lab',   'Lab Researchers',   25, 4999, 44900, true, 3)
on conflict (key) do nothing;

-- ── Subscriptions (Pro membership AND subscribe-&-save reorders) ──────────────────
create table if not exists public.subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users(id) on delete set null,
  customer_email     text not null,
  kind               text not null check (kind in ('pro','reorder')),   -- membership vs subscribe-&-save
  tier               text references public.membership_tiers(key),       -- set when kind='pro'
  plan               text check (plan in ('monthly','annual')),          -- billing cadence (pro)
  amount_pence       integer not null check (amount_pence > 0),
  frequency          text not null default 'MONTHLY',                    -- Fena freq: MONTHLY/YEARLY/...
  status             text not null default 'draft',                      -- mirrors Fena statuses
  fena_payment_id    text,                                               -- Fena recurring/standing-order id
  reference          text,                                               -- Fena reference (<=12 chars)
  first_payment_date date,
  next_expected_date date,
  current_period_end timestamptz,                                        -- access valid through
  items              jsonb not null default '[]'::jsonb,                 -- reorder basket (kind='reorder')
  discount_percent   integer not null default 0,                         -- locked subscribe-&-save discount
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  cancelled_at       timestamptz
);

create index if not exists subscriptions_user_idx   on public.subscriptions(user_id);
create index if not exists subscriptions_email_idx  on public.subscriptions(lower(customer_email));
create index if not exists subscriptions_fena_idx   on public.subscriptions(fena_payment_id);
create index if not exists subscriptions_status_idx on public.subscriptions(status);

-- ── Denormalised Pro flags on the profile for fast, cheap gating ─────────────────
-- Source of truth = active kind='pro' subscription; kept in sync by the recurring
-- webhook + a daily reconciliation worker.
alter table public.profiles add column if not exists is_pro    boolean not null default false;
alter table public.profiles add column if not exists pro_tier  text references public.membership_tiers(key);
alter table public.profiles add column if not exists pro_plan  text;                 -- 'monthly' | 'annual'
alter table public.profiles add column if not exists pro_until timestamptz;           -- access valid through

-- ── RLS (service role full; members read their own + the public tier list) ───────
alter table public.subscriptions enable row level security;
create policy "subscriptions_service" on public.subscriptions
  for all to service_role using (true) with check (true);
create policy "subscriptions_owner_read" on public.subscriptions
  for select to authenticated using (auth.uid() = user_id);

alter table public.membership_tiers enable row level security;
create policy "tiers_service" on public.membership_tiers
  for all to service_role using (true) with check (true);
create policy "tiers_public_read" on public.membership_tiers
  for select to anon, authenticated using (active);
