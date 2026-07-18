#!/bin/sh
# WC-SEC-02 / SEC-FIX-WC-01B real-Postgres codification test. Spins an ephemeral Postgres,
# loads a minimal invoices/invoice_line_items fixture (cross-tenant, owned by prowork, wc_app
# NOBYPASSRLS runtime role, NO RLS), applies the ACTUAL codification migration under test, then
# asserts the live isolation contract (FORCE RLS binds owner + runtime role; tenant-scoped read;
# cross-tenant write blocked; exact policy names). Exits non-zero on any failure.
# Run from the repo root:  sh tests/db/run_wc_sec_02_force_rls.sh
set -u
CN=wc-sec02-rlstest
IMG=public.ecr.aws/docker/library/postgres:16-alpine
MIG=app/storage/migrations
DIR=tests/db

docker rm -f "$CN" >/dev/null 2>&1 || true
docker run -d --name "$CN" -e POSTGRES_PASSWORD=test "$IMG" >/dev/null
trap 'docker rm -f "$CN" >/dev/null 2>&1 || true' EXIT

# wait for readiness
i=0; while [ $i -lt 30 ]; do docker exec "$CN" pg_isready -U postgres >/dev/null 2>&1 && break; i=$((i+1)); sleep 1; done

psql_f() { docker exec -i "$CN" psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 -f - ; }

step() { # name file
  printf '%s ... ' "$1"
  if psql_f < "$2" >/tmp/wcsec02_step.out 2>&1; then echo OK; else echo FAIL; echo "---"; cat /tmp/wcsec02_step.out; return 1; fi
}

step "bootstrap fixture"                     "$DIR/wc_sec_02_force_rls_invoices.bootstrap.sql"  || exit 1
step "migration: force_rls_invoices"         "$MIG/20260625_wc_sec_02_force_rls_invoices.sql"   || exit 1
# idempotency: applying the migration a second time must be a clean no-op
step "migration re-apply (idempotency)"      "$MIG/20260625_wc_sec_02_force_rls_invoices.sql"   || exit 1
# assertions: capture output so the PASS line shows
if psql_f < "$DIR/wc_sec_02_force_rls_invoices.assertions.sql" >/tmp/wcsec02_assert.out 2>&1; then
  grep -q ALL_ASSERTIONS_PASS /tmp/wcsec02_assert.out && { echo "assertions ... OK"; grep ALL_ASSERTIONS_PASS /tmp/wcsec02_assert.out; exit 0; }
  echo "assertions ... UNCLEAR"; cat /tmp/wcsec02_assert.out; exit 1
else
  echo "assertions ... FAIL"; cat /tmp/wcsec02_assert.out; exit 1
fi
