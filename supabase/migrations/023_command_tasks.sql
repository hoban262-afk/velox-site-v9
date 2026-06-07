-- Command Centre: unified personal + business to-do list.
-- Read/written only via api/command/tasks (service role, admin-gated).
create table if not exists public.command_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  kind text not null default 'personal',
  done boolean not null default false,
  done_at timestamptz,
  due date,
  sort integer not null default 0
);

comment on table public.command_tasks is 'Unified personal + business to-do list for the Command Centre. Admin-only: written/read via api/command/tasks (service role). Service-role only.';

alter table public.command_tasks enable row level security;
-- No anon/authenticated policies: reached only through the service-role
-- Command Centre endpoint, which gates on admin auth itself.

create index if not exists command_tasks_open_idx on public.command_tasks (done, created_at desc);
