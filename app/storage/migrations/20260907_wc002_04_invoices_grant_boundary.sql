-- WorkCaptain WC002-04 T3 — invoices privilege boundary, REPO↔LIVE DRIFT CLOSURE.
--
-- WHAT THIS IS
--   A companion to 20260625_wc_sec_02_force_rls_invoices.sql. That file codified the
--   FORCE RLS + tenant-isolation policies that were force-landed on the live DB on
--   25 Jun 2026 via prowork_ddl. It deliberately changed no grants ("DDL only — no
--   grant change"), which left the PRIVILEGE half of the same boundary implicit.
--   This migration closes that half.
--
-- THIS DESCRIBES STATE THAT IS ALREADY LIVE.
--   * The RLS control on invoices/invoice_line_items has been live since 25 Jun 2026.
--   * This file is repo↔live drift closure. It is NOT evidence that the control is
--     newly introduced, and its presence must NOT be read as "production lacked
--     tenant isolation until this migration".
--   * It must NOT be blindly applied to production as though live were missing the
--     control. Live reconciliation/apply is separately gated (G1) and is not
--     performed by the lane that authored this file.
--
-- WHY THE GRANTS NEED SAYING OUT LOUD
--   wc_app (the NOBYPASSRLS runtime role) currently holds DML on these two tables
--   only through the blanket
--       grant select, insert, update, delete on all tables in schema public to wc_app;
--   in 20260619_wc_sec_01_role_rehome.sql. GRANT ... ON ALL TABLES is POINT-IN-TIME:
--   it covers exactly the tables that existed when it ran. invoices was created on
--   20260617, before that grant, so a clean replay in filename order happens to work
--   today — by ordering, not by statement. 20260619's own header calls this out as
--   the failure mode. Naming the grant here makes the boundary independent of
--   migration ordering.
--
-- PUBLIC AND anon ARE HANDLED SEPARATELY, ON PURPOSE
--   REVOKE ... FROM PUBLIC does not remove privileges held by a named role. A role
--   that was granted directly keeps what it was granted. So PUBLIC is revoked
--   explicitly, and any named anonymous role is revoked explicitly and separately.
--
--   NOTE ON `anon`: this is RDS PostgreSQL, not Supabase. There is no `anon` role in
--   this repository's role model (prowork / prowork_owner / prowork_app / prowork_ddl
--   / wc_app). The revoke below is therefore GUARDED by a pg_roles existence check:
--   it is a standing assertion that anon holds nothing here if it is ever introduced,
--   and a no-op today. An unguarded REVOKE against a non-existent role would abort
--   the migration and break re-runnability (DL-064).
--
-- IDEMPOTENCY (DL-064 is binding: a migration that breaks on re-run is a landmine)
--   Every statement here is re-runnable. GRANT and REVOKE are declarative and
--   converge; both role-dependent blocks are guarded by pg_roles lookups; there is
--   no CREATE of any object that would collide on a second pass. Re-running this
--   file against a database that already has it applied is a clean no-op.
--
--   DDL/DCL only. No INSERT/UPDATE/DELETE, no DROP, no table or column change.

-- ── PUBLIC: no ambient access to billing data ────────────────────────────────
-- Guards against a default or inherited grant ever exposing these tables to every
-- role in the cluster. Safe to re-run; safe if PUBLIC already holds nothing.
revoke all on public.invoices           from public;
revoke all on public.invoice_line_items from public;

-- ── Any named anonymous role: revoked explicitly, never assumed ──────────────
-- Guarded: no-op unless such a role exists. See the note above.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on public.invoices           from anon';
    execute 'revoke all on public.invoice_line_items from anon';
  end if;
end $$;

-- ── wc_app: the runtime role's DML, stated explicitly ────────────────────────
-- Mirrors what wc_app already holds live. NOBYPASSRLS + FORCE RLS mean these
-- grants are bounded by the tenant-isolation policies in the companion migration;
-- the grant is reach, the policy is the boundary.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'wc_app') then
    execute 'grant select, insert, update, delete on public.invoices           to wc_app';
    execute 'grant select, insert, update, delete on public.invoice_line_items to wc_app';
  end if;
end $$;

-- ── prowork_app: unchanged from 20260617_create_invoices.sql ─────────────────
-- Restated so a replay that skips the creation migration still lands the same
-- privilege set. No DELETE — the draft → issued transition needs UPDATE, not DELETE.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'prowork_app') then
    execute 'grant insert, select, update on public.invoices           to prowork_app';
    execute 'grant insert, select, update on public.invoice_line_items to prowork_app';
  end if;
end $$;
