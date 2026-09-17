-- 030_email_suppressions — authoritative "do not email me" list.
--
-- Applied to production as version 20260917122756 (name: 011_email_suppressions).
-- Numbered 030 here because 011_product_variants.sql already owns 011 in this
-- directory; Supabase versions migrations by timestamp, so the file name is
-- only a label and the two do not collide.
--
-- WHY THIS EXISTS
-- Opt-out used to be recorded as `unsubscribed_at` on `subscribers` and on
-- `newsletter_codes`. Both are keyed to people who signed up for marketing, so
-- a guest buyer — present in `orders` but in neither table — had nowhere to be
-- recorded. /api/newsletter/unsubscribe PATCHed both tables, matched zero rows,
-- and still rendered a success page, while the reorder / review / restock /
-- design-nurture sequences carried on emailing them.
--
-- This table is keyed by email alone, so it covers everyone regardless of how
-- they entered the system. lib/mail.js checks it on every marketing send as a
-- final backstop; each sequence also pre-checks it so it can park the record.

create table if not exists email_suppressions (
  email          text primary key,
  suppressed_at  timestamptz not null default now(),
  source         text not null default 'unsubscribe_link',
  note           text
);

-- Service-role only: RLS on with no policies means no anon/authenticated access.
alter table email_suppressions enable row level security;

-- Backfill the existing opt-outs from the two legacy stores so nobody who has
-- already unsubscribed gets re-enrolled the moment the backstop goes live.
-- lower() because lib/mail.js lowercases the address before it looks it up.
insert into email_suppressions (email, suppressed_at, source)
select lower(email), min(unsubscribed_at), 'backfill_subscribers'
  from subscribers
 where unsubscribed_at is not null and email is not null
 group by lower(email)
on conflict (email) do nothing;

insert into email_suppressions (email, suppressed_at, source)
select lower(email), min(unsubscribed_at), 'backfill_newsletter_codes'
  from newsletter_codes
 where unsubscribed_at is not null and email is not null
 group by lower(email)
on conflict (email) do nothing;
