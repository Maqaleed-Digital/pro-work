#!/usr/bin/env bash
# PROWORK PHASE 16 — Data Residency + Evidence Retention Governance Evidence Runner
# Evidence contract: FND/PROWORK_DATA_RESIDENCY_RETENTION_EVIDENCE_CONTRACT.md
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_BASE="${REPO_ROOT}/.prowork/evidence"
EVIDENCE_DIR="${EVIDENCE_BASE}/phase16_${TIMESTAMP}"
SUMMARY_JSON="${EVIDENCE_DIR}/summary.json"
DECISION_LOG="${EVIDENCE_DIR}/decision_log.txt"
COMMAND_LOG="${EVIDENCE_DIR}/command_log.txt"
MANIFEST="${EVIDENCE_DIR}/manifest.txt"
EG_EXPORT="${EVIDENCE_DIR}/evidence_governance_export.json"

PORT=13016
HOST=127.0.0.1
BASE="http://${HOST}:${PORT}"
SERVER_PID=""
PRINCIPALS_FILE="${REPO_ROOT}/app/data/admin_principals.json"
APR_FILE="${REPO_ROOT}/app/data/approval_requests.jsonl"
APD_FILE="${REPO_ROOT}/app/data/approval_decisions.jsonl"

SA_TOKEN="sk-phase16-superadmin-A"
SA2_TOKEN="sk-phase16-superadmin-B"
OPS_TOKEN="sk-phase16-ops-ksa"
AUD_TOKEN="sk-phase16-auditor-001"

TENANT_KSA="tenant_p16_ksa"

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
cd "$REPO_ROOT"
command -v node  >/dev/null 2>&1 || { echo "ERROR: node not found"; exit 1; }
command -v curl  >/dev/null 2>&1 || { echo "ERROR: curl not found"; exit 1; }
command -v jq    >/dev/null 2>&1 || { echo "ERROR: jq not found"; exit 1; }

[ -f "app/server.js" ]                                          || { echo "ERROR: app/server.js not found"; exit 1; }
[ -f "app/lib/evidence_governance.js" ]                         || { echo "ERROR: evidence_governance.js not found"; exit 1; }
[ -f "tests/production/phase16_evidence_governance.test.js" ]   || { echo "ERROR: phase16 test not found"; exit 1; }

mkdir -p "$EVIDENCE_DIR"

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true; SERVER_PID=""
  fi
  [ -f "${PRINCIPALS_FILE}.phase16_bak" ] && mv "${PRINCIPALS_FILE}.phase16_bak" "$PRINCIPALS_FILE"
  rm -f "$APR_FILE" "$APD_FILE" 2>/dev/null || true
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Unit tests — Phase 16 + regression
# ---------------------------------------------------------------------------
echo "[phase16] running unit tests..."
node --test tests/production/phase16_evidence_governance.test.js >"${EVIDENCE_DIR}/unit_p16.txt" 2>&1
P16_FAIL=$(grep "^# fail" "${EVIDENCE_DIR}/unit_p16.txt" | awk '{print $3}' || echo "1")
P16_PASS=$(grep "^# pass" "${EVIDENCE_DIR}/unit_p16.txt" | awk '{print $3}' || echo "0")
echo "[phase16] phase16 unit: pass=${P16_PASS} fail=${P16_FAIL}"
[ "${P16_FAIL}" = "0" ] || { echo "ERROR: phase16 unit tests failed"; exit 1; }

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

echo "[phase16] all unit suites pass"

# ---------------------------------------------------------------------------
# Prepare test environment
# ---------------------------------------------------------------------------
echo "[phase16] preparing test principals..."
cp "$PRINCIPALS_FILE" "${PRINCIPALS_FILE}.phase16_bak"

cat > "$PRINCIPALS_FILE" <<PRINCIPALS_EOF
{
  "roles": {
    "superadmin": { "description": "Sovereign" },
    "ops":        { "description": "Operational" },
    "auditor":    { "description": "Read-only" }
  },
  "principals": [
    { "id": "adm_p16_saA", "name": "phase16-sa-A", "role": "superadmin", "status": "active",
      "token": "${SA_TOKEN}", "tenant_id": "*",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)", "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)" },
    { "id": "adm_p16_saB", "name": "phase16-sa-B", "role": "superadmin", "status": "active",
      "token": "${SA2_TOKEN}", "tenant_id": "*",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)", "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)" },
    { "id": "adm_p16_ops", "name": "phase16-ops-ksa", "role": "ops", "status": "active",
      "token": "${OPS_TOKEN}", "tenant_id": "${TENANT_KSA}",
      "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)", "updated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)" },
    { "id": "adm_p16_aud", "name": "phase16-auditor", "role": "auditor", "status": "active",
      "token": "${AUD_TOKEN}", "tenant_id": "*",
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

echo "[phase16] starting server on ${HOST}:${PORT}..."
node app/server.js >"${EVIDENCE_DIR}/server.log" 2>&1 &
SERVER_PID=$!

for i in $(seq 1 30); do
  curl -sf "${BASE}/api/health" >/dev/null 2>&1 && break; sleep 0.3; done
curl -sf "${BASE}/api/health" >/dev/null 2>&1 || { echo "ERROR: server not ready"; exit 1; }
echo "[phase16] server ready"

# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------
PASS=0
FAIL=0
HDRS_FILE="/tmp/p16_hdrs_$$.txt"
BODY_FILE="/tmp/p16_body_$$.json"

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
    PASS=$((PASS+1)); echo "[phase16] PASS  ${label} (${method} ${route} → ${actual})"
  else
    FAIL=$((FAIL+1)); echo "[phase16] FAIL  ${label} (${method} ${route} → got ${actual}, want ${expected})"
  fi
}

