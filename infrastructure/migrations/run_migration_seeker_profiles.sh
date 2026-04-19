#!/bin/sh
set -e
echo "S45-G1: Creating seeker profile tables..."
psql "$MIGRATION_URL" -c "DROP TABLE IF EXISTS seeker_profile_events CASCADE; DROP TABLE IF EXISTS seeker_certifications CASCADE; DROP TABLE IF EXISTS seeker_skills CASCADE; DROP TABLE IF EXISTS seeker_profiles CASCADE;" 2>&1
psql "$MIGRATION_URL" -v ON_ERROR_STOP=1 -f 20260419_create_seeker_profiles.sql
echo "✓ seeker_profiles + seeker_skills + seeker_certifications + seeker_profile_events created"
psql "$MIGRATION_URL" -c "SELECT has_table_privilege('prowork_app', 'seeker_profile_events', 'UPDATE') AS can_update, has_table_privilege('prowork_app', 'seeker_profile_events', 'DELETE') AS can_delete;"
psql "$MIGRATION_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name IN ('seeker_profiles','seeker_skills','seeker_certifications') AND (column_name ILIKE '%shift%' OR column_name ILIKE '%attendance%' OR column_name ILIKE '%clock%' OR column_name ILIKE '%hours_per_day%');"
echo "S45-G1 migration complete."
