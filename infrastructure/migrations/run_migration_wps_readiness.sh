#!/bin/sh
set -e
echo "S44-G2: Creating WPS readiness tables..."
psql "$MIGRATION_URL" -c "DROP TABLE IF EXISTS wps_readiness_events CASCADE; DROP TABLE IF EXISTS wps_readiness_packs CASCADE;" 2>&1
psql "$MIGRATION_URL" -v ON_ERROR_STOP=1 -f 20260419_create_wps_readiness.sql
echo "✓ wps_readiness_packs + wps_readiness_events created"
psql "$MIGRATION_URL" -c "SELECT has_table_privilege('prowork_app', 'wps_readiness_events', 'UPDATE') AS can_update, has_table_privilege('prowork_app', 'wps_readiness_events', 'DELETE') AS can_delete;"
psql "$MIGRATION_URL" -c "SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('wps_readiness_packs','wps_readiness_events') AND schemaname = 'public';"
echo "S44-G2 migration complete."
