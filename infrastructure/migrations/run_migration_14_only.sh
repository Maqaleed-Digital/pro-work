#!/bin/sh
set -e
echo "Migration 14 — Phase 1 (postgres): create role + grant membership..."
psql "$MIGRATION_URL" \
  -v ON_ERROR_STOP=1 \
  -f 20260416_create_owner_role_and_revoke_phase1.sql
echo "✓ phase1 complete — prowork_owner created, granted to prowork_app"

echo "Migration 14 — Phase 2 (prowork_app): transfer ownership + grants..."
psql "$DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  -f 20260416_create_owner_role_and_revoke_phase2.sql
echo "✓ phase2 complete — ownership transferred, privileges set"

echo "Migration 14 complete."

psql "$MIGRATION_URL" -c "
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'prowork_app'
AND table_name IN (
  'recommendation_audit_logs',
  'contract_lifecycle_events',
  'evidence_packs',
  'evidence_files',
  'evidence_approvals',
  'evidence_ai_artifacts',
  'nitaqat_preview_overrides',
  'probation_governance_records',
  'qiwa_contracts',
  'sdp_programmes',
  'sdp_enrolments'
)
AND privilege_type IN ('UPDATE','DELETE');"

psql "$MIGRATION_URL" -c "
SELECT tablename, tableowner
FROM pg_tables
WHERE tablename IN (
  'recommendation_audit_logs',
  'contract_lifecycle_events',
  'evidence_packs',
  'nitaqat_preview_overrides'
)
AND schemaname = 'public';"

echo "Verification complete."
