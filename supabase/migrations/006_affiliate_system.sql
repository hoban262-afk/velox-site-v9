-- ============================================================
-- Velox Peptides — Affiliate System
-- Applied: 2026-05-29
--
-- Extends the existing affiliates table for self-service login +
-- per-affiliate commission config, links orders to affiliates, and adds
-- the money-truth tables: commissions, payouts, notifications.
--
-- The commission lifecycle is driven ENTIRELY by order status via one
-- trigger (affiliate_commission_sync) so the logic lives in one place and
-- can't drift. Commission rate is snapshotted at order time. Order value +
-- status are denormalised onto the commission so affiliates can render their
-- dashboard from `commissions` alone and NEVER read the orders table (no
-- customer PII leak).
-- ============================================================

-- ── affiliates: login + commission config + lifecycle vocab ──
alter table public.affiliates add column if not exists user_id          uuid references auth.users(id) on delete set null;
alter table public.affiliates add column if not exists commission_type   text default 'percentage';   -- 'percentage' | 'flat'
alter table public.affiliates add column if not exists commission_rate   numeric(10,2) default 10;    -- percent (percentage) or £ amount (flat)
alter table public.affiliates add column if not exists payout_details    text;
alter table public.affiliates add column if not exists promo_method      text;                        -- how they plan to promote (from signup)

-- new status vocabulary: pending_approval | active | rejected | disabled
alter table public.affiliates alter column status set default 'pending_approval';
update public.affiliates set status = 'pending_approval' where status = 'pending';
update public.affiliates set status = 'active'           where status = 'approved';
-- seed commission_rate from the legacy commission_pct column where present
update public.affiliates set commission_rate = commission_pct where commission_rate is null and commission_pct is not null;

create unique index if not exists affiliates_user_id_uniq on public.affiliates(user_id) where user_id is not null;

-- code is assigned by admin at approval time, so it's null until then
alter table public.affiliates alter column ref_code drop not null;

-- affiliate can read ONLY their own affiliate row (admin/insert policies already exist)
drop policy if exists "affiliates_select_own" on public.affiliates;
create policy "affiliates_select_own" on public.affiliates for select to authenticated using (user_id = auth.uid());

-- ── orders: link to affiliate ──
alter table public.orders add column if not exists affiliate_id      uuid references public.affiliates(id);
alter table public.orders add column if not exists affiliate_code_used text;

-- ── payouts (created before commissions so the FK resolves) ──
create table if not exists public.payouts (
  id          uuid default gen_random_uuid() primary key,
  created_at  timestamptz default now(),
  affiliate_id uuid not null references public.affiliates(id),
  amount      numeric(10,2) not null default 0,
  status      text not null default 'paid',   -- 'paid' only for now (manual mark)
  paid_at     timestamptz,
  reference   text
);
create index if not exists payouts_affiliate_idx on public.payouts(affiliate_id, created_at desc);

-- ── commissions (one per order; money truth) ──
create table if not exists public.commissions (
  id                       uuid default gen_random_uuid() primary key,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now(),
  order_id                 uuid not null unique references public.orders(id) on delete cascade,
  affiliate_id             uuid not null references public.affiliates(id),
  amount                   numeric(10,2) not null default 0,
  commission_type_snapshot text not null,
  commission_rate_snapshot numeric(10,2) not null,
  subtotal_snapshot        numeric(10,2) not null default 0,   -- order value the commission was based on
  order_reference          text,
  order_status             text,                                -- denormalised so affiliates never read orders
  status                   text not null default 'pending',     -- pending | payable | reversed | paid | clawback
  payout_id                uuid references public.payouts(id) on delete set null
);
create index if not exists commissions_affiliate_idx on public.commissions(affiliate_id, status);
create index if not exists commissions_payout_idx    on public.commissions(payout_id);

-- ── notifications (one-way feed to the affiliate) ──
create table if not exists public.notifications (
  id          uuid default gen_random_uuid() primary key,
  created_at  timestamptz default now(),
  affiliate_id uuid not null references public.affiliates(id),
  type        text not null,    -- order_placed | commission_confirmed | commission_reversed | commission_clawback | payout_sent
  message     text not null,
  read        boolean default false
);
create index if not exists notifications_affiliate_idx on public.notifications(affiliate_id, read, created_at desc);

-- ============================================================
-- Commission lifecycle trigger — single source of truth
-- ============================================================
create or replace function public.affiliate_commission_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  aff        record;
  c          record;
  base       numeric(10,2);
  new_amount numeric(10,2);
  new_status text;
  ref        text;
