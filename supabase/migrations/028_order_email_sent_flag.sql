-- Idempotency flag: prevents duplicate order confirmation emails when both
-- the browser redirect (confirm-fena-payment) and the Fena webhook race to
-- mark an order paid. The first path to win sets email_sent_at; the loser
-- sees it's already set and skips sending.
alter table orders add column if not exists email_sent_at timestamptz;
