#!/bin/sh
set -e

echo "S40 migrations — auth tables + invitations..."

psql "$MIGRATION_URL" \
  -v ON_ERROR_STOP=1 \
  -f 20260418_create_auth_tables.sql
echo "✓ create_auth_tables (migration 16)"

psql "$MIGRATION_URL" \
  -v ON_ERROR_STOP=1 \
  -f 20260418_create_invitations.sql
echo "✓ create_invitations (migration 17)"

echo "S40 migrations complete."

psql "$MIGRATION_URL" \
  -c "\dt" | grep -E "users|sessions|invitations"

psql "$MIGRATION_URL" \
  -c "SELECT table_name, privilege_type
      FROM information_schema.role_table_grants
      WHERE grantee = 'prowork_app'
      AND table_name IN ('users', 'sessions', 'invitations')
      ORDER BY table_name, privilege_type;"

echo "Grant verification complete."
