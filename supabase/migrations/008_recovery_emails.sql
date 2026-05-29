-- ============================================================
-- Velox Peptides — Checkout / payment-drop-off recovery
-- Migration 008
-- ============================================================
-- An abandoned checkout in this codebase is simply an order that
-- create-fena-payment wrote as 'pending' and that the Fena webhook /
-- confirm-fena-payment never advanced to 'paid'. We don't need a new
-- table — we just track how far through the recovery email sequence
-- each pending order has progressed.

alter table orders add column if not exists recovery_stage smallint not null default 0;
alter table orders add column if not exists last_recovery_email_at timestamptz;

-- Speeds up the cron worker's "find due pending orders" query.
create index if not exists orders_recovery_idx
  on orders (status, payment_method, created_at);

-- Reporting note (no schema needed): a recovered order is one where
-- recovery_stage > 0 AND status in ('paid','dispatched').
-- e.g. recovered revenue =
--   select coalesce(sum(total),0) from orders
--   where recovery_stage > 0 and status in ('paid','dispatched');
