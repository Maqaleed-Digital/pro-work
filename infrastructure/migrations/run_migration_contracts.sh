#!/bin/sh
set -e
echo "S44-G1: Creating contract tables..."
psql "$MIGRATION_URL" -c "DROP TABLE IF EXISTS contract_events CASCADE; DROP TABLE IF EXISTS contracts CASCADE; DROP TABLE IF EXISTS contract_templates CASCADE;" 2>&1
psql "$MIGRATION_URL" -v ON_ERROR_STOP=1 -f 20260419_create_contracts.sql
echo "✓ contracts + contract_events + contract_templates created"
psql "$MIGRATION_URL" -c "SELECT has_table_privilege('prowork_app', 'contract_events', 'UPDATE') AS can_update, has_table_privilege('prowork_app', 'contract_events', 'DELETE') AS can_delete;"
psql "$MIGRATION_URL" -c "SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('contracts','contract_events','contract_templates') AND schemaname = 'public';"
psql "$MIGRATION_URL" -c "SELECT count(*) AS template_count FROM contract_templates;"
echo "S44-G1 migration complete."
