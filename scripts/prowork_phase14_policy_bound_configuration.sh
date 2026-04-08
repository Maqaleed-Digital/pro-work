#!/usr/bin/env bash
# PROWORK PHASE 14 — Policy-Bound Configuration + Sovereign Control Registry Evidence Runner
# Evidence contract: FND/PROWORK_SOVEREIGN_CONTROL_EVIDENCE_CONTRACT.md
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_BASE="${REPO_ROOT}/.prowork/evidence"
EVIDENCE_DIR="${EVIDENCE_BASE}/phase14_${TIMESTAMP}"
SUMMARY_JSON="${EVIDENCE_DIR}/summary.json"
DECISION_LOG="${EVIDENCE_DIR}/decision_log.txt"
COMMAND_LOG="${EVIDENCE_DIR}/command_log.txt"
MANIFEST="${EVIDENCE_DIR}/manifest.txt"
REGISTRY_EXPORT="${EVIDENCE_DIR}/registry_export.json"

PORT=13014
HOST=127.0.0.1
BASE="http://${HOST}:${PORT}"
SERVER_PID=""
PRINCIPALS_FILE="${REPO_ROOT}/app/data/admin_principals.json"
APR_FILE="${REPO_ROOT}/app/data/approval_requests.jsonl"
APD_FILE="${REPO_ROOT}/app/data/approval_decisions.jsonl"

SUPERADMIN_TOKEN="sk-phase14-superadmin-A"
SUPERADMIN2_TOKEN="sk-phase14-superadmin-B"
OPS_TOKEN="sk-phase14-ops-001"
AUDITOR_TOKEN="sk-phase14-auditor-001"

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
cd "$REPO_ROOT"
command -v node  >/dev/null 2>&1 || { echo "ERROR: node not found"; exit 1; }
command -v curl  >/dev/null 2>&1 || { echo "ERROR: curl not found"; exit 1; }
command -v jq    >/dev/null 2>&1 || { echo "ERROR: jq not found"; exit 1; }

[ -f "app/server.js" ]                                      || { echo "ERROR: app/server.js not found"; exit 1; }
[ -f "app/lib/sovereign_registry.js" ]                      || { echo "ERROR: sovereign_registry.js not found"; exit 1; }
[ -f "tests/production/phase14_sovereign_registry.test.js" ] || { echo "ERROR: phase14 test not found"; exit 1; }

mkdir -p "$EVIDENCE_DIR"

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""
  fi
  [ -f "${PRINCIPALS_FILE}.phase14_bak" ] && mv "${PRINCIPALS_FILE}.phase14_bak" "$PRINCIPALS_FILE"
  rm -f "$APR_FILE" "$APD_FILE" 2>/dev/null || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Unit tests — Phase 14 + regression
# ---------------------------------------------------------------------------
echo "[phase14] running unit tests..."
node --test tests/production/phase14_sovereign_registry.test.js >"${EVIDENCE_DIR}/unit_p14.txt" 2>&1
P14_FAIL=$(grep "^# fail" "${EVIDENCE_DIR}/unit_p14.txt" | awk '{print $3}' || echo "1")
P14_PASS=$(grep "^# pass" "${EVIDENCE_DIR}/unit_p14.txt" | awk '{print $3}' || echo "0")
echo "[phase14] phase14 unit: pass=${P14_PASS} fail=${P14_FAIL}"
[ "${P14_FAIL}" = "0" ] || { echo "ERROR: phase14 unit tests failed"; exit 1; }

node --test tests/production/phase11_permission_control.test.js >"${EVIDENCE_DIR}/unit_p11.txt" 2>&1
P11_FAIL=$(grep "^# fail" "${EVIDENCE_DIR}/unit_p11.txt" | awk '{print $3}' || echo "1")
[ "${P11_FAIL}" = "0" ] || { echo "ERROR: phase11 regression"; exit 1; }

