#!/usr/bin/env bash
# PROWORK PHASE 19 — Breach Response + Incident Containment Governance Evidence Runner
# Evidence contract: FND/PROWORK_INCIDENT_EVIDENCE_CONTRACT.md
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_BASE="${REPO_ROOT}/.prowork/evidence"
EVIDENCE_DIR="${EVIDENCE_BASE}/phase19_${TIMESTAMP}"
SUMMARY_JSON="${EVIDENCE_DIR}/summary.json"
DECISION_LOG="${EVIDENCE_DIR}/decision_log.txt"
COMMAND_LOG="${EVIDENCE_DIR}/command_log.txt"
MANIFEST="${EVIDENCE_DIR}/manifest.txt"
INC_EXPORT="${EVIDENCE_DIR}/incident_governance_export.json"

PORT=13019
HOST=127.0.0.1
BASE="http://${HOST}:${PORT}"
SERVER_PID=""
PRINCIPALS_FILE="${REPO_ROOT}/app/data/admin_principals.json"
APR_FILE="${REPO_ROOT}/app/data/approval_requests.jsonl"
APD_FILE="${REPO_ROOT}/app/data/approval_decisions.jsonl"

SA_TOKEN="sk-phase19-superadmin-A"
OPS_TOKEN="sk-phase19-ops-001"

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
cd "$REPO_ROOT"
command -v node  >/dev/null 2>&1 || { echo "ERROR: node not found"; exit 1; }
command -v curl  >/dev/null 2>&1 || { echo "ERROR: curl not found"; exit 1; }
command -v jq    >/dev/null 2>&1 || { echo "ERROR: jq not found"; exit 1; }

[ -f "app/server.js" ]                                                       || { echo "ERROR: app/server.js not found"; exit 1; }
[ -f "app/lib/incident_registry.js" ]                                        || { echo "ERROR: incident_registry.js not found"; exit 1; }
[ -f "tests/production/phase19_incident_containment.test.js" ]               || { echo "ERROR: phase19 test not found"; exit 1; }

mkdir -p "$EVIDENCE_DIR"

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""
  fi
  [ -f "${PRINCIPALS_FILE}.phase19_bak" ] && mv "${PRINCIPALS_FILE}.phase19_bak" "$PRINCIPALS_FILE"
  rm -f "$APR_FILE" "$APD_FILE" 2>/dev/null || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Unit tests — Phase 19 + regression
# ---------------------------------------------------------------------------
echo "[phase19] running unit tests..."
node --test tests/production/phase19_incident_containment.test.js >"${EVIDENCE_DIR}/unit_p19.txt" 2>&1
P19_FAIL=$(grep "^# fail" "${EVIDENCE_DIR}/unit_p19.txt" | awk '{print $3}' || echo "1")
P19_PASS=$(grep "^# pass" "${EVIDENCE_DIR}/unit_p19.txt" | awk '{print $3}' || echo "0")
echo "[phase19] phase19 unit: pass=${P19_PASS} fail=${P19_FAIL}"
[ "${P19_FAIL}" = "0" ] || { echo "ERROR: phase19 unit tests failed"; exit 1; }

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

echo "[phase19] all unit suites pass"

# ---------------------------------------------------------------------------
# Prepare test environment
# ---------------------------------------------------------------------------
echo "[phase19] preparing test principals..."
cp "$PRINCIPALS_FILE" "${PRINCIPALS_FILE}.phase19_bak"

