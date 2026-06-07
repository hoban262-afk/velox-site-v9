-- 019_storefront_events — first-party funnel events (add_to_cart, begin_checkout)
-- kept separate from `visits` so page-view/traffic counts are not inflated.
-- Applied to project stkjdtyhaxejxqmbzyua via the Supabase MCP on 2026-06-07.
create table if not exists public.events (
  id         uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  sid        text not null,
  event      text not null,         -- 'add_to_cart' | 'begin_checkout'
  path       text,
  meta       jsonb
);
create index if not exists idx_events_time on public.events(created_at desc);
create index if not exists idx_events_ev   on public.events(event, created_at desc);

alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;
create policy "events_service" on public.events for all to service_role using (true) with check (true);
