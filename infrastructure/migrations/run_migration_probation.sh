#!/bin/sh
set -e
echo "S44-G3: Creating probation tables..."
psql "$MIGRATION_URL" -c "DROP TABLE IF EXISTS probation_events CASCADE; DROP TABLE IF EXISTS probation_records CASCADE;" 2>&1
psql "$MIGRATION_URL" -v ON_ERROR_STOP=1 -f 20260419_create_probation.sql
echo "✓ probation_records + probation_events created"
psql "$MIGRATION_URL" -c "SELECT has_table_privilege('prowork_app', 'probation_events', 'UPDATE') AS can_update, has_table_privilege('prowork_app', 'probation_events', 'DELETE') AS can_delete;"
psql "$MIGRATION_URL" -c "SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('probation_records','probation_events') AND schemaname = 'public';"
echo "S44-G3 migration complete."
