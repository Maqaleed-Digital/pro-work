#!/bin/sh
set -e
echo "S44-G4: Creating ESB calculation tables..."
psql "$MIGRATION_URL" -c "DROP TABLE IF EXISTS esb_calculation_events CASCADE; DROP TABLE IF EXISTS esb_calculations CASCADE;" 2>&1
psql "$MIGRATION_URL" -v ON_ERROR_STOP=1 -f 20260419_create_esb_calculations.sql
echo "✓ esb_calculations + esb_calculation_events created"
psql "$MIGRATION_URL" -c "SELECT has_table_privilege('prowork_app', 'esb_calculation_events', 'UPDATE') AS can_update, has_table_privilege('prowork_app', 'esb_calculation_events', 'DELETE') AS can_delete;"
psql "$MIGRATION_URL" -c "SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('esb_calculations','esb_calculation_events') AND schemaname = 'public';"
echo "S44-G4 migration complete."
