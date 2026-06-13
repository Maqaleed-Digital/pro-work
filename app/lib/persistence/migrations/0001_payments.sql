-- WO-WC-HYPERPAY-001 — payments persistence (PREPARED, NOT auto-applied).
--
-- Deliberately a standalone migration (NOT added to postgres_client.initSchema)
-- so it is never auto-created at app startup. Applying it to any database is a
-- separate, explicit step. Idempotent. Rollback: 0001_payments_rollback.sql.

begin;

create table if not exists payment_transactions (
  id varchar(64) primary key,
  tenant_id varchar(64) references tenants(id),
  merchant_transaction_id varchar(128),
  checkout_id varchar(128) unique,
  amount decimal(15,2),
  currency varchar(8),
  payment_brand varchar(32),
  status varchar(32) default 'created',        -- created|pending|success|rejected
  result_code varchar(32),
  psp_response jsonb,
  mode varchar(16) default 'sandbox',          -- audit which rail produced the row
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists payment_webhook_events (
  id varchar(64) primary key,
  checkout_id varchar(128),
  payment_id varchar(128),
  event_type varchar(64),
  signature_valid boolean not null,            -- false => unauthenticated, not processed
  payload jsonb,
  headers jsonb,
  processed_at timestamptz default now()
);

create index if not exists idx_payment_tx_tenant   on payment_transactions(tenant_id);
create index if not exists idx_payment_tx_checkout on payment_transactions(checkout_id);
create index if not exists idx_payment_tx_status   on payment_transactions(status);
create index if not exists idx_payment_whk_checkout on payment_webhook_events(checkout_id);
create index if not exists idx_payment_whk_valid    on payment_webhook_events(signature_valid);

commit;
