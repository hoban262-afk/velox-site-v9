-- ============================================================
-- Newsletter welcome codes (20% off first order, one unique code per email)
-- Applied via Supabase MCP on 2026-05-27 (this file is the record).
-- ============================================================

create table public.newsletter_codes (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  code text unique not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  used_at timestamptz,
  order_id uuid references public.orders(id),
  unsubscribed_at timestamptz,
  ip text
);
create index newsletter_codes_code_idx on public.newsletter_codes (upper(code));

alter table public.newsletter_codes enable row level security;
-- No anon/authenticated access: all operations via service-role serverless functions.
create policy "newsletter_codes_admin"   on public.newsletter_codes for all to authenticated using (public.is_admin());
create policy "newsletter_codes_service" on public.newsletter_codes for all to service_role  using (true);

-- Track which welcome code an order used (so it's marked used on completion)
alter table public.orders add column if not exists welcome_code text;

-- Extend the existing order status trigger to mark/restore welcome codes too
create or replace function public.orders_loyalty_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('paid','dispatched') and old.status is distinct from new.status then
    perform public.award_order_points(new.id);
    if new.welcome_code is not null then
      update public.newsletter_codes set used_at = now(), order_id = new.id
       where upper(code) = upper(new.welcome_code) and used_at is null;
    end if;
  elsif new.status in ('cancelled','refunded') and old.status is distinct from new.status then
    perform public.reverse_order_points(new.id);
    if new.welcome_code is not null then
      update public.newsletter_codes set used_at = null, order_id = null where order_id = new.id;
    end if;
  end if;
  return new;
end; $$;
revoke execute on function public.orders_loyalty_trigger() from anon, authenticated, public;
