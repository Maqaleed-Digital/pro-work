#!/usr/bin/env bash
# PROWORK PHASE 20 — Business Continuity + Disaster Recovery Governance Evidence Runner
# Evidence contract: FND/PROWORK_BUSINESS_CONTINUITY_DR_EVIDENCE_CONTRACT.md
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_BASE="${REPO_ROOT}/.prowork/evidence"
EVIDENCE_DIR="${EVIDENCE_BASE}/phase20_${TIMESTAMP}"
SUMMARY_JSON="${EVIDENCE_DIR}/summary.json"
DECISION_LOG="${EVIDENCE_DIR}/decision_log.txt"
COMMAND_LOG="${EVIDENCE_DIR}/command_log.txt"
MANIFEST="${EVIDENCE_DIR}/manifest.txt"
CDR_EXPORT="${EVIDENCE_DIR}/continuity_dr_export.json"

PORT=13020
HOST=127.0.0.1
BASE="http://${HOST}:${PORT}"
SERVER_PID=""
PRINCIPALS_FILE="${REPO_ROOT}/app/data/admin_principals.json"
APR_FILE="${REPO_ROOT}/app/data/approval_requests.jsonl"
APD_FILE="${REPO_ROOT}/app/data/approval_decisions.jsonl"

SA_TOKEN="sk-phase20-superadmin-A"
OPS_TOKEN="sk-phase20-ops-001"

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
cd "$REPO_ROOT"
command -v node  >/dev/null 2>&1 || { echo "ERROR: node not found"; exit 1; }
command -v curl  >/dev/null 2>&1 || { echo "ERROR: curl not found"; exit 1; }
command -v jq    >/dev/null 2>&1 || { echo "ERROR: jq not found"; exit 1; }

[ -f "app/server.js" ]                                                       || { echo "ERROR: app/server.js not found"; exit 1; }
[ -f "app/lib/continuity_dr.js" ]                                            || { echo "ERROR: continuity_dr.js not found"; exit 1; }
[ -f "tests/production/phase20_continuity_dr.test.js" ]                      || { echo "ERROR: phase20 test not found"; exit 1; }

mkdir -p "$EVIDENCE_DIR"

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""
  fi
  [ -f "${PRINCIPALS_FILE}.phase20_bak" ] && mv "${PRINCIPALS_FILE}.phase20_bak" "$PRINCIPALS_FILE"
  rm -f "$APR_FILE" "$APD_FILE" 2>/dev/null || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Unit tests — Phase 20 + regression
# ---------------------------------------------------------------------------
echo "[phase20] running unit tests..."
node --test tests/production/phase20_continuity_dr.test.js >"${EVIDENCE_DIR}/unit_p20.txt" 2>&1
P20_FAIL=$(grep "^# fail" "${EVIDENCE_DIR}/unit_p20.txt" | awk '{print $3}' || echo "1")
P20_PASS=$(grep "^# pass" "${EVIDENCE_DIR}/unit_p20.txt" | awk '{print $3}' || echo "0")
echo "[phase20] phase20 unit: pass=${P20_PASS} fail=${P20_FAIL}"
[ "${P20_FAIL}" = "0" ] || { echo "ERROR: phase20 unit tests failed"; exit 1; }

node --test tests/production/phase19_incident_containment.test.js >"${EVIDENCE_DIR}/unit_p19.txt" 2>&1
P19_FAIL=$(grep "^# fail" "${EVIDENCE_DIR}/unit_p19.txt" | awk '{print $3}' || echo "1")
[ "${P19_FAIL}" = "0" ] || { echo "ERROR: phase19 regression"; exit 1; }

node --test tests/production/phase18_external_review_gateway.test.js >"${EVIDENCE_DIR}/unit_p18.txt" 2>&1
P18_FAIL=$(grep "^# fail" "${EVIDENCE_DIR}/unit_p18.txt" | awk '{print $3}' || echo "1")
[ "${P18_FAIL}" = "0" ] || { echo "ERROR: phase18 regression"; exit 1; }

node --test tests/production/phase17_disclosure_legal_hold.test.js >"${EVIDENCE_DIR}/unit_p17.txt" 2>&1
P17_FAIL=$(grep "^# fail" "${EVIDENCE_DIR}/unit_p17.txt" | awk '{print $3}' || echo "1")
[ "${P17_FAIL}" = "0" ] || { echo "ERROR: phase17 regression"; exit 1; }

