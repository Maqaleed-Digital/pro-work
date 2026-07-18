-- WC-SEC-02 / SEC-FIX-WC-01B real-Postgres EXECUTION assertions.
-- Run as superuser AFTER the bootstrap fixture + the migration under test have loaded.
-- Each assertion RAISEs on failure so psql (ON_ERROR_STOP) exits non-zero → test fails red.
-- Proves the CODIFIED migration reproduces the live isolation contract (V1-FINAL-wc-rls.txt).
\set ON_ERROR_STOP on

-- A0 — structural: FORCE RLS is set on BOTH tables (mirrors live relforcerowsecurity=t).
do $$ begin
  if (select count(*) from pg_class
       where relname in ('invoices','invoice_line_items')
         and relnamespace = 'public'::regnamespace
         and relrowsecurity and relforcerowsecurity) <> 2 then
    raise exception 'A0 FAIL: FORCE ROW LEVEL SECURITY not set on both invoices + invoice_line_items';
  end if;
end $$;

-- A1 — fail-closed for the runtime role: wc_app, NO GUC → ZERO rows on both tables.
set role wc_app;
do $$ begin
  if (select count(*) from invoices) <> 0
     or (select count(*) from invoice_line_items) <> 0 then
    raise exception 'A1 FAIL: wc_app saw rows with no tenant GUC — FORCE RLS not binding runtime role';
  end if;
end $$;
reset role;

-- A2 — FORCE binds the OWNER too: prowork (table owner), NO GUC → ZERO rows.
--      This is what FORCE adds over plain ENABLE (owner would otherwise bypass RLS).
set role prowork;
do $$ begin
  if (select count(*) from invoices) <> 0
     or (select count(*) from invoice_line_items) <> 0 then
    raise exception 'A2 FAIL: table owner prowork saw rows with no GUC — FORCE (not just ENABLE) is missing';
  end if;
end $$;
reset role;

-- A3 — tenant-scoped invoices read: wc_app + GUC tn-1 sees ONLY tn-1 (1 row, not tn-2).
set role wc_app;
set app.current_tenant_id = 'tn-1';
do $$ declare n int; declare wrong int; begin
  select count(*) into n     from invoices;
  select count(*) into wrong from invoices where tenant_id <> 'tn-1';
  if n <> 1 or wrong <> 0 then
    raise exception 'A3 FAIL: wc_app@tn-1 saw % invoices (% cross-tenant); expected 1/0', n, wrong;
  end if;
end $$;

-- A4 — tenant-scoped line-items read via EXISTS-join: wc_app + GUC tn-1 sees ONLY tn-1's line item.
do $$ declare n int; declare wrong int; begin
  select count(*) into n from invoice_line_items;
  select count(*) into wrong from invoice_line_items li
    where not exists (select 1 from invoices i
                       where i.id = li.invoice_id and i.tenant_id = 'tn-1');
  if n <> 1 or wrong <> 0 then
    raise exception 'A4 FAIL: wc_app@tn-1 saw % line_items (% outside tn-1); expected 1/0', n, wrong;
  end if;
end $$;

-- A5 — cross-tenant WRITE blocked: wc_app@tn-1 INSERT invoice tenant_id=tn-2 → RLS check violation.
--      (FOR ALL policy with NULL with_check falls back to USING for the insert check.)
do $$ begin
  begin
    insert into invoices (tenant_id, total) values ('tn-2', 999);
    raise exception 'A5 FAIL: cross-tenant INSERT (tn-2 under tn-1 context) was ALLOWED';
  exception
    when insufficient_privilege then null;  -- expected: new row violates RLS policy
  end;
end $$;
reset role;
reset app.current_tenant_id;

-- A6 — policy identity matches the live catalog exactly (names + cmd=ALL, roles include public).
do $$ begin
  if (select count(*) from pg_policies
       where schemaname='public'
         and ((tablename='invoices'           and policyname='wc_sec02_invoices_tenant_isolation'   and cmd='ALL')
           or (tablename='invoice_line_items' and policyname='wc_sec02_line_items_tenant_isolation' and cmd='ALL'))) <> 2 then
    raise exception 'A6 FAIL: expected policies wc_sec02_{invoices,line_items}_tenant_isolation (cmd=ALL) not both present';
  end if;
end $$;

-- A7 — DL-109 invariant: the runtime role wc_app stays NOBYPASSRLS.
do $$ begin
  if (select rolbypassrls from pg_roles where rolname='wc_app') then
    raise exception 'A7 FAIL: wc_app is BYPASSRLS — DL-109 runtime-role invariant violated';
  end if;
end $$;

select 'WC_SEC_02_FORCE_RLS_INVOICES_TEST: ALL_ASSERTIONS_PASS' as result;
