-- One-shot claim for the public bank-transfer alert path in api/send-order.js.
-- Kept separate from email_sent_at (028) on purpose: fena-webhook sets
-- email_sent_at *before* it triggers /api/send-order, so reusing that flag
-- would make send-order skip every webhook-paid order.
alter table orders add column if not exists bank_notified_at timestamptz;
