#!/usr/bin/env bash
# PROWORK PHASE 11 — Permission-Bound Operational Control Evidence Runner
# Evidence contract: FND/PROWORK_OPERATIONAL_CONTROL_EVIDENCE_CONTRACT.md
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_BASE="${REPO_ROOT}/.prowork/evidence"
EVIDENCE_DIR="${EVIDENCE_BASE}/phase11_${TIMESTAMP}"
SUMMARY_JSON="${EVIDENCE_DIR}/summary.json"
DECISION_LOG="${EVIDENCE_DIR}/decision_log.txt"
COMMAND_LOG="${EVIDENCE_DIR}/command_log.txt"
MANIFEST="${EVIDENCE_DIR}/manifest.txt"

PORT=13011
HOST=127.0.0.1
BASE="http://${HOST}:${PORT}"
SERVER_PID=""
PRINCIPALS_FILE="${REPO_ROOT}/app/data/admin_principals.json"
PRINCIPALS_BACKUP="${REPO_ROOT}/app/data/admin_principals.json.phase11_bak"

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
cd "$REPO_ROOT"
command -v node  >/dev/null 2>&1 || { echo "ERROR: node not found"; exit 1; }
command -v curl  >/dev/null 2>&1 || { echo "ERROR: curl not found"; exit 1; }
command -v jq    >/dev/null 2>&1 || { echo "ERROR: jq not found"; exit 1; }

[ -f "app/server.js" ]                         || { echo "ERROR: app/server.js not found"; exit 1; }
[ -f "app/lib/admin_permissions.js" ]          || { echo "ERROR: admin_permissions.js not found"; exit 1; }
[ -f "$PRINCIPALS_FILE" ]                      || { echo "ERROR: admin_principals.json not found"; exit 1; }
[ -f "tests/production/phase11_permission_control.test.js" ] || { echo "ERROR: phase11 test file not found"; exit 1; }

mkdir -p "$EVIDENCE_DIR"

# ---------------------------------------------------------------------------
# Cleanup: kill server + restore principals backup
# ---------------------------------------------------------------------------
cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    SERVER_PID=""
  fi
  if [ -f "$PRINCIPALS_BACKUP" ]; then
    mv "$PRINCIPALS_BACKUP" "$PRINCIPALS_FILE"
  fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Unit tests first (fail-fast)
# ---------------------------------------------------------------------------
echo "[phase11] running unit tests..."
node --test tests/production/phase11_permission_control.test.js \
  >"${EVIDENCE_DIR}/unit_test_output.txt" 2>&1
UNIT_FAIL=$(grep "^# fail" "${EVIDENCE_DIR}/unit_test_output.txt" | awk '{print $3}' || echo "1")
UNIT_PASS=$(grep "^# pass" "${EVIDENCE_DIR}/unit_test_output.txt" | awk '{print $3}' || echo "0")
echo "[phase11] unit tests: pass=${UNIT_PASS} fail=${UNIT_FAIL}"
[ "${UNIT_FAIL}" = "0" ] || { echo "ERROR: unit tests failed"; exit 1; }

# ---------------------------------------------------------------------------
# Set up test principals file (backup original, write test version)
# ---------------------------------------------------------------------------
echo "[phase11] preparing test principals..."
cp "$PRINCIPALS_FILE" "$PRINCIPALS_BACKUP"

# Write a test principals file with all three roles and test tokens
SUPERADMIN_TOKEN="sk-phase11-superadmin-bootstrap"
OPS_TOKEN="sk-phase11-ops-001"
AUDITOR_TOKEN="sk-phase11-auditor-001"

