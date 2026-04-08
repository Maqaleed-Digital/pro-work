#!/usr/bin/env bash
# PROWORK — PHASE 21: Controlled Service Restoration + Post-Incident Assurance
# Evidence runner — port 13021
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

HOST="127.0.0.1"
PORT=13021
BASE="http://${HOST}:${PORT}"
export APP_PORT="$PORT"
export APP_HOST="$HOST"
export WOS_PUBLIC_WRITE="false"

SA_TOKEN="sk-phase21-superadmin-A"
OPS_TOKEN="sk-phase21-ops-001"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_DIR="${REPO_ROOT}/evidence/phase21_${TIMESTAMP}"
mkdir -p "${EVIDENCE_DIR}"

RESTORATION_EXPORT="${EVIDENCE_DIR}/restoration_export.json"
DECISION_LOG="${EVIDENCE_DIR}/decision_log.txt"
COMMAND_LOG="${EVIDENCE_DIR}/command_log.txt"
SUMMARY_JSON="${EVIDENCE_DIR}/summary.json"
MANIFEST="${EVIDENCE_DIR}/manifest.txt"
UNIT_OUT="${EVIDENCE_DIR}/unit_p21.txt"

PRINCIPALS_FILE="${REPO_ROOT}/app/data/admin_principals.json"

# ---------------------------------------------------------------------------
# Cleanup helpers
# ---------------------------------------------------------------------------
SERVER_PID=""
cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  [ -f "${PRINCIPALS_FILE}.phase21_bak" ] && mv "${PRINCIPALS_FILE}.phase21_bak" "$PRINCIPALS_FILE" || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Principals
# ---------------------------------------------------------------------------
cp "$PRINCIPALS_FILE" "${PRINCIPALS_FILE}.phase21_bak"
cat > "$PRINCIPALS_FILE" <<PRINCIPALS_EOF
{
  "roles": {
    "superadmin": { "description": "Sovereign" },
    "ops":        { "description": "Ops executor" },
    "auditor":    { "description": "Read-only auditor" }
  },
  "principals": [
    { "id": "adm_p21_sa",  "name": "phase21-sa",  "role": "superadmin", "status": "active",
      "token": "${SA_TOKEN}",  "tenant_id": "*",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)", "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)" },
    { "id": "adm_p21_ops", "name": "phase21-ops", "role": "ops",        "status": "active",
      "token": "${OPS_TOKEN}", "tenant_id": "*",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)", "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)" }
  ]
}
PRINCIPALS_EOF

export ADMIN_API_TOKEN="$SA_TOKEN"

# ---------------------------------------------------------------------------
# Start server
# ---------------------------------------------------------------------------
echo "[phase21] starting server on ${HOST}:${PORT}..."
node app/server.js >> "${EVIDENCE_DIR}/server.log" 2>&1 &
SERVER_PID=$!
for i in $(seq 1 30); do
  if curl -sf "${BASE}/healthz" > /dev/null 2>&1; then break; fi
  sleep 0.3
done
echo "[phase21] server up (pid ${SERVER_PID})"

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
echo "[phase21] running unit tests..."
node --test tests/production/phase21_restoration_registry.test.js > "${UNIT_OUT}" 2>&1 || {
  echo "[FAIL] unit tests failed"
  cat "${UNIT_OUT}"
  exit 1
}
echo "[phase21] unit tests passed"

# ---------------------------------------------------------------------------
# Evidence cases
# ---------------------------------------------------------------------------

# 1. RESTORATION-DENIED-NO-APPROVAL — initiate without approved_by → 422
STATUS=$(http_call "POST" "/api/admin/restorations" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"scope":"auth-service"}')
BODY=$(read_body)
record_case "RESTORATION-DENIED-NO-APPROVAL" "/api/admin/restorations" "POST" "422" "$STATUS" "superadmin"

# 2. RESTORATION-INITIATED — initiate with approved_by → 201
STATUS=$(http_call "POST" "/api/admin/restorations" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"scope":"auth-service","approved_by":"admin-sa"}')
BODY=$(read_body)
record_case "RESTORATION-INITIATED" "/api/admin/restorations" "POST" "201" "$STATUS" "superadmin"
RESTORATION_ID=$(echo "$BODY" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const p=JSON.parse(d);console.log((p.data&&p.data.restoration_id)||p.restoration_id||'')}catch(e){console.log('')}})")
echo "[phase21] restoration_id: ${RESTORATION_ID}"

# 3. RESTORATION-DENIED-NO-CONTEXT — governed exec without X-Restoration-Id → 403
STATUS=$(http_call "POST" "/api/ops/governed-restoration-exec" "$OPS_TOKEN")
BODY=$(read_body)
record_case "RESTORATION-DENIED-NO-CONTEXT" "/api/ops/governed-restoration-exec" "POST" "403" "$STATUS" "ops"

# 4. RESTORATION-PHASE-APPLIED — apply phase → 200 (pending → in_progress)
if [ -n "$RESTORATION_ID" ]; then
  STATUS=$(http_call "POST" "/api/admin/restorations/${RESTORATION_ID}/phase" "$SA_TOKEN")
  BODY=$(read_body)
  record_case "RESTORATION-PHASE-APPLIED" "/api/admin/restorations/:id/phase" "POST" "200" "$STATUS" "superadmin"
