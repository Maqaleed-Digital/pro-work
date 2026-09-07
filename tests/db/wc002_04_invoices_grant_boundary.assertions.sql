-- WC002-04 T3 — privilege-boundary assertions for
-- 20260907_wc002_04_invoices_grant_boundary.sql.
--
-- These run AFTER the grant-boundary migration has been applied twice (idempotency)
-- by tests/db/run_wc_sec_02_force_rls.sh. They assert the privilege half of the
-- boundary; the RLS half is asserted by wc_sec_02_force_rls_invoices.assertions.sql.

-- G1 — PUBLIC holds nothing on either billing table.
do $$
declare n int;
begin
  select count(*) into n
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('invoices','invoice_line_items')
     and grantee = 'PUBLIC';
  if n <> 0 then
    raise exception 'G1 FAIL: PUBLIC still holds % grant(s) on the billing tables', n;
  end if;
end $$;

-- G2 — wc_app holds exactly the four DML privileges on BOTH tables, stated
--      explicitly rather than inherited from a point-in-time blanket grant.
do $$
declare n int;
begin
  select count(*) into n
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('invoices','invoice_line_items')
     and grantee = 'wc_app'
     and privilege_type in ('SELECT','INSERT','UPDATE','DELETE');
  if n <> 8 then
    raise exception 'G2 FAIL: wc_app has % of the expected 8 DML grants across the two billing tables', n;
  end if;
end $$;

-- G3 — the grant does NOT defeat the policy. wc_app is NOBYPASSRLS and both tables
--      remain FORCE RLS, so reach is still bounded by tenant isolation.
do $$ begin
  if (select rolbypassrls from pg_roles where rolname = 'wc_app') then
    raise exception 'G3 FAIL: wc_app is BYPASSRLS — grants would escape the policy';
  end if;
  if (select count(*) from pg_class
       where relname in ('invoices','invoice_line_items')
         and relnamespace = 'public'::regnamespace
         and relrowsecurity and relforcerowsecurity) <> 2 then
    raise exception 'G3 FAIL: FORCE RLS is not set on both billing tables';
  end if;
end $$;

-- G4 — the guarded anon revoke is a genuine no-op here: this role model has no anon.
--      If anon is ever introduced, the migration revokes it; this asserts today's truth.
do $$
declare n int;
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    select count(*) into n
      from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name in ('invoices','invoice_line_items')
       and grantee = 'anon';
    if n <> 0 then
      raise exception 'G4 FAIL: anon exists and holds % grant(s) on the billing tables', n;
    end if;
  end if;
end $$;

-- G5 — tenant isolation still actually works as wc_app after the grants land.
--      Verified AS wc_app, never as the DDL/owner role.
set role wc_app;
set app.current_tenant_id = 'tn-1';
do $$
declare visible int;
begin
  select count(*) into visible from invoices;
  if visible = 0 then
    raise exception 'G5 FAIL: wc_app can see NO invoices under tn-1 — grant or policy is wrong';
  end if;
  if exists (select 1 from invoices where tenant_id <> 'tn-1') then
    raise exception 'G5 FAIL: wc_app can see cross-tenant invoices — isolation broken';
  end if;
end $$;
reset role;
reset app.current_tenant_id;

select 'WC002_04_INVOICES_GRANT_BOUNDARY_TEST: ALL_ASSERTIONS_PASS' as result;