cat > "$PRINCIPALS_FILE" <<PRINCIPALS_EOF
{
  "roles": {
    "superadmin": { "description": "Sovereign — all permissions" },
    "ops":        { "description": "Operational — execute + retry; no override" },
    "auditor":    { "description": "Read-only — no mutations" }
  },
  "principals": [
    {
      "id": "adm_phase11_superadmin",
      "name": "phase11-superadmin",
      "role": "superadmin",
      "status": "active",
      "token": "${SUPERADMIN_TOKEN}",
      "tenant_id": "*",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
      "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    },
    {
      "id": "adm_phase11_ops",
      "name": "phase11-ops",
      "role": "ops",
      "status": "active",
      "token": "${OPS_TOKEN}",
      "tenant_id": "*",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
      "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    },
    {
      "id": "adm_phase11_auditor",
      "name": "phase11-auditor",
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

# ---------------------------------------------------------------------------
# Start server
# ---------------------------------------------------------------------------
export ADMIN_API_TOKEN="$SUPERADMIN_TOKEN"
export APP_PORT="$PORT"
export APP_HOST="$HOST"
export WOS_PUBLIC_WRITE="false"
export LOG_FORMAT="json"

echo "[phase11] starting server on ${HOST}:${PORT}..."
node app/server.js >"${EVIDENCE_DIR}/server.log" 2>&1 &
SERVER_PID=$!

for i in $(seq 1 30); do
  if curl -sf "${BASE}/api/health" >/dev/null 2>&1; then break; fi
  sleep 0.3
done
curl -sf "${BASE}/api/health" >/dev/null 2>&1 || { echo "ERROR: server did not start"; exit 1; }
echo "[phase11] server ready"

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

  local curl_args=("-s" "-o" "/tmp/ph11_body.json" "-w" "%{http_code}" "-X" "$method" "${BASE}${route}")
  [ -n "$token" ]        && curl_args+=("-H" "Authorization: Bearer ${token}")
  [ "$method" = "POST" ] && curl_args+=("-H" "Content-Type: application/json" "-d" "{}")

  echo "CMD: curl ${curl_args[*]}" >> "$COMMAND_LOG"

  local actual_status
  actual_status=$(curl "${curl_args[@]}" 2>>"$COMMAND_LOG") || true
  local body=""
  [ -f /tmp/ph11_body.json ] && body=$(cat /tmp/ph11_body.json 2>/dev/null || echo "")

  local decision="deny"
  [ "$expected" = "200" ] && decision="allow"
  [ "$expected" = "202" ] && decision="allow"

  local result="FAIL"
  [ "$actual_status" = "$expected" ] && result="PASS"

  local rec
  rec=$(jq -n \
    --arg label      "$label" \
    --arg ts         "$ts" \
    --arg route      "$route" \
    --arg method     "$method" \
    --arg expected   "$expected" \
    --arg actual     "$actual_status" \
    --arg role       "$role" \
    --arg perm       "$permission" \
    --arg decision   "$decision" \
    --arg result     "$result" \
    '{label:$label,timestamp:$ts,route:$route,method:$method,expected_status:$expected,actual_status:$actual,resolved_role:$role,required_permission:$perm,decision:$decision,result:$result}')

  echo "$rec" > "$case_file"
  echo "$rec" >> "$DECISION_LOG"

  if [ "$result" = "PASS" ]; then
    PASS=$((PASS + 1))
    echo "[phase11] PASS  ${label} (${method} ${route} as ${role} → ${actual_status})"
  else
    FAIL=$((FAIL + 1))
    echo "[phase11] FAIL  ${label} (${method} ${route} as ${role} → got ${actual_status}, want ${expected})"
  fi
}

# ---------------------------------------------------------------------------
# Execute all required evidence cases
# ---------------------------------------------------------------------------
run_case "PERM-PUBLIC-ALLOW"                   "GET"  "/api/health"          ""                 "200" "(none)"      "(public)"
run_case "PERM-IDENTITY-ALLOW"                 "GET"  "/api/admin/version"   "$SUPERADMIN_TOKEN" "200" "superadmin"  "(auth-only)"
run_case "PERM-ADMIN-READ-ALLOW"               "GET"  "/api/admin/governance" "$SUPERADMIN_TOKEN" "200" "superadmin" "admin:governance:read"
run_case "PERM-OPS-READ-ALLOW"                 "GET"  "/api/ops/status"      "$OPS_TOKEN"        "200" "ops"         "ops:status:read"
run_case "PERM-OPS-EXECUTE-DENY-AUDITOR"       "POST" "/api/ops/execute"     "$AUDITOR_TOKEN"    "403" "auditor"     "ops:execute"
run_case "PERM-OPS-EXECUTE-ALLOW-OPS"          "POST" "/api/ops/execute"     "$OPS_TOKEN"        "202" "ops"         "ops:execute"
run_case "PERM-OPS-EXECUTE-ALLOW-SUPERADMIN"   "POST" "/api/ops/execute"     "$SUPERADMIN_TOKEN" "202" "superadmin"  "ops:execute"
run_case "PERM-OPS-RETRY-DENY-AUDITOR"         "POST" "/api/ops/retry"       "$AUDITOR_TOKEN"    "403" "auditor"     "ops:retry"
run_case "PERM-OPS-RETRY-ALLOW-OPS"            "POST" "/api/ops/retry"       "$OPS_TOKEN"        "202" "ops"         "ops:retry"
run_case "PERM-OPS-OVERRIDE-DENY-OPS"          "POST" "/api/ops/override"    "$OPS_TOKEN"        "403" "ops"         "ops:override"
run_case "PERM-OPS-OVERRIDE-ALLOW-SUPERADMIN"  "POST" "/api/ops/override"    "$SUPERADMIN_TOKEN" "202" "superadmin"  "ops:override"
run_case "PERM-DENY-MISSING-PERMISSION-MAPPING" "POST" "/api/ops/execute"    ""                  "401" "(no-token)"  "ops:execute"

# ---------------------------------------------------------------------------
# Write summary.json
# ---------------------------------------------------------------------------
TOTAL=$((PASS + FAIL))
jq -n \
  --arg phase     "phase-11" \
  --arg ts        "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson pass  "$PASS" \
  --argjson fail  "$FAIL" \
  --argjson total "$TOTAL" \
  --arg unit  "$UNIT_PASS" \
  '{phase:$phase,generated_at:$ts,unit_tests_pass:$unit,http_cases:{total:$total,pass:$pass,fail:$fail}}' \
  > "$SUMMARY_JSON"

# ---------------------------------------------------------------------------
# Write manifest.txt
# ---------------------------------------------------------------------------
{
  echo "PROWORK PHASE 11 EVIDENCE MANIFEST"
  echo "generated_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "evidence_dir: ${EVIDENCE_DIR}"
  echo ""
  echo "FILES:"
  find "$EVIDENCE_DIR" -type f | sort
} > "$MANIFEST"

# ---------------------------------------------------------------------------
# Stop server (cleanup trap handles backup restore)
# ---------------------------------------------------------------------------
if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
  kill "$SERVER_PID" 2>/dev/null || true
  SERVER_PID=""
fi

# ---------------------------------------------------------------------------
# Final result
# ---------------------------------------------------------------------------
echo ""
echo "[phase11] ============================="
echo "[phase11] unit tests pass:  ${UNIT_PASS}"
echo "[phase11] http cases pass:  ${PASS}/${TOTAL}"
echo "[phase11] ============================="

if [ "$FAIL" -gt 0 ]; then
  echo "[phase11] FAILED: ${FAIL} case(s) did not match expected status"
  exit 1
fi

echo "[phase11] ALL CASES PASSED"
echo ""
echo "EVIDENCE_RUN_DIR=${EVIDENCE_DIR}"
