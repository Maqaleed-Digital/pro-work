#!/bin/sh
set -e
echo "S45-G2: Adding persona_type to users table..."
psql "$MIGRATION_URL" -v ON_ERROR_STOP=1 -f 20260419_add_persona_type.sql
echo "✓ persona_type + current_persona_preference columns added"

echo "Adding SEEKER to role CHECK constraint..."
psql "$MIGRATION_URL" -v ON_ERROR_STOP=1 -c "
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('OWNER','ADMIN','HIRING_MANAGER','FINANCE_APPROVER','VIEWER','SEEKER'));
"
echo "✓ SEEKER role added to CHECK constraint"

psql "$MIGRATION_URL" -c "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'users' AND column_name IN ('persona_type','current_persona_preference');"
psql "$MIGRATION_URL" -c "SELECT persona_type, count(*) FROM users GROUP BY persona_type;"
echo "S45-G2 migration complete."