node --test tests/production/phase16_evidence_governance.test.js >"${EVIDENCE_DIR}/unit_p16.txt" 2>&1
P16_FAIL=$(grep "^# fail" "${EVIDENCE_DIR}/unit_p16.txt" | awk '{print $3}' || echo "1")
[ "${P16_FAIL}" = "0" ] || { echo "ERROR: phase16 regression"; exit 1; }

node --test tests/production/phase15_tenant_jurisdiction.test.js >"${EVIDENCE_DIR}/unit_p15.txt" 2>&1
P15_FAIL=$(grep "^# fail" "${EVIDENCE_DIR}/unit_p15.txt" | awk '{print $3}' || echo "1")
[ "${P15_FAIL}" = "0" ] || { echo "ERROR: phase15 regression"; exit 1; }

node --test tests/production/phase14_sovereign_registry.test.js >"${EVIDENCE_DIR}/unit_p14.txt" 2>&1
P14_FAIL=$(grep "^# fail" "${EVIDENCE_DIR}/unit_p14.txt" | awk '{print $3}' || echo "1")
[ "${P14_FAIL}" = "0" ] || { echo "ERROR: phase14 regression"; exit 1; }

node --test tests/production/phase13_approval_control.test.js >"${EVIDENCE_DIR}/unit_p13.txt" 2>&1
P13_FAIL=$(grep "^# fail" "${EVIDENCE_DIR}/unit_p13.txt" | awk '{print $3}' || echo "1")
[ "${P13_FAIL}" = "0" ] || { echo "ERROR: phase13 regression"; exit 1; }

node --test tests/production/phase11_permission_control.test.js >"${EVIDENCE_DIR}/unit_p11.txt" 2>&1
P11_FAIL=$(grep "^# fail" "${EVIDENCE_DIR}/unit_p11.txt" | awk '{print $3}' || echo "1")
[ "${P11_FAIL}" = "0" ] || { echo "ERROR: phase11 regression"; exit 1; }

echo "[phase20] all unit suites pass"

# ---------------------------------------------------------------------------
# Prepare test environment
# ---------------------------------------------------------------------------
echo "[phase20] preparing test principals..."
cp "$PRINCIPALS_FILE" "${PRINCIPALS_FILE}.phase20_bak"

cat > "$PRINCIPALS_FILE" <<PRINCIPALS_EOF
{
  "roles": {
    "superadmin": { "description": "Sovereign" },
    "ops":        { "description": "Operational" },
    "auditor":    { "description": "Read-only" }
  },
  "principals": [
    { "id": "adm_p20_sa",  "name": "phase20-sa",  "role": "superadmin", "status": "active",
      "token": "${SA_TOKEN}",  "tenant_id": "*",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)", "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)" },
    { "id": "adm_p20_ops", "name": "phase20-ops", "role": "ops",        "status": "active",
      "token": "${OPS_TOKEN}", "tenant_id": "*",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)", "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)" }
  ]
}
PRINCIPALS_EOF

> "$APR_FILE" 2>/dev/null || touch "$APR_FILE"
> "$APD_FILE" 2>/dev/null || touch "$APD_FILE"

# ---------------------------------------------------------------------------
# Start server
# ---------------------------------------------------------------------------
export ADMIN_API_TOKEN="$SA_TOKEN"
export APP_PORT="$PORT"
export APP_HOST="$HOST"
export WOS_PUBLIC_WRITE="false"
export LOG_FORMAT="json"

echo "[phase20] starting server on ${HOST}:${PORT}..."
node app/server.js >"${EVIDENCE_DIR}/server.log" 2>&1 &
SERVER_PID=$!

for i in $(seq 1 30); do
  curl -sf "${BASE}/api/health" >/dev/null 2>&1 && break; sleep 0.3; done
curl -sf "${BASE}/api/health" >/dev/null 2>&1 || { echo "ERROR: server not ready"; exit 1; }
echo "[phase20] server ready"

# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------
PASS=0
FAIL=0
HDRS_FILE="/tmp/p20_hdrs_$$.txt"
BODY_FILE="/tmp/p20_body_$$.json"

http_call() {
  local method="$1" route="$2" token="$3"
  shift 3
  local status
  local auth_flag=()
  [ -n "$token" ] && auth_flag=("-H" "Authorization: Bearer ${token}")
  status=$(curl -s -D "$HDRS_FILE" -o "$BODY_FILE" -w "%{http_code}" -X "$method" \
    ${auth_flag[@]+"${auth_flag[@]}"} \
    "$@" \
    "${BASE}${route}" 2>>"$COMMAND_LOG") || true
  echo "$status"
}

