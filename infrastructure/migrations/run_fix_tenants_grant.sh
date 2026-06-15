#!/bin/sh
set -e
echo "Granting prowork_app access to tenants table..."
psql "$MIGRATION_URL" -v ON_ERROR_STOP=1 -c "
GRANT SELECT, INSERT, UPDATE ON tenants TO prowork_app;
"
echo "✓ tenants grants applied"

psql "$MIGRATION_URL" -c "
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'prowork_app'
AND table_name = 'tenants'
ORDER BY privilege_type;"
echo "Verification complete."
