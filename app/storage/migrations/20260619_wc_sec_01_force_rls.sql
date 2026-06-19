-- WorkCaptain WO-WC-SEC-01 V1.1 — FORCE ROW LEVEL SECURITY + nitaqat GUC fix.
-- AUTHORED FOR GO-3c — NOT APPLIED HERE. Apply AFTER the role re-home + DATABASE_URL swap, so the
-- app already connects as the non-owner wc_app (FORCE then binds it).
--
-- SCOPE (verified against the LIVE DB, not the migration files):
--   FORCE only the RLS-enabled tables that HAVE a policy. The live DB has 16 RLS-enabled tables, but
--   5 of them are RLS-ENABLED-WITH-NO-POLICY (wps_evidence_packs, wps_readiness_records,
--   contract_lifecycle_events, probation_governance_records, qiwa_contracts). FORCE + no policy =
--   implicit DENY-ALL → would lock the app out of those tables. They are EXCLUDED here and handed to
--   the phased follow-on (add a GUC-keyed policy, THEN force). See GO-1 notes.
--
--   ⚠️ NOT in this migration: the ~44 live tenant tables that have NO RLS at all (candidate_*,
--   wos_*, worker_*, hiring_*, onboarding_*, offboarding_*, invoices, employment_contracts, …).
--   Enabling RLS + authoring a fail-closed policy + proving helper-path coverage for each of those
--   44 is a large, outage-risky effort that must be PHASED (WO-WC-SEC-02), not crammed into V1.1.
--   V1.1 makes the EXISTING 11 policies actually enforce + re-homes the role; it does not pretend to
--   cover the 44 RLS-less tables (which today rely solely on app-layer WHERE filtering).

-- ── nitaqat GUC fix: policy keys on app.current_tenant, which is NEVER set in code → permanently
--    NULL → mis-scoped. Re-key to app.current_tenant_id (text; the helper sets it). ─────────────
drop policy if exists tenant_isolation on nitaqat_preview_overrides;
create policy tenant_isolation on nitaqat_preview_overrides
  using (tenant_id = current_setting('app.current_tenant_id', true));

-- ── FORCE RLS on the 11 policy-bearing tables (now enforced even for the table owner) ───────────
-- text/varchar GUC (app.current_tenant_id): users, sessions, invitations, nitaqat
alter table users                     force row level security;
alter table sessions                  force row level security;
alter table invitations               force row level security;
alter table nitaqat_preview_overrides force row level security;
-- uuid GUC (app.tenant_id) — the formerly-prowork_owner tables, under enforced RLS for the first time;
-- their access paths MUST set app.tenant_id via the consolidated helper (see GO-1 item #2).
alter table evidence_packs            force row level security;
alter table evidence_files            force row level security;
alter table evidence_approvals        force row level security;
alter table evidence_ai_artifacts     force row level security;
alter table recommendation_audit_logs force row level security;
alter table sdp_programmes            force row level security;
alter table sdp_enrolments            force row level security;
