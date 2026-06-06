-- 017_storage_log.sql
-- Velox Pro "Storage & stability log": members record reconstituted peptides and
-- the tool tracks the stability window (28 days at 2–8°C with bacteriostatic
-- water, 24h without). One row per logged vial; owned by the member.

create table if not exists public.storage_log (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  compound         text not null,
  size             text,
  reconstituted_on date not null,
  with_bac         boolean not null default true,
  note             text,
  created_at       timestamptz not null default now()
);

create index if not exists storage_log_user_idx on public.storage_log(user_id);

alter table public.storage_log enable row level security;
create policy "storage_log_owner_all" on public.storage_log
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "storage_log_service" on public.storage_log
  for all to service_role using (true) with check (true);
