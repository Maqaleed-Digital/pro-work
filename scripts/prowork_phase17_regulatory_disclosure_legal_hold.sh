#!/usr/bin/env bash
# PROWORK PHASE 17 — Regulatory Disclosure + Legal Hold Governance Evidence Runner
# Evidence contract: FND/PROWORK_DISCLOSURE_LEGAL_HOLD_EVIDENCE_CONTRACT.md
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_BASE="${REPO_ROOT}/.prowork/evidence"
EVIDENCE_DIR="${EVIDENCE_BASE}/phase17_${TIMESTAMP}"
SUMMARY_JSON="${EVIDENCE_DIR}/summary.json"
DECISION_LOG="${EVIDENCE_DIR}/decision_log.txt"
COMMAND_LOG="${EVIDENCE_DIR}/command_log.txt"
MANIFEST="${EVIDENCE_DIR}/manifest.txt"
DLH_EXPORT="${EVIDENCE_DIR}/disclosure_governance_export.json"

PORT=13017
HOST=127.0.0.1
BASE="http://${HOST}:${PORT}"
SERVER_PID=""
PRINCIPALS_FILE="${REPO_ROOT}/app/data/admin_principals.json"
APR_FILE="${REPO_ROOT}/app/data/approval_requests.jsonl"
APD_FILE="${REPO_ROOT}/app/data/approval_decisions.jsonl"

SA_TOKEN="sk-phase17-superadmin-A"
OPS_TOKEN="sk-phase17-ops-001"

TENANT_P17="tenant_p17_main"

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
cd "$REPO_ROOT"
command -v node  >/dev/null 2>&1 || { echo "ERROR: node not found"; exit 1; }
command -v curl  >/dev/null 2>&1 || { echo "ERROR: curl not found"; exit 1; }
command -v jq    >/dev/null 2>&1 || { echo "ERROR: jq not found"; exit 1; }

[ -f "app/server.js" ]                                                  || { echo "ERROR: app/server.js not found"; exit 1; }
[ -f "app/lib/disclosure_legal_hold.js" ]                               || { echo "ERROR: disclosure_legal_hold.js not found"; exit 1; }
[ -f "tests/production/phase17_disclosure_legal_hold.test.js" ]         || { echo "ERROR: phase17 test not found"; exit 1; }

mkdir -p "$EVIDENCE_DIR"

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""
  fi
  [ -f "${PRINCIPALS_FILE}.phase17_bak" ] && mv "${PRINCIPALS_FILE}.phase17_bak" "$PRINCIPALS_FILE"
  rm -f "$APR_FILE" "$APD_FILE" 2>/dev/null || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Unit tests — Phase 17 + regression
# ---------------------------------------------------------------------------
echo "[phase17] running unit tests..."
node --test tests/production/phase17_disclosure_legal_hold.test.js >"${EVIDENCE_DIR}/unit_p17.txt" 2>&1
P17_FAIL=$(grep "^# fail" "${EVIDENCE_DIR}/unit_p17.txt" | awk '{print $3}' || echo "1")
P17_PASS=$(grep "^# pass" "${EVIDENCE_DIR}/unit_p17.txt" | awk '{print $3}' || echo "0")
echo "[phase17] phase17 unit: pass=${P17_PASS} fail=${P17_FAIL}"
[ "${P17_FAIL}" = "0" ] || { echo "ERROR: phase17 unit tests failed"; exit 1; }

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

echo "[phase17] all unit suites pass"

# ---------------------------------------------------------------------------
# Prepare test environment
# ---------------------------------------------------------------------------
echo "[phase17] preparing test principals..."
cp "$PRINCIPALS_FILE" "${PRINCIPALS_FILE}.phase17_bak"

