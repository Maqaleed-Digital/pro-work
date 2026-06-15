#!/bin/sh
set -e
echo "S43-G3: Creating candidate pipeline tables..."

# Drop pre-existing tables if any (from initSchema)
psql "$MIGRATION_URL" -c "
DROP TABLE IF EXISTS application_events CASCADE;
DROP TABLE IF EXISTS applications CASCADE;
DROP TABLE IF EXISTS candidates CASCADE;
" 2>&1
echo "Pre-existing tables dropped (if any)"

psql "$MIGRATION_URL" \
  -v ON_ERROR_STOP=1 \
  -f 20260419_create_candidates.sql
echo "✓ candidates + applications + application_events created"

echo "=== Table verification ==="
psql "$MIGRATION_URL" -c "\dt" | grep -E "candidates|applications|application_events"

echo "=== DELETE/UPDATE privilege check on application_events ==="
psql "$MIGRATION_URL" -c "
SELECT has_table_privilege('prowork_app', 'application_events', 'UPDATE') AS can_update,
       has_table_privilege('prowork_app', 'application_events', 'DELETE') AS can_delete;
"

echo "=== RLS enabled ==="
psql "$MIGRATION_URL" -c "
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename IN ('candidates', 'applications', 'application_events')
AND schemaname = 'public';
"

echo "S43-G3 migration complete."
