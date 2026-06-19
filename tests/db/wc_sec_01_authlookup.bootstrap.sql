-- WC-SEC-01 GO-4-FIX real-Postgres test fixture (run as superuser).
-- Minimal users/invitations world under FORCE RLS, mirroring the live topology the GO-4 crash hit:
--   * tables owned by `prowork` (the RDS master), NOT by prowork_owner
--   * wc_app = the runtime role, NOBYPASSRLS, granted DML but bound by FORCE RLS
--   * cross-tenant seed data (two tenants) so a pre-auth lookup must read across tenants
\set ON_ERROR_STOP on

create role prowork;
create role prowork_owner;
create role prowork_app;
create role wc_app nosuperuser nobypassrls noinherit;
grant prowork_owner to prowork;            -- mirror real membership (prowork ∈ prowork_owner)

create table public.users (
  id            uuid primary key default gen_random_uuid(),
  email         varchar(255) not null,
  password_hash varchar(255) not null default 'x',
  tenant_id     varchar(64)  not null,
  role          varchar(32)  not null default 'OWNER',
  status        varchar(32)  not null default 'ACTIVE',
  unique (email, tenant_id)
);
alter table public.users owner to prowork;

create table public.invitations (
  id         uuid primary key default gen_random_uuid(),
  token      text not null unique,
  email      varchar(255) not null,
  tenant_id  varchar(64)  not null,
  role       varchar(32)  not null default 'VIEWER',
  status     varchar(32)  not null default 'PENDING',
  expires_at timestamptz  not null default now() + interval '7 days'
);
alter table public.invitations owner to prowork;

-- cross-tenant seed
insert into public.users (email, tenant_id) values ('owner@t1.test','tn-1'), ('owner@t2.test','tn-2');
insert into public.invitations (token, email, tenant_id) values ('tok-1','invitee@t1.test','tn-1');

-- runtime-role DML grants (mirror role_rehome broad-DML)
grant select, insert, update, delete on public.users       to wc_app;
grant select, insert, update, delete on public.invitations to wc_app;

-- FORCE RLS + tenant policy on both (mirror GO-3c on these two tables)
alter table public.users       enable row level security;
alter table public.users       force  row level security;
create policy users_isol on public.users for all to wc_app
  using (tenant_id = current_setting('app.current_tenant_id', true));
alter table public.invitations enable row level security;
alter table public.invitations force  row level security;
create policy inv_isol on public.invitations for all to wc_app
  using (tenant_id = current_setting('app.current_tenant_id', true));
