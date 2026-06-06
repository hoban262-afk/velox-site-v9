-- ============================================================
-- 014_stock_automation
-- Auto-decrement stock on paid orders, auto-flag low stock.
--
-- SAFE BY DESIGN: only variants with a non-null stock_qty are touched. With
-- every stock_qty currently NULL, this is a complete no-op until the owner
-- seeds a real count (via the Pricing tab or the packer goods-in screen).
-- Untracked variants keep their manually-set in_stock / low_stock flags.
--
-- Applied to project stkjdtyhaxejxqmbzyua via the Supabase MCP on 2026-06-06.
-- ============================================================

-- Per-variant reorder threshold (when stock_qty <= this, low_stock flips true).
alter table public.product_variants
  add column if not exists low_stock_threshold integer not null default 10;

-- Idempotency guard so a paid order can never be decremented twice
-- (both the Fena return AND the webhook can mark an order paid).
alter table public.orders
  add column if not exists stock_decremented boolean not null default false;

-- Recompute the in_stock / low_stock flags for every TRACKED variant.
create or replace function public.velox_recompute_stock_flags()
returns void
language sql
security definer
set search_path = public
as $$
  update public.product_variants
     set low_stock = (stock_qty is not null and stock_qty <= low_stock_threshold),
         in_stock  = (stock_qty is null or stock_qty > 0),
         updated_at = now()
   where stock_qty is not null;
$$;

-- BEFORE UPDATE trigger: when an order first becomes paid, decrement the stock
-- of each matching tracked variant, then refresh the flags.
create or replace function public.velox_decrement_stock_on_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  itm   jsonb;
  v_slug text;
  v_size text;
  v_qty  integer;
begin
  if NEW.status = 'paid'
     and OLD.status is distinct from 'paid'
     and coalesce(OLD.stock_decremented, false) = false then

    for itm in select jsonb_array_elements(coalesce(NEW.items, '[]'::jsonb)) loop
      v_slug := itm->>'slug';
      v_size := itm->>'size';
      v_qty  := coalesce((itm->>'qty')::int, (itm->>'quantity')::int, 1);
      if v_slug is not null then
        update public.product_variants
           set stock_qty = greatest(0, coalesce(stock_qty, 0) - v_qty),
               updated_at = now()
         where slug = v_slug
           and (size = v_size or (v_size is null and size is null))
           and stock_qty is not null;
      end if;
    end loop;

    perform public.velox_recompute_stock_flags();
    NEW.stock_decremented := true;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_velox_decrement_stock on public.orders;
create trigger trg_velox_decrement_stock
  before update on public.orders
  for each row
  execute function public.velox_decrement_stock_on_paid();
