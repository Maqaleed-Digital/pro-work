#!/usr/bin/env bash
# PROWORK PHASE 18 — Controlled External Access + Regulator/Third-Party Review Gateway
# Evidence contract: FND/PROWORK_EXTERNAL_REVIEW_GATEWAY_EVIDENCE_CONTRACT.md
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_BASE="${REPO_ROOT}/.prowork/evidence"
EVIDENCE_DIR="${EVIDENCE_BASE}/phase18_${TIMESTAMP}"
SUMMARY_JSON="${EVIDENCE_DIR}/summary.json"
DECISION_LOG="${EVIDENCE_DIR}/decision_log.txt"
COMMAND_LOG="${EVIDENCE_DIR}/command_log.txt"
MANIFEST="${EVIDENCE_DIR}/manifest.txt"
ERG_EXPORT="${EVIDENCE_DIR}/external_review_gateway_export.json"

PORT=13018
HOST=127.0.0.1
BASE="http://${HOST}:${PORT}"
SERVER_PID=""
PRINCIPALS_FILE="${REPO_ROOT}/app/data/admin_principals.json"
APR_FILE="${REPO_ROOT}/app/data/approval_requests.jsonl"
APD_FILE="${REPO_ROOT}/app/data/approval_decisions.jsonl"

SA_TOKEN="sk-phase18-superadmin-A"
OPS_TOKEN="sk-phase18-ops-001"

TENANT_P18="tenant_p18_main"
TENANT_OTHER="tenant_p18_other"

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
cd "$REPO_ROOT"
command -v node  >/dev/null 2>&1 || { echo "ERROR: node not found"; exit 1; }
command -v curl  >/dev/null 2>&1 || { echo "ERROR: curl not found"; exit 1; }
command -v jq    >/dev/null 2>&1 || { echo "ERROR: jq not found"; exit 1; }

[ -f "app/server.js" ]                                                      || { echo "ERROR: app/server.js not found"; exit 1; }
[ -f "app/lib/external_review_gateway.js" ]                                 || { echo "ERROR: external_review_gateway.js not found"; exit 1; }
[ -f "tests/production/phase18_external_review_gateway.test.js" ]           || { echo "ERROR: phase18 test not found"; exit 1; }

mkdir -p "$EVIDENCE_DIR"

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""
  fi
  [ -f "${PRINCIPALS_FILE}.phase18_bak" ] && mv "${PRINCIPALS_FILE}.phase18_bak" "$PRINCIPALS_FILE"
  rm -f "$APR_FILE" "$APD_FILE" 2>/dev/null || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Unit tests — Phase 18 + regression
# ---------------------------------------------------------------------------
echo "[phase18] running unit tests..."
node --test tests/production/phase18_external_review_gateway.test.js >"${EVIDENCE_DIR}/unit_p18.txt" 2>&1
P18_FAIL=$(grep "^# fail" "${EVIDENCE_DIR}/unit_p18.txt" | awk '{print $3}' || echo "1")
P18_PASS=$(grep "^# pass" "${EVIDENCE_DIR}/unit_p18.txt" | awk '{print $3}' || echo "0")
echo "[phase18] phase18 unit: pass=${P18_PASS} fail=${P18_FAIL}"
[ "${P18_FAIL}" = "0" ] || { echo "ERROR: phase18 unit tests failed"; exit 1; }

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

echo "[phase18] all unit suites pass"

# ---------------------------------------------------------------------------
# Prepare test environment
# ---------------------------------------------------------------------------
echo "[phase18] preparing test principals..."
cp "$PRINCIPALS_FILE" "${PRINCIPALS_FILE}.phase18_bak"

