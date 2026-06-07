-- ============================================================
-- 016_design_lab_usage — tracks each Velox Design Lab generation run so usage
-- can be gated by membership tier (free=1 lifetime, solo=4/mo, group=20/mo, lab=∞).
-- Applied to project stkjdtyhaxejxqmbzyua via the Supabase MCP on 2026-06-07.
-- ============================================================
create table if not exists public.design_lab_usage (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid not null,
  created_at      timestamptz default now(),
  target          text,
  candidate_count integer,
  tier_at_run     text
);
create index if not exists idx_dlu_user_time on public.design_lab_usage(user_id, created_at desc);

alter table public.design_lab_usage enable row level security;
revoke all on public.design_lab_usage from anon, authenticated;
create policy "dlu_service"   on public.design_lab_usage for all    to service_role  using (true);
create policy "dlu_own_read"  on public.design_lab_usage for select to authenticated using (auth.uid() = user_id);
