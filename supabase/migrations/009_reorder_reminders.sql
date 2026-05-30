-- ============================================================
-- Velox Peptides — Reorder / replenishment reminders
-- Migration 009
-- ============================================================
-- Research peptides are consumed on a fairly predictable cycle, so we nudge
-- past buyers ~4 weeks after dispatch to reorder. One reminder per order;
-- this column records when (and whether) that reminder was sent.

alter table orders add column if not exists reorder_email_sent_at timestamptz;

-- The reorder cron looks up paid/dispatched orders in a date window that
-- haven't been reminded yet — this index keeps that query fast.
create index if not exists orders_reorder_idx
  on orders (status, created_at, reorder_email_sent_at);
