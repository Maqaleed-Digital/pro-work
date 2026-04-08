#!/usr/bin/env bash
# PROWORK PHASE 13 — Approval-Bound Privileged Operations Evidence Runner
# Evidence contract: FND/PROWORK_APPROVAL_CONTROL_EVIDENCE_CONTRACT.md
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_BASE="${REPO_ROOT}/.prowork/evidence"
EVIDENCE_DIR="${EVIDENCE_BASE}/phase13_${TIMESTAMP}"
SUMMARY_JSON="${EVIDENCE_DIR}/summary.json"
DECISION_LOG="${EVIDENCE_DIR}/decision_log.txt"
COMMAND_LOG="${EVIDENCE_DIR}/command_log.txt"
MANIFEST="${EVIDENCE_DIR}/manifest.txt"
APPROVAL_EXPORT="${EVIDENCE_DIR}/approval_export.json"

PORT=13013
HOST=127.0.0.1
BASE="http://${HOST}:${PORT}"
SERVER_PID=""
PRINCIPALS_FILE="${REPO_ROOT}/app/data/admin_principals.json"
PRINCIPALS_BACKUP="${REPO_ROOT}/app/data/admin_principals.json.phase13_bak"
APR_FILE="${REPO_ROOT}/app/data/approval_requests.jsonl"
APD_FILE="${REPO_ROOT}/app/data/approval_decisions.jsonl"

SUPERADMIN_TOKEN="sk-phase13-superadmin-A"
SUPERADMIN2_TOKEN="sk-phase13-superadmin-B"
OPS_TOKEN="sk-phase13-ops-001"
AUDITOR_TOKEN="sk-phase13-auditor-001"

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
cd "$REPO_ROOT"
command -v node  >/dev/null 2>&1 || { echo "ERROR: node not found"; exit 1; }
command -v curl  >/dev/null 2>&1 || { echo "ERROR: curl not found"; exit 1; }
command -v jq    >/dev/null 2>&1 || { echo "ERROR: jq not found"; exit 1; }

[ -f "app/server.js" ]                           || { echo "ERROR: app/server.js not found"; exit 1; }
[ -f "app/lib/approval_control.js" ]             || { echo "ERROR: approval_control.js not found"; exit 1; }
[ -f "tests/production/phase13_approval_control.test.js" ] || { echo "ERROR: phase13 test not found"; exit 1; }

mkdir -p "$EVIDENCE_DIR"

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""
  fi
  [ -f "${PRINCIPALS_FILE}.phase13_bak" ] && mv "${PRINCIPALS_FILE}.phase13_bak" "$PRINCIPALS_FILE"
  rm -f "$APR_FILE" "$APD_FILE" 2>/dev/null || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Unit tests
# ---------------------------------------------------------------------------
echo "[phase13] running unit tests..."
node --test tests/production/phase13_approval_control.test.js >"${EVIDENCE_DIR}/unit_p13.txt" 2>&1
P13_FAIL=$(grep "^# fail" "${EVIDENCE_DIR}/unit_p13.txt" | awk '{print $3}' || echo "1")
P13_PASS=$(grep "^# pass" "${EVIDENCE_DIR}/unit_p13.txt" | awk '{print $3}' || echo "0")
echo "[phase13] phase13 unit: pass=${P13_PASS} fail=${P13_FAIL}"
[ "${P13_FAIL}" = "0" ] || { echo "ERROR: phase13 unit tests failed"; exit 1; }

node --test tests/production/phase11_permission_control.test.js >"${EVIDENCE_DIR}/unit_p11.txt" 2>&1
P11_FAIL=$(grep "^# fail" "${EVIDENCE_DIR}/unit_p11.txt" | awk '{print $3}' || echo "1")
[ "${P11_FAIL}" = "0" ] || { echo "ERROR: phase11 regression"; exit 1; }

