#!/bin/sh
# WC-SEC-01 GO-4-FIX real-Postgres execution test. Spins an ephemeral Postgres, loads the ACTUAL
# migration files (login_lookup_fn.sql + fix_authlookup_owner.sql) over a minimal users/invitations
# fixture under FORCE RLS, then EXECUTES the pre-auth fns and asserts. Exits non-zero on any failure.
# Run from the repo root:  sh tests/db/run_wc_sec_01_authlookup.sh
set -u
CN=wc-sec01-authtest
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
  if psql_f < "$2" >/tmp/wcsec_step.out 2>&1; then echo OK; else echo FAIL; echo "---"; cat /tmp/wcsec_step.out; return 1; fi
}

step "bootstrap fixture"          "$DIR/wc_sec_01_authlookup.bootstrap.sql"            || exit 1
step "login_lookup_fn.sql"        "$MIG/20260619_wc_sec_01_login_lookup_fn.sql"        || exit 1
step "fix_authlookup_owner.sql"   "$MIG/20260619_wc_sec_01_fix_authlookup_owner.sql"   || exit 1
# assertions: capture output so the PASS line shows
if psql_f < "$DIR/wc_sec_01_authlookup.assertions.sql" >/tmp/wcsec_assert.out 2>&1; then
  grep -q ALL_ASSERTIONS_PASS /tmp/wcsec_assert.out && { echo "assertions ... OK"; grep ALL_ASSERTIONS_PASS /tmp/wcsec_assert.out; exit 0; }
  echo "assertions ... UNCLEAR"; cat /tmp/wcsec_assert.out; exit 1
else
  echo "assertions ... FAIL"; cat /tmp/wcsec_assert.out; exit 1
fi
