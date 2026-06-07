-- Lightweight fixed-window rate limiter for unauthenticated API endpoints.
-- Used to blunt scripted abuse of create-fena-payment etc. (financial-exposure hardening).
create table if not exists public.api_rate_limits (
  bucket       text primary key,
  count        int not null default 0,
  window_start timestamptz not null default now()
);

alter table public.api_rate_limits enable row level security;
-- No policies => only the service role (used by the edge functions) can touch it.

-- Atomic check-and-increment. Returns TRUE when the request is allowed
-- (i.e. count within p_limit for the current window), FALSE when it should be throttled.
create or replace function public.check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.api_rate_limits as r (bucket, count, window_start)
       values (p_key, 1, now())
  on conflict (bucket) do update
       set count = case
                     when r.window_start < now() - make_interval(secs => p_window_seconds) then 1
                     else r.count + 1
                   end,
           window_start = case
                     when r.window_start < now() - make_interval(secs => p_window_seconds) then now()
                     else r.window_start
                   end
  returning r.count into v_count;

  return v_count <= p_limit;
end;
$$;

-- This function must never be callable by browser clients.
revoke all on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
