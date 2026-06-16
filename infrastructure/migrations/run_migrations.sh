#!/bin/sh
set -e

echo "Starting migration runner..."

psql "$MIGRATION_URL" \
  -v ON_ERROR_STOP=1 \
  -f 20260306_phase1_trust_event_foundation.sql
echo "✓ phase1_trust_event_foundation"

psql "$MIGRATION_URL" \
  -v ON_ERROR_STOP=1 \
  -f 20260306_sprint_a_wos_core.sql
echo "✓ sprint_a_wos_core"

psql "$MIGRATION_URL" \
  -v ON_ERROR_STOP=1 \
  -f 20260306_sprint_b_sovereign_recruiting.sql
echo "✓ sprint_b_sovereign_recruiting"

psql "$MIGRATION_URL" \
  -v ON_ERROR_STOP=1 \
  -f 20260307_sprint_c_sovereign_onboarding.sql
echo "✓ sprint_c_sovereign_onboarding"

psql "$MIGRATION_URL" \
  -v ON_ERROR_STOP=1 \
  -f 20260307_sprint_d_sovereign_hiring.sql
echo "✓ sprint_d_sovereign_hiring"

psql "$MIGRATION_URL" \
  -v ON_ERROR_STOP=1 \
  -f 20260307_sprint_e_lifecycle_esb_offboarding.sql
echo "✓ sprint_e_lifecycle_esb_offboarding"

psql "$MIGRATION_URL" \
  -v ON_ERROR_STOP=1 \
  -f 20260416_create_recommendation_audit_log.sql
echo "✓ create_recommendation_audit_log"

psql "$MIGRATION_URL" \
  -v ON_ERROR_STOP=1 \
  -f 20260416_create_nitaqat_overrides.sql
echo "✓ create_nitaqat_overrides"

psql "$MIGRATION_URL" \
  -v ON_ERROR_STOP=1 \
  -f 20260416_create_contract_lifecycle.sql
echo "✓ create_contract_lifecycle"

psql "$MIGRATION_URL" \
  -v ON_ERROR_STOP=1 \
  -f 20260416_create_probation_governance.sql
echo "✓ create_probation_governance"

psql "$MIGRATION_URL" \
  -v ON_ERROR_STOP=1 \
  -f 20260416_create_wps_readiness.sql
echo "✓ create_wps_readiness"

psql "$MIGRATION_URL" \
  -v ON_ERROR_STOP=1 \
  -f 20260416_create_evidence_packs.sql
echo "✓ create_evidence_packs"

psql "$MIGRATION_URL" \
  -v ON_ERROR_STOP=1 \
  -f 20260416_create_sdp_programmes.sql
echo "✓ create_sdp_programmes"

psql "$MIGRATION_URL" \
  -v ON_ERROR_STOP=1 \
  -f 20260416_create_owner_role_and_revoke_phase1.sql
echo "✓ create_owner_role_and_revoke_phase1"

psql "$DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  -f 20260416_create_owner_role_and_revoke_phase2.sql
echo "✓ create_owner_role_and_revoke_phase2"

psql "$MIGRATION_URL" \
  -v ON_ERROR_STOP=1 \
  -f 20260418_create_auth_tables.sql
echo "✓ create_auth_tables"

psql "$MIGRATION_URL" \
  -v ON_ERROR_STOP=1 \
  -f 20260418_create_invitations.sql
echo "✓ create_invitations"

psql "$MIGRATION_URL" \
  -v ON_ERROR_STOP=1 \
  -f 20260616_create_tos_acceptances.sql
echo "✓ create_tos_acceptances"

echo "All 18 migrations complete."

psql "$MIGRATION_URL" \
  -c "\dt" | head -50

psql "$MIGRATION_URL" \
  -c "SELECT table_name, privilege_type
      FROM information_schema.role_table_grants
      WHERE grantee = 'prowork_app'
      AND privilege_type IN ('UPDATE','DELETE')
      ORDER BY table_name;"

echo "REVOKE verification complete."
