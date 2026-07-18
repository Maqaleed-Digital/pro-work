-- WC-SEC-02 / SEC-FIX-WC-01B real-Postgres test fixture (run as superuser).
-- Minimal invoices world mirroring the live topology the codification migration targets:
--   * tables owned by `prowork` (the RDS master), so FORCE RLS is observable on the owner;
--   * wc_app = the runtime role, NOBYPASSRLS, granted DML but bound by FORCE RLS;
--   * cross-tenant seed (two tenants) so a mis-scoped read/write is detectable;
--   * NO row-level security here — the MIGRATION UNDER TEST adds ENABLE/FORCE + policies;
--   * NO FK on invoice_line_items.invoice_id — mirrors live (0 FK rows), isolation is via policy.
\set ON_ERROR_STOP on

create role prowork;
create role wc_app nosuperuser nobypassrls noinherit login password 'test';

-- schema mirrors 20260617_create_invoices.sql (subset), tables owned by prowork, NO inline FK
create table public.invoices (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      text not null,
  invoice_number text unique,
  currency       text not null default 'SAR',
  subtotal       numeric(14,2) not null default 0,
  vat_rate       numeric(5,4)  not null default 0,
  vat_amount     numeric(14,2) not null default 0,
  total          numeric(14,2) not null default 0,
  status         text not null default 'draft' check (status in ('draft','issued','void')),
  created_by     uuid,
  issued_by      uuid,
  created_at     timestamptz not null default now(),
  issued_at      timestamptz
);
alter table public.invoices owner to prowork;

create table public.invoice_line_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null,                 -- NO FK: mirrors live (0 FK rows)
  description text not null,
  qty         numeric(14,2) not null,
  unit_amount numeric(14,2) not null,
  line_total  numeric(14,2) not null
);
alter table public.invoice_line_items owner to prowork;

create index if not exists idx_invoices_tenant            on public.invoices(tenant_id);
create index if not exists idx_invoice_line_items_invoice on public.invoice_line_items(invoice_id);

-- cross-tenant seed: one invoice + one line item per tenant, deterministic ids
insert into public.invoices (id, tenant_id, total) values
  ('11111111-1111-1111-1111-111111111111','tn-1', 100),
  ('22222222-2222-2222-2222-222222222222','tn-2', 200);
insert into public.invoice_line_items (invoice_id, description, qty, unit_amount, line_total) values
  ('11111111-1111-1111-1111-111111111111','t1 work', 1, 100, 100),
  ('22222222-2222-2222-2222-222222222222','t2 work', 1, 200, 200);

-- runtime-role DML grants (mirror the wc_app broad-DML grant on billing tables)
grant select, insert, update, delete on public.invoices           to wc_app;
grant select, insert, update, delete on public.invoice_line_items to wc_app;
