-- (a) Track which payable commissions have had their "confirmed" email sent.
alter table public.commissions add column if not exists payable_emailed_at timestamptz;

-- (b) Re-create affiliate_commission_sync() WITH a self-referral guard:
--     an affiliate cannot earn commission on an order placed with their own
--     account email. Full body re-created (the only change vs 006 is the guard
--     block right after the affiliate lookup).
create or replace function public.affiliate_commission_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  aff record; c record; base numeric(10,2); new_amount numeric(10,2); new_status text; ref text;
begin
  if NEW.affiliate_id is null then return NEW; end if;
  select * into aff from public.affiliates where id = NEW.affiliate_id;
  if not found then return NEW; end if;

  -- Self-referral guard.
  if NEW.customer_email is not null and aff.email is not null
     and lower(NEW.customer_email) = lower(aff.email) then
    return NEW;
  end if;

  base := coalesce(NEW.subtotal, NEW.total, 0);
  ref  := coalesce(NEW.notes, upper(left(NEW.id::text, 8)));
  select * into c from public.commissions where order_id = NEW.id;

  if found then
    if c.commission_type_snapshot = 'flat' then new_amount := c.commission_rate_snapshot;
    else new_amount := round(base * c.commission_rate_snapshot / 100.0, 2); end if;
  else
    if coalesce(aff.commission_type, 'percentage') = 'flat' then new_amount := coalesce(aff.commission_rate, 0);
    else new_amount := round(base * coalesce(aff.commission_rate, 0) / 100.0, 2); end if;
  end if;

  if NEW.status in ('cancelled', 'refunded') then
    if found and c.status = 'paid' then new_status := 'clawback'; else new_status := 'reversed'; end if;
  elsif NEW.status = 'dispatched' then
    if found and c.status in ('paid', 'clawback') then new_status := c.status; else new_status := 'payable'; end if;
  else
    if found and c.status in ('paid', 'clawback') then new_status := c.status; else new_status := 'pending'; end if;
  end if;

  if found then
    if c.status is distinct from new_status or c.amount is distinct from new_amount or c.order_status is distinct from NEW.status then
      update public.commissions set status = new_status, amount = new_amount, order_status = NEW.status, order_reference = ref, updated_at = now() where id = c.id;
      if new_status = 'payable' and c.status <> 'payable' then
        insert into public.notifications(affiliate_id, type, message) values (NEW.affiliate_id, 'commission_confirmed', 'Commission confirmed — order ' || ref || ' was dispatched.');
      elsif new_status = 'reversed' and c.status <> 'reversed' then
        insert into public.notifications(affiliate_id, type, message) values (NEW.affiliate_id, 'commission_reversed', 'Commission reversed — order ' || ref || ' was ' || NEW.status || '.');
      elsif new_status = 'clawback' and c.status <> 'clawback' then
        insert into public.notifications(affiliate_id, type, message) values (NEW.affiliate_id, 'commission_clawback', 'A previously paid commission for order ' || ref || ' was reversed.');
      end if;
    end if;
  else
    insert into public.commissions(order_id, affiliate_id, amount, commission_type_snapshot, commission_rate_snapshot, subtotal_snapshot, order_reference, order_status, status)
      values (NEW.id, NEW.affiliate_id, new_amount, coalesce(aff.commission_type, 'percentage'), coalesce(aff.commission_rate, 0), base, ref, NEW.status, new_status);
    insert into public.notifications(affiliate_id, type, message)
      values (NEW.affiliate_id, 'order_placed', 'New order ' || ref || ' placed with your code' || case when new_status = 'payable' then ' (already dispatched — commission confirmed).' else '.' end);
  end if;
  return NEW;
end;
$$;