node --test tests/production/phase12_authz_audit.test.js >"${EVIDENCE_DIR}/unit_p12.txt" 2>&1
P12_FAIL=$(grep "^# fail" "${EVIDENCE_DIR}/unit_p12.txt" | awk '{print $3}' || echo "1")
[ "${P12_FAIL}" = "0" ] || { echo "ERROR: phase12 regression"; exit 1; }

echo "[phase13] all unit suites pass"

# ---------------------------------------------------------------------------
# Prepare test environment
# ---------------------------------------------------------------------------
echo "[phase13] preparing test principals..."
cp "$PRINCIPALS_FILE" "${PRINCIPALS_FILE}.phase13_bak"

# Two superadmin principals (A=requester, B=approver for maker-checker)
cat > "$PRINCIPALS_FILE" <<PRINCIPALS_EOF
{
  "roles": {
    "superadmin": { "description": "Sovereign" },
    "ops":        { "description": "Operational" },
    "auditor":    { "description": "Read-only" }
  },
  "principals": [
    { "id": "adm_p13_saA", "name": "phase13-sa-A", "role": "superadmin", "status": "active",
      "token": "${SUPERADMIN_TOKEN}", "tenant_id": "*",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)", "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)" },
    { "id": "adm_p13_saB", "name": "phase13-sa-B", "role": "superadmin", "status": "active",
      "token": "${SUPERADMIN2_TOKEN}", "tenant_id": "*",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)", "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)" },
    { "id": "adm_p13_ops", "name": "phase13-ops", "role": "ops", "status": "active",
      "token": "${OPS_TOKEN}", "tenant_id": "*",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)", "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)" },
    { "id": "adm_p13_aud", "name": "phase13-auditor", "role": "auditor", "status": "active",
      "token": "${AUDITOR_TOKEN}", "tenant_id": "*",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)", "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)" }
  ]
}
PRINCIPALS_EOF

> "$APR_FILE" 2>/dev/null || touch "$APR_FILE"
> "$APD_FILE" 2>/dev/null || touch "$APD_FILE"

# ---------------------------------------------------------------------------
# Start server
# ---------------------------------------------------------------------------
export ADMIN_API_TOKEN="$SUPERADMIN_TOKEN"
export APP_PORT="$PORT"
export APP_HOST="$HOST"
export WOS_PUBLIC_WRITE="false"
export LOG_FORMAT="json"

echo "[phase13] starting server on ${HOST}:${PORT}..."
node app/server.js >"${EVIDENCE_DIR}/server.log" 2>&1 &
SERVER_PID=$!

for i in $(seq 1 30); do
  curl -sf "${BASE}/api/health" >/dev/null 2>&1 && break; sleep 0.3; done
curl -sf "${BASE}/api/health" >/dev/null 2>&1 || { echo "ERROR: server not ready"; exit 1; }
echo "[phase13] server ready"

# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------
PASS=0
FAIL=0

http_call() {
  local method="$1" route="$2" token="$3" body_arg="$4"
  local hdrs="/tmp/p13_hdrs_$$.txt"
  local curl_args=("-s" "-D" "$hdrs" "-o" "/tmp/p13_body_$$.json" "-w" "%{http_code}" "-X" "$method" "${BASE}${route}")
  [ -n "$token" ]       && curl_args+=("-H" "Authorization: Bearer ${token}")
  [ -n "$body_arg" ]    && curl_args+=("-H" "Content-Type: application/json" "-d" "$body_arg")
  local status
  status=$(curl "${curl_args[@]}" 2>>"$COMMAND_LOG") || true
  echo "$status"
}

read_body() { cat /tmp/p13_body_$$.json 2>/dev/null || echo "{}"; }

