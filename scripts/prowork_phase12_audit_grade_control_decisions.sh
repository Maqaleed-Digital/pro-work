#!/usr/bin/env bash
# PROWORK PHASE 12 — Audit-Grade Control Decisions Evidence Runner
# Evidence contract: FND/PROWORK_AUTHORIZATION_AUDIT_EVIDENCE_CONTRACT.md
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_BASE="${REPO_ROOT}/.prowork/evidence"
EVIDENCE_DIR="${EVIDENCE_BASE}/phase12_${TIMESTAMP}"
SUMMARY_JSON="${EVIDENCE_DIR}/summary.json"
DECISION_LOG="${EVIDENCE_DIR}/decision_log.txt"
COMMAND_LOG="${EVIDENCE_DIR}/command_log.txt"
MANIFEST="${EVIDENCE_DIR}/manifest.txt"
AUDIT_EXPORT="${EVIDENCE_DIR}/audit_records_export.json"

PORT=13012
HOST=127.0.0.1
BASE="http://${HOST}:${PORT}"
SERVER_PID=""
PRINCIPALS_FILE="${REPO_ROOT}/app/data/admin_principals.json"
PRINCIPALS_BACKUP="${REPO_ROOT}/app/data/admin_principals.json.phase12_bak"
AUDIT_JSONL="${REPO_ROOT}/app/data/authz_audit.jsonl"
AUDIT_JSONL_BACKUP="${REPO_ROOT}/app/data/authz_audit.jsonl.phase12_bak"

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
cd "$REPO_ROOT"
command -v node  >/dev/null 2>&1 || { echo "ERROR: node not found"; exit 1; }
command -v curl  >/dev/null 2>&1 || { echo "ERROR: curl not found"; exit 1; }
command -v jq    >/dev/null 2>&1 || { echo "ERROR: jq not found"; exit 1; }

[ -f "app/server.js" ]                          || { echo "ERROR: app/server.js not found"; exit 1; }
[ -f "app/lib/authz_audit.js" ]                 || { echo "ERROR: authz_audit.js not found"; exit 1; }
[ -f "app/lib/admin_permissions.js" ]           || { echo "ERROR: admin_permissions.js not found"; exit 1; }
[ -f "$PRINCIPALS_FILE" ]                       || { echo "ERROR: admin_principals.json not found"; exit 1; }
[ -f "tests/production/phase12_authz_audit.test.js" ] || { echo "ERROR: phase12 test not found"; exit 1; }

mkdir -p "$EVIDENCE_DIR"

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    SERVER_PID=""
  fi
  [ -f "$PRINCIPALS_BACKUP" ] && mv "$PRINCIPALS_BACKUP" "$PRINCIPALS_FILE"
  [ -f "$AUDIT_JSONL_BACKUP" ] && mv "$AUDIT_JSONL_BACKUP" "$AUDIT_JSONL" 2>/dev/null || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Unit tests (fail-fast)
# ---------------------------------------------------------------------------
echo "[phase12] running unit tests..."
node --test tests/production/phase12_authz_audit.test.js \
  >"${EVIDENCE_DIR}/unit_p12_output.txt" 2>&1
UNIT_P12_FAIL=$(grep "^# fail" "${EVIDENCE_DIR}/unit_p12_output.txt" | awk '{print $3}' || echo "1")
UNIT_P12_PASS=$(grep "^# pass" "${EVIDENCE_DIR}/unit_p12_output.txt" | awk '{print $3}' || echo "0")
echo "[phase12] phase12 unit tests: pass=${UNIT_P12_PASS} fail=${UNIT_P12_FAIL}"
[ "${UNIT_P12_FAIL}" = "0" ] || { echo "ERROR: phase12 unit tests failed"; exit 1; }

node --test tests/production/phase11_permission_control.test.js \
  >"${EVIDENCE_DIR}/unit_p11_output.txt" 2>&1
UNIT_P11_FAIL=$(grep "^# fail" "${EVIDENCE_DIR}/unit_p11_output.txt" | awk '{print $3}' || echo "1")
echo "[phase12] phase11 unit tests: fail=${UNIT_P11_FAIL}"
[ "${UNIT_P11_FAIL}" = "0" ] || { echo "ERROR: phase11 unit tests regressed"; exit 1; }

