-- ============================================================
-- Accounts + Loyalty system
-- Applied via Supabase MCP on 2026-05-27 (this file is the record).
-- ============================================================

-- ── Admin scope helper (so customer logins can't read admin data) ──────────
create or replace function public.is_admin()
returns boolean language sql stable set search_path = '' as $$
  select coalesce((auth.jwt() ->> 'email'), '') = 'veloxpeps@gmail.com';
$$;

-- ── PROFILES (1:1 with auth.users) ─────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  saved_addresses jsonb not null default '[]'::jsonb,   -- [{id,label,line1,line2,city,postcode,country}]
  default_address_id text,
  loyalty_points integer not null default 0 check (loyalty_points >= 0),
  lifetime_points integer not null default 0 check (lifetime_points >= 0),
  loyalty_tier text generated always as (
    case when lifetime_points >= 5000 then 'Platinum'
         when lifetime_points >= 1500 then 'Gold'
         when lifetime_points >= 500  then 'Silver'
         else 'Bronze' end) stored,
  created_at timestamptz not null default now(),
  last_login_at timestamptz,
  deleted_at timestamptz
);
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "profiles_admin"      on public.profiles for all    to authenticated using (public.is_admin());
create policy "profiles_service"    on public.profiles for all    to service_role using (true);

-- Auto-create a profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;
  return new;
end; $$;
revoke execute on function public.handle_new_user() from anon, authenticated, public;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── ORDERS: account link + loyalty bookkeeping ─────────────────────────────
alter table public.orders add column if not exists user_id uuid references auth.users(id);
alter table public.orders add column if not exists subtotal numeric(10,2);     -- pre-discount, drives points
alter table public.orders add column if not exists points_awarded boolean not null default false;
alter table public.orders add column if not exists points_redeemed integer not null default 0;
create index if not exists orders_user_id_idx on public.orders (user_id);

-- ── RLS hardening: admin policies scoped to is_admin(); users see own rows ──
drop policy if exists "admin_orders" on public.orders;
create policy "orders_admin"       on public.orders for all    to authenticated using (public.is_admin());
create policy "orders_select_own"  on public.orders for select to authenticated using (auth.uid() = user_id);
create policy "orders_insert_auth" on public.orders for insert to authenticated with check (user_id = auth.uid() or user_id is null);
drop policy if exists "admin_reviews" on public.reviews;
create policy "reviews_admin" on public.reviews for all to authenticated using (public.is_admin());
drop policy if exists "read_approved_reviews" on public.reviews;
create policy "reviews_read_approved" on public.reviews for select to anon, authenticated using (status = 'approved');
drop policy if exists "admin_subscribers" on public.subscribers;
create policy "subscribers_admin" on public.subscribers for all to authenticated using (public.is_admin());
drop policy if exists "admin_affiliates" on public.affiliates;
create policy "affiliates_admin" on public.affiliates for all to authenticated using (public.is_admin());
drop policy if exists "admin_referrals" on public.affiliate_referrals;
create policy "referrals_admin" on public.affiliate_referrals for all to authenticated using (public.is_admin());

-- ── LOYALTY ENGINE (idempotent, server-authoritative, runs on status change) ─
create or replace function public.award_order_points(p_order_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare o record; v_base int; v_mult numeric; v_points int; v_tier text;
begin
  update public.orders set points_awarded = true
   where id = p_order_id and points_awarded = false and user_id is not null
     and status in ('paid','dispatched')
   returning * into o;
  if not found then return 0; end if;
  select loyalty_tier into v_tier from public.profiles where id = o.user_id;
  v_mult := case v_tier when 'Platinum' then 2.0 when 'Gold' then 1.5 when 'Silver' then 1.25 else 1.0 end;
  v_base := floor(coalesce(o.subtotal, o.total, 0));
  v_points := floor(v_base * v_mult);
  update public.profiles
     set loyalty_points  = greatest(0, loyalty_points + v_points - coalesce(o.points_redeemed,0)),
         lifetime_points = lifetime_points + v_points
   where id = o.user_id;
  return v_points;
end; $$;

create or replace function public.reverse_order_points(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o record; v_base int; v_mult numeric; v_points int; v_tier text;
begin
  update public.orders set points_awarded = false
   where id = p_order_id and points_awarded = true and user_id is not null
   returning * into o;
  if not found then return; end if;
  select loyalty_tier into v_tier from public.profiles where id = o.user_id;
  v_mult := case v_tier when 'Platinum' then 2.0 when 'Gold' then 1.5 when 'Silver' then 1.25 else 1.0 end;
  v_base := floor(coalesce(o.subtotal, o.total, 0));
  v_points := floor(v_base * v_mult);
  update public.profiles
     set loyalty_points  = greatest(0, loyalty_points - v_points + coalesce(o.points_redeemed,0)),
         lifetime_points = greatest(0, lifetime_points - v_points)
   where id = o.user_id;
end; $$;

create or replace function public.orders_loyalty_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('paid','dispatched') and old.status is distinct from new.status then
    perform public.award_order_points(new.id);
  elsif new.status in ('cancelled','refunded') and old.status is distinct from new.status then
    perform public.reverse_order_points(new.id);
  end if;
  return new;
end; $$;
drop trigger if exists orders_loyalty on public.orders;
create trigger orders_loyalty after update of status on public.orders
  for each row execute function public.orders_loyalty_trigger();

-- ── Account helpers ─────────────────────────────────────────────────────────
create or replace function public.link_my_orders()  -- claim prior guest orders by email
returns integer language plpgsql security definer set search_path = public as $$
declare v_email text; v_count int;
begin
  v_email := auth.jwt() ->> 'email';
  if v_email is null or auth.uid() is null then return 0; end if;
  update public.orders set user_id = auth.uid()
   where user_id is null and lower(customer_email) = lower(v_email);
  get diagnostics v_count = row_count; return v_count;
end; $$;

create or replace function public.delete_my_account()  -- soft delete + anonymise PII
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  uid := auth.uid(); if uid is null then return; end if;
  update public.profiles set deleted_at = now(), name = 'Deleted user', email = null,
         saved_addresses = '[]'::jsonb, default_address_id = null where id = uid;
  update public.orders set customer_name = 'Deleted user', customer_email = null where user_id = uid;
end; $$;

-- ── Execution grants (lock definer functions to service role / authed users) ─
revoke execute on function public.award_order_points(uuid)   from anon, authenticated, public;
revoke execute on function public.reverse_order_points(uuid) from anon, authenticated, public;
revoke execute on function public.orders_loyalty_trigger()   from anon, authenticated, public;
grant  execute on function public.award_order_points(uuid)   to service_role;
revoke execute on function public.link_my_orders()    from anon, public; grant execute on function public.link_my_orders()    to authenticated;
revoke execute on function public.delete_my_account() from anon, public; grant execute on function public.delete_my_account() to authenticated;