read_body() { cat "$BODY_FILE" 2>/dev/null || echo "{}"; }

record_case() {
  local label="$1" route="$2" method="$3" expected="$4" actual="$5" role="$6" extra="${7:-}" result="FAIL"
  [ "$actual" = "$expected" ] && result="PASS"
  local ts; ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local rec
  rec=$(jq -n \
    --arg label  "$label"   --arg ts    "$ts"       --arg route  "$route"   \
    --arg method "$method"  --arg exp   "$expected"  --arg act   "$actual"  \
    --arg role   "$role"    --arg extra "$extra"     --arg result "$result"  \
    '{label:$label,timestamp:$ts,route:$route,method:$method,expected_status:$exp,actual_status:$act,resolved_role:$role,extra:$extra,result:$result}')
  echo "$rec" > "${EVIDENCE_DIR}/${label}.json"
  echo "$rec" >> "$DECISION_LOG"
  if [ "$result" = "PASS" ]; then
    PASS=$((PASS+1)); echo "[phase20] PASS  ${label} (${method} ${route} → ${actual})"
  else
    FAIL=$((FAIL+1)); echo "[phase20] FAIL  ${label} (${method} ${route} → got ${actual}, want ${expected})"
  fi
}

# ---------------------------------------------------------------------------
# CONTINUITY-CONTEXT-LOADED + DR-CONTEXT-LOADED
# ---------------------------------------------------------------------------
STATUS=$(http_call "GET" "/api/admin/continuity-governance" "$SA_TOKEN")
BODY=$(read_body)
record_case "CONTINUITY-CONTEXT-LOADED" "/api/admin/continuity-governance" "GET" "200" "$STATUS" "superadmin"

if [ "$STATUS" = "200" ]; then
  CM=$(echo "$BODY" | jq -r '.data.continuity_mode // empty' 2>/dev/null || echo "")
  RS=$(echo "$BODY" | jq -r '.data.recovery_state  // empty' 2>/dev/null || echo "")
  if [ -n "$RS" ]; then
    PASS=$((PASS+1)); echo "[phase20] PASS  DR-CONTEXT-LOADED (recovery_state=${RS})"
  else
    FAIL=$((FAIL+1)); echo "[phase20] FAIL  DR-CONTEXT-LOADED (recovery_state missing)"
  fi
  echo "[phase20]   continuity_mode=${CM} recovery_state=${RS}"
fi

# ---------------------------------------------------------------------------
# CONTINUITY-EXPORT-GENERATED
# ---------------------------------------------------------------------------
STATUS=$(http_call "GET" "/api/admin/continuity-governance/export" "$SA_TOKEN")
BODY=$(read_body)
record_case "CONTINUITY-EXPORT-GENERATED" "/api/admin/continuity-governance/export" "GET" "200" "$STATUS" "superadmin"
if [ "$STATUS" = "200" ]; then
  echo "$BODY" | jq '.data' > "$CDR_EXPORT" 2>/dev/null || echo "$BODY" > "$CDR_EXPORT"
fi

# ---------------------------------------------------------------------------
# CONTINUITY-DR-POLICY-BOUND-ENFORCED: set mode via admin route
# ---------------------------------------------------------------------------
STATUS=$(http_call "POST" "/api/admin/continuity-governance/mode" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"continuity_mode":"degraded"}')
BODY=$(read_body)
record_case "CONTINUITY-DR-POLICY-BOUND-ENFORCED" "/api/admin/continuity-governance/mode" "POST" "200" "$STATUS" "superadmin" "set_degraded"
CURR_MODE=$(echo "$BODY" | jq -r '.data.current_mode // empty' 2>/dev/null || echo "")
echo "[phase20]   current_mode=${CURR_MODE}"

# Restore to normal for remaining tests
http_call "POST" "/api/admin/continuity-governance/mode" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"continuity_mode":"normal"}' >/dev/null 2>>"$COMMAND_LOG" || true