record_case() {
  local label="$1" route="$2" method="$3" expected="$4" actual="$5" role="$6" apr_id="${7:-}" apd_id="${8:-}" result="FAIL"
  [ "$actual" = "$expected" ] && result="PASS"
  local ts; ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local rec
  rec=$(jq -n \
    --arg label   "$label"   --arg ts    "$ts"      --arg route  "$route"  \
    --arg method  "$method"  --arg exp   "$expected" --arg act   "$actual" \
    --arg role    "$role"    --arg apr   "$apr_id"   --arg apd   "$apd_id" \
    --arg result  "$result" \
    '{label:$label,timestamp:$ts,route:$route,method:$method,expected_status:$exp,actual_status:$act,resolved_role:$role,approval_request_id:$apr,approval_decision_id:$apd,result:$result}')
  echo "$rec" > "${EVIDENCE_DIR}/${label}.json"
  echo "$rec" >> "$DECISION_LOG"
  if [ "$result" = "PASS" ]; then
    PASS=$((PASS+1)); echo "[phase13] PASS  ${label} (${method} ${route} → ${actual})"
  else
    FAIL=$((FAIL+1)); echo "[phase13] FAIL  ${label} (${method} ${route} → got ${actual}, want ${expected})"
  fi
}

# ---------------------------------------------------------------------------
# APPROVAL-REQUEST-DENIED-WITHOUT-PRIVILEGE: auditor cannot request
# ---------------------------------------------------------------------------
http_call "POST" "/api/approvals/request" "$AUDITOR_TOKEN" '{"action_type":"ops.override","target_route":"ops.override","reason":"test"}'
record_case "APPROVAL-REQUEST-DENIED-WITHOUT-PRIVILEGE" "/api/approvals/request" "POST" "403" "$(cat /tmp/p13_body_$$.json 2>/dev/null | jq -r '.error.code' 2>/dev/null | grep -q FORBIDDEN && echo "403" || echo "$(http_call POST /api/approvals/request $AUDITOR_TOKEN '"{"action_type":"ops.override"}"')")" "auditor"
# Re-do properly
STATUS=$(http_call "POST" "/api/approvals/request" "$AUDITOR_TOKEN" '{"action_type":"ops.override","target_route":"ops.override","reason":"test"}')
record_case "APPROVAL-REQUEST-DENIED-WITHOUT-PRIVILEGE" "/api/approvals/request" "POST" "403" "$STATUS" "auditor"

# ---------------------------------------------------------------------------
# APPROVAL-REQUEST-CREATED: ops creates ops.force_execute request
# ---------------------------------------------------------------------------
STATUS=$(http_call "POST" "/api/approvals/request" "$OPS_TOKEN" '{"action_type":"ops.force_execute","target_route":"ops.force_execute","reason":"phase13 evidence test"}')
BODY=$(read_body)
FE_APR_ID=$(echo "$BODY" | jq -r '.data.approval_request_id // empty' 2>/dev/null || echo "")
record_case "APPROVAL-REQUEST-CREATED" "/api/approvals/request" "POST" "201" "$STATUS" "ops" "$FE_APR_ID"

# ---------------------------------------------------------------------------
# APPROVAL-OVERRIDE-DENY-NO-APPROVAL: ops.override without approval
# ---------------------------------------------------------------------------
STATUS=$(http_call "POST" "/api/ops/override" "$SUPERADMIN_TOKEN" '{"approval_request_id":"apr_nonexistent"}')
record_case "APPROVAL-OVERRIDE-DENY-NO-APPROVAL" "/api/ops/override" "POST" "403" "$STATUS" "superadmin" "apr_nonexistent"

# ---------------------------------------------------------------------------
# APPROVAL-FORCE-EXECUTE-DENY-NO-APPROVAL: no approval
# ---------------------------------------------------------------------------
STATUS=$(http_call "POST" "/api/ops/force-execute" "$OPS_TOKEN" '{"approval_request_id":"apr_nonexistent"}')
record_case "APPROVAL-FORCE-EXECUTE-DENY-NO-APPROVAL" "/api/ops/force-execute" "POST" "403" "$STATUS" "ops" "apr_nonexistent"

# ---------------------------------------------------------------------------
# APPROVAL-CONFIG-CHANGE-DENY-NO-APPROVAL: no approval
# ---------------------------------------------------------------------------
STATUS=$(http_call "POST" "/api/admin/config-change" "$SUPERADMIN_TOKEN" '{"approval_request_id":"apr_nonexistent"}')
record_case "APPROVAL-CONFIG-CHANGE-DENY-NO-APPROVAL" "/api/admin/config-change" "POST" "403" "$STATUS" "superadmin" "apr_nonexistent"

