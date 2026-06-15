#!/bin/sh
set -e
echo "S44-G6: Creating SDP program tables..."
psql "$MIGRATION_URL" -c "DROP TABLE IF EXISTS sdp_program_events CASCADE; DROP TABLE IF EXISTS sdp_pods CASCADE; DROP TABLE IF EXISTS sdp_programs CASCADE;" 2>&1
psql "$MIGRATION_URL" -v ON_ERROR_STOP=1 -f 20260419_create_sdp_programs.sql
echo "✓ sdp_programs + sdp_pods + sdp_program_events created"
psql "$MIGRATION_URL" -c "SELECT has_table_privilege('prowork_app', 'sdp_program_events', 'UPDATE') AS can_update, has_table_privilege('prowork_app', 'sdp_program_events', 'DELETE') AS can_delete;"
psql "$MIGRATION_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name IN ('sdp_programs','sdp_pods') AND (column_name ILIKE '%shift%' OR column_name ILIKE '%attendance%' OR column_name ILIKE '%clock%');"
echo "S44-G6 migration complete."
