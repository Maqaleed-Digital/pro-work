-- WC002-04 T3 — grant SUFFICIENCY pre-step.
--
-- The bootstrap fixture grants wc_app DML on the billing tables so it can mirror
-- live. That means an assertion "wc_app holds DML" could be satisfied by the
-- FIXTURE rather than by the migration under test — the test would be certifying
-- its own setup. This strips those grants so the following re-apply of
-- 20260907_wc002_04_invoices_grant_boundary.sql is the ONLY thing that can put
-- them back. If the migration does not actually grant, the assertions fail.
revoke all on public.invoices           from wc_app;
revoke all on public.invoice_line_items from wc_app;

-- Prove the strip actually happened, so a silently-ineffective revoke cannot make
-- the sufficiency check vacuous.
do $$
declare n int;
begin
  select count(*) into n
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in ('invoices','invoice_line_items')
     and grantee = 'wc_app';
  if n <> 0 then
    raise exception 'SUFFICIENCY SETUP FAIL: wc_app still holds % grant(s) after revoke', n;
  end if;
end $$;

select 'WC002_04_GRANT_SUFFICIENCY_SETUP: GRANTS_STRIPPED' as result;