begin
  -- Only act when the order is linked to an affiliate.
  if NEW.affiliate_id is null then
    return NEW;
  end if;

  select * into aff from public.affiliates where id = NEW.affiliate_id;
  if not found then
    return NEW;
  end if;

  base := coalesce(NEW.subtotal, NEW.total, 0);
  ref  := coalesce(NEW.notes, upper(left(NEW.id::text, 8)));

  select * into c from public.commissions where order_id = NEW.id;

  -- Amount: use the snapshot if the commission already exists, else the
  -- affiliate's current config (which becomes the snapshot).
  if found then
    if c.commission_type_snapshot = 'flat' then
      new_amount := c.commission_rate_snapshot;
    else
      new_amount := round(base * c.commission_rate_snapshot / 100.0, 2);
    end if;
  else
    if coalesce(aff.commission_type, 'percentage') = 'flat' then
      new_amount := coalesce(aff.commission_rate, 0);
    else
      new_amount := round(base * coalesce(aff.commission_rate, 0) / 100.0, 2);
    end if;
  end if;

  -- Derive commission status from order status (never downgrade a paid one).
  if NEW.status in ('cancelled', 'refunded') then
    if found and c.status = 'paid' then
      new_status := 'clawback';
    else
      new_status := 'reversed';
    end if;
  elsif NEW.status = 'dispatched' then
    if found and c.status in ('paid', 'clawback') then
      new_status := c.status;
    else
      new_status := 'payable';
    end if;
  else
    -- pending / paid (payment received, not yet dispatched) / other
    if found and c.status in ('paid', 'clawback') then
      new_status := c.status;
    else
      new_status := 'pending';
    end if;
  end if;

  if found then
    if c.status is distinct from new_status
       or c.amount is distinct from new_amount
       or c.order_status is distinct from NEW.status then
      update public.commissions
        set status = new_status, amount = new_amount,
            order_status = NEW.status, order_reference = ref, updated_at = now()
        where id = c.id;

      -- Fire affiliate notifications on meaningful transitions.
      if new_status = 'payable' and c.status <> 'payable' then
        insert into public.notifications(affiliate_id, type, message)
          values (NEW.affiliate_id, 'commission_confirmed',
                  'Commission confirmed — order ' || ref || ' was dispatched.');
      elsif new_status = 'reversed' and c.status <> 'reversed' then
        insert into public.notifications(affiliate_id, type, message)
          values (NEW.affiliate_id, 'commission_reversed',
                  'Commission reversed — order ' || ref || ' was ' || NEW.status || '.');
      elsif new_status = 'clawback' and c.status <> 'clawback' then
        insert into public.notifications(affiliate_id, type, message)
          values (NEW.affiliate_id, 'commission_clawback',
                  'A previously paid commission for order ' || ref || ' was reversed.');
      end if;
    end if;
  else
    insert into public.commissions(
      order_id, affiliate_id, amount, commission_type_snapshot,
      commission_rate_snapshot, subtotal_snapshot, order_reference, order_status, status)
    values (
      NEW.id, NEW.affiliate_id, new_amount, coalesce(aff.commission_type, 'percentage'),
      coalesce(aff.commission_rate, 0), base, ref, NEW.status, new_status);

    insert into public.notifications(affiliate_id, type, message)
      values (NEW.affiliate_id, 'order_placed',
              'New order ' || ref || ' placed with your code'
              || case when new_status = 'payable' then ' (already dispatched — commission confirmed).' else '.' end);
  end if;

  return NEW;
end;
$$;

drop trigger if exists orders_affiliate_commission on public.orders;
create trigger orders_affiliate_commission
  after insert or update of status, affiliate_id on public.orders
  for each row execute function public.affiliate_commission_sync();

-- ============================================================
-- Row Level Security
-- Affiliates read ONLY their own rows; admin (is_admin) does everything;
-- service role (server functions) bypasses RLS for privileged writes.
-- ============================================================
alter table public.commissions   enable row level security;
alter table public.payouts        enable row level security;
alter table public.notifications  enable row level security;

-- helper predicate: the row's affiliate_id belongs to the logged-in user
-- commissions
drop policy if exists "commissions_own"     on public.commissions;
drop policy if exists "commissions_admin"   on public.commissions;
drop policy if exists "commissions_service" on public.commissions;
create policy "commissions_own" on public.commissions for select to authenticated
  using (affiliate_id in (select id from public.affiliates where user_id = auth.uid()));
create policy "commissions_admin"   on public.commissions for all to authenticated using (public.is_admin());
create policy "commissions_service" on public.commissions for all to service_role  using (true);

-- payouts
drop policy if exists "payouts_own"     on public.payouts;
drop policy if exists "payouts_admin"   on public.payouts;
drop policy if exists "payouts_service" on public.payouts;
create policy "payouts_own" on public.payouts for select to authenticated
  using (affiliate_id in (select id from public.affiliates where user_id = auth.uid()));
create policy "payouts_admin"   on public.payouts for all to authenticated using (public.is_admin());
create policy "payouts_service" on public.payouts for all to service_role  using (true);

-- notifications (affiliate may also mark their own as read)
drop policy if exists "notifications_own_select" on public.notifications;
drop policy if exists "notifications_own_update" on public.notifications;
drop policy if exists "notifications_admin"      on public.notifications;
drop policy if exists "notifications_service"    on public.notifications;
create policy "notifications_own_select" on public.notifications for select to authenticated
  using (affiliate_id in (select id from public.affiliates where user_id = auth.uid()));
create policy "notifications_own_update" on public.notifications for update to authenticated
  using (affiliate_id in (select id from public.affiliates where user_id = auth.uid()))
  with check (affiliate_id in (select id from public.affiliates where user_id = auth.uid()));
create policy "notifications_admin"   on public.notifications for all to authenticated using (public.is_admin());
create policy "notifications_service" on public.notifications for all to service_role  using (true);