# ---------------------------------------------------------------------------
# CONTINUITY-ALLOW-NORMAL: normal mode + standby state → 202
# ---------------------------------------------------------------------------
STATUS=$(http_call "POST" "/api/ops/governed-continuity-exec" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-H" "X-Continuity-Mode: normal" \
  "-H" "X-Recovery-State: standby" \
  "-d" '{"note":"normal mode test"}')
BODY=$(read_body)
record_case "CONTINUITY-ALLOW-NORMAL" "/api/ops/governed-continuity-exec" "POST" "202" "$STATUS" "ops" "normal+standby"
CM_RESP=$(echo "$BODY" | jq -r '.data.continuity_mode // empty' 2>/dev/null || echo "")
RS_RESP=$(echo "$BODY" | jq -r '.data.recovery_state  // empty' 2>/dev/null || echo "")
echo "[phase20]   response continuity_mode=${CM_RESP} recovery_state=${RS_RESP}"

# ---------------------------------------------------------------------------
# CONTINUITY-DENY-MISSING-MODE: no X-Continuity-Mode → 403
# ---------------------------------------------------------------------------
STATUS=$(http_call "POST" "/api/ops/governed-continuity-exec" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-H" "X-Recovery-State: standby" \
  "-d" '{"note":"test"}')
record_case "CONTINUITY-DENY-MISSING-MODE" "/api/ops/governed-continuity-exec" "POST" "403" "$STATUS" "ops" "no_continuity_mode"

# ---------------------------------------------------------------------------
# CONTINUITY-DENY-UNKNOWN-MODE: unknown mode → 403
# ---------------------------------------------------------------------------
STATUS=$(http_call "POST" "/api/ops/governed-continuity-exec" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-H" "X-Continuity-Mode: catastrophic" \
  "-H" "X-Recovery-State: standby" \
  "-d" '{"note":"test"}')
BODY=$(read_body)
ERR_CODE=$(echo "$BODY" | jq -r '.error.code // empty' 2>/dev/null || echo "")
record_case "CONTINUITY-DENY-UNKNOWN-MODE" "/api/ops/governed-continuity-exec" "POST" "403" "$STATUS" "ops" "unknown_mode"
echo "[phase20]   error_code=${ERR_CODE}"

# ---------------------------------------------------------------------------
# CONTINUITY-DEGRADED-RESTRICTION-ENFORCED: degraded mode → 403
# ---------------------------------------------------------------------------
STATUS=$(http_call "POST" "/api/ops/governed-continuity-exec" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-H" "X-Continuity-Mode: degraded" \
  "-H" "X-Recovery-State: standby" \
  "-d" '{"note":"test"}')
BODY=$(read_body)
ERR_CODE=$(echo "$BODY" | jq -r '.error.code // empty' 2>/dev/null || echo "")
record_case "CONTINUITY-DEGRADED-RESTRICTION-ENFORCED" "/api/ops/governed-continuity-exec" "POST" "403" "$STATUS" "ops" "degraded_mode"
echo "[phase20]   error_code=${ERR_CODE}"

# ---------------------------------------------------------------------------
# DR-DENY-MISSING-STATE: no X-Recovery-State → 403
# ---------------------------------------------------------------------------
STATUS=$(http_call "POST" "/api/ops/governed-continuity-exec" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-H" "X-Continuity-Mode: normal" \
  "-d" '{"note":"test"}')
record_case "DR-DENY-MISSING-STATE" "/api/ops/governed-continuity-exec" "POST" "403" "$STATUS" "ops" "no_recovery_state"

# ---------------------------------------------------------------------------
# DR-DENY-UNKNOWN-STATE: unknown recovery state → 403
# ---------------------------------------------------------------------------
STATUS=$(http_call "POST" "/api/ops/governed-continuity-exec" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-H" "X-Continuity-Mode: normal" \
  "-H" "X-Recovery-State: partial_recovery" \
  "-d" '{"note":"test"}')
BODY=$(read_body)
ERR_CODE=$(echo "$BODY" | jq -r '.error.code // empty' 2>/dev/null || echo "")
record_case "DR-DENY-UNKNOWN-STATE" "/api/ops/governed-continuity-exec" "POST" "403" "$STATUS" "ops" "unknown_recovery_state"
echo "[phase20]   error_code=${ERR_CODE}"

# ---------------------------------------------------------------------------
# DR-ACTIVE-RECOVERY-RESTRICTION-ENFORCED: active_recovery → 403
# ---------------------------------------------------------------------------
STATUS=$(http_call "POST" "/api/ops/governed-continuity-exec" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-H" "X-Continuity-Mode: normal" \
  "-H" "X-Recovery-State: active_recovery" \
  "-d" '{"note":"test"}')
BODY=$(read_body)
ERR_CODE=$(echo "$BODY" | jq -r '.error.code // empty' 2>/dev/null || echo "")
record_case "DR-ACTIVE-RECOVERY-RESTRICTION-ENFORCED" "/api/ops/governed-continuity-exec" "POST" "403" "$STATUS" "ops" "active_recovery"
echo "[phase20]   error_code=${ERR_CODE}"

# ---------------------------------------------------------------------------
# DR-RESTORED-ALLOW: normal mode + restored state → 202
# ---------------------------------------------------------------------------
STATUS=$(http_call "POST" "/api/ops/governed-continuity-exec" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-H" "X-Continuity-Mode: normal" \
  "-H" "X-Recovery-State: restored" \
  "-d" '{"note":"test"}')
record_case "DR-RESTORED-ALLOW" "/api/ops/governed-continuity-exec" "POST" "202" "$STATUS" "ops" "normal+restored"

# ---------------------------------------------------------------------------
# INCIDENT-CONTAINMENT-PRECEDENCE-PRESERVED:
# Declare critical incident, then try continuity exec with valid mode/state → still 403
# ---------------------------------------------------------------------------
STATUS=$(http_call "POST" "/api/admin/incidents" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"severity":"critical","scope":"phase20-precedence-test","notes":"precedence test"}')
BODY=$(read_body)
PREC_INC_ID=$(echo "$BODY" | jq -r '.data.incident_id // empty' 2>/dev/null || echo "")
echo "[phase20]   created critical incident for precedence test: ${PREC_INC_ID}"

STATUS=$(http_call "POST" "/api/ops/governed-continuity-exec" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-H" "X-Continuity-Mode: normal" \
  "-H" "X-Recovery-State: standby" \
  "-d" '{"note":"containment precedence test"}')
BODY=$(read_body)
ERR_CODE=$(echo "$BODY" | jq -r '.error.code // empty' 2>/dev/null || echo "")
record_case "INCIDENT-CONTAINMENT-PRECEDENCE-PRESERVED" "/api/ops/governed-continuity-exec" "POST" "403" "$STATUS" "ops" "critical_incident_overrides_normal_mode"
echo "[phase20]   error_code=${ERR_CODE}"

# Resolve the test incident
if [ -n "$PREC_INC_ID" ]; then
  http_call "POST" "/api/admin/incidents/${PREC_INC_ID}/resolve" "$SA_TOKEN" >/dev/null 2>>"$COMMAND_LOG" || true
fi

# ---------------------------------------------------------------------------
# CONTINUITY-DR-METADATA-PRESENT: continuity_mode in server.log
# ---------------------------------------------------------------------------
if grep -q '"continuity_mode"' "${EVIDENCE_DIR}/server.log" 2>/dev/null; then
  PASS=$((PASS+1)); echo "[phase20] PASS  CONTINUITY-DR-METADATA-PRESENT (continuity_mode in server.log)"
else
  FAIL=$((FAIL+1)); echo "[phase20] FAIL  CONTINUITY-DR-METADATA-PRESENT (not found in server.log)"
fi

# ---------------------------------------------------------------------------
# Write summary.json
# ---------------------------------------------------------------------------
TOTAL=$((PASS+FAIL))
jq -n \
  --arg phase    "phase-20" \
  --arg ts       "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson pass  "$PASS" \
  --argjson fail  "$FAIL" \
  --argjson total "$TOTAL" \
  --arg unit_p20  "$P20_PASS" \
  '{phase:$phase,generated_at:$ts,unit_tests_p20_pass:$unit_p20,http_cases:{total:$total,pass:$pass,fail:$fail}}' \
  > "$SUMMARY_JSON"

{
  echo "PROWORK PHASE 20 EVIDENCE MANIFEST"
  echo "generated_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "evidence_dir: ${EVIDENCE_DIR}"
  echo "FILES:"
  find "$EVIDENCE_DIR" -type f | sort
} > "$MANIFEST"

if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
  kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""
fi
rm -f "$HDRS_FILE" "$BODY_FILE" 2>/dev/null || true

# ---------------------------------------------------------------------------
# Final
# ---------------------------------------------------------------------------
echo ""
echo "[phase20] ============================="
echo "[phase20] unit tests p20: ${P20_PASS}"
echo "[phase20] http cases:     ${PASS}/${TOTAL}"
echo "[phase20] ============================="

[ "$FAIL" -gt 0 ] && { echo "[phase20] FAILED: ${FAIL} case(s)"; exit 1; }

echo "[phase20] ALL CASES PASSED"
echo ""
echo "EVIDENCE_RUN_DIR=${EVIDENCE_DIR}"
