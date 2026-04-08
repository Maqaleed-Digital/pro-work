#!/usr/bin/env bash
# PROWORK — PHASE 22: Continuous Control Attestation + Compliance Reporting
# Evidence runner — port 13022
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

HOST="127.0.0.1"
PORT=13022
BASE="http://${HOST}:${PORT}"
export APP_PORT="$PORT"
export APP_HOST="$HOST"
export WOS_PUBLIC_WRITE="false"

SA_TOKEN="sk-phase22-superadmin-A"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_DIR="${REPO_ROOT}/evidence/phase22_${TIMESTAMP}"
mkdir -p "${EVIDENCE_DIR}"

ATTESTATION_EXPORT="${EVIDENCE_DIR}/control_attestation_export.json"
REPORT_EXPORT="${EVIDENCE_DIR}/compliance_report_export.json"
DECISION_LOG="${EVIDENCE_DIR}/decision_log.txt"
COMMAND_LOG="${EVIDENCE_DIR}/command_log.txt"
SUMMARY_JSON="${EVIDENCE_DIR}/summary.json"
MANIFEST="${EVIDENCE_DIR}/manifest.txt"
UNIT_OUT="${EVIDENCE_DIR}/unit_p22.txt"

PRINCIPALS_FILE="${REPO_ROOT}/app/data/admin_principals.json"

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
SERVER_PID=""
cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  [ -f "${PRINCIPALS_FILE}.phase22_bak" ] && mv "${PRINCIPALS_FILE}.phase22_bak" "$PRINCIPALS_FILE" || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Principals
# ---------------------------------------------------------------------------
cp "$PRINCIPALS_FILE" "${PRINCIPALS_FILE}.phase22_bak"
cat > "$PRINCIPALS_FILE" <<PRINCIPALS_EOF
{
  "roles": {
    "superadmin": { "description": "Sovereign" },
    "ops":        { "description": "Ops executor" },
    "auditor":    { "description": "Read-only auditor" }
  },
  "principals": [
    { "id": "adm_p22_sa", "name": "phase22-sa", "role": "superadmin", "status": "active",
      "token": "${SA_TOKEN}", "tenant_id": "*",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)", "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)" }
  ]
}
PRINCIPALS_EOF

export ADMIN_API_TOKEN="$SA_TOKEN"

# ---------------------------------------------------------------------------
# Start server
# ---------------------------------------------------------------------------
echo "[phase22] starting server on ${HOST}:${PORT}..."
node app/server.js >> "${EVIDENCE_DIR}/server.log" 2>&1 &
SERVER_PID=$!
for i in $(seq 1 30); do
  if curl -sf "${BASE}/healthz" > /dev/null 2>&1; then break; fi
  sleep 0.3
done
echo "[phase22] server up (pid ${SERVER_PID})"

# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------
BODY_TMP="$(mktemp)"
http_call() {
  local method="$1" path="$2" token="$3"
  shift 3
  local extra_args=()
  while [ $# -gt 0 ]; do extra_args+=("$1"); shift; done
  echo ">>> ${method} ${path}" >> "${COMMAND_LOG}"
  local status
  status=$(curl -s -o "${BODY_TMP}" -w "%{http_code}" \
    -X "${method}" "${BASE}${path}" \
    -H "Authorization: Bearer ${token}" \
    ${extra_args[@]+"${extra_args[@]}"})
  echo "<<< ${status}" >> "${COMMAND_LOG}"
  cat "${BODY_TMP}" >> "${COMMAND_LOG}"
  echo "" >> "${COMMAND_LOG}"
  echo "$status"
}
read_body() { cat "${BODY_TMP}"; }

# ---------------------------------------------------------------------------
# Case tracking
# ---------------------------------------------------------------------------
PASS=0
FAIL=0
declare -a RESULTS=()

record_case() {
  local label="$1" route="$2" method="$3" expected="$4" actual="$5" actor="$6"
  local body
  body=$(read_body)
  local pass_fail="PASS"
  if [ "$actual" != "$expected" ]; then pass_fail="FAIL"; fi

  {
    echo "--- ${label} ---"
    echo "route:    ${route}"
    echo "method:   ${method}"
    echo "actor:    ${actor}"
    echo "expected: ${expected}"
    echo "actual:   ${actual}"
    echo "body:     ${body}"
    echo ""
  } >> "${DECISION_LOG}"

  echo "${body}" > "${EVIDENCE_DIR}/${label}.json"

  if [ "$pass_fail" = "PASS" ]; then
    PASS=$((PASS+1))
    echo "[PASS] ${label} (${actual})"
  else
    FAIL=$((FAIL+1))
    echo "[FAIL] ${label} (expected ${expected}, got ${actual})"
    echo "       body: ${body}"
  fi
  RESULTS+=("${label}:${pass_fail}")
}

# ---------------------------------------------------------------------------
# Unit tests
# ---------------------------------------------------------------------------
echo "[phase22] running unit tests..."
node --test tests/production/phase22_control_attestation.test.js > "${UNIT_OUT}" 2>&1 || {
  echo "[FAIL] unit tests failed"
  cat "${UNIT_OUT}"
  exit 1
}
echo "[phase22] unit tests passed"

# ---------------------------------------------------------------------------
# Evidence cases
# ---------------------------------------------------------------------------

# 1. ATTESTATION-CONTEXT-LOADED — GET /api/admin/control-attestation → 200
STATUS=$(http_call "GET" "/api/admin/control-attestation" "$SA_TOKEN")
BODY=$(read_body)
record_case "ATTESTATION-CONTEXT-LOADED" "/api/admin/control-attestation" "GET" "200" "$STATUS" "superadmin"

# 2. REPORT-CONTEXT-LOADED — GET /api/admin/compliance-report → 200
STATUS=$(http_call "GET" "/api/admin/compliance-report" "$SA_TOKEN")
BODY=$(read_body)
record_case "REPORT-CONTEXT-LOADED" "/api/admin/compliance-report" "GET" "200" "$STATUS" "superadmin"

# 3. ATTESTATION-DENY-MISSING-CONTROL-STATUS — record without status → 422
STATUS=$(http_call "POST" "/api/admin/control-attestation/record" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"control_id":"rbac_control","control_family":"rbac_control"}')
BODY=$(read_body)
record_case "ATTESTATION-DENY-MISSING-CONTROL-STATUS" "/api/admin/control-attestation/record" "POST" "422" "$STATUS" "superadmin"

# 4. ATTESTATION-DENY-UNKNOWN-STATUS — record with unknown status → 422
STATUS=$(http_call "POST" "/api/admin/control-attestation/record" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"control_id":"rbac_control","control_family":"rbac_control","status":"invalid_status"}')
BODY=$(read_body)
record_case "ATTESTATION-DENY-UNKNOWN-STATUS" "/api/admin/control-attestation/record" "POST" "422" "$STATUS" "superadmin"

# 5. REPORT-DENY-UNKNOWN-REPORT-TYPE — generate with unknown type → 422
STATUS=$(http_call "POST" "/api/admin/compliance-report/generate" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"report_type":"invalid.report.type"}')
BODY=$(read_body)
record_case "REPORT-DENY-UNKNOWN-REPORT-TYPE" "/api/admin/compliance-report/generate" "POST" "422" "$STATUS" "superadmin"

# 6. REPORT-DENY-MISSING-CRITICAL-ATTESTATION — generate before critical families attested → 422
# Fresh server has no attestations; critical families are not attested
STATUS=$(http_call "POST" "/api/admin/compliance-report/generate" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"report_type":"governance.control_report","report_scope":"global"}')
BODY=$(read_body)
record_case "REPORT-DENY-MISSING-CRITICAL-ATTESTATION" "/api/admin/compliance-report/generate" "POST" "422" "$STATUS" "superadmin"

# --- Now seed critical control attestations ---

# 7. ATTESTATION-PASS-RECORDED — record rbac_control with status=pass → 201
STATUS=$(http_call "POST" "/api/admin/control-attestation/record" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"control_id":"rbac_control","control_family":"rbac_control","status":"pass","evidence_ref":"ev-rbac-001"}')
BODY=$(read_body)
record_case "ATTESTATION-PASS-RECORDED" "/api/admin/control-attestation/record" "POST" "201" "$STATUS" "superadmin"

# Seed permission_control (critical)
http_call "POST" "/api/admin/control-attestation/record" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"control_id":"permission_control","control_family":"permission_control","status":"pass","evidence_ref":"ev-perm-001"}' > /dev/null

