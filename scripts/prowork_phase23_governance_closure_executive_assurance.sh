#!/usr/bin/env bash
# PROWORK — PHASE 23: Governance Closure + Executive Assurance Pack
# Evidence runner — port 13023
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

HOST="127.0.0.1"
PORT=13023
BASE="http://${HOST}:${PORT}"
export APP_PORT="$PORT"
export APP_HOST="$HOST"
export WOS_PUBLIC_WRITE="false"

SA_TOKEN="sk-phase23-superadmin-A"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_DIR="${REPO_ROOT}/evidence/phase23_${TIMESTAMP}"
mkdir -p "${EVIDENCE_DIR}"

CLOSURE_EXPORT="${EVIDENCE_DIR}/governance_closure_export.json"
ASSURANCE_EXPORT="${EVIDENCE_DIR}/executive_assurance_export.json"
DECISION_LOG="${EVIDENCE_DIR}/decision_log.txt"
COMMAND_LOG="${EVIDENCE_DIR}/command_log.txt"
SUMMARY_JSON="${EVIDENCE_DIR}/summary.json"
MANIFEST="${EVIDENCE_DIR}/manifest.txt"
UNIT_OUT="${EVIDENCE_DIR}/unit_p23.txt"

PRINCIPALS_FILE="${REPO_ROOT}/app/data/admin_principals.json"

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
SERVER_PID=""
cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  [ -f "${PRINCIPALS_FILE}.phase23_bak" ] && mv "${PRINCIPALS_FILE}.phase23_bak" "$PRINCIPALS_FILE" || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Principals
# ---------------------------------------------------------------------------
cp "$PRINCIPALS_FILE" "${PRINCIPALS_FILE}.phase23_bak"
cat > "$PRINCIPALS_FILE" <<PRINCIPALS_EOF
{
  "roles": {
    "superadmin": { "description": "Sovereign" },
    "ops":        { "description": "Ops executor" },
    "auditor":    { "description": "Read-only auditor" }
  },
  "principals": [
    { "id": "adm_p23_sa", "name": "phase23-sa", "role": "superadmin", "status": "active",
      "token": "${SA_TOKEN}", "tenant_id": "*",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)", "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)" }
  ]
}
PRINCIPALS_EOF

export ADMIN_API_TOKEN="$SA_TOKEN"

# ---------------------------------------------------------------------------
# Start server
# ---------------------------------------------------------------------------
echo "[phase23] starting server on ${HOST}:${PORT}..."
node app/server.js >> "${EVIDENCE_DIR}/server.log" 2>&1 &
SERVER_PID=$!
for i in $(seq 1 30); do
  if curl -sf "${BASE}/healthz" > /dev/null 2>&1; then break; fi
  sleep 0.3
done
echo "[phase23] server up (pid ${SERVER_PID})"

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

extract_field() {
  local file="$1" field="$2"
  node -e "const fs=require('fs');const raw=JSON.parse(fs.readFileSync(process.env.PROWORK_FILE,'utf8'));const d=raw.data||raw;console.log(d['${field}']||'')" 2>/dev/null || echo ""
}

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
echo "[phase23] running unit tests..."
node --test tests/production/phase23_governance_closure.test.js > "${UNIT_OUT}" 2>&1 || {
  echo "[FAIL] unit tests failed"
  cat "${UNIT_OUT}"
  exit 1
}
echo "[phase23] unit tests passed"

# ---------------------------------------------------------------------------
# Evidence cases
# ---------------------------------------------------------------------------

# 1. CLOSURE-CONTEXT-LOADED — GET /api/admin/governance-closure → 200
STATUS=$(http_call "GET" "/api/admin/governance-closure" "$SA_TOKEN")
record_case "CLOSURE-CONTEXT-LOADED" "/api/admin/governance-closure" "GET" "200" "$STATUS" "superadmin"

# 2. ASSURANCE-CONTEXT-LOADED — GET /api/admin/executive-assurance-pack → 200
STATUS=$(http_call "GET" "/api/admin/executive-assurance-pack" "$SA_TOKEN")
record_case "ASSURANCE-CONTEXT-LOADED" "/api/admin/executive-assurance-pack" "GET" "200" "$STATUS" "superadmin"

# 3. CLOSURE-DENY-UNKNOWN-STATUS — record with unknown status → 422
STATUS=$(http_call "POST" "/api/admin/governance-closure/record" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"closure_status":"invalid_status","scope":"global"}')
record_case "CLOSURE-DENY-UNKNOWN-STATUS" "/api/admin/governance-closure/record" "POST" "422" "$STATUS" "superadmin"