cat > "$PRINCIPALS_FILE" <<PRINCIPALS_EOF
{
  "roles": {
    "superadmin": { "description": "Sovereign" },
    "ops":        { "description": "Operational" },
    "auditor":    { "description": "Read-only" }
  },
  "principals": [
    { "id": "adm_p19_sa",  "name": "phase19-sa",  "role": "superadmin", "status": "active",
      "token": "${SA_TOKEN}",  "tenant_id": "*",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)", "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)" },
    { "id": "adm_p19_ops", "name": "phase19-ops", "role": "ops",        "status": "active",
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

echo "[phase19] starting server on ${HOST}:${PORT}..."
node app/server.js >"${EVIDENCE_DIR}/server.log" 2>&1 &
SERVER_PID=$!

for i in $(seq 1 30); do
  curl -sf "${BASE}/api/health" >/dev/null 2>&1 && break; sleep 0.3; done
curl -sf "${BASE}/api/health" >/dev/null 2>&1 || { echo "ERROR: server not ready"; exit 1; }
echo "[phase19] server ready"

# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------
PASS=0
FAIL=0
HDRS_FILE="/tmp/p19_hdrs_$$.txt"
BODY_FILE="/tmp/p19_body_$$.json"

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
    PASS=$((PASS+1)); echo "[phase19] PASS  ${label} (${method} ${route} → ${actual})"
  else
    FAIL=$((FAIL+1)); echo "[phase19] FAIL  ${label} (${method} ${route} → got ${actual}, want ${expected})"
  fi
}

# ---------------------------------------------------------------------------
# INCIDENT-CONTEXT-LOADED: GET /api/admin/incidents/export → 200
# ---------------------------------------------------------------------------
STATUS=$(http_call "GET" "/api/admin/incidents/export" "$SA_TOKEN")
BODY=$(read_body)
record_case "INCIDENT-CONTEXT-LOADED" "/api/admin/incidents/export" "GET" "200" "$STATUS" "superadmin"
if [ "$STATUS" = "200" ]; then
  echo "$BODY" | jq '.data' > "$INC_EXPORT" 2>/dev/null || echo "$BODY" > "$INC_EXPORT"
fi

# ---------------------------------------------------------------------------
# INCIDENT-CONTAINMENT-ALLOW: no incidents active → exec allowed
# ---------------------------------------------------------------------------
STATUS=$(http_call "POST" "/api/ops/governed-containment-exec" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"note":"pre-incident exec test"}')
BODY=$(read_body)
record_case "INCIDENT-CONTAINMENT-ALLOW" "/api/ops/governed-containment-exec" "POST" "202" "$STATUS" "ops" "no_active_incidents"
HIGHEST=$(echo "$BODY" | jq -r '.data.highest_active_severity // "none"' 2>/dev/null || echo "none")
echo "[phase19]   highest_active_severity=${HIGHEST}"

# ---------------------------------------------------------------------------
# INCIDENT-DECLARED: POST /api/admin/incidents → 201
# ---------------------------------------------------------------------------
STATUS=$(http_call "POST" "/api/admin/incidents" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"severity":"critical","scope":"auth-service","notes":"Phase19 breach simulation"}')
BODY=$(read_body)
record_case "INCIDENT-DECLARED" "/api/admin/incidents" "POST" "201" "$STATUS" "superadmin"
INCIDENT_ID=$(echo "$BODY" | jq -r '.data.incident_id // empty' 2>/dev/null || echo "")
INC_SEV=$(echo "$BODY" | jq -r '.data.incident_severity // empty' 2>/dev/null || echo "")
INC_STATUS=$(echo "$BODY" | jq -r '.data.incident_status // empty' 2>/dev/null || echo "")
echo "[phase19]   incident_id=${INCIDENT_ID} severity=${INC_SEV} status=${INC_STATUS}"

# ---------------------------------------------------------------------------
# INCIDENT-CONTAINMENT-ACTIVE: export shows containment_active=true
# ---------------------------------------------------------------------------
STATUS=$(http_call "GET" "/api/admin/incidents/export" "$SA_TOKEN")
BODY=$(read_body)
if [ "$STATUS" = "200" ]; then
  CONTAINMENT_ACTIVE=$(echo "$BODY" | jq '.data.containment_active // false' 2>/dev/null || echo "false")
  HIGHEST_SEV=$(echo "$BODY" | jq -r '.data.highest_active_severity // "none"' 2>/dev/null || echo "none")
  if [ "$CONTAINMENT_ACTIVE" = "true" ]; then
    PASS=$((PASS+1)); echo "[phase19] PASS  INCIDENT-CONTAINMENT-ACTIVE (containment_active=true, highest=${HIGHEST_SEV})"
  else
    FAIL=$((FAIL+1)); echo "[phase19] FAIL  INCIDENT-CONTAINMENT-ACTIVE (containment_active=${CONTAINMENT_ACTIVE})"
  fi
else
  FAIL=$((FAIL+1)); echo "[phase19] FAIL  INCIDENT-CONTAINMENT-ACTIVE (export failed: ${STATUS})"
fi

# ---------------------------------------------------------------------------
# INCIDENT-CONTAINMENT-BLOCK: critical incident active → exec blocked
# ---------------------------------------------------------------------------
STATUS=$(http_call "POST" "/api/ops/governed-containment-exec" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"note":"exec during critical incident"}')
BODY=$(read_body)
ERR_CODE=$(echo "$BODY" | jq -r '.error.code // empty' 2>/dev/null || echo "")
record_case "INCIDENT-CONTAINMENT-BLOCK" "/api/ops/governed-containment-exec" "POST" "403" "$STATUS" "ops" "critical_incident_active"
echo "[phase19]   error_code=${ERR_CODE}"

# ---------------------------------------------------------------------------
# INCIDENT-RESOLVED: POST /api/admin/incidents/:id/resolve → 200
# ---------------------------------------------------------------------------
if [ -n "$INCIDENT_ID" ]; then
  STATUS=$(http_call "POST" "/api/admin/incidents/${INCIDENT_ID}/resolve" "$SA_TOKEN")
  BODY=$(read_body)
  record_case "INCIDENT-RESOLVED" "/api/admin/incidents/${INCIDENT_ID}/resolve" "POST" "200" "$STATUS" "superadmin"
  NEW_STATUS=$(echo "$BODY" | jq -r '.data.incident_status // empty' 2>/dev/null || echo "")
  echo "[phase19]   resolved incident_status=${NEW_STATUS}"
else
  FAIL=$((FAIL+1)); echo "[phase19] FAIL  INCIDENT-RESOLVED (no incident_id to resolve)"
fi

# Also verify exec allowed again after resolve (extend allow proof)
STATUS=$(http_call "POST" "/api/ops/governed-containment-exec" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"note":"exec after incident resolved"}')
if [ "$STATUS" = "202" ]; then
  PASS=$((PASS+1)); echo "[phase19] PASS  INCIDENT-CONTAINMENT-ALLOW-AFTER-RESOLVE (exec allowed after resolve)"
else
  FAIL=$((FAIL+1)); echo "[phase19] FAIL  INCIDENT-CONTAINMENT-ALLOW-AFTER-RESOLVE (status=${STATUS})"
fi

# ---------------------------------------------------------------------------
# INCIDENT-METADATA-PRESENT: incident_severity in server.log
# ---------------------------------------------------------------------------
if grep -q '"incident_severity"' "${EVIDENCE_DIR}/server.log" 2>/dev/null; then
  PASS=$((PASS+1)); echo "[phase19] PASS  INCIDENT-METADATA-PRESENT (incident_severity in server.log)"
else
  FAIL=$((FAIL+1)); echo "[phase19] FAIL  INCIDENT-METADATA-PRESENT (not found in server.log)"
fi

# ---------------------------------------------------------------------------
# Write summary.json
# ---------------------------------------------------------------------------
TOTAL=$((PASS+FAIL))
jq -n \
  --arg phase    "phase-19" \
  --arg ts       "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson pass  "$PASS" \
  --argjson fail  "$FAIL" \
  --argjson total "$TOTAL" \
  --arg unit_p19  "$P19_PASS" \
  '{phase:$phase,generated_at:$ts,unit_tests_p19_pass:$unit_p19,http_cases:{total:$total,pass:$pass,fail:$fail}}' \
  > "$SUMMARY_JSON"

{
  echo "PROWORK PHASE 19 EVIDENCE MANIFEST"
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
echo "[phase19] ============================="
echo "[phase19] unit tests p19: ${P19_PASS}"
echo "[phase19] http cases:     ${PASS}/${TOTAL}"
echo "[phase19] ============================="

[ "$FAIL" -gt 0 ] && { echo "[phase19] FAILED: ${FAIL} case(s)"; exit 1; }

echo "[phase19] ALL CASES PASSED"
echo ""
echo "EVIDENCE_RUN_DIR=${EVIDENCE_DIR}"