cat > "$PRINCIPALS_FILE" <<PRINCIPALS_EOF
{
  "roles": {
    "superadmin": { "description": "Sovereign" },
    "ops":        { "description": "Operational" },
    "auditor":    { "description": "Read-only" }
  },
  "principals": [
    { "id": "adm_p17_sa",  "name": "phase17-sa",  "role": "superadmin", "status": "active",
      "token": "${SA_TOKEN}",  "tenant_id": "*",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)", "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)" },
    { "id": "adm_p17_ops", "name": "phase17-ops", "role": "ops",        "status": "active",
      "token": "${OPS_TOKEN}", "tenant_id": "${TENANT_P17}",
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

echo "[phase17] starting server on ${HOST}:${PORT}..."
node app/server.js >"${EVIDENCE_DIR}/server.log" 2>&1 &
SERVER_PID=$!

for i in $(seq 1 30); do
  curl -sf "${BASE}/api/health" >/dev/null 2>&1 && break; sleep 0.3; done
curl -sf "${BASE}/api/health" >/dev/null 2>&1 || { echo "ERROR: server not ready"; exit 1; }
echo "[phase17] server ready"

# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------
PASS=0
FAIL=0
HDRS_FILE="/tmp/p17_hdrs_$$.txt"
BODY_FILE="/tmp/p17_body_$$.json"

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
    PASS=$((PASS+1)); echo "[phase17] PASS  ${label} (${method} ${route} → ${actual})"
  else
    FAIL=$((FAIL+1)); echo "[phase17] FAIL  ${label} (${method} ${route} → got ${actual}, want ${expected})"
  fi
}

# ---------------------------------------------------------------------------
# Create test tenant
# ---------------------------------------------------------------------------
http_call "POST" "/api/admin/tenants" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" "{\"tenant_id\":\"${TENANT_P17}\",\"name\":\"Phase17 Main Tenant\"}" >/dev/null 2>>"$COMMAND_LOG" || true

# ---------------------------------------------------------------------------
# DISCLOSURE-CONTEXT-LOADED: GET /api/admin/disclosure-governance/bases
# ---------------------------------------------------------------------------
STATUS=$(http_call "GET" "/api/admin/disclosure-governance/bases" "$SA_TOKEN")
BODY=$(read_body)
record_case "DISCLOSURE-CONTEXT-LOADED" "/api/admin/disclosure-governance/bases" "GET" "200" "$STATUS" "superadmin"

# ---------------------------------------------------------------------------
# DISCLOSURE-POLICY-BOUND-ENFORCED: ≥3 bases present
# ---------------------------------------------------------------------------
if [ "$STATUS" = "200" ]; then
  BC=$(echo "$BODY" | jq '(.data.disclosure_bases // []) | length' 2>/dev/null || echo 0)
  if [ "$BC" -ge 3 ]; then
    PASS=$((PASS+1)); echo "[phase17] PASS  DISCLOSURE-POLICY-BOUND-ENFORCED (basis_count=${BC})"
  else
    FAIL=$((FAIL+1)); echo "[phase17] FAIL  DISCLOSURE-POLICY-BOUND-ENFORCED (count=${BC})"
  fi
else
  FAIL=$((FAIL+1)); echo "[phase17] FAIL  DISCLOSURE-POLICY-BOUND-ENFORCED (bases call failed: ${STATUS})"
fi

# ---------------------------------------------------------------------------
# LEGAL-HOLD-CONTEXT-LOADED: GET /api/admin/disclosure-governance/legal-holds
# ---------------------------------------------------------------------------
STATUS=$(http_call "GET" "/api/admin/disclosure-governance/legal-holds" "$SA_TOKEN")
record_case "LEGAL-HOLD-CONTEXT-LOADED" "/api/admin/disclosure-governance/legal-holds" "GET" "200" "$STATUS" "superadmin"

# ---------------------------------------------------------------------------
# DISCLOSURE-EXPORT-GENERATED: GET /api/admin/disclosure-governance/export
# ---------------------------------------------------------------------------
STATUS=$(http_call "GET" "/api/admin/disclosure-governance/export" "$SA_TOKEN")
BODY=$(read_body)
record_case "DISCLOSURE-EXPORT-GENERATED" "/api/admin/disclosure-governance/export" "GET" "200" "$STATUS" "superadmin"
if [ "$STATUS" = "200" ]; then
  echo "$BODY" | jq '.data' > "$DLH_EXPORT" 2>/dev/null || echo "$BODY" > "$DLH_EXPORT"
fi

# ---------------------------------------------------------------------------
# LEGAL-HOLD-POLICY-BOUND-ENFORCED: create a legal hold for tenant → 201
# ---------------------------------------------------------------------------
STATUS=$(http_call "POST" "/api/admin/disclosure-governance/legal-hold" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" "{\"tenant_id\":\"${TENANT_P17}\",\"scope\":\"full_export\",\"note\":\"p17 policy bound test\"}")
BODY=$(read_body)
record_case "LEGAL-HOLD-POLICY-BOUND-ENFORCED" "/api/admin/disclosure-governance/legal-hold" "POST" "201" "$STATUS" "superadmin"
SETUP_HOLD_ID=$(echo "$BODY" | jq -r '.data.legal_hold_id // empty' 2>/dev/null || echo "")
echo "[phase17]   created hold_id=${SETUP_HOLD_ID}"

# Release the setup hold so it doesn't affect later tests
if [ -n "$SETUP_HOLD_ID" ]; then
  http_call "POST" "/api/admin/disclosure-governance/legal-hold/${SETUP_HOLD_ID}/release" "$SA_TOKEN" >/dev/null 2>>"$COMMAND_LOG" || true
fi

# ---------------------------------------------------------------------------
# governed-disclosure proof route tests
# ---------------------------------------------------------------------------

# DISCLOSURE-DENY-MISSING-BASIS: no X-Disclosure-Basis header
STATUS=$(http_call "POST" "/api/ops/governed-disclosure" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"note":"test"}')
record_case "DISCLOSURE-DENY-MISSING-BASIS" "/api/ops/governed-disclosure" "POST" "403" "$STATUS" "ops" "no_disclosure_basis"

# DISCLOSURE-UNKNOWN-DENIED: unknown basis
STATUS=$(http_call "POST" "/api/ops/governed-disclosure" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-H" "X-Disclosure-Basis: totally.unknown.basis" \
  "-H" "X-Disclosure-Scope: audit_records" \
  "-d" '{"note":"test"}')
record_case "DISCLOSURE-UNKNOWN-DENIED" "/api/ops/governed-disclosure" "POST" "403" "$STATUS" "ops" "unknown_basis"

# DISCLOSURE-DENY-OUT-OF-SCOPE: internal.audit.review + full_export (not in allowance)
STATUS=$(http_call "POST" "/api/ops/governed-disclosure" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-H" "X-Disclosure-Basis: internal.audit.review" \
  "-H" "X-Disclosure-Scope: full_export" \
  "-d" '{"note":"test"}')
BODY=$(read_body)
ERR_CODE=$(echo "$BODY" | jq -r '.error.code // empty' 2>/dev/null || echo "")
record_case "DISCLOSURE-DENY-OUT-OF-SCOPE" "/api/ops/governed-disclosure" "POST" "403" "$STATUS" "ops" "internal_audit_review+full_export"
echo "[phase17]   error_code=${ERR_CODE}"

# DISCLOSURE-ALLOW-IN-SCOPE: regulatory.request + full_export
STATUS=$(http_call "POST" "/api/ops/governed-disclosure" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-H" "X-Disclosure-Basis: regulatory.request" \
  "-H" "X-Disclosure-Scope: full_export" \
  "-d" '{"note":"test"}')
BODY=$(read_body)
record_case "DISCLOSURE-ALLOW-IN-SCOPE" "/api/ops/governed-disclosure" "POST" "202" "$STATUS" "ops" "regulatory.request+full_export"
DBASIS_RESP=$(echo "$BODY" | jq -r '.data.disclosure_basis // empty' 2>/dev/null || echo "")
DSCOPE_RESP=$(echo "$BODY" | jq -r '.data.disclosure_scope // empty' 2>/dev/null || echo "")
echo "[phase17]   response disclosure_basis=${DBASIS_RESP} disclosure_scope=${DSCOPE_RESP}"

# DISCLOSURE-METADATA-PRESENT: disclosure_basis in server.log
if grep -q '"disclosure_basis":"regulatory.request"' "${EVIDENCE_DIR}/server.log" 2>/dev/null; then
  PASS=$((PASS+1)); echo "[phase17] PASS  DISCLOSURE-METADATA-PRESENT (disclosure_basis in server.log)"
else
  FAIL=$((FAIL+1)); echo "[phase17] FAIL  DISCLOSURE-METADATA-PRESENT (not found in server.log)"
fi

# ---------------------------------------------------------------------------
# governed-disposal proof route tests
# ---------------------------------------------------------------------------

# LEGAL-HOLD-DENY-MISSING-STATE: no X-Legal-Hold-State header
STATUS=$(http_call "POST" "/api/ops/governed-disposal" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-H" "X-Tenant-Id: ${TENANT_P17}" \
  "-d" '{"note":"test"}')
record_case "LEGAL-HOLD-DENY-MISSING-STATE" "/api/ops/governed-disposal" "POST" "403" "$STATUS" "ops" "no_hold_state"

# LEGAL-HOLD-UNKNOWN-DENIED: unknown state value
STATUS=$(http_call "POST" "/api/ops/governed-disposal" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-H" "X-Tenant-Id: ${TENANT_P17}" \
  "-H" "X-Legal-Hold-State: suspended" \
  "-d" '{"note":"test"}')
record_case "LEGAL-HOLD-UNKNOWN-DENIED" "/api/ops/governed-disposal" "POST" "403" "$STATUS" "ops" "unknown_state"

# LEGAL-HOLD-ALLOW-NONE: state=none, no active hold → 202
STATUS=$(http_call "POST" "/api/ops/governed-disposal" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-H" "X-Tenant-Id: ${TENANT_P17}" \
  "-H" "X-Legal-Hold-State: none" \
  "-d" '{"note":"test"}')
record_case "LEGAL-HOLD-ALLOW-NONE" "/api/ops/governed-disposal" "POST" "202" "$STATUS" "ops" "state=none,no_hold"

# Create an active hold for the block tests
STATUS=$(http_call "POST" "/api/admin/disclosure-governance/legal-hold" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" "{\"tenant_id\":\"${TENANT_P17}\",\"scope\":\"full_export\",\"note\":\"block test hold\"}")
BODY=$(read_body)
ACTIVE_HOLD_ID=$(echo "$BODY" | jq -r '.data.legal_hold_id // empty' 2>/dev/null || echo "")
echo "[phase17]   active hold created: ${ACTIVE_HOLD_ID}"

# LEGAL-HOLD-BLOCK-ACTIVE-HOLD: active hold blocks disposal
STATUS=$(http_call "POST" "/api/ops/governed-disposal" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-H" "X-Tenant-Id: ${TENANT_P17}" \
  "-H" "X-Legal-Hold-State: none" \
  "-d" '{"note":"test"}')
BODY=$(read_body)
ERR_CODE=$(echo "$BODY" | jq -r '.error.code // empty' 2>/dev/null || echo "")
record_case "LEGAL-HOLD-BLOCK-ACTIVE-HOLD" "/api/ops/governed-disposal" "POST" "403" "$STATUS" "ops" "active_hold_blocks"
echo "[phase17]   error_code=${ERR_CODE}"

# LEGAL-HOLD-OVERRIDES-RETENTION: active hold blocks even with valid context
STATUS=$(http_call "POST" "/api/ops/governed-disposal" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-H" "X-Tenant-Id: ${TENANT_P17}" \
  "-H" "X-Legal-Hold-State: active" \
  "-H" "X-Retention-Class: audit.long_term" \
  "-H" "X-Residency-Region: KSA" \
  "-d" '{"note":"test with valid retention context"}')
record_case "LEGAL-HOLD-OVERRIDES-RETENTION" "/api/ops/governed-disposal" "POST" "403" "$STATUS" "ops" "active_hold+valid_retention"

# Release the active hold
if [ -n "$ACTIVE_HOLD_ID" ]; then
  http_call "POST" "/api/admin/disclosure-governance/legal-hold/${ACTIVE_HOLD_ID}/release" "$SA_TOKEN" >/dev/null 2>>"$COMMAND_LOG" || true
  echo "[phase17]   hold released: ${ACTIVE_HOLD_ID}"
fi

# LEGAL-HOLD-ALLOW-RELEASED: after hold released, disposal proceeds → 202
STATUS=$(http_call "POST" "/api/ops/governed-disposal" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-H" "X-Tenant-Id: ${TENANT_P17}" \
  "-H" "X-Legal-Hold-State: released" \
  "-d" '{"note":"test after release"}')
record_case "LEGAL-HOLD-ALLOW-RELEASED" "/api/ops/governed-disposal" "POST" "202" "$STATUS" "ops" "state=released,no_active_hold"

# LEGAL-HOLD-METADATA-PRESENT: legal_hold_state in server.log
if grep -q '"legal_hold_state"' "${EVIDENCE_DIR}/server.log" 2>/dev/null; then
  PASS=$((PASS+1)); echo "[phase17] PASS  LEGAL-HOLD-METADATA-PRESENT (legal_hold_state in server.log)"
else
  FAIL=$((FAIL+1)); echo "[phase17] FAIL  LEGAL-HOLD-METADATA-PRESENT (not found in server.log)"
fi

# ---------------------------------------------------------------------------
# Write summary.json
# ---------------------------------------------------------------------------
TOTAL=$((PASS+FAIL))
jq -n \
  --arg phase    "phase-17" \
  --arg ts       "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson pass  "$PASS" \
  --argjson fail  "$FAIL" \
  --argjson total "$TOTAL" \
  --arg unit_p17  "$P17_PASS" \
  '{phase:$phase,generated_at:$ts,unit_tests_p17_pass:$unit_p17,http_cases:{total:$total,pass:$pass,fail:$fail}}' \
  > "$SUMMARY_JSON"

{
  echo "PROWORK PHASE 17 EVIDENCE MANIFEST"
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
echo "[phase17] ============================="
echo "[phase17] unit tests p17: ${P17_PASS}"
echo "[phase17] http cases:     ${PASS}/${TOTAL}"
echo "[phase17] ============================="

[ "$FAIL" -gt 0 ] && { echo "[phase17] FAILED: ${FAIL} case(s)"; exit 1; }

echo "[phase17] ALL CASES PASSED"
echo ""
echo "EVIDENCE_RUN_DIR=${EVIDENCE_DIR}"
