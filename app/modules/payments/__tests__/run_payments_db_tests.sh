#!/usr/bin/env bash
# WO-WC-HYPERPAY-001 — payments migration + persistence semantics against ephemeral PG.
# Applies the REAL migration, probes constraints, then rollback. No real DB touched.
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG="$DIR/../../../lib/persistence/migrations"
CTR=wc_payments_pg; PORT=55436
export PGPASSWORD=pw
P=(psql -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -qtA)
SAFE=(psql -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -qtA)
cleanup(){ docker rm -f "$CTR" >/dev/null 2>&1 || true; }
trap cleanup EXIT; cleanup
docker run -d --name "$CTR" -e POSTGRES_PASSWORD=pw -p ${PORT}:5432 postgres:16 >/dev/null
for i in $(seq 1 60); do "${SAFE[@]}" -c "select 1" >/dev/null 2>&1 && break; sleep 1; done

FAIL=0; ok(){ echo "  ✓ $1"; }; bad(){ echo "  ✗ $1"; FAIL=1; }
eq(){ [ "$2" = "$3" ] && ok "$1 ($3)" || bad "$1: got [$2] want [$3]"; }

echo "▶ prereq (tenants FK target) + apply migration"
"${SAFE[@]}" >/dev/null <<'SQL'
create table if not exists tenants (id varchar(64) primary key, name varchar(255), status varchar(32) default 'active');
insert into tenants(id,name) values ('default','Default') on conflict do nothing;
SQL
"${SAFE[@]}" -f "$MIG/0001_payments.sql" >/dev/null || { echo "migration failed"; exit 1; }
eq "payment_transactions exists" "$("${P[@]}" -c "select count(*) from information_schema.tables where table_name='payment_transactions'")" "1"
eq "payment_webhook_events exists" "$("${P[@]}" -c "select count(*) from information_schema.tables where table_name='payment_webhook_events'")" "1"

echo "▶ persistence semantics"
"${SAFE[@]}" >/dev/null -c "insert into payment_transactions(id,tenant_id,checkout_id,amount,currency,status,mode) values ('pay_1','default','chk_1',92.00,'SAR','created','sandbox')"
eq "transaction persisted status" "$("${P[@]}" -c "select status from payment_transactions where checkout_id='chk_1'")" "created"
# UNIQUE(checkout_id)
if "${P[@]}" -c "insert into payment_transactions(id,checkout_id,status) values ('pay_2','chk_1','created')" >/dev/null 2>&1; then
  bad "duplicate checkout_id accepted (UNIQUE missing)"; else ok "UNIQUE(checkout_id) enforced"; fi
# status update
"${SAFE[@]}" >/dev/null -c "update payment_transactions set status='success', result_code='000.000.000' where checkout_id='chk_1'"
eq "status update applied" "$("${P[@]}" -c "select status from payment_transactions where checkout_id='chk_1'")" "success"
# webhook event: signature_valid NOT NULL
"${SAFE[@]}" >/dev/null -c "insert into payment_webhook_events(id,checkout_id,signature_valid,event_type) values ('whk_1','chk_1',false,'unverified')"
eq "webhook event persisted (signature_valid=false)" "$("${P[@]}" -c "select signature_valid from payment_webhook_events where id='whk_1'")" "f"
if "${P[@]}" -c "insert into payment_webhook_events(id,checkout_id) values ('whk_2','chk_1')" >/dev/null 2>&1; then
  bad "signature_valid NULL accepted (NOT NULL missing)"; else ok "signature_valid NOT NULL enforced"; fi

echo "▶ rollback"
"${SAFE[@]}" -f "$MIG/0001_payments_rollback.sql" >/dev/null
eq "payment tables dropped" "$("${P[@]}" -c "select count(*) from information_schema.tables where table_name in ('payment_transactions','payment_webhook_events')")" "0"

[ "$FAIL" = 0 ] && echo "PAYMENTS DB TESTS PASSED" || { echo "PAYMENTS DB TESTS FAILED"; exit 1; }