# 4. CLOSURE-DENY-MISSING-CRITICAL-EVIDENCE — ready without evidence → 422
STATUS=$(http_call "POST" "/api/admin/governance-closure/record" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"closure_status":"ready","scope":"global","critical_evidence_refs":[]}')
record_case "CLOSURE-DENY-MISSING-CRITICAL-EVIDENCE" "/api/admin/governance-closure/record" "POST" "422" "$STATUS" "superadmin"

# 5. CLOSURE-BLOCKED-RECORDED — create blocked closure → 201
STATUS=$(http_call "POST" "/api/admin/governance-closure/record" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"closure_status":"blocked","scope":"global"}')
BODY=$(read_body)
record_case "CLOSURE-BLOCKED-RECORDED" "/api/admin/governance-closure/record" "POST" "201" "$STATUS" "superadmin"

# 6. CLOSURE-READY-RECORDED — create ready closure with evidence → 201
STATUS=$(http_call "POST" "/api/admin/governance-closure/record" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"closure_status":"ready","scope":"global","critical_evidence_refs":["ev-governance-001","ev-attestation-002"],"tenant_id":"t_p23","jurisdiction_code":"KSA"}')
BODY=$(read_body)
record_case "CLOSURE-READY-RECORDED" "/api/admin/governance-closure/record" "POST" "201" "$STATUS" "superadmin"
CLOSURE_ID=$(echo "$BODY" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const p=JSON.parse(d);console.log((p.data&&p.data.closure_id)||p.closure_id||'')}catch(e){console.log('')}})")
echo "[phase23] closure_id: ${CLOSURE_ID}"

# 7. CLOSURE-GENERATE-TENANT — GET tenant-scoped closures → 200
STATUS=$(http_call "GET" "/api/admin/governance-closure/tenant?tenant_id=t_p23" "$SA_TOKEN")
record_case "CLOSURE-GENERATE-TENANT" "/api/admin/governance-closure/tenant" "GET" "200" "$STATUS" "superadmin"

# 8. CLOSURE-GENERATE-JURISDICTION — GET jurisdiction-scoped closures → 200
STATUS=$(http_call "GET" "/api/admin/governance-closure/jurisdiction?jurisdiction_code=KSA" "$SA_TOKEN")
record_case "CLOSURE-GENERATE-JURISDICTION" "/api/admin/governance-closure/jurisdiction" "GET" "200" "$STATUS" "superadmin"

# 9. ASSURANCE-DENY-MISSING-CLOSURE — create pack without closure_id → 422
STATUS=$(http_call "POST" "/api/admin/executive-assurance-pack/record" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"assurance_status":"draft"}')
record_case "ASSURANCE-DENY-MISSING-CLOSURE" "/api/admin/executive-assurance-pack/record" "POST" "422" "$STATUS" "superadmin"

# 10. ASSURANCE-DENY-UNKNOWN-STATUS — create pack with unknown status → 422
if [ -n "$CLOSURE_ID" ]; then
  STATUS=$(http_call "POST" "/api/admin/executive-assurance-pack/record" "$SA_TOKEN" \
    "-H" "Content-Type: application/json" \
    "-d" "{\"closure_id\":\"${CLOSURE_ID}\",\"assurance_status\":\"invalid_val\"}")
  record_case "ASSURANCE-DENY-UNKNOWN-STATUS" "/api/admin/executive-assurance-pack/record" "POST" "422" "$STATUS" "superadmin"
else
  echo "[FAIL] ASSURANCE-DENY-UNKNOWN-STATUS — no closure_id"
  FAIL=$((FAIL+1)); RESULTS+=("ASSURANCE-DENY-UNKNOWN-STATUS:FAIL")
fi

# 11. ASSURANCE-VALIDATED-RECORDED — create validated pack → 201
if [ -n "$CLOSURE_ID" ]; then
  STATUS=$(http_call "POST" "/api/admin/executive-assurance-pack/record" "$SA_TOKEN" \
    "-H" "Content-Type: application/json" \
    "-d" "{\"closure_id\":\"${CLOSURE_ID}\",\"assurance_status\":\"validated\",\"summary_ref\":\"summary-ref-001\"}")
  BODY=$(read_body)
  record_case "ASSURANCE-VALIDATED-RECORDED" "/api/admin/executive-assurance-pack/record" "POST" "201" "$STATUS" "superadmin"
else
  echo "[FAIL] ASSURANCE-VALIDATED-RECORDED — no closure_id"
  FAIL=$((FAIL+1)); RESULTS+=("ASSURANCE-VALIDATED-RECORDED:FAIL")
fi

