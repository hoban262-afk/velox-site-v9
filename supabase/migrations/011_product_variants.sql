-- ============================================================
-- Velox Peptides — Product pricing: single source of truth
-- Migration 011
-- ============================================================
-- One row per purchasable variant (product + vial size). This becomes the
-- ONLY place prices live. Key principle:
--   base_price  = the anchor / RRP. The only thing you edit for a real price
--                 change. Never overwritten by a deal.
--   sale_price  = optional deal layer. NULL = no deal. "Was" = base_price,
--                 "Now" = sale_price. Discounts ALWAYS derive from base.
--   discountable = false for items that must never be discounted (e.g. pens) —
--                 excludes them from sale, volume, and code discounts at the
--                 data level (no more /pen/ regex scattered through the JS).

create table if not exists public.product_variants (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null,                 -- product slug, e.g. 'retatrutide'
  name          text not null,                 -- display name, e.g. 'Retatrutide'
  size          text not null,                 -- '10mg', '40mg Pen'
  base_price    numeric(10,2) not null,        -- the normal selling price (what it charges)
  sale_price    numeric(10,2),                 -- active DEAL price (NULL = not on a deal)
  compare_at    numeric(10,2),                 -- optional higher RRP for a strikethrough "was"
  discountable  boolean not null default true, -- false = excluded from deal/volume/code discounts (pens)
  deal_flag     boolean not null default false,-- "Deal of the week" highlight
  in_stock      boolean not null default true,
  low_stock     boolean not null default false,
  sort_order    integer not null default 0,    -- order of sizes within a product
  updated_at    timestamptz not null default now(),
  unique (slug, size)
);

create index if not exists product_variants_slug_idx on public.product_variants (slug);

-- Keep updated_at fresh on edits.
create or replace function public.touch_product_variants() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;
drop trigger if exists trg_touch_product_variants on public.product_variants;
create trigger trg_touch_product_variants before update on public.product_variants
  for each row execute function public.touch_product_variants();

-- ── RLS: storefront reads, admin writes ──────────────────────────────────────
alter table public.product_variants enable row level security;

drop policy if exists "variants_public_read" on public.product_variants;
create policy "variants_public_read" on public.product_variants
  for select to anon, authenticated using (true);

drop policy if exists "variants_admin_write" on public.product_variants;
create policy "variants_admin_write" on public.product_variants
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "variants_service" on public.product_variants;
create policy "variants_service" on public.product_variants
  for all to service_role using (true) with check (true);

-- Effective unit price = deal price if on a deal, else the normal price.
-- (compare_at is display-only; cart-level volume/code discounts are applied on
-- top of this by the checkout layer, and only when discountable = true.)
-- Used by server-side price validation at checkout.
create or replace function public.variant_effective_price(p_slug text, p_size text)
returns numeric language sql stable as $$
  select coalesce(v.sale_price, v.base_price)
  from public.product_variants v
  where v.slug = p_slug and v.size = p_size
  limit 1;
$$;
