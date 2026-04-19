#!/bin/sh
set -e

echo "S43-G1: Creating requisition tables..."

# Drop existing tables if they exist (empty — from prior partial run or initSchema)
psql "$MIGRATION_URL" -c "
DROP TABLE IF EXISTS requisition_documents CASCADE;
DROP TABLE IF EXISTS requisition_skills CASCADE;
DROP TABLE IF EXISTS requisitions CASCADE;
" 2>&1
echo "Pre-existing tables dropped (if any)"

psql "$MIGRATION_URL" \
  -v ON_ERROR_STOP=1 \
  -f 20260418_create_requisitions.sql
echo "✓ requisitions + requisition_skills + requisition_documents created"

echo "=== Table verification ==="
psql "$MIGRATION_URL" -c "\dt" | grep -E "requisition"

echo "=== DELETE privilege check ==="
psql "$MIGRATION_URL" -c "
SELECT has_table_privilege('prowork_app', 'requisitions', 'DELETE') AS can_delete_requisitions,
       has_table_privilege('prowork_app', 'requisition_skills', 'DELETE') AS can_delete_skills,
       has_table_privilege('prowork_app', 'requisition_documents', 'DELETE') AS can_delete_docs;
"

echo "=== RLS enabled check ==="
psql "$MIGRATION_URL" -c "
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('requisitions', 'requisition_skills', 'requisition_documents')
AND schemaname = 'public';
"

echo "=== Grant verification ==="
psql "$MIGRATION_URL" -c "
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'prowork_app'
AND table_name IN ('requisitions', 'requisition_skills', 'requisition_documents')
ORDER BY table_name, privilege_type;
"

echo "S43-G1 migration complete."