# 12. ASSURANCE-ISSUED-RECORDED — create issued pack → 201
if [ -n "$CLOSURE_ID" ]; then
  STATUS=$(http_call "POST" "/api/admin/executive-assurance-pack/record" "$SA_TOKEN" \
    "-H" "Content-Type: application/json" \
    "-d" "{\"closure_id\":\"${CLOSURE_ID}\",\"assurance_status\":\"issued\",\"summary_ref\":\"summary-final-001\"}")
  BODY=$(read_body)
  record_case "ASSURANCE-ISSUED-RECORDED" "/api/admin/executive-assurance-pack/record" "POST" "201" "$STATUS" "superadmin"
else
  echo "[FAIL] ASSURANCE-ISSUED-RECORDED — no closure_id"
  FAIL=$((FAIL+1)); RESULTS+=("ASSURANCE-ISSUED-RECORDED:FAIL")
fi

# 13. ASSURANCE-SUMMARY-GENERATED — GET executive summary → 200
STATUS=$(http_call "GET" "/api/admin/executive-assurance-pack/summary" "$SA_TOKEN")
record_case "ASSURANCE-SUMMARY-GENERATED" "/api/admin/executive-assurance-pack/summary" "GET" "200" "$STATUS" "superadmin"

# 14. CLOSURE-EXPORT-GENERATED
STATUS=$(http_call "GET" "/api/admin/governance-closure/export" "$SA_TOKEN")
BODY=$(read_body)
record_case "CLOSURE-EXPORT-GENERATED" "/api/admin/governance-closure/export" "GET" "200" "$STATUS" "superadmin"
if [ "$STATUS" = "200" ]; then
  echo "$BODY" > "${CLOSURE_EXPORT}"
  echo "[phase23] closure export artifact written"
fi

# 15. ASSURANCE-EXPORT-GENERATED
STATUS=$(http_call "GET" "/api/admin/executive-assurance-pack/export" "$SA_TOKEN")
BODY=$(read_body)
record_case "ASSURANCE-EXPORT-GENERATED" "/api/admin/executive-assurance-pack/export" "GET" "200" "$STATUS" "superadmin"
if [ "$STATUS" = "200" ]; then
  echo "$BODY" > "${ASSURANCE_EXPORT}"
  echo "[phase23] assurance export artifact written"
fi

# 16. CLOSURE-ASSURANCE-METADATA-PRESENT — verify metadata in exports
if [ -f "${CLOSURE_EXPORT}" ] && [ -f "${ASSURANCE_EXPORT}" ]; then
  export PROWORK_CLS_FILE="${CLOSURE_EXPORT}"
  export PROWORK_ACP_FILE="${ASSURANCE_EXPORT}"
  HAS_CLOSURE_META=$(node -e "const fs=require('fs');const raw=JSON.parse(fs.readFileSync(process.env.PROWORK_CLS_FILE,'utf8'));const d=raw.data||raw;const a=d.closures||[];console.log(a.some(x=>x.closure_id&&x.closure_status)?'yes':'no')")
  HAS_ASSURANCE_META=$(node -e "const fs=require('fs');const raw=JSON.parse(fs.readFileSync(process.env.PROWORK_ACP_FILE,'utf8'));const d=raw.data||raw;const a=d.assurance_packs||[];console.log(a.some(x=>x.assurance_pack_id&&x.assurance_status)?'yes':'no')")
  if [ "$HAS_CLOSURE_META" = "yes" ] && [ "$HAS_ASSURANCE_META" = "yes" ]; then
    echo '{"metadata_present":true,"closure_id_found":true,"assurance_status_found":true}' > "${BODY_TMP}"
    STATUS="200"
  else
    echo "{\"metadata_present\":false,\"closure_id_found\":\"${HAS_CLOSURE_META}\",\"assurance_status_found\":\"${HAS_ASSURANCE_META}\"}" > "${BODY_TMP}"
    STATUS="422"
  fi
  record_case "CLOSURE-ASSURANCE-METADATA-PRESENT" "closure+assurance exports" "CHECK" "200" "$STATUS" "superadmin"
else
  echo "[FAIL] CLOSURE-ASSURANCE-METADATA-PRESENT — export file(s) missing"
  FAIL=$((FAIL+1)); RESULTS+=("CLOSURE-ASSURANCE-METADATA-PRESENT:FAIL")
fi

# ---------------------------------------------------------------------------
# Summary JSON
# ---------------------------------------------------------------------------
{
  printf '{\n'
  printf '  "phase": 23,\n'
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
echo "=== Phase 23 Evidence Summary ==="
echo "PASS: ${PASS}  FAIL: ${FAIL}"
echo "Evidence: ${EVIDENCE_DIR}"

if [ "${FAIL}" -gt 0 ]; then
  echo "[phase23] FAILED — ${FAIL} case(s) failed"
  exit 1
fi

echo "[phase23] ALL CASES PASSED"
echo ""
echo "EVIDENCE_RUN_DIR=${EVIDENCE_DIR}"
