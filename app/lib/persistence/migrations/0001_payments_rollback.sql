-- WO-WC-HYPERPAY-001 — rollback for 0001_payments.sql. Idempotent.
begin;
drop table if exists payment_webhook_events;
drop table if exists payment_transactions;
commit;
