-- WorkCaptain WO-WC-SEC-01 V1.1 — app connection-role re-home (least privilege).
-- AUTHORED FOR GO-3a — NOT APPLIED HERE. Apply BEFORE the DATABASE_URL swap (GO-3b).
--
-- WHY: the live app connects as `prowork`, which (verified on the live DB):
--   * OWNS the operational tenant tables (users, sessions, invitations, candidates, … ~49 tables),
--     and with NO table using FORCE ROW LEVEL SECURITY, the OWNER bypasses RLS → tenant isolation
--     is NOT enforced by RLS for the app on any table it owns.
--   * is a MEMBER of `prowork_owner` (INHERIT) → owner-exempt on the prowork_owner tables too
--     → RLS is enforced NOWHERE for the live app.
--   * is a MEMBER of `rds_superuser` → admin-tier privileges on a customer-facing app (it can drop
--     tables, create roles, read everything). Gross over-privilege.
--
-- FIX: introduce `wc_app`, a least-privilege LOGIN role — NON-owner, NOT in rds_superuser, NOT in
-- prowork_owner, NOBYPASSRLS, NOSUPERUSER, NOINHERIT — with explicit DML grants on the application
-- tables. After GO-3b swaps DATABASE_URL to wc_app, the app is a plain non-owner role, so RLS
-- (made FORCE in the companion migration) is finally ENFORCED, and the app no longer carries DBA
-- privileges.
--
-- GRANT COMPLETENESS (the GO-3b outage mode): wc_app must hold a grant on EVERY table the app
-- touches or the swap breaks reads/writes. The app currently runs as owner (implicit all-privileges
-- on all ~60 tables), so we cannot derive per-table verbs from the catalog — we grant the safe
-- baseline (SELECT/INSERT/UPDATE/DELETE on ALL current + future tables, USAGE on sequences) so the
-- swap cannot cause a privilege outage. Tightening to per-table least-privilege verbs is a Register-B
-- follow-up once access patterns are instrumented; the security win here is non-owner + NOBYPASSRLS
-- + not-rds_superuser, which is what makes RLS enforce and removes the DBA over-privilege.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'wc_app') then
    create role wc_app login nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
    -- NOTE: set the password out-of-band (not in migration); the GO-3b DATABASE_URL secret carries it.
  end if;
end $$;

-- Explicit: wc_app is NOT a member of prowork_owner or rds_superuser (do not GRANT those to it).

grant usage on schema public to wc_app;
grant select, insert, update, delete on all tables in schema public to wc_app;
grant usage, select on all sequences in schema public to wc_app;
-- Future tables/sequences inherit the same grants. ALTER DEFAULT PRIVILEGES is per-creating-role,
-- so cover BOTH owners that create tables in this schema (prowork = migration runner, and
-- prowork_owner = owner of the append-only/audit tables) — else a later prowork_owner-created table
-- would silently miss the wc_app grant.
alter default privileges in schema public grant select, insert, update, delete on tables to wc_app;
alter default privileges in schema public grant usage, select on sequences to wc_app;
alter default privileges for role prowork_owner in schema public grant select, insert, update, delete on tables to wc_app;
alter default privileges for role prowork_owner in schema public grant usage, select on sequences to wc_app;

-- Bounded pre-auth lookups (from 20260619_wc_sec_01_login_lookup_fn.sql) — execute for wc_app.
grant execute on function wc_login_lookup(text) to wc_app;
grant execute on function wc_invitation_lookup(text) to wc_app;

-- Append-only audit/evidence tables: withhold DELETE/UPDATE from the app role (ledger integrity).
-- These are owned by prowork_owner; keep the app to SELECT/INSERT (mirrors the existing prowork_app grant).
revoke update, delete on
  recommendation_audit_logs, contract_lifecycle_events,
  evidence_packs, evidence_files, evidence_approvals, evidence_ai_artifacts
  from wc_app;
