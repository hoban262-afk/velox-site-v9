-- 027_chat_transcripts — one stored row per on-site chatbot conversation.
-- The chat backend (api/chat.js) is stateless per turn, so transcripts are
-- captured here keyed by the widget session id (sid). Two cron workers read
-- this table: a per-chat "flush" (emails each conversation once it goes quiet)
-- and a daily "digest" (one summary of all conversations). Both send to
-- support@veloxpeps.com. Rows hold visitor emails (PII) so the table is
-- service-role only — never exposed to anon/authenticated.
create table if not exists public.chat_transcripts (
  sid         text primary key,          -- widget session id (sessionStorage vcw_sid)
  email       text,                      -- captured visitor email, if shared
  page        text,                      -- page of the most recent turn
  transcript  jsonb not null default '[]'::jsonb,  -- [{role,content}, ...] full thread
  msg_count   int  not null default 0,   -- number of stored turns
  started_at  timestamptz not null default now(),
  last_at     timestamptz not null default now(),  -- last activity (drives the flush)
  emailed_at  timestamptz,               -- per-chat transcript emailed (null = not yet)
  digest_at   timestamptz                -- included in a daily digest (null = not yet)
);

create index if not exists idx_chat_transcripts_last on public.chat_transcripts(last_at desc);
-- Fast lookup for the flush worker: conversations not yet emailed.
create index if not exists idx_chat_transcripts_unsent on public.chat_transcripts(last_at) where emailed_at is null;

alter table public.chat_transcripts enable row level security;
revoke all on public.chat_transcripts from anon, authenticated;
create policy "chat_transcripts_service" on public.chat_transcripts
  for all to service_role using (true) with check (true);