else
  echo "[FAIL] RESTORATION-PHASE-APPLIED — no restoration_id"
  FAIL=$((FAIL+1)); RESULTS+=("RESTORATION-PHASE-APPLIED:FAIL")
fi

# 5. ASSURANCE-STARTED — start assurance → 200
if [ -n "$RESTORATION_ID" ]; then
  STATUS=$(http_call "POST" "/api/admin/restorations/${RESTORATION_ID}/assurance/start" "$SA_TOKEN")
  BODY=$(read_body)
  record_case "ASSURANCE-STARTED" "/api/admin/restorations/:id/assurance/start" "POST" "200" "$STATUS" "superadmin"
else
  echo "[FAIL] ASSURANCE-STARTED — no restoration_id"
  FAIL=$((FAIL+1)); RESULTS+=("ASSURANCE-STARTED:FAIL")
fi

# 6. ASSURANCE-FAILED — verify assurance with passed=false → 200 (reverts to pending)
if [ -n "$RESTORATION_ID" ]; then
  STATUS=$(http_call "POST" "/api/admin/restorations/${RESTORATION_ID}/assurance/verify" "$SA_TOKEN" \
    "-H" "Content-Type: application/json" \
    "-d" '{"passed":false,"evidence_ref":"fail-ref-001"}')
  BODY=$(read_body)
  record_case "ASSURANCE-FAILED" "/api/admin/restorations/:id/assurance/verify" "POST" "200" "$STATUS" "superadmin"

  # Re-apply phase (reverted to pending)
  http_call "POST" "/api/admin/restorations/${RESTORATION_ID}/phase" "$SA_TOKEN" > /dev/null || true
fi

# 7. ASSURANCE-PASSED — verify assurance with passed=true → 200 (validated)
if [ -n "$RESTORATION_ID" ]; then
  STATUS=$(http_call "POST" "/api/admin/restorations/${RESTORATION_ID}/assurance/verify" "$SA_TOKEN" \
    "-H" "Content-Type: application/json" \
    "-d" '{"passed":true,"evidence_ref":"evidence-ref-001"}')
  BODY=$(read_body)
  record_case "ASSURANCE-PASSED" "/api/admin/restorations/:id/assurance/verify" "POST" "200" "$STATUS" "superadmin"
else
  echo "[FAIL] ASSURANCE-PASSED — no restoration_id"
  FAIL=$((FAIL+1)); RESULTS+=("ASSURANCE-PASSED:FAIL")
fi

# 8. RESTORATION-COMPLETED — complete validated restoration → 200
if [ -n "$RESTORATION_ID" ]; then
  STATUS=$(http_call "POST" "/api/admin/restorations/${RESTORATION_ID}/complete" "$SA_TOKEN")
  BODY=$(read_body)
  record_case "RESTORATION-COMPLETED" "/api/admin/restorations/:id/complete" "POST" "200" "$STATUS" "superadmin"
else
  echo "[FAIL] RESTORATION-COMPLETED — no restoration_id"
  FAIL=$((FAIL+1)); RESULTS+=("RESTORATION-COMPLETED:FAIL")
fi

# ---------------------------------------------------------------------------
# Export restoration governance artifact
# ---------------------------------------------------------------------------
STATUS=$(http_call "GET" "/api/admin/restorations/export" "$SA_TOKEN")
BODY=$(read_body)
if [ "$STATUS" = "200" ]; then
  echo "$BODY" > "${RESTORATION_EXPORT}"
  echo "[phase21] restoration export artifact written"
else
  echo "[WARN] restoration export returned ${STATUS}"
fi

# ---------------------------------------------------------------------------
# Summary JSON
# ---------------------------------------------------------------------------
{
  echo "{"
  echo "  \"phase\": 21,"
  echo "  \"timestamp\": \"${TIMESTAMP}\","
  echo "  \"pass\": ${PASS},"
  echo "  \"fail\": ${FAIL},"
  echo "  \"cases\": ["
  local_first=true
  for r in "${RESULTS[@]+"${RESULTS[@]}"}"; do
    lbl="${r%%:*}"
    pf="${r##*:}"
    if [ "$local_first" = "true" ]; then local_first=false; else echo "    ,"; fi
    echo "    { \"label\": \"${lbl}\", \"result\": \"${pf}\" }"
  done
  echo "  ]"
  echo "}"
} > "${SUMMARY_JSON}"

# ---------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------
find "${EVIDENCE_DIR}" -type f | sort > "${MANIFEST}"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo "=== Phase 21 Evidence Summary ==="
echo "PASS: ${PASS}  FAIL: ${FAIL}"
echo "Evidence: ${EVIDENCE_DIR}"

if [ "${FAIL}" -gt 0 ]; then
  echo "[phase21] FAILED — ${FAIL} case(s) failed"
  exit 1
fi

echo "[phase21] ALL CASES PASSED"
echo ""
echo "EVIDENCE_RUN_DIR=${EVIDENCE_DIR}"
