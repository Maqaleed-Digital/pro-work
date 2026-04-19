#!/bin/sh
set -e
echo "Fixing RLS policy on users for login email lookup..."

psql "$MIGRATION_URL" -v ON_ERROR_STOP=1 -c "
DROP POLICY IF EXISTS tenant_isolation_users ON users;
CREATE POLICY tenant_isolation_users ON users
  USING (
    COALESCE(current_setting('app.current_tenant_id', true), '') = ''
    OR tenant_id = current_setting('app.current_tenant_id', true)
  );
"
echo "✓ RLS policy updated — login email lookup now works without tenant context"

psql "$MIGRATION_URL" -c "
SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr
FROM pg_policy
WHERE polrelid = 'users'::regclass;
"
echo "Verification complete."