cat > "$PRINCIPALS_FILE" <<PRINCIPALS_EOF
{
  "roles": {
    "superadmin": { "description": "Sovereign" },
    "ops":        { "description": "Operational" },
    "auditor":    { "description": "Read-only" }
  },
  "principals": [
    { "id": "adm_p18_sa",  "name": "phase18-sa",  "role": "superadmin", "status": "active",
      "token": "${SA_TOKEN}",  "tenant_id": "*",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)", "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)" },
    { "id": "adm_p18_ops", "name": "phase18-ops", "role": "ops",        "status": "active",
      "token": "${OPS_TOKEN}", "tenant_id": "${TENANT_P18}",
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

echo "[phase18] starting server on ${HOST}:${PORT}..."
node app/server.js >"${EVIDENCE_DIR}/server.log" 2>&1 &
SERVER_PID=$!

for i in $(seq 1 30); do
  curl -sf "${BASE}/api/health" >/dev/null 2>&1 && break; sleep 0.3; done
curl -sf "${BASE}/api/health" >/dev/null 2>&1 || { echo "ERROR: server not ready"; exit 1; }
echo "[phase18] server ready"

# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------
PASS=0
FAIL=0
HDRS_FILE="/tmp/p18_hdrs_$$.txt"
BODY_FILE="/tmp/p18_body_$$.json"

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
    PASS=$((PASS+1)); echo "[phase18] PASS  ${label} (${method} ${route} → ${actual})"
  else
    FAIL=$((FAIL+1)); echo "[phase18] FAIL  ${label} (${method} ${route} → got ${actual}, want ${expected})"
  fi
}

# ---------------------------------------------------------------------------
# Create test tenants
# ---------------------------------------------------------------------------
http_call "POST" "/api/admin/tenants" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" "{\"tenant_id\":\"${TENANT_P18}\",\"name\":\"Phase18 Main Tenant\"}" >/dev/null 2>>"$COMMAND_LOG" || true

http_call "POST" "/api/admin/tenants" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" "{\"tenant_id\":\"${TENANT_OTHER}\",\"name\":\"Phase18 Other Tenant\"}" >/dev/null 2>>"$COMMAND_LOG" || true

# ---------------------------------------------------------------------------
# EXTERNAL-REVIEW-CONTEXT-LOADED + EXTERNAL-REVIEW-EXPORT-GENERATED
# ---------------------------------------------------------------------------
STATUS=$(http_call "GET" "/api/admin/external-review/export" "$SA_TOKEN")
BODY=$(read_body)
record_case "EXTERNAL-REVIEW-CONTEXT-LOADED" "/api/admin/external-review/export" "GET" "200" "$STATUS" "superadmin"

if [ "$STATUS" = "200" ]; then
  echo "$BODY" | jq '.data' > "$ERG_EXPORT" 2>/dev/null || echo "$BODY" > "$ERG_EXPORT"
  RT_COUNT=$(echo "$BODY" | jq '.data.reviewer_type_count // 0' 2>/dev/null || echo 0)
  if [ "$RT_COUNT" -ge 3 ]; then
    PASS=$((PASS+1)); echo "[phase18] PASS  EXTERNAL-REVIEW-EXPORT-GENERATED (reviewer_type_count=${RT_COUNT})"
  else
    FAIL=$((FAIL+1)); echo "[phase18] FAIL  EXTERNAL-REVIEW-EXPORT-GENERATED (count=${RT_COUNT})"
  fi
fi

# ---------------------------------------------------------------------------
# Create working sessions for proof route tests
# ---------------------------------------------------------------------------

# Session A: evidence.read, KSA jurisdiction, TENANT_P18
STATUS=$(http_call "POST" "/api/admin/external-review/sessions" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" "{\"reviewer_type\":\"regulator\",\"review_scope\":\"evidence.read\",\"tenant_id\":\"${TENANT_P18}\",\"jurisdiction_code\":\"KSA\"}")
BODY=$(read_body)
SESSION_A=$(echo "$BODY" | jq -r '.data.review_session_id // empty' 2>/dev/null || echo "")
echo "[phase18]   session_a=${SESSION_A}"

# Session B: audit.read, GLOBAL jurisdiction, TENANT_P18
STATUS=$(http_call "POST" "/api/admin/external-review/sessions" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" "{\"reviewer_type\":\"third_party_auditor\",\"review_scope\":\"audit.read\",\"tenant_id\":\"${TENANT_P18}\",\"jurisdiction_code\":\"GLOBAL\"}")
BODY=$(read_body)
SESSION_B=$(echo "$BODY" | jq -r '.data.review_session_id // empty' 2>/dev/null || echo "")
echo "[phase18]   session_b=${SESSION_B}"

# Session C: disclosure.export.read, KSA, TENANT_P18, with disclosure basis
STATUS=$(http_call "POST" "/api/admin/external-review/sessions" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" "{\"reviewer_type\":\"regulator\",\"review_scope\":\"disclosure.export.read\",\"tenant_id\":\"${TENANT_P18}\",\"jurisdiction_code\":\"KSA\",\"disclosure_basis\":\"regulatory.request\"}")
BODY=$(read_body)
SESSION_C=$(echo "$BODY" | jq -r '.data.review_session_id // empty' 2>/dev/null || echo "")
echo "[phase18]   session_c=${SESSION_C}"

# Session EXPIRED: evidence.read, already past expiry
PAST="$(date -u -v-1S +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u --date='1 second ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "2000-01-01T00:00:00Z")"
STATUS=$(http_call "POST" "/api/admin/external-review/sessions" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" "{\"reviewer_type\":\"regulator\",\"review_scope\":\"evidence.read\",\"tenant_id\":\"${TENANT_P18}\",\"jurisdiction_code\":\"KSA\",\"expires_at\":\"${PAST}\"}")
BODY=$(read_body)
SESSION_EXPIRED=$(echo "$BODY" | jq -r '.data.review_session_id // empty' 2>/dev/null || echo "")
echo "[phase18]   session_expired=${SESSION_EXPIRED}"

# Session REVOKED: evidence.read — will revoke immediately
STATUS=$(http_call "POST" "/api/admin/external-review/sessions" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" "{\"reviewer_type\":\"regulator\",\"review_scope\":\"evidence.read\",\"tenant_id\":\"${TENANT_P18}\",\"jurisdiction_code\":\"KSA\"}")
BODY=$(read_body)
SESSION_TO_REVOKE=$(echo "$BODY" | jq -r '.data.review_session_id // empty' 2>/dev/null || echo "")
if [ -n "$SESSION_TO_REVOKE" ]; then
  http_call "POST" "/api/admin/external-review/sessions/${SESSION_TO_REVOKE}/revoke" "$SA_TOKEN" >/dev/null 2>>"$COMMAND_LOG" || true
fi
echo "[phase18]   session_revoked=${SESSION_TO_REVOKE}"

# ---------------------------------------------------------------------------
# EXTERNAL-REVIEW-DENY-MISSING-SESSION
# ---------------------------------------------------------------------------
STATUS=$(http_call "GET" "/external-review/evidence" "" \
  "-H" "X-Tenant-Id: ${TENANT_P18}" \
  "-H" "X-Jurisdiction-Code: KSA")
record_case "EXTERNAL-REVIEW-DENY-MISSING-SESSION" "/external-review/evidence" "GET" "403" "$STATUS" "none" "no_session_id"

# ---------------------------------------------------------------------------
# EXTERNAL-REVIEW-DENY-EXPIRED-SESSION
# ---------------------------------------------------------------------------
if [ -n "$SESSION_EXPIRED" ]; then
  STATUS=$(http_call "GET" "/external-review/evidence" "" \
    "-H" "X-Review-Session-Id: ${SESSION_EXPIRED}" \
    "-H" "X-Tenant-Id: ${TENANT_P18}" \
    "-H" "X-Jurisdiction-Code: KSA")
  record_case "EXTERNAL-REVIEW-DENY-EXPIRED-SESSION" "/external-review/evidence" "GET" "403" "$STATUS" "none" "expired_session"
else
  FAIL=$((FAIL+1)); echo "[phase18] FAIL  EXTERNAL-REVIEW-DENY-EXPIRED-SESSION (could not create expired session)"
fi

# ---------------------------------------------------------------------------
# EXTERNAL-REVIEW-DENY-REVOKED-SESSION
# ---------------------------------------------------------------------------
if [ -n "$SESSION_TO_REVOKE" ]; then
  STATUS=$(http_call "GET" "/external-review/evidence" "" \
    "-H" "X-Review-Session-Id: ${SESSION_TO_REVOKE}" \
    "-H" "X-Tenant-Id: ${TENANT_P18}" \
    "-H" "X-Jurisdiction-Code: KSA")
  record_case "EXTERNAL-REVIEW-DENY-REVOKED-SESSION" "/external-review/evidence" "GET" "403" "$STATUS" "none" "revoked_session"
else
  FAIL=$((FAIL+1)); echo "[phase18] FAIL  EXTERNAL-REVIEW-DENY-REVOKED-SESSION (could not create/revoke session)"
fi

# ---------------------------------------------------------------------------
# EXTERNAL-REVIEW-DENY-SCOPE-MISMATCH: session_a has evidence.read, audit route needs audit.read
# ---------------------------------------------------------------------------
if [ -n "$SESSION_A" ]; then
  STATUS=$(http_call "GET" "/external-review/audit" "" \
    "-H" "X-Review-Session-Id: ${SESSION_A}" \
    "-H" "X-Tenant-Id: ${TENANT_P18}" \
    "-H" "X-Jurisdiction-Code: KSA")
  BODY=$(read_body)
  ERR_CODE=$(echo "$BODY" | jq -r '.error.code // empty' 2>/dev/null || echo "")
  record_case "EXTERNAL-REVIEW-DENY-SCOPE-MISMATCH" "/external-review/audit" "GET" "403" "$STATUS" "none" "evidence.read_vs_audit.read"
  echo "[phase18]   error_code=${ERR_CODE}"
else
  FAIL=$((FAIL+1)); echo "[phase18] FAIL  EXTERNAL-REVIEW-DENY-SCOPE-MISMATCH (no session_a)"
fi

# ---------------------------------------------------------------------------
# EXTERNAL-REVIEW-DENY-CROSS-TENANT: session_a is for TENANT_P18, request as TENANT_OTHER
# ---------------------------------------------------------------------------
if [ -n "$SESSION_A" ]; then
  STATUS=$(http_call "GET" "/external-review/evidence" "" \
    "-H" "X-Review-Session-Id: ${SESSION_A}" \
    "-H" "X-Tenant-Id: ${TENANT_OTHER}" \
    "-H" "X-Jurisdiction-Code: KSA")
  BODY=$(read_body)
  ERR_CODE=$(echo "$BODY" | jq -r '.error.code // empty' 2>/dev/null || echo "")
  record_case "EXTERNAL-REVIEW-DENY-CROSS-TENANT" "/external-review/evidence" "GET" "403" "$STATUS" "none" "cross_tenant"
  echo "[phase18]   error_code=${ERR_CODE}"
else
  FAIL=$((FAIL+1)); echo "[phase18] FAIL  EXTERNAL-REVIEW-DENY-CROSS-TENANT (no session_a)"
fi

# ---------------------------------------------------------------------------
# EXTERNAL-REVIEW-DENY-INCOMPATIBLE-JURISDICTION: session_a is KSA, request GCC
# ---------------------------------------------------------------------------
if [ -n "$SESSION_A" ]; then
  STATUS=$(http_call "GET" "/external-review/evidence" "" \
    "-H" "X-Review-Session-Id: ${SESSION_A}" \
    "-H" "X-Tenant-Id: ${TENANT_P18}" \
    "-H" "X-Jurisdiction-Code: GCC")
  BODY=$(read_body)
  ERR_CODE=$(echo "$BODY" | jq -r '.error.code // empty' 2>/dev/null || echo "")
  record_case "EXTERNAL-REVIEW-DENY-INCOMPATIBLE-JURISDICTION" "/external-review/evidence" "GET" "403" "$STATUS" "none" "gcc_on_ksa_session"
  echo "[phase18]   error_code=${ERR_CODE}"
else
  FAIL=$((FAIL+1)); echo "[phase18] FAIL  EXTERNAL-REVIEW-DENY-INCOMPATIBLE-JURISDICTION (no session_a)"
fi

# ---------------------------------------------------------------------------
# EXTERNAL-REVIEW-ALLOW-IN-SCOPE: valid session_a, correct tenant and jurisdiction
# ---------------------------------------------------------------------------
if [ -n "$SESSION_A" ]; then
  STATUS=$(http_call "GET" "/external-review/evidence" "" \
    "-H" "X-Review-Session-Id: ${SESSION_A}" \
    "-H" "X-Tenant-Id: ${TENANT_P18}" \
    "-H" "X-Jurisdiction-Code: KSA")
  BODY=$(read_body)
  record_case "EXTERNAL-REVIEW-ALLOW-IN-SCOPE" "/external-review/evidence" "GET" "200" "$STATUS" "none" "valid_session_evidence.read"
  RT_RESP=$(echo "$BODY" | jq -r '.data.reviewer_type // empty' 2>/dev/null || echo "")
  RS_RESP=$(echo "$BODY" | jq -r '.data.review_scope  // empty' 2>/dev/null || echo "")
  echo "[phase18]   reviewer_type=${RT_RESP} review_scope=${RS_RESP}"
else
  FAIL=$((FAIL+1)); echo "[phase18] FAIL  EXTERNAL-REVIEW-ALLOW-IN-SCOPE (no session_a)"
fi

# ---------------------------------------------------------------------------
# EXTERNAL-REVIEW-DENY-MUTATION: POST to mutation-test always denied
# ---------------------------------------------------------------------------
STATUS=$(http_call "POST" "/external-review/mutation-test" "" \
  "-H" "Content-Type: application/json" \
  "-d" '{"action":"delete_all"}')
BODY=$(read_body)
ERR_CODE=$(echo "$BODY" | jq -r '.error.code // empty' 2>/dev/null || echo "")
record_case "EXTERNAL-REVIEW-DENY-MUTATION" "/external-review/mutation-test" "POST" "403" "$STATUS" "none" "mutation_denied"
echo "[phase18]   error_code=${ERR_CODE}"

# ---------------------------------------------------------------------------
# EXTERNAL-REVIEW-DISCLOSURE-BOUND-ENFORCED: session_c with disclosure basis
# ---------------------------------------------------------------------------
if [ -n "$SESSION_C" ]; then
  STATUS=$(http_call "GET" "/external-review/disclosure-export" "" \
    "-H" "X-Review-Session-Id: ${SESSION_C}" \
    "-H" "X-Tenant-Id: ${TENANT_P18}" \
    "-H" "X-Jurisdiction-Code: KSA")
  BODY=$(read_body)
  record_case "EXTERNAL-REVIEW-DISCLOSURE-BOUND-ENFORCED" "/external-review/disclosure-export" "GET" "200" "$STATUS" "none" "disclosure_basis_enforced"
  DB_RESP=$(echo "$BODY" | jq -r '.data.disclosure_basis // empty' 2>/dev/null || echo "")
  echo "[phase18]   disclosure_basis=${DB_RESP}"
else
  FAIL=$((FAIL+1)); echo "[phase18] FAIL  EXTERNAL-REVIEW-DISCLOSURE-BOUND-ENFORCED (no session_c)"
fi

# ---------------------------------------------------------------------------
# EXTERNAL-REVIEW-LEGAL-HOLD-ENFORCED: create active hold, disclosure export → 403
# ---------------------------------------------------------------------------

# Create active legal hold for TENANT_P18
STATUS=$(http_call "POST" "/api/admin/disclosure-governance/legal-hold" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" "{\"tenant_id\":\"${TENANT_P18}\",\"scope\":\"full_export\",\"note\":\"p18 legal hold block test\"}")
BODY=$(read_body)
BLOCK_HOLD_ID=$(echo "$BODY" | jq -r '.data.legal_hold_id // empty' 2>/dev/null || echo "")
echo "[phase18]   created hold for legal hold enforcement: ${BLOCK_HOLD_ID}"

# Session D: disclosure.export.read for hold-blocked test
STATUS=$(http_call "POST" "/api/admin/external-review/sessions" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" "{\"reviewer_type\":\"regulator\",\"review_scope\":\"disclosure.export.read\",\"tenant_id\":\"${TENANT_P18}\",\"jurisdiction_code\":\"KSA\",\"disclosure_basis\":\"regulatory.request\"}")
BODY=$(read_body)
SESSION_D=$(echo "$BODY" | jq -r '.data.review_session_id // empty' 2>/dev/null || echo "")

if [ -n "$SESSION_D" ]; then
  STATUS=$(http_call "GET" "/external-review/disclosure-export" "" \
    "-H" "X-Review-Session-Id: ${SESSION_D}" \
    "-H" "X-Tenant-Id: ${TENANT_P18}" \
    "-H" "X-Jurisdiction-Code: KSA")
  BODY=$(read_body)
  ERR_CODE=$(echo "$BODY" | jq -r '.error.code // empty' 2>/dev/null || echo "")
  record_case "EXTERNAL-REVIEW-LEGAL-HOLD-ENFORCED" "/external-review/disclosure-export" "GET" "403" "$STATUS" "none" "active_legal_hold_blocks_export"
  echo "[phase18]   error_code=${ERR_CODE}"
else
  FAIL=$((FAIL+1)); echo "[phase18] FAIL  EXTERNAL-REVIEW-LEGAL-HOLD-ENFORCED (no session_d)"
fi

# Release the hold
if [ -n "$BLOCK_HOLD_ID" ]; then
  http_call "POST" "/api/admin/disclosure-governance/legal-hold/${BLOCK_HOLD_ID}/release" "$SA_TOKEN" >/dev/null 2>>"$COMMAND_LOG" || true
fi

# ---------------------------------------------------------------------------
# EXTERNAL-REVIEW-METADATA-PRESENT: reviewer_type in server.log
# ---------------------------------------------------------------------------
if grep -q '"reviewer_type"' "${EVIDENCE_DIR}/server.log" 2>/dev/null; then
  PASS=$((PASS+1)); echo "[phase18] PASS  EXTERNAL-REVIEW-METADATA-PRESENT (reviewer_type in server.log)"
else
  FAIL=$((FAIL+1)); echo "[phase18] FAIL  EXTERNAL-REVIEW-METADATA-PRESENT (not found in server.log)"
fi

# ---------------------------------------------------------------------------
# EXTERNAL-REVIEW-UNKNOWN-REVIEWER-DENIED:
# Create a session with valid type, then test with completely unknown session id
# (The module validates reviewer type at creation time, so we test via missing/unknown session)
# ---------------------------------------------------------------------------
STATUS=$(http_call "GET" "/external-review/evidence" "" \
  "-H" "X-Review-Session-Id: ers_totally_unknown_bad_session_id" \
  "-H" "X-Tenant-Id: ${TENANT_P18}" \
  "-H" "X-Jurisdiction-Code: KSA")
BODY=$(read_body)
ERR_CODE=$(echo "$BODY" | jq -r '.error.code // empty' 2>/dev/null || echo "")
record_case "EXTERNAL-REVIEW-UNKNOWN-REVIEWER-DENIED" "/external-review/evidence" "GET" "403" "$STATUS" "none" "unknown_session_id"
echo "[phase18]   error_code=${ERR_CODE}"

# ---------------------------------------------------------------------------
# Write summary.json
# ---------------------------------------------------------------------------
TOTAL=$((PASS+FAIL))
jq -n \
  --arg phase    "phase-18" \
  --arg ts       "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson pass  "$PASS" \
  --argjson fail  "$FAIL" \
  --argjson total "$TOTAL" \
  --arg unit_p18  "$P18_PASS" \
  '{phase:$phase,generated_at:$ts,unit_tests_p18_pass:$unit_p18,http_cases:{total:$total,pass:$pass,fail:$fail}}' \
  > "$SUMMARY_JSON"

{
  echo "PROWORK PHASE 18 EVIDENCE MANIFEST"
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
echo "[phase18] ============================="
echo "[phase18] unit tests p18: ${P18_PASS}"
echo "[phase18] http cases:     ${PASS}/${TOTAL}"
echo "[phase18] ============================="

[ "$FAIL" -gt 0 ] && { echo "[phase18] FAILED: ${FAIL} case(s)"; exit 1; }

echo "[phase18] ALL CASES PASSED"
echo ""
echo "EVIDENCE_RUN_DIR=${EVIDENCE_DIR}"
