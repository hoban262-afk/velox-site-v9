-- ============================================================
-- Velox Peptides — Post-dispatch review requests
-- Migration 010
-- ============================================================
-- Once an order has been dispatched and the customer has had time to receive
-- it, we send a single email asking them to leave a review on the product
-- page. One request per order; this column records when it was sent.

alter table orders add column if not exists review_request_sent_at timestamptz;

create index if not exists orders_review_idx
  on orders (status, created_at, review_request_sent_at);
