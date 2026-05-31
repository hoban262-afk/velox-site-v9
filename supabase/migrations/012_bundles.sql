-- ============================================================
-- Velox Peptides — Bundles (stacks) as data
-- Migration 012
-- ============================================================
-- A bundle is a set of product variants sold together at a discount. Its price
-- AUTO-COMPUTES from live component prices, so it can never go stale: change a
-- component's base price (or its components) and every bundle updates.
--   bundle price = round( sum(component base_price * qty) * (1 - discount_pct/100), 2 )
--   "was"        = sum(component base_price * qty)
-- (Uses component BASE prices, not their sale prices, so a bundle discount never
--  stacks on top of a component's own deal.)

create table if not exists public.bundles (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,            -- '/stacks/<slug>/'
  name         text not null,
  discount_pct numeric(5,2) not null default 0, -- e.g. 33 = 33% off component sum
  active       boolean not null default true,
  sort_order   integer not null default 0,
  updated_at   timestamptz not null default now()
);

create table if not exists public.bundle_components (
  id           uuid primary key default gen_random_uuid(),
  bundle_slug  text not null references public.bundles(slug) on delete cascade,
  product_slug text not null,
  size         text not null,
  qty          integer not null default 1,
  sort_order   integer not null default 0
);
create index if not exists bundle_components_bundle_idx on public.bundle_components (bundle_slug);

create or replace function public.touch_bundles() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists trg_touch_bundles on public.bundles;
create trigger trg_touch_bundles before update on public.bundles
  for each row execute function public.touch_bundles();

-- ── RLS: storefront reads, admin writes ──────────────────────────────────────
alter table public.bundles enable row level security;
alter table public.bundle_components enable row level security;

drop policy if exists "bundles_read" on public.bundles;
create policy "bundles_read" on public.bundles for select to anon, authenticated using (true);
drop policy if exists "bundles_admin" on public.bundles;
create policy "bundles_admin" on public.bundles for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "bundles_service" on public.bundles;
create policy "bundles_service" on public.bundles for all to service_role using (true) with check (true);

drop policy if exists "bcomp_read" on public.bundle_components;
create policy "bcomp_read" on public.bundle_components for select to anon, authenticated using (true);
drop policy if exists "bcomp_admin" on public.bundle_components;
create policy "bcomp_admin" on public.bundle_components for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "bcomp_service" on public.bundle_components;
create policy "bcomp_service" on public.bundle_components for all to service_role using (true) with check (true);

-- Authoritative bundle price (used by hydration + server-side price guard).
create or replace function public.bundle_price(p_slug text)
returns numeric language sql stable as $$
  select round(
           coalesce(sum(v.base_price * bc.qty), 0)
           * (1 - (select discount_pct from public.bundles where slug = p_slug) / 100.0)
         , 2)
  from public.bundle_components bc
  join public.product_variants v
    on v.slug = bc.product_slug and v.size = bc.size
  where bc.bundle_slug = p_slug;
$$;