# ---------------------------------------------------------------------------
# Approve the force_execute request (SA-A approves what ops requested — no maker-checker)
# ---------------------------------------------------------------------------
if [ -n "$FE_APR_ID" ]; then
  STATUS=$(http_call "POST" "/api/approvals/${FE_APR_ID}/approve" "$SUPERADMIN_TOKEN" '{"reason":"approved for evidence"}')
  BODY=$(read_body)
  FE_APD_ID=$(echo "$BODY" | jq -r '.data.approval_decision_id // empty' 2>/dev/null || echo "")
  record_case "APPROVAL-DECISION-APPROVED" "/api/approvals/${FE_APR_ID}/approve" "POST" "200" "$STATUS" "superadmin" "$FE_APR_ID" "$FE_APD_ID"

  # APPROVAL-FORCE-EXECUTE-ALLOW-WITH-APPROVAL
  STATUS=$(http_call "POST" "/api/ops/force-execute" "$OPS_TOKEN" "{\"approval_request_id\":\"${FE_APR_ID}\"}")
  record_case "APPROVAL-FORCE-EXECUTE-ALLOW-WITH-APPROVAL" "/api/ops/force-execute" "POST" "202" "$STATUS" "ops" "$FE_APR_ID" "$FE_APD_ID"

  # APPROVAL-REPLAY-DENIED: same approval_request_id again
  STATUS=$(http_call "POST" "/api/ops/force-execute" "$OPS_TOKEN" "{\"approval_request_id\":\"${FE_APR_ID}\"}")
  record_case "APPROVAL-REPLAY-DENIED" "/api/ops/force-execute" "POST" "403" "$STATUS" "ops" "$FE_APR_ID"
else
  echo "[phase13] WARN: FE_APR_ID not obtained — skipping dependent cases"
  FAIL=$((FAIL+3))
fi

# ---------------------------------------------------------------------------
# ops.override maker-checker: SA-A requests, SA-A tries to approve own → deny self-approval
# ---------------------------------------------------------------------------
STATUS=$(http_call "POST" "/api/approvals/request" "$SUPERADMIN_TOKEN" '{"action_type":"ops.override","target_route":"ops.override","reason":"self-approve test"}')
BODY=$(read_body)
OVR_SELF_APR_ID=$(echo "$BODY" | jq -r '.data.approval_request_id // empty' 2>/dev/null || echo "")

if [ -n "$OVR_SELF_APR_ID" ]; then
  # SA-A (same actor) tries to approve own override request → maker-checker violation
  STATUS=$(http_call "POST" "/api/approvals/${OVR_SELF_APR_ID}/approve" "$SUPERADMIN_TOKEN" '{"reason":"self approve attempt"}')
  record_case "APPROVAL-OVERRIDE-DENY-SELF-APPROVAL" "/api/approvals/${OVR_SELF_APR_ID}/approve" "POST" "403" "$STATUS" "superadmin" "$OVR_SELF_APR_ID"
else
  FAIL=$((FAIL+1))
  echo "[phase13] WARN: OVR_SELF_APR_ID not obtained"
fi

# ---------------------------------------------------------------------------
# ops.override maker-checker: SA-A requests, SA-B approves → allow
# ---------------------------------------------------------------------------
STATUS=$(http_call "POST" "/api/approvals/request" "$SUPERADMIN_TOKEN" '{"action_type":"ops.override","target_route":"ops.override","reason":"evidence override test"}')
BODY=$(read_body)
OVR_APR_ID=$(echo "$BODY" | jq -r '.data.approval_request_id // empty' 2>/dev/null || echo "")