# Seed additional families for richer report coverage
for family in audit_evidence_control approval_control sovereign_policy_control tenant_jurisdiction_control \
              residency_retention_control disclosure_legal_hold_control external_review_control \
              incident_containment_control continuity_dr_control restoration_assurance_control; do
  http_call "POST" "/api/admin/control-attestation/record" "$SA_TOKEN" \
    "-H" "Content-Type: application/json" \
    "-d" "{\"control_id\":\"${family}\",\"control_family\":\"${family}\",\"status\":\"pass\",\"evidence_ref\":\"ev-${family}-001\"}" > /dev/null
done

# 8. ATTESTATION-DEGRADED-RECORDED — record a degraded attestation → 201
STATUS=$(http_call "POST" "/api/admin/control-attestation/record" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"control_id":"degraded_control_test","control_family":"audit_evidence_control","status":"degraded","evidence_ref":"ev-degraded-001"}')
BODY=$(read_body)
record_case "ATTESTATION-DEGRADED-RECORDED" "/api/admin/control-attestation/record" "POST" "201" "$STATUS" "superadmin"

# 9. REPORT-GENERATE-GOVERNANCE-CONTROL
STATUS=$(http_call "POST" "/api/admin/compliance-report/generate" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"report_type":"governance.control_report","report_scope":"global"}')
BODY=$(read_body)
record_case "REPORT-GENERATE-GOVERNANCE-CONTROL" "/api/admin/compliance-report/generate" "POST" "201" "$STATUS" "superadmin"

# 10. REPORT-GENERATE-TENANT-COMPLIANCE
STATUS=$(http_call "POST" "/api/admin/compliance-report/generate" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"report_type":"tenant.compliance_report","report_scope":"global","tenant_id":"t_phase22"}')
BODY=$(read_body)
record_case "REPORT-GENERATE-TENANT-COMPLIANCE" "/api/admin/compliance-report/generate" "POST" "201" "$STATUS" "superadmin"

# 11. REPORT-GENERATE-JURISDICTION-COMPLIANCE
STATUS=$(http_call "POST" "/api/admin/compliance-report/generate" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"report_type":"jurisdiction.compliance_report","report_scope":"global","jurisdiction_code":"KSA"}')
BODY=$(read_body)
record_case "REPORT-GENERATE-JURISDICTION-COMPLIANCE" "/api/admin/compliance-report/generate" "POST" "201" "$STATUS" "superadmin"

# 12. REPORT-GENERATE-INCIDENT-ASSURANCE
STATUS=$(http_call "POST" "/api/admin/compliance-report/generate" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"report_type":"incident.assurance_report","report_scope":"global"}')
BODY=$(read_body)
record_case "REPORT-GENERATE-INCIDENT-ASSURANCE" "/api/admin/compliance-report/generate" "POST" "201" "$STATUS" "superadmin"

# 13. ATTESTATION-EXPORT-GENERATED
STATUS=$(http_call "GET" "/api/admin/control-attestation/export" "$SA_TOKEN")
BODY=$(read_body)
record_case "ATTESTATION-EXPORT-GENERATED" "/api/admin/control-attestation/export" "GET" "200" "$STATUS" "superadmin"
if [ "$STATUS" = "200" ]; then
  echo "$BODY" > "${ATTESTATION_EXPORT}"
  echo "[phase22] attestation export artifact written"