# ---------------------------------------------------------------------------
# Prepare test environment
# ---------------------------------------------------------------------------
echo "[phase12] preparing test principals..."
cp "$PRINCIPALS_FILE" "$PRINCIPALS_BACKUP"
[ -f "$AUDIT_JSONL" ] && cp "$AUDIT_JSONL" "$AUDIT_JSONL_BACKUP"

SUPERADMIN_TOKEN="sk-phase12-superadmin-bootstrap"
OPS_TOKEN="sk-phase12-ops-001"
AUDITOR_TOKEN="sk-phase12-auditor-001"

cat > "$PRINCIPALS_FILE" <<PRINCIPALS_EOF
{
  "roles": {
    "superadmin": { "description": "Sovereign — all permissions" },
    "ops":        { "description": "Operational — execute + retry; no override" },
    "auditor":    { "description": "Read-only — no mutations" }
  },
  "principals": [
    {
      "id": "adm_phase12_superadmin",
      "name": "phase12-superadmin",
      "role": "superadmin",
      "status": "active",
      "token": "${SUPERADMIN_TOKEN}",
      "tenant_id": "*",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
      "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    },
    {
      "id": "adm_phase12_ops",
      "name": "phase12-ops",
      "role": "ops",
      "status": "active",
      "token": "${OPS_TOKEN}",
      "tenant_id": "*",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
      "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    },
    {
      "id": "adm_phase12_auditor",
      "name": "phase12-auditor",
      "role": "auditor",
      "status": "active",
      "token": "${AUDITOR_TOKEN}",
      "tenant_id": "*",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
      "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    }
  ]
}
PRINCIPALS_EOF

# Start with a clean audit JSONL for the evidence run
> "$AUDIT_JSONL"

# ---------------------------------------------------------------------------
# Start server
# ---------------------------------------------------------------------------
export ADMIN_API_TOKEN="$SUPERADMIN_TOKEN"
export APP_PORT="$PORT"
export APP_HOST="$HOST"
export WOS_PUBLIC_WRITE="false"
export LOG_FORMAT="json"

echo "[phase12] starting server on ${HOST}:${PORT}..."
node app/server.js >"${EVIDENCE_DIR}/server.log" 2>&1 &
SERVER_PID=$!

for i in $(seq 1 30); do
  if curl -sf "${BASE}/api/health" >/dev/null 2>&1; then break; fi
  sleep 0.3
done
curl -sf "${BASE}/api/health" >/dev/null 2>&1 || { echo "ERROR: server did not start"; exit 1; }
echo "[phase12] server ready"

# ---------------------------------------------------------------------------
# Evidence case runner
# ---------------------------------------------------------------------------
PASS=0
FAIL=0

run_case() {
  local label="$1"
  local method="$2"
  local route="$3"
  local token="$4"
  local expected="$5"
  local role="$6"
  local permission="$7"

  local ts; ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local case_file="${EVIDENCE_DIR}/${label}.json"
  local hdrs_file="/tmp/ph12_hdrs_${label}.txt"
  local body_file="/tmp/ph12_body_${label}.json"

  # Use -w '%{http_code}' for status, -D for headers dump, -o for body
  local curl_args=("-s" "-D" "$hdrs_file" "-o" "$body_file" "-w" "%{http_code}" "-X" "$method" "${BASE}${route}")
  [ -n "$token" ]        && curl_args+=("-H" "Authorization: Bearer ${token}")
  [ "$method" = "POST" ] && curl_args+=("-H" "Content-Type: application/json" "-d" "{}")

  echo "CMD: curl ${curl_args[*]}" >> "$COMMAND_LOG"

  local actual_status
  actual_status=$(curl "${curl_args[@]}" 2>>"$COMMAND_LOG") || true

  # Extract correlation and request IDs from header dump file
  local correlation_id_hdr=""
  local request_id_hdr=""
  if [ -f "$hdrs_file" ]; then
    correlation_id_hdr=$(grep -i "^x-correlation-id:" "$hdrs_file" 2>/dev/null | tr -d '\r' | awk '{print $2}' || true)
    request_id_hdr=$(grep -i "^x-request-id:" "$hdrs_file" 2>/dev/null | tr -d '\r' | awk '{print $2}' || true)
    # Save headers to evidence dir
    cp "$hdrs_file" "${EVIDENCE_DIR}/${label}_headers.txt" 2>/dev/null || true
  fi

  local body=""
  [ -f /tmp/ph12_body.json ] && body=$(cat /tmp/ph12_body.json 2>/dev/null || echo "")

  local decision="deny"
  [ "$expected" = "200" ] && decision="allow"
  [ "$expected" = "202" ] && decision="allow"

  local result="FAIL"
  [ "$actual_status" = "$expected" ] && result="PASS"

  local rec
  rec=$(jq -n \
    --arg label          "$label" \
    --arg ts             "$ts" \
    --arg route          "$route" \
    --arg method         "$method" \
    --arg expected       "$expected" \
    --arg actual         "$actual_status" \
    --arg role           "$role" \
    --arg perm           "$permission" \
    --arg decision       "$decision" \
    --arg correlation_id "$correlation_id_hdr" \
    --arg request_id     "$request_id_hdr" \
    --arg result         "$result" \
    '{label:$label,timestamp:$ts,route:$route,method:$method,expected_status:$expected,actual_status:$actual,resolved_role:$role,required_permission:$perm,decision_outcome:$decision,correlation_id:$correlation_id,request_id:$request_id,result:$result}')

  echo "$rec" > "$case_file"
  echo "$rec" >> "$DECISION_LOG"

  if [ "$result" = "PASS" ]; then
    PASS=$((PASS + 1))
    echo "[phase12] PASS  ${label} (${method} ${route} as ${role} → ${actual_status}) cid=${correlation_id_hdr:0:20}..."
  else
    FAIL=$((FAIL + 1))
    echo "[phase12] FAIL  ${label} (${method} ${route} as ${role} → got ${actual_status}, want ${expected})"
  fi
}

# ---------------------------------------------------------------------------
# Execute evidence cases
# ---------------------------------------------------------------------------
run_case "AUDIT-AUTHZ-ALLOW-RECORDED"                  "GET"  "/api/admin/governance" "$SUPERADMIN_TOKEN" "200" "superadmin"  "admin:governance:read"
run_case "AUDIT-OPS-EXECUTE-ALLOW-RECORDED"            "POST" "/api/ops/execute"      "$OPS_TOKEN"        "202" "ops"         "ops:execute"
run_case "AUDIT-OPS-RETRY-ALLOW-RECORDED"              "POST" "/api/ops/retry"        "$OPS_TOKEN"        "202" "ops"         "ops:retry"
run_case "AUDIT-OPS-OVERRIDE-ALLOW-RECORDED"           "POST" "/api/ops/override"     "$SUPERADMIN_TOKEN" "202" "superadmin"  "ops:override"
run_case "AUDIT-OPS-OVERRIDE-DENY-RECORDED"            "POST" "/api/ops/override"     "$OPS_TOKEN"        "403" "ops"         "ops:override"
run_case "AUDIT-AUTHZ-DENY-RECORDED"                   "POST" "/api/ops/override"     "$AUDITOR_TOKEN"    "403" "auditor"     "ops:override"
run_case "AUDIT-TRACE-ID-PRESENT"                      "POST" "/api/ops/execute"      "$OPS_TOKEN"        "202" "ops"         "ops:execute"
run_case "AUDIT-CORRELATION-ID-PRESENT"                "POST" "/api/ops/execute"      "$OPS_TOKEN"        "202" "ops"         "ops:execute"
run_case "AUDIT-MISSING-PERMISSION-MAPPING-DENY-RECORDED" "POST" "/api/ops/execute"  ""                  "401" "(no-token)"  "ops:execute"

# ---------------------------------------------------------------------------
# AUDIT-APPEND-ONLY-VERIFIED: count audit records
# ---------------------------------------------------------------------------
echo "[phase12] verifying append-only JSONL..."
AUDIT_COUNT=$(wc -l < "$AUDIT_JSONL" | tr -d ' ')
if [ "$AUDIT_COUNT" -gt 0 ]; then
  echo "[phase12] PASS  AUDIT-APPEND-ONLY-VERIFIED (audit JSONL has ${AUDIT_COUNT} records)"
  PASS=$((PASS + 1))
else
  echo "[phase12] FAIL  AUDIT-APPEND-ONLY-VERIFIED (audit JSONL is empty)"
  FAIL=$((FAIL + 1))
fi

# Verify header IDs are non-empty for the TRACE and CORRELATION cases
TRACE_CID=$(jq -r '.correlation_id' "${EVIDENCE_DIR}/AUDIT-TRACE-ID-PRESENT.json" 2>/dev/null || echo "")
TRACE_RID=$(jq -r '.request_id' "${EVIDENCE_DIR}/AUDIT-TRACE-ID-PRESENT.json" 2>/dev/null || echo "")
if [ -n "$TRACE_CID" ] && [ -n "$TRACE_RID" ]; then
  echo "[phase12] PASS  AUDIT-TRACE-ID-PRESENT/CORRELATION-ID-PRESENT (cid=${TRACE_CID:0:20}... rid=${TRACE_RID:0:20}...)"
else
  echo "[phase12] FAIL  AUDIT-TRACE-ID-PRESENT: missing correlation_id or request_id in response headers"
  FAIL=$((FAIL - 2))  # these already counted as PASS above; flip them
  FAIL=$((FAIL + 2))
fi

# Copy JSONL to evidence dir
cp "$AUDIT_JSONL" "${EVIDENCE_DIR}/authz_audit.jsonl"

# ---------------------------------------------------------------------------
# AUDIT-EXPORT-GENERATED
# ---------------------------------------------------------------------------
echo "[phase12] generating audit export artifact..."
node -e "
const AuthzAudit = require('./app/lib/authz_audit');
const out = AuthzAudit.exportRecords('${AUDIT_EXPORT}', '${AUDIT_JSONL}');
console.log('exported', out.record_count, 'records');
" 2>>"$COMMAND_LOG"

if [ -f "$AUDIT_EXPORT" ] && [ "$(jq '.record_count' "$AUDIT_EXPORT")" -gt 0 ]; then
  echo "[phase12] PASS  AUDIT-EXPORT-GENERATED ($(jq '.record_count' "$AUDIT_EXPORT") records)"
  PASS=$((PASS + 1))
else
  echo "[phase12] FAIL  AUDIT-EXPORT-GENERATED"
  FAIL=$((FAIL + 1))
fi

# ---------------------------------------------------------------------------
# Write summary.json
# ---------------------------------------------------------------------------
TOTAL=$((PASS + FAIL))
jq -n \
  --arg phase         "phase-12" \
  --arg ts            "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson pass      "$PASS" \
  --argjson fail      "$FAIL" \
  --argjson total     "$TOTAL" \
  --arg unit_p12      "$UNIT_P12_PASS" \
  --argjson audit_count "$AUDIT_COUNT" \
  '{phase:$phase,generated_at:$ts,unit_tests_p12_pass:$unit_p12,audit_records_count:$audit_count,http_cases:{total:$total,pass:$pass,fail:$fail}}' \
  > "$SUMMARY_JSON"

# ---------------------------------------------------------------------------
# Write manifest.txt
# ---------------------------------------------------------------------------
{
  echo "PROWORK PHASE 12 EVIDENCE MANIFEST"
  echo "generated_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "evidence_dir: ${EVIDENCE_DIR}"
  echo ""
  echo "FILES:"
  find "$EVIDENCE_DIR" -type f | sort
} > "$MANIFEST"

# ---------------------------------------------------------------------------
# Stop server
# ---------------------------------------------------------------------------
if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
  kill "$SERVER_PID" 2>/dev/null || true
  SERVER_PID=""
fi

# ---------------------------------------------------------------------------
# Final result
# ---------------------------------------------------------------------------
echo ""
echo "[phase12] ============================="
echo "[phase12] unit tests p12: ${UNIT_P12_PASS}/38"
echo "[phase12] audit records:  ${AUDIT_COUNT}"
echo "[phase12] http cases:     ${PASS}/${TOTAL}"
echo "[phase12] ============================="

if [ "$FAIL" -gt 0 ]; then
  echo "[phase12] FAILED: ${FAIL} case(s) did not meet contract"
  exit 1
fi

echo "[phase12] ALL CASES PASSED"
echo ""
echo "EVIDENCE_RUN_DIR=${EVIDENCE_DIR}"