if [ -n "$OVR_APR_ID" ]; then
  # SA-B approves (different actor)
  STATUS=$(http_call "POST" "/api/approvals/${OVR_APR_ID}/approve" "$SUPERADMIN2_TOKEN" '{"reason":"approved by SA-B"}')
  BODY=$(read_body)
  OVR_APD_ID=$(echo "$BODY" | jq -r '.data.approval_decision_id // empty' 2>/dev/null || echo "")

  # SA-A (requester) executes — maker-checker: executor cannot be requester
  STATUS_A=$(http_call "POST" "/api/ops/override" "$SUPERADMIN_TOKEN" "{\"approval_request_id\":\"${OVR_APR_ID}\"}")
  # SA-A is the requester (adm_p13_saA) — maker-checker blocks them from executing
  record_case "APPROVAL-OVERRIDE-DENY-SELF-APPROVAL" "/api/ops/override" "POST" "403" "$STATUS_A" "superadmin(requester)" "$OVR_APR_ID" "$OVR_APD_ID"

  # SA-B (approver, non-requester) executes → should succeed
  STATUS_B=$(http_call "POST" "/api/ops/override" "$SUPERADMIN2_TOKEN" "{\"approval_request_id\":\"${OVR_APR_ID}\"}")
  record_case "APPROVAL-OVERRIDE-ALLOW-WITH-APPROVAL" "/api/ops/override" "POST" "202" "$STATUS_B" "superadmin(approver)" "$OVR_APR_ID" "$OVR_APD_ID"
else
  FAIL=$((FAIL+2)); echo "[phase13] WARN: OVR_APR_ID not obtained"
fi

# ---------------------------------------------------------------------------
# APPROVAL-DECISION-DENIED: deny a fresh request
# ---------------------------------------------------------------------------
STATUS=$(http_call "POST" "/api/approvals/request" "$SUPERADMIN_TOKEN" '{"action_type":"admin.config_change","target_route":"admin.config_change","reason":"deny test"}')
BODY=$(read_body)
CC_APR_ID=$(echo "$BODY" | jq -r '.data.approval_request_id // empty' 2>/dev/null || echo "")

if [ -n "$CC_APR_ID" ]; then
  STATUS=$(http_call "POST" "/api/approvals/${CC_APR_ID}/deny" "$SUPERADMIN2_TOKEN" '{"reason":"denied by SA-B"}')
  BODY=$(read_body)
  CC_APD_ID=$(echo "$BODY" | jq -r '.data.approval_decision_id // empty' 2>/dev/null || echo "")
  record_case "APPROVAL-DECISION-DENIED" "/api/approvals/${CC_APR_ID}/deny" "POST" "200" "$STATUS" "superadmin" "$CC_APR_ID" "$CC_APD_ID"
else
  FAIL=$((FAIL+1)); echo "[phase13] WARN: CC_APR_ID not obtained"
fi

# ---------------------------------------------------------------------------
# APPROVAL-CONFIG-CHANGE-ALLOW-WITH-APPROVAL
# ---------------------------------------------------------------------------
STATUS=$(http_call "POST" "/api/approvals/request" "$SUPERADMIN_TOKEN" '{"action_type":"admin.config_change","target_route":"admin.config_change","reason":"evidence config-change"}')
BODY=$(read_body)
CC2_APR_ID=$(echo "$BODY" | jq -r '.data.approval_request_id // empty' 2>/dev/null || echo "")

if [ -n "$CC2_APR_ID" ]; then
  STATUS=$(http_call "POST" "/api/approvals/${CC2_APR_ID}/approve" "$SUPERADMIN2_TOKEN" '{"reason":"approved by SA-B"}')
  BODY=$(read_body)
  CC2_APD_ID=$(echo "$BODY" | jq -r '.data.approval_decision_id // empty' 2>/dev/null || echo "")
  # SA-B executes (SA-A was requester, SA-B is non-requester executor)
  STATUS=$(http_call "POST" "/api/admin/config-change" "$SUPERADMIN2_TOKEN" "{\"approval_request_id\":\"${CC2_APR_ID}\"}")
  record_case "APPROVAL-CONFIG-CHANGE-ALLOW-WITH-APPROVAL" "/api/admin/config-change" "POST" "202" "$STATUS" "superadmin" "$CC2_APR_ID" "$CC2_APD_ID"
