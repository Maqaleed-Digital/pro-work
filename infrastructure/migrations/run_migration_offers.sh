#!/bin/sh
set -e
echo "S43-G6: Creating offers table..."
psql "$MIGRATION_URL" -c "DROP TABLE IF EXISTS offers CASCADE;" 2>&1
psql "$MIGRATION_URL" -v ON_ERROR_STOP=1 -f 20260419_create_offers.sql
echo "✓ offers table created"
psql "$MIGRATION_URL" -c "SELECT has_table_privilege('prowork_app', 'offers', 'DELETE') AS can_delete;"
psql "$MIGRATION_URL" -c "SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'offers' AND schemaname = 'public';"
echo "S43-G6 migration complete."