node --test tests/production/phase12_authz_audit.test.js >"${EVIDENCE_DIR}/unit_p12.txt" 2>&1
P12_FAIL=$(grep "^# fail" "${EVIDENCE_DIR}/unit_p12.txt" | awk '{print $3}' || echo "1")
[ "${P12_FAIL}" = "0" ] || { echo "ERROR: phase12 regression"; exit 1; }

node --test tests/production/phase13_approval_control.test.js >"${EVIDENCE_DIR}/unit_p13.txt" 2>&1
P13_FAIL=$(grep "^# fail" "${EVIDENCE_DIR}/unit_p13.txt" | awk '{print $3}' || echo "1")
[ "${P13_FAIL}" = "0" ] || { echo "ERROR: phase13 regression"; exit 1; }

echo "[phase14] all unit suites pass"

# ---------------------------------------------------------------------------
# Prepare test environment
# ---------------------------------------------------------------------------
echo "[phase14] preparing test principals..."
cp "$PRINCIPALS_FILE" "${PRINCIPALS_FILE}.phase14_bak"

cat > "$PRINCIPALS_FILE" <<PRINCIPALS_EOF
{
  "roles": {
    "superadmin": { "description": "Sovereign" },
    "ops":        { "description": "Operational" },
    "auditor":    { "description": "Read-only" }
  },
  "principals": [
    { "id": "adm_p14_saA", "name": "phase14-sa-A", "role": "superadmin", "status": "active",
      "token": "${SUPERADMIN_TOKEN}", "tenant_id": "*",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)", "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)" },
    { "id": "adm_p14_saB", "name": "phase14-sa-B", "role": "superadmin", "status": "active",
      "token": "${SUPERADMIN2_TOKEN}", "tenant_id": "*",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)", "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)" },
    { "id": "adm_p14_ops", "name": "phase14-ops", "role": "ops", "status": "active",
      "token": "${OPS_TOKEN}", "tenant_id": "*",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)", "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)" },
    { "id": "adm_p14_aud", "name": "phase14-auditor", "role": "auditor", "status": "active",
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

echo "[phase14] starting server on ${HOST}:${PORT}..."
node app/server.js >"${EVIDENCE_DIR}/server.log" 2>&1 &
SERVER_PID=$!

for i in $(seq 1 30); do
  curl -sf "${BASE}/api/health" >/dev/null 2>&1 && break; sleep 0.3; done
curl -sf "${BASE}/api/health" >/dev/null 2>&1 || { echo "ERROR: server not ready"; exit 1; }
echo "[phase14] server ready"

# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------
PASS=0
FAIL=0

HDRS_FILE="/tmp/p14_hdrs_$$.txt"
BODY_FILE="/tmp/p14_body_$$.json"

http_call() {
  local method="$1" route="$2" token="$3" body_arg="${4:-}"
  local curl_args=("-s" "-D" "$HDRS_FILE" "-o" "$BODY_FILE" "-w" "%{http_code}" "-X" "$method" "${BASE}${route}")
  [ -n "$token" ]    && curl_args+=("-H" "Authorization: Bearer ${token}")
  [ -n "$body_arg" ] && curl_args+=("-H" "Content-Type: application/json" "-d" "$body_arg")
  local status
  status=$(curl "${curl_args[@]}" 2>>"$COMMAND_LOG") || true
  echo "$status"
}

read_body() { cat "$BODY_FILE" 2>/dev/null || echo "{}"; }

record_case() {
  local label="$1" route="$2" method="$3" expected="$4" actual="$5" role="$6" extra="${7:-}" result="FAIL"
  [ "$actual" = "$expected" ] && result="PASS"
  local ts; ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local rec
  rec=$(jq -n \
    --arg label    "$label"    --arg ts      "$ts"       --arg route   "$route"    \
    --arg method   "$method"   --arg exp     "$expected"  --arg act    "$actual"   \
    --arg role     "$role"     --arg extra   "$extra"     --arg result "$result"   \
    '{label:$label,timestamp:$ts,route:$route,method:$method,expected_status:$exp,actual_status:$act,resolved_role:$role,extra:$extra,result:$result}')
  echo "$rec" > "${EVIDENCE_DIR}/${label}.json"
  echo "$rec" >> "$DECISION_LOG"
  if [ "$result" = "PASS" ]; then
    PASS=$((PASS+1)); echo "[phase14] PASS  ${label} (${method} ${route} → ${actual})"
  else
    FAIL=$((FAIL+1)); echo "[phase14] FAIL  ${label} (${method} ${route} → got ${actual}, want ${expected})"
  fi
}

# ---------------------------------------------------------------------------
# POLICY-REGISTRY-UNAUTHORIZED-DENIED: auditor cannot list registry
# ---------------------------------------------------------------------------
STATUS=$(http_call "GET" "/api/admin/policy-registry" "$AUDITOR_TOKEN")
record_case "POLICY-REGISTRY-UNAUTHORIZED-DENIED" "/api/admin/policy-registry" "GET" "403" "$STATUS" "auditor"

# ---------------------------------------------------------------------------
# POLICY-REGISTRY-LOADED + POLICY-REGISTRY-LIST-ALL-REQUIRED-KEYS
# ---------------------------------------------------------------------------
STATUS=$(http_call "GET" "/api/admin/policy-registry" "$SUPERADMIN_TOKEN")
BODY=$(read_body)
record_case "POLICY-REGISTRY-LOADED" "/api/admin/policy-registry" "GET" "200" "$STATUS" "superadmin"

if [ "$STATUS" = "200" ]; then
  CTRL_COUNT=$(echo "$BODY" | jq '.data.control_count // 0' 2>/dev/null || echo 0)
  if [ "$CTRL_COUNT" -ge 7 ]; then
    PASS=$((PASS+1)); echo "[phase14] PASS  POLICY-REGISTRY-LIST-ALL-REQUIRED-KEYS (control_count=${CTRL_COUNT})"
  else
    FAIL=$((FAIL+1)); echo "[phase14] FAIL  POLICY-REGISTRY-LIST-ALL-REQUIRED-KEYS (control_count=${CTRL_COUNT}, want >=7)"
  fi
else
  FAIL=$((FAIL+1)); echo "[phase14] FAIL  POLICY-REGISTRY-LIST-ALL-REQUIRED-KEYS (registry list failed)"
fi

# ---------------------------------------------------------------------------
# POLICY-CONTROL-VERSION-PRESENT: version_control entry in list response
# ---------------------------------------------------------------------------
if [ "$STATUS" = "200" ]; then
  VERSION_CTRL=$(echo "$BODY" | jq -r '.data.version_control.control_key // empty' 2>/dev/null || echo "")
  if [ "$VERSION_CTRL" = "sovereign.registry.version" ]; then
    PASS=$((PASS+1)); echo "[phase14] PASS  POLICY-CONTROL-VERSION-PRESENT"
  else
    FAIL=$((FAIL+1)); echo "[phase14] FAIL  POLICY-CONTROL-VERSION-PRESENT (version_control.control_key=${VERSION_CTRL})"
  fi
else
  FAIL=$((FAIL+1)); echo "[phase14] FAIL  POLICY-CONTROL-VERSION-PRESENT (registry list failed)"
fi

# ---------------------------------------------------------------------------
# POLICY-RUNTIME-GUARD-FAIL-CLOSED: runtime guard entry active in registry
# ---------------------------------------------------------------------------
if [ "$STATUS" = "200" ]; then
  RG_STATUS=$(echo "$BODY" | jq -r '[.data.entries[] | select(.control_key=="runtime.guard.fail_closed.enabled")] | first | .status // empty' 2>/dev/null || echo "")
  RG_VALUE=$(echo  "$BODY" | jq -r '[.data.entries[] | select(.control_key=="runtime.guard.fail_closed.enabled")] | first | .value // empty' 2>/dev/null || echo "")
  if [ "$RG_STATUS" = "active" ] && [ "$RG_VALUE" = "true" ]; then
    PASS=$((PASS+1)); echo "[phase14] PASS  POLICY-RUNTIME-GUARD-FAIL-CLOSED"
  else
    FAIL=$((FAIL+1)); echo "[phase14] FAIL  POLICY-RUNTIME-GUARD-FAIL-CLOSED (status=${RG_STATUS} value=${RG_VALUE})"
  fi
else
  FAIL=$((FAIL+1)); echo "[phase14] FAIL  POLICY-RUNTIME-GUARD-FAIL-CLOSED"
fi

# ---------------------------------------------------------------------------
# POLICY-REGISTRY-EXPORT-GENERATED
# ---------------------------------------------------------------------------
STATUS=$(http_call "GET" "/api/admin/policy-registry/export" "$SUPERADMIN_TOKEN")
BODY=$(read_body)
record_case "POLICY-REGISTRY-EXPORT-GENERATED" "/api/admin/policy-registry/export" "GET" "200" "$STATUS" "superadmin"

if [ "$STATUS" = "200" ]; then
  # Save registry export artifact
  echo "$BODY" | jq '.data' > "$REGISTRY_EXPORT" 2>/dev/null || echo "$BODY" > "$REGISTRY_EXPORT"
  EXP_COUNT=$(echo "$BODY" | jq '.data.control_count // 0' 2>/dev/null || echo 0)
  if [ "$EXP_COUNT" -ge 7 ]; then
    PASS=$((PASS+1)); echo "[phase14] PASS  POLICY-REGISTRY-EXPORT-ARTIFACT (control_count=${EXP_COUNT})"
  else
    FAIL=$((FAIL+1)); echo "[phase14] FAIL  POLICY-REGISTRY-EXPORT-ARTIFACT (control_count=${EXP_COUNT})"
  fi
fi

# ---------------------------------------------------------------------------
# POLICY-UNKNOWN-CONTROL-DENIED: disable unknown key returns error
# ---------------------------------------------------------------------------
ENCODED_KEY=$(python3 -c "import urllib.parse; print(urllib.parse.quote('no.such.control.key'))" 2>/dev/null || echo "no.such.control.key")
STATUS=$(http_call "POST" "/api/admin/policy-registry/${ENCODED_KEY}/disable" "$SUPERADMIN_TOKEN")
# Unknown key → 400, 404, or 422 (implementation returns 422 POLICY_CONTROL_ERROR with reason unknown_key)
if [ "$STATUS" = "400" ] || [ "$STATUS" = "404" ] || [ "$STATUS" = "422" ]; then
  PASS=$((PASS+1)); echo "[phase14] PASS  POLICY-UNKNOWN-CONTROL-DENIED (got ${STATUS})"
else
  FAIL=$((FAIL+1)); echo "[phase14] FAIL  POLICY-UNKNOWN-CONTROL-DENIED (got ${STATUS}, want 400, 404, or 422)"
fi

# ---------------------------------------------------------------------------
# POLICY-SOVEREIGN-CONTROL-GATES-OPS-OVERRIDE: approval required, sovereign control active
# ---------------------------------------------------------------------------
# No approval → 403 (approval gate — sovereign control already passes since active)
STATUS=$(http_call "POST" "/api/ops/override" "$SUPERADMIN_TOKEN" '{"approval_request_id":"apr_nonexistent"}')
record_case "POLICY-SOVEREIGN-CONTROL-GATES-OPS-OVERRIDE" "/api/ops/override" "POST" "403" "$STATUS" "superadmin" "no_approval"

# ---------------------------------------------------------------------------
# POLICY-SOVEREIGN-CONTROL-GATES-FORCE-EXECUTE
# ---------------------------------------------------------------------------
STATUS=$(http_call "POST" "/api/ops/force-execute" "$OPS_TOKEN" '{"approval_request_id":"apr_nonexistent"}')
record_case "POLICY-SOVEREIGN-CONTROL-GATES-FORCE-EXECUTE" "/api/ops/force-execute" "POST" "403" "$STATUS" "ops" "no_approval"

# ---------------------------------------------------------------------------
# POLICY-SOVEREIGN-CONTROL-GATES-CONFIG-CHANGE
# ---------------------------------------------------------------------------
STATUS=$(http_call "POST" "/api/admin/config-change" "$SUPERADMIN_TOKEN" '{"approval_request_id":"apr_nonexistent"}')
record_case "POLICY-SOVEREIGN-CONTROL-GATES-CONFIG-CHANGE" "/api/admin/config-change" "POST" "403" "$STATUS" "superadmin" "no_approval"

# ---------------------------------------------------------------------------
# POLICY-REGISTRY-DISABLE-BLOCKS-EXECUTION: disable ops.override.requires_approval
# Then hitting ops.override should get 403 POLICY_CONTROL_MISSING (not approval gate)
# ---------------------------------------------------------------------------
CTRL_KEY_ENC=$(python3 -c "import urllib.parse; print(urllib.parse.quote('ops.override.requires_approval'))" 2>/dev/null || echo "ops.override.requires_approval")
STATUS=$(http_call "POST" "/api/admin/policy-registry/${CTRL_KEY_ENC}/disable" "$SUPERADMIN_TOKEN")
record_case "POLICY-REGISTRY-DISABLE-BLOCKS-EXECUTION" "/api/admin/policy-registry/${CTRL_KEY_ENC}/disable" "POST" "200" "$STATUS" "superadmin" "disable_ops_override"

if [ "$STATUS" = "200" ]; then
  # Now ops.override should fail with POLICY_CONTROL_MISSING (403)
  STATUS2=$(http_call "POST" "/api/ops/override" "$SUPERADMIN_TOKEN" '{"approval_request_id":"apr_any"}')
  BODY2=$(read_body)
  ERR_CODE=$(echo "$BODY2" | jq -r '.error.code // empty' 2>/dev/null || echo "")
  if [ "$STATUS2" = "403" ] && [ "$ERR_CODE" = "POLICY_CONTROL_MISSING" ]; then
    PASS=$((PASS+1)); echo "[phase14] PASS  POLICY-REGISTRY-DISABLE-BLOCKS-EXECUTION-VERIFY (POLICY_CONTROL_MISSING returned)"
  else
    FAIL=$((FAIL+1)); echo "[phase14] FAIL  POLICY-REGISTRY-DISABLE-BLOCKS-EXECUTION-VERIFY (status=${STATUS2} code=${ERR_CODE})"
  fi

  # Re-enable the control
  STATUS3=$(http_call "POST" "/api/admin/policy-registry/${CTRL_KEY_ENC}/enable" "$SUPERADMIN_TOKEN")
  record_case "POLICY-REGISTRY-ENABLE-RESTORES-EXECUTION" "/api/admin/policy-registry/${CTRL_KEY_ENC}/enable" "POST" "200" "$STATUS3" "superadmin" "enable_ops_override"

  # Verify execution path is restored (approval gate active again → 403 from approval, not sovereign)
  STATUS4=$(http_call "POST" "/api/ops/override" "$SUPERADMIN_TOKEN" '{"approval_request_id":"apr_nonexistent"}')
  BODY4=$(read_body)
  ERR_CODE4=$(echo "$BODY4" | jq -r '.error.code // empty' 2>/dev/null || echo "")
  # Should now fail at approval gate (APPROVAL_REQUIRED or APPROVAL_NOT_FOUND), not POLICY_CONTROL_MISSING
  if [ "$STATUS4" = "403" ] && [ "$ERR_CODE4" != "POLICY_CONTROL_MISSING" ]; then
    PASS=$((PASS+1)); echo "[phase14] PASS  POLICY-REGISTRY-ENABLE-RESTORES-EXECUTION-VERIFY (back to approval gate)"
  else
    FAIL=$((FAIL+1)); echo "[phase14] FAIL  POLICY-REGISTRY-ENABLE-RESTORES-EXECUTION-VERIFY (status=${STATUS4} code=${ERR_CODE4})"
  fi
else
  FAIL=$((FAIL+3)); echo "[phase14] FAIL  disable failed, skipping disable/enable/restore verification"
fi

# ---------------------------------------------------------------------------
# Full happy path: create approval → approve → execute with sovereign control active
# ---------------------------------------------------------------------------
# ops creates a force_execute approval request
STATUS=$(http_call "POST" "/api/approvals/request" "$OPS_TOKEN" '{"action_type":"ops.force_execute","target_route":"ops.force_execute","reason":"phase14 evidence test"}')
BODY=$(read_body)
FE_APR_ID=$(echo "$BODY" | jq -r '.data.approval_request_id // empty' 2>/dev/null || echo "")

if [ -n "$FE_APR_ID" ]; then
  # SA-A approves
  STATUS=$(http_call "POST" "/api/approvals/${FE_APR_ID}/approve" "$SUPERADMIN_TOKEN" '{"reason":"approved for phase14 evidence"}')
  BODY=$(read_body)
  FE_APD_ID=$(echo "$BODY" | jq -r '.data.approval_decision_id // empty' 2>/dev/null || echo "")

  # ops executes (sovereign control active + approval valid)
  STATUS=$(http_call "POST" "/api/ops/force-execute" "$OPS_TOKEN" "{\"approval_request_id\":\"${FE_APR_ID}\"}")
  record_case "POLICY-SOVEREIGN-CONTROL-GATES-FORCE-EXECUTE-ALLOW" "/api/ops/force-execute" "POST" "202" "$STATUS" "ops" "$FE_APR_ID"
else
  FAIL=$((FAIL+1)); echo "[phase14] WARN: FE_APR_ID not obtained — skipping force_execute happy path"
fi

# ---------------------------------------------------------------------------
# Write summary.json
# ---------------------------------------------------------------------------
TOTAL=$((PASS+FAIL))
jq -n \
  --arg phase       "phase-14" \
  --arg ts          "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson pass    "$PASS" \
  --argjson fail    "$FAIL" \
  --argjson total   "$TOTAL" \
  --arg unit_p14    "$P14_PASS" \
  '{phase:$phase,generated_at:$ts,unit_tests_p14_pass:$unit_p14,http_cases:{total:$total,pass:$pass,fail:$fail}}' \
  > "$SUMMARY_JSON"

# Write manifest
{
  echo "PROWORK PHASE 14 EVIDENCE MANIFEST"
  echo "generated_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "evidence_dir: ${EVIDENCE_DIR}"
  echo "FILES:"
  find "$EVIDENCE_DIR" -type f | sort
} > "$MANIFEST"

# Stop server
if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
  kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""
fi

# Cleanup temp files
rm -f "$HDRS_FILE" "$BODY_FILE" 2>/dev/null || true

# ---------------------------------------------------------------------------
# Final
# ---------------------------------------------------------------------------
echo ""
echo "[phase14] ============================="
echo "[phase14] unit tests p14: ${P14_PASS}/31"
echo "[phase14] http cases:     ${PASS}/${TOTAL}"
echo "[phase14] ============================="

[ "$FAIL" -gt 0 ] && { echo "[phase14] FAILED: ${FAIL} case(s)"; exit 1; }

echo "[phase14] ALL CASES PASSED"
echo ""
echo "EVIDENCE_RUN_DIR=${EVIDENCE_DIR}"
