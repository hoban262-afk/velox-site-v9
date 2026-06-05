-- Applied via Supabase MCP on 2026-05-27.
-- Track unsubscribe at the subscriber level (newsletter-form signups have no
-- newsletter_codes row), so the broadcast tool can exclude unsubscribed people.
alter table public.subscribers add column if not exists unsubscribed_at timestamptz;
