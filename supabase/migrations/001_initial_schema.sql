-- ============================================================
-- Velox Peptides — Initial Schema
-- Applied: 2026-05-26
-- ============================================================

-- ORDERS
create table orders (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  customer_name text not null,
  customer_email text not null,
  items jsonb not null,
  total numeric(10,2) not null,
  payment_method text default 'open_banking',
  status text default 'pending',  -- pending | paid | dispatched | cancelled
  fena_payment_id text,           -- Fena's payment reference
  notes text
);

-- SUBSCRIBERS
create table subscribers (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  email text unique not null,
  source text default 'website'
);

-- AFFILIATES
create table affiliates (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  name text not null,
  email text unique not null,
  ref_code text unique not null,
  discount_pct numeric(5,2) default 10,
  commission_pct numeric(5,2) default 10,
  status text default 'pending',  -- pending | approved | rejected
  total_referred integer default 0,
  total_revenue numeric(10,2) default 0
);

-- AFFILIATE REFERRALS
create table affiliate_referrals (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  affiliate_id uuid references affiliates(id),
  order_id uuid references orders(id),
  commission_amount numeric(10,2)
);

-- ── Row Level Security ────────────────────────────────────────────────────────

alter table orders enable row level security;
alter table subscribers enable row level security;
alter table affiliates enable row level security;
alter table affiliate_referrals enable row level security;

-- Orders: customers can insert, admin (authenticated) can do everything,
-- service role (webhook) bypasses RLS automatically but explicit policy added
create policy "insert_order"   on orders for insert to anon          with check (true);
create policy "admin_orders"   on orders for all    to authenticated  using (true);
create policy "service_orders" on orders for all    to service_role   using (true);

-- Subscribers: anyone can sign up, admin reads/manages
create policy "insert_subscriber"  on subscribers for insert to anon          with check (true);
create policy "admin_subscribers"  on subscribers for all    to authenticated  using (true);

-- Affiliates: anyone can apply, admin manages
create policy "insert_affiliate" on affiliates for insert to anon          with check (true);
create policy "admin_affiliates" on affiliates for all    to authenticated  using (true);

-- Referrals: written by service role, read by admin
create policy "admin_referrals"   on affiliate_referrals for all to authenticated using (true);
create policy "service_affiliates" on affiliate_referrals for all to service_role  using (true);
