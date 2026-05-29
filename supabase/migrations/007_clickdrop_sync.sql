-- ============================================================
-- Velox Peptides — Royal Mail Click & Drop sync fields (Phase 2 fulfilment)
-- Tracks whether a paid order has been pushed into Click & Drop via the
-- Click & Drop REST API, so the push is idempotent (never double-imports)
-- and failures are visible in the admin.
-- ============================================================

-- Identifier returned by Click & Drop when the order is created.
-- Non-null means "already pushed" → the push function skips it.
alter table public.orders add column if not exists clickdrop_order_identifier text;
alter table public.orders add column if not exists clickdrop_synced_at        timestamptz;
-- Last error message from a failed push (cleared on success).
alter table public.orders add column if not exists clickdrop_error            text;
