#!/bin/sh
set -e
echo "Fix: grant reviewer column UPDATE on recommendation_audit_logs..."
# Table owned by prowork_owner — prowork_app is member, use DATABASE_URL
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
GRANT UPDATE (reviewer_decision, reviewer_id, reviewed_at, override_reason)
ON recommendation_audit_logs TO prowork_app;
"
echo "✓ reviewer columns UPDATE granted"

psql "$DATABASE_URL" -c "
SELECT privilege_type, column_name
FROM information_schema.column_privileges
WHERE grantee = 'prowork_app'
AND table_name = 'recommendation_audit_logs'
AND privilege_type = 'UPDATE'
ORDER BY column_name;
"
echo "Verification complete."