# ---------------------------------------------------------------------------
# Create test tenant + set KSA jurisdiction
# ---------------------------------------------------------------------------
http_call "POST" "/api/admin/tenants" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" "{\"tenant_id\":\"${TENANT_KSA}\",\"name\":\"Phase16 KSA Tenant\"}" >/dev/null 2>>"$COMMAND_LOG" || true

# Set KSA jurisdiction for this tenant
http_call "POST" "/api/admin/tenant-governance/${TENANT_KSA}/set-jurisdiction" "$SA_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-d" '{"jurisdiction_code":"KSA"}' >/dev/null 2>>"$COMMAND_LOG" || true

# ---------------------------------------------------------------------------
# RESIDENCY-POLICY-BOUND-ENFORCED: list evidence governance (≥3 regions)
# ---------------------------------------------------------------------------
STATUS=$(http_call "GET" "/api/admin/evidence-governance" "$SA_TOKEN")
BODY=$(read_body)
if [ "$STATUS" = "200" ]; then
  RC=$(echo "$BODY" | jq '(.data.regions // .data.residency_regions // []) | length' 2>/dev/null || echo 0)
  if [ "$RC" -ge 3 ]; then
    PASS=$((PASS+1)); echo "[phase16] PASS  RESIDENCY-POLICY-BOUND-ENFORCED (region_count=${RC})"
  else
    FAIL=$((FAIL+1)); echo "[phase16] FAIL  RESIDENCY-POLICY-BOUND-ENFORCED (count=${RC})"
  fi
else
  FAIL=$((FAIL+1)); echo "[phase16] FAIL  RESIDENCY-POLICY-BOUND-ENFORCED (status=${STATUS})"
fi

# ---------------------------------------------------------------------------
# RESIDENCY-CONTEXT-LOADED: list residency regions
# ---------------------------------------------------------------------------
STATUS=$(http_call "GET" "/api/admin/evidence-governance/residency" "$SA_TOKEN")
BODY=$(read_body)
record_case "RESIDENCY-CONTEXT-LOADED" "/api/admin/evidence-governance/residency" "GET" "200" "$STATUS" "superadmin"
if [ "$STATUS" = "200" ]; then
  RCODES=$(echo "$BODY" | jq -r '[.data.residency_regions[].region] | join(",")' 2>/dev/null || echo "")
  echo "[phase16]   regions=${RCODES}"
fi

# ---------------------------------------------------------------------------
# RETENTION-CONTEXT-LOADED: list retention classes
# ---------------------------------------------------------------------------
STATUS=$(http_call "GET" "/api/admin/evidence-governance/retention" "$SA_TOKEN")
BODY=$(read_body)
record_case "RETENTION-CONTEXT-LOADED" "/api/admin/evidence-governance/retention" "GET" "200" "$STATUS" "superadmin"
if [ "$STATUS" = "200" ]; then
  RCLASSES=$(echo "$BODY" | jq -r '[.data.retention_classes[].retention_class] | join(",")' 2>/dev/null || echo "")
  echo "[phase16]   retention_classes=${RCLASSES}"
fi

# ---------------------------------------------------------------------------
# EVIDENCE-GOVERNANCE-EXPORT-GENERATED
# ---------------------------------------------------------------------------
STATUS=$(http_call "GET" "/api/admin/evidence-governance/export" "$SA_TOKEN")
BODY=$(read_body)
record_case "EVIDENCE-GOVERNANCE-EXPORT-GENERATED" "/api/admin/evidence-governance/export" "GET" "200" "$STATUS" "superadmin"
if [ "$STATUS" = "200" ]; then
  echo "$BODY" | jq '.data' > "$EG_EXPORT" 2>/dev/null || echo "$BODY" > "$EG_EXPORT"
  EXP_RC=$(echo "$BODY" | jq '.data.retention_class_count // 0' 2>/dev/null || echo 0)
  if [ "$EXP_RC" -ge 4 ]; then
    PASS=$((PASS+1)); echo "[phase16] PASS  EVIDENCE-GOVERNANCE-EXPORT-ARTIFACT (retention_class_count=${EXP_RC})"
  else
    FAIL=$((FAIL+1)); echo "[phase16] FAIL  EVIDENCE-GOVERNANCE-EXPORT-ARTIFACT (count=${EXP_RC})"
  fi
fi

# ---------------------------------------------------------------------------
# RETENTION-POLICY-BOUND-ENFORCED: disable a retention class
# ---------------------------------------------------------------------------
ENC_CLASS=$(python3 -c "import urllib.parse; print(urllib.parse.quote('audit.short_term'))" 2>/dev/null || echo "audit.short_term")
STATUS=$(http_call "POST" "/api/admin/evidence-governance/retention/${ENC_CLASS}/disable" "$SA_TOKEN")
record_case "RETENTION-POLICY-BOUND-ENFORCED" "/api/admin/evidence-governance/retention/${ENC_CLASS}/disable" "POST" "200" "$STATUS" "superadmin" "disable_audit.short_term"

# ---------------------------------------------------------------------------
# Helper: governed-evidence-write base call
# Requires tenant governance + jurisdiction to be set up first
# ---------------------------------------------------------------------------

# RESIDENCY-DENY-MISSING-REGION: no X-Residency-Region
STATUS=$(http_call "POST" "/api/ops/governed-evidence-write" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-H" "X-Tenant-Id: ${TENANT_KSA}" \
  "-H" "X-Jurisdiction-Code: KSA" \
  "-H" "X-Retention-Class: audit.long_term" \
  "-d" '{"note":"test"}')
record_case "RESIDENCY-DENY-MISSING-REGION" "/api/ops/governed-evidence-write" "POST" "403" "$STATUS" "ops" "no_residency_region"

# RESIDENCY-UNKNOWN-DENIED: unknown region
STATUS=$(http_call "POST" "/api/ops/governed-evidence-write" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-H" "X-Tenant-Id: ${TENANT_KSA}" \
  "-H" "X-Jurisdiction-Code: KSA" \
  "-H" "X-Residency-Region: ATLANTIS" \
  "-H" "X-Retention-Class: audit.long_term" \
  "-d" '{"note":"test"}')
record_case "RESIDENCY-UNKNOWN-DENIED" "/api/ops/governed-evidence-write" "POST" "403" "$STATUS" "ops" "unknown_region"

# RESIDENCY-DENY-INCOMPATIBLE-REGION: GCC region for KSA jurisdiction tenant
STATUS=$(http_call "POST" "/api/ops/governed-evidence-write" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-H" "X-Tenant-Id: ${TENANT_KSA}" \
  "-H" "X-Jurisdiction-Code: KSA" \
  "-H" "X-Residency-Region: GCC" \
  "-H" "X-Retention-Class: audit.long_term" \
  "-d" '{"note":"test"}')
BODY=$(read_body)
ERR_CODE=$(echo "$BODY" | jq -r '.error.code // empty' 2>/dev/null || echo "")
record_case "RESIDENCY-DENY-INCOMPATIBLE-REGION" "/api/ops/governed-evidence-write" "POST" "403" "$STATUS" "ops" "gcc_on_ksa"
echo "[phase16]   error_code=${ERR_CODE}"

# RETENTION-DENY-MISSING-CLASS: no X-Retention-Class
STATUS=$(http_call "POST" "/api/ops/governed-evidence-write" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-H" "X-Tenant-Id: ${TENANT_KSA}" \
  "-H" "X-Jurisdiction-Code: KSA" \
  "-H" "X-Residency-Region: KSA" \
  "-d" '{"note":"test"}')
record_case "RETENTION-DENY-MISSING-CLASS" "/api/ops/governed-evidence-write" "POST" "403" "$STATUS" "ops" "no_retention_class"

# RETENTION-UNKNOWN-DENIED: unknown retention class
STATUS=$(http_call "POST" "/api/ops/governed-evidence-write" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-H" "X-Tenant-Id: ${TENANT_KSA}" \
  "-H" "X-Jurisdiction-Code: KSA" \
  "-H" "X-Residency-Region: KSA" \
  "-H" "X-Retention-Class: no.such.class" \
  "-d" '{"note":"test"}')
record_case "RETENTION-UNKNOWN-DENIED" "/api/ops/governed-evidence-write" "POST" "403" "$STATUS" "ops" "unknown_retention_class"

# RETENTION-DENY-INACTIVE-CLASS: audit.short_term is now disabled
STATUS=$(http_call "POST" "/api/ops/governed-evidence-write" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-H" "X-Tenant-Id: ${TENANT_KSA}" \
  "-H" "X-Jurisdiction-Code: KSA" \
  "-H" "X-Residency-Region: KSA" \
  "-H" "X-Retention-Class: audit.short_term" \
  "-d" '{"note":"test"}')
BODY=$(read_body)
ERR_CODE=$(echo "$BODY" | jq -r '.error.code // empty' 2>/dev/null || echo "")
record_case "RETENTION-DENY-INACTIVE-CLASS" "/api/ops/governed-evidence-write" "POST" "403" "$STATUS" "ops" "inactive_class"
echo "[phase16]   error_code=${ERR_CODE}"

# Re-enable audit.short_term
http_call "POST" "/api/admin/evidence-governance/retention/${ENC_CLASS}/enable" "$SA_TOKEN" >/dev/null 2>>"$COMMAND_LOG" || true

# RESIDENCY-ALLOW-COMPATIBLE-REGION + RETENTION-ALLOW-ACTIVE-CLASS: KSA region, KSA jurisdiction, audit.long_term
STATUS=$(http_call "POST" "/api/ops/governed-evidence-write" "$OPS_TOKEN" \
  "-H" "Content-Type: application/json" \
  "-H" "X-Tenant-Id: ${TENANT_KSA}" \
  "-H" "X-Jurisdiction-Code: KSA" \
  "-H" "X-Residency-Region: KSA" \
  "-H" "X-Retention-Class: audit.long_term" \
  "-d" '{"note":"phase16 evidence write test"}')
BODY=$(read_body)
record_case "RESIDENCY-ALLOW-COMPATIBLE-REGION" "/api/ops/governed-evidence-write" "POST" "202" "$STATUS" "ops" "ksa_on_ksa"
record_case "RETENTION-ALLOW-ACTIVE-CLASS" "/api/ops/governed-evidence-write" "POST" "202" "$STATUS" "ops" "audit.long_term"

RESIDENCY_RESP=$(echo "$BODY" | jq -r '.data.residency_region // empty' 2>/dev/null || echo "")
RETENTION_RESP=$(echo "$BODY" | jq -r '.data.retention_class  // empty' 2>/dev/null || echo "")
echo "[phase16]   response residency_region=${RESIDENCY_RESP} retention_class=${RETENTION_RESP}"

# EVIDENCE-RESIDENCY-METADATA-PRESENT: residency_region in server.log
if grep -q "\"residency_region\":\"KSA\"" "${EVIDENCE_DIR}/server.log" 2>/dev/null; then
  PASS=$((PASS+1)); echo "[phase16] PASS  EVIDENCE-RESIDENCY-METADATA-PRESENT (residency_region=KSA in server.log)"
else
  FAIL=$((FAIL+1)); echo "[phase16] FAIL  EVIDENCE-RESIDENCY-METADATA-PRESENT (not found in server.log)"
fi

# EVIDENCE-RETENTION-METADATA-PRESENT: retention_class in server.log
if grep -q "\"retention_class\":\"audit.long_term\"" "${EVIDENCE_DIR}/server.log" 2>/dev/null; then
  PASS=$((PASS+1)); echo "[phase16] PASS  EVIDENCE-RETENTION-METADATA-PRESENT (retention_class=audit.long_term in server.log)"
else
  FAIL=$((FAIL+1)); echo "[phase16] FAIL  EVIDENCE-RETENTION-METADATA-PRESENT (not found in server.log)"
fi

# ---------------------------------------------------------------------------
# Write summary.json
# ---------------------------------------------------------------------------
TOTAL=$((PASS+FAIL))
jq -n \
  --arg phase    "phase-16" \
  --arg ts       "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson pass  "$PASS" \
  --argjson fail  "$FAIL" \
  --argjson total "$TOTAL" \
  --arg unit_p16  "$P16_PASS" \
  '{phase:$phase,generated_at:$ts,unit_tests_p16_pass:$unit_p16,http_cases:{total:$total,pass:$pass,fail:$fail}}' \
  > "$SUMMARY_JSON"

{
  echo "PROWORK PHASE 16 EVIDENCE MANIFEST"
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
echo "[phase16] ============================="
echo "[phase16] unit tests p16: ${P16_PASS}/41"
echo "[phase16] http cases:     ${PASS}/${TOTAL}"
echo "[phase16] ============================="

[ "$FAIL" -gt 0 ] && { echo "[phase16] FAILED: ${FAIL} case(s)"; exit 1; }

echo "[phase16] ALL CASES PASSED"
echo ""
echo "EVIDENCE_RUN_DIR=${EVIDENCE_DIR}"
