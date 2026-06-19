-- WC-SEC-01 GO-4-FIX real-Postgres EXECUTION assertions (run as superuser; uses SET ROLE wc_app).
-- These EXECUTE the pre-auth functions — the verification that metadata-checks + the mock pool both
-- missed. Each assertion RAISEs on failure so psql (ON_ERROR_STOP) exits non-zero → test fails red.
\set ON_ERROR_STOP on

-- A1 — RLS binds the runtime role: wc_app, no GUC, must see ZERO users under FORCE RLS.
set role wc_app;
do $$ begin
  if (select count(*) from users) <> 0 then
    raise exception 'A1 FAIL: wc_app saw % users with no GUC — FORCE RLS not binding the runtime role',
      (select count(*) from users);
  end if;
end $$;
reset role;

-- A2 — THE GO-4 CRASH CASE: wc_app calls wc_login_lookup under FORCE RLS. The SECURITY DEFINER fn
-- runs as its owner (wc_auth_lookup, BYPASSRLS) → reads cross-tenant → returns the row, NO 42501.
-- The OLD owner (prowork_owner, no SELECT) raised 'permission denied for table users' here.
set role wc_app;
do $$ declare n int; begin
  select count(*) into n from wc_login_lookup('owner@t1.test');
  if n <> 1 then raise exception 'A2 FAIL: wc_login_lookup returned % rows (expected 1) under FORCE RLS', n; end if;
end $$;

-- A3 — same for the invitation pre-auth lookup.
do $$ declare n int; begin
  select count(*) into n from wc_invitation_lookup('tok-1');
  if n <> 1 then raise exception 'A3 FAIL: wc_invitation_lookup returned % rows (expected 1) under FORCE RLS', n; end if;
end $$;
reset role;

-- A4 — structural: the two fns are owned by wc_auth_lookup AND that role is BYPASSRLS (the fix).
do $$ begin
  if (select count(*) from pg_proc p
        join pg_roles r on r.oid = p.proowner
       where p.proname in ('wc_login_lookup','wc_invitation_lookup')
         and r.rolname = 'wc_auth_lookup' and r.rolbypassrls) <> 2 then
    raise exception 'A4 FAIL: the two pre-auth fns are not both owned by BYPASSRLS wc_auth_lookup';
  end if;
end $$;

-- A5 — DL-109 §3 invariant: the RUNTIME role wc_app stays NOBYPASSRLS.
do $$ begin
  if (select rolbypassrls from pg_roles where rolname='wc_app') then
    raise exception 'A5 FAIL: wc_app is BYPASSRLS — DL-109 runtime-role invariant violated';
  end if;
end $$;

select 'WC_SEC_01_AUTHLOOKUP_TEST: ALL_ASSERTIONS_PASS' as result;
