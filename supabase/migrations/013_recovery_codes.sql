-- ============================================================
-- Cart-recovery 15% codes — stage-3 abandoned-checkout incentive
-- Migration 013
-- Applied via Supabase MCP (this file is the record).
-- ============================================================
-- The 3-email checkout-recovery sequence (api/recovery/run.js) sends a unique,
-- single-use 15% code on the FINAL email (12h after drop-off). Each code is
-- bound to the customer's email and expires in 7 days. Stored here (not in
-- newsletter_codes, which is one-welcome-code-per-email) so the same person can
-- hold both a welcome code and a recovery code.

create table if not exists public.recovery_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code text unique not null,
  order_id uuid references public.orders(id),
  discount_pct smallint not null default 15,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  unsubscribed_at timestamptz
);
create index if not exists recovery_codes_code_idx  on public.recovery_codes (upper(code));
create index if not exists recovery_codes_order_idx on public.recovery_codes (order_id);

alter table public.recovery_codes enable row level security;
-- Service-role serverless functions only (mirrors newsletter_codes).
create policy "recovery_codes_admin"   on public.recovery_codes for all to authenticated using (public.is_admin());
create policy "recovery_codes_service" on public.recovery_codes for all to service_role  using (true);

-- Extend the order trigger to also mark/restore recovery codes. Checkout stores
-- whichever VELOX- code was applied in orders.welcome_code, so matching by code
-- covers both welcome and recovery codes.
create or replace function public.orders_loyalty_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('paid','dispatched') and old.status is distinct from new.status then
    perform public.award_order_points(new.id);
    if new.welcome_code is not null then
      update public.newsletter_codes set used_at = now(), order_id = new.id
       where upper(code) = upper(new.welcome_code) and used_at is null;
      update public.recovery_codes set used_at = now(), order_id = new.id
       where upper(code) = upper(new.welcome_code) and used_at is null;
    end if;
  elsif new.status in ('cancelled','refunded') and old.status is distinct from new.status then
    perform public.reverse_order_points(new.id);
    if new.welcome_code is not null then
      update public.newsletter_codes set used_at = null, order_id = null where order_id = new.id;
      update public.recovery_codes  set used_at = null where order_id = new.id and used_at is not null;
    end if;
  end if;
  return new;
end; $$;
revoke execute on function public.orders_loyalty_trigger() from anon, authenticated, public;
