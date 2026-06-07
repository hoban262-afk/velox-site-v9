-- 026_pro_points_multiplier.sql
-- Velox Pro loyalty-points multiplier by membership tier.
-- Applied live on 2026-06-08; this migration captures it in the repo so the
-- codebase matches the database.
--
-- Points per order = floor(order subtotal) × effective multiplier, where the
-- effective multiplier is the GREATER of the lifetime-spend loyalty tier
-- (Bronze 1× / Silver 1.25× / Gold 1.5× / Platinum 2×) and the active Velox Pro
-- membership multiplier (Solo 2× / Group 3× / Lab 4×), so members never earn less.

CREATE OR REPLACE FUNCTION public.award_order_points(p_order_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o record; v_base int; v_mult numeric; v_pro_mult numeric; v_eff numeric; v_points int;
  v_tier text; v_is_pro boolean; v_pro_tier text; v_pro_until timestamptz;
begin
  -- Only award for genuinely completed orders, once (idempotent claim)
  update public.orders set points_awarded = true
   where id = p_order_id
     and points_awarded = false
     and user_id is not null
     and status in ('paid','dispatched')
   returning * into o;
  if not found then return 0; end if;

  select loyalty_tier, is_pro, pro_tier, pro_until
    into v_tier, v_is_pro, v_pro_tier, v_pro_until
    from public.profiles where id = o.user_id;

  -- Loyalty-tier multiplier (lifetime spend).
  v_mult := case v_tier when 'Platinum' then 2.0 when 'Gold' then 1.5 when 'Silver' then 1.25 else 1.0 end;

  -- Velox Pro multiplier (active membership only): Lab 4x, Group 3x, Solo 2x.
  v_pro_mult := 1.0;
  if coalesce(v_is_pro, false) and (v_pro_until is null or v_pro_until > now()) then
    v_pro_mult := case v_pro_tier when 'lab' then 4.0 when 'group' then 3.0 when 'solo' then 2.0 else 1.0 end;
  end if;

  -- Take the better of the two so members never earn less.
  v_eff := greatest(v_mult, v_pro_mult);
  v_base := floor(coalesce(o.subtotal, o.total, 0));
  v_points := floor(v_base * v_eff);

  update public.profiles
     set loyalty_points  = greatest(0, loyalty_points + v_points - coalesce(o.points_redeemed,0)),
         lifetime_points = lifetime_points + v_points
   where id = o.user_id;
  return v_points;
end; $function$;
