-- ============================================================
-- 015_monitor_state — remembers last-known health so the health-monitor cron
-- only alerts on a state CHANGE (up→down / down→up), not every run.
-- Service-role only.
--
-- Applied to project stkjdtyhaxejxqmbzyua via the Supabase MCP on 2026-06-06.
-- ============================================================
create table if not exists public.monitor_state (
  key            text primary key,
  status         text not null default 'up',   -- 'up' | 'down'
  detail         text,
  since          timestamptz default now(),
  last_alert_at  timestamptz,
  updated_at     timestamptz default now()
);

alter table public.monitor_state enable row level security;
revoke all on public.monitor_state from anon, authenticated;
create policy "monitor_service" on public.monitor_state for all to service_role using (true);
