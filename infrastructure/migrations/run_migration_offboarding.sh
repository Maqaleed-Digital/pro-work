#!/bin/sh
set -e
echo "S44-G5: Creating offboarding tables..."
psql "$MIGRATION_URL" -c "DROP TABLE IF EXISTS offboarding_events CASCADE; DROP TABLE IF EXISTS offboardings CASCADE;" 2>&1
psql "$MIGRATION_URL" -v ON_ERROR_STOP=1 -f 20260419_create_offboarding.sql
echo "✓ offboardings + offboarding_events created"
psql "$MIGRATION_URL" -c "SELECT has_table_privilege('prowork_app', 'offboarding_events', 'UPDATE') AS can_update, has_table_privilege('prowork_app', 'offboarding_events', 'DELETE') AS can_delete;"
psql "$MIGRATION_URL" -c "SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('offboardings','offboarding_events') AND schemaname = 'public';"
echo "S44-G5 migration complete."