fi

# 14. REPORT-EXPORT-GENERATED
STATUS=$(http_call "GET" "/api/admin/compliance-report/export" "$SA_TOKEN")
BODY=$(read_body)
record_case "REPORT-EXPORT-GENERATED" "/api/admin/compliance-report/export" "GET" "200" "$STATUS" "superadmin"
if [ "$STATUS" = "200" ]; then
  echo "$BODY" > "${REPORT_EXPORT}"
  echo "[phase22] report export artifact written"
fi

# 15. ATTESTATION-REPORT-METADATA-PRESENT — verify metadata fields in attestation export
if [ -f "${ATTESTATION_EXPORT}" ] && [ -f "${REPORT_EXPORT}" ]; then
  export PROWORK_ATT_FILE="${ATTESTATION_EXPORT}"
  export PROWORK_RPT_FILE="${REPORT_EXPORT}"
  HAS_CONTROL_ID=$(node -e "const fs=require('fs');const raw=JSON.parse(fs.readFileSync(process.env.PROWORK_ATT_FILE,'utf8'));const d=raw.data||raw;const a=d.attestations||[];console.log(a.some(x=>x.control_id&&x.attestation_status)?'yes':'no')")
  HAS_REPORT_TYPE=$(node -e "const fs=require('fs');const raw=JSON.parse(fs.readFileSync(process.env.PROWORK_RPT_FILE,'utf8'));const d=raw.data||raw;const r=d.reports||[];console.log(r.some(x=>x.report_type&&x.report_status)?'yes':'no')")
  if [ "$HAS_CONTROL_ID" = "yes" ] && [ "$HAS_REPORT_TYPE" = "yes" ]; then
    echo '{"metadata_present":true,"control_id_found":true,"report_type_found":true}' > "${BODY_TMP}"
    STATUS="200"
  else
    echo "{\"metadata_present\":false,\"control_id_found\":\"${HAS_CONTROL_ID}\",\"report_type_found\":\"${HAS_REPORT_TYPE}\"}" > "${BODY_TMP}"
    STATUS="422"
  fi
  record_case "ATTESTATION-REPORT-METADATA-PRESENT" "attestation+report exports" "CHECK" "200" "$STATUS" "superadmin"
else
  echo "[FAIL] ATTESTATION-REPORT-METADATA-PRESENT — export file(s) missing"
  FAIL=$((FAIL+1)); RESULTS+=("ATTESTATION-REPORT-METADATA-PRESENT:FAIL")
fi

# ---------------------------------------------------------------------------
# Summary JSON
# ---------------------------------------------------------------------------
{
  printf '{\n'
  printf '  "phase": 22,\n'
  printf '  "timestamp": "%s",\n' "${TIMESTAMP}"
  printf '  "pass": %d,\n' "${PASS}"
  printf '  "fail": %d,\n' "${FAIL}"
  printf '  "cases": [\n'
  local_first=true
  for r in "${RESULTS[@]+"${RESULTS[@]}"}"; do
    lbl="${r%%:*}"
    pf="${r##*:}"
    if [ "$local_first" = "true" ]; then local_first=false; else printf '    ,\n'; fi
    printf '    { "label": "%s", "result": "%s" }\n' "${lbl}" "${pf}"
  done
  printf '  ]\n'
  printf '}\n'
} > "${SUMMARY_JSON}"

# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------
find "${EVIDENCE_DIR}" -type f | sort > "${MANIFEST}"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo "=== Phase 22 Evidence Summary ==="
echo "PASS: ${PASS}  FAIL: ${FAIL}"
echo "Evidence: ${EVIDENCE_DIR}"

if [ "${FAIL}" -gt 0 ]; then
  echo "[phase22] FAILED — ${FAIL} case(s) failed"
  exit 1
fi

echo "[phase22] ALL CASES PASSED"
echo ""
echo "EVIDENCE_RUN_DIR=${EVIDENCE_DIR}"