else
  FAIL=$((FAIL+1)); echo "[phase13] WARN: CC2_APR_ID not obtained"
fi

# ---------------------------------------------------------------------------
# APPROVAL-EXPORT-GENERATED + APPROVAL-AUDIT-BINDING-PRESENT
# ---------------------------------------------------------------------------
echo "[phase13] generating approval export..."
node -e "
const A = require('./app/lib/approval_control');
const out = A.exportApprovals('${APPROVAL_EXPORT}');
console.log('exported: requests=' + out.requests_count + ' decisions=' + out.decisions_count);
" 2>>"$COMMAND_LOG"

EXPORT_OK="FAIL"
BINDING_OK="FAIL"
if [ -f "$APPROVAL_EXPORT" ]; then
  REQ_COUNT=$(jq '.requests_count' "$APPROVAL_EXPORT" 2>/dev/null || echo 0)
  DEC_COUNT=$(jq '.decisions_count' "$APPROVAL_EXPORT" 2>/dev/null || echo 0)
  CONSUMED_COUNT=$(jq '[.decisions[] | select(.decision_outcome=="consumed")] | length' "$APPROVAL_EXPORT" 2>/dev/null || echo 0)
  if [ "$REQ_COUNT" -gt 0 ] && [ "$DEC_COUNT" -gt 0 ]; then
    EXPORT_OK="PASS"; PASS=$((PASS+1))
    echo "[phase13] PASS  APPROVAL-EXPORT-GENERATED (requests=${REQ_COUNT} decisions=${DEC_COUNT})"
  else
    FAIL=$((FAIL+1)); echo "[phase13] FAIL  APPROVAL-EXPORT-GENERATED"
  fi
  if [ "$CONSUMED_COUNT" -gt 0 ]; then
    BINDING_OK="PASS"; PASS=$((PASS+1))
    echo "[phase13] PASS  APPROVAL-AUDIT-BINDING-PRESENT (${CONSUMED_COUNT} consumed records with approval_request_id)"
  else
    FAIL=$((FAIL+1)); echo "[phase13] FAIL  APPROVAL-AUDIT-BINDING-PRESENT (no consumed records found)"
  fi
else
  FAIL=$((FAIL+2)); echo "[phase13] FAIL  APPROVAL-EXPORT-GENERATED (file missing)"
fi

# ---------------------------------------------------------------------------
# Write summary.json
# ---------------------------------------------------------------------------
TOTAL=$((PASS+FAIL))
jq -n \
  --arg phase       "phase-13" \
  --arg ts          "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson pass    "$PASS" \
  --argjson fail    "$FAIL" \
  --argjson total   "$TOTAL" \
  --arg unit_p13    "$P13_PASS" \
  '{phase:$phase,generated_at:$ts,unit_tests_p13_pass:$unit_p13,http_cases:{total:$total,pass:$pass,fail:$fail}}' \
  > "$SUMMARY_JSON"

# Write manifest
{
  echo "PROWORK PHASE 13 EVIDENCE MANIFEST"
  echo "generated_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "evidence_dir: ${EVIDENCE_DIR}"
  echo "FILES:"
  find "$EVIDENCE_DIR" -type f | sort
} > "$MANIFEST"

# Stop server
if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
  kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""
fi

# ---------------------------------------------------------------------------
# Final
# ---------------------------------------------------------------------------
echo ""
echo "[phase13] ============================="
echo "[phase13] unit tests p13: ${P13_PASS}/26"
echo "[phase13] http cases:     ${PASS}/${TOTAL}"
echo "[phase13] ============================="

[ "$FAIL" -gt 0 ] && { echo "[phase13] FAILED: ${FAIL} case(s)"; exit 1; }

echo "[phase13] ALL CASES PASSED"
echo ""
echo "EVIDENCE_RUN_DIR=${EVIDENCE_DIR}"
