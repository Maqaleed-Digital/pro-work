#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/Users/waheebmahmoud/dev/pro-work}"
PHASE44_PORT="${PHASE44_PORT:-43144}"
PHASE_TS="${PHASE_TS:-$(date -u +"%Y%m%dT%H%M%SZ")}"
EVIDENCE_RUN_DIR="${EVIDENCE_RUN_DIR:-${REPO_ROOT}/evidence/phase44_${PHASE_TS}}"

mkdir -p "${EVIDENCE_RUN_DIR}"

PRECHECK_FILE="${EVIDENCE_RUN_DIR}/PRECHECK.txt"
HEALTH_FILE="${EVIDENCE_RUN_DIR}/ROUTE_TEST_HEALTH.txt"
BEFORE_FILE="${EVIDENCE_RUN_DIR}/ROUTE_TEST_COMMAND_CENTER_BEFORE.txt"
INVALID_FILE="${EVIDENCE_RUN_DIR}/ROUTE_TEST_INVALID_INTAKE.txt"
VALID_FILE="${EVIDENCE_RUN_DIR}/ROUTE_TEST_VALID_INTAKE.txt"
OPPS_AFTER_FILE="${EVIDENCE_RUN_DIR}/ROUTE_TEST_OPPORTUNITIES_AFTER.txt"
AFTER_FILE="${EVIDENCE_RUN_DIR}/ROUTE_TEST_COMMAND_CENTER_AFTER.txt"
HTML_FILE="${EVIDENCE_RUN_DIR}/ROUTE_TEST_BROWSER_HTML.txt"
JS_FILE="${EVIDENCE_RUN_DIR}/ROUTE_TEST_BROWSER_JS.txt"
STATE_FILE_OUT="${EVIDENCE_RUN_DIR}/STATE_SNAPSHOT.json"
SUMMARY_FILE="${EVIDENCE_RUN_DIR}/SUMMARY.md"
SERVER_LOG="${EVIDENCE_RUN_DIR}/SERVER.log"
STATE_FILE="${REPO_ROOT}/prowork_runtime/api/data/phase44-runtime.json"

{
  echo "PHASE=44"
  echo "REPO_ROOT=${REPO_ROOT}"
  echo "PHASE44_PORT=${PHASE44_PORT}"
  echo "NODE=$(node --version)"
  echo "HEAD=$(git -C "${REPO_ROOT}" rev-parse HEAD)"
} > "${PRECHECK_FILE}"

rm -f "${STATE_FILE}"

node "${REPO_ROOT}/prowork_runtime/api/src/phase44/devServer.js" > "${SERVER_LOG}" 2>&1 &
SERVER_PID=$!

cleanup() {
  if kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

READY=0
for _ in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:${PHASE44_PORT}/health" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.25
done

if [ "${READY}" != "1" ]; then
  echo "ERROR: phase 44 server did not become ready"
  cat "${SERVER_LOG}" || true
  exit 1
fi

curl -fsS "http://127.0.0.1:${PHASE44_PORT}/health" > "${HEALTH_FILE}"
curl -fsS "http://127.0.0.1:${PHASE44_PORT}/api/command-center/state" > "${BEFORE_FILE}"

INVALID_HTTP_CODE="$(
  curl -sS -o "${INVALID_FILE}" -w "%{http_code}" \
    -H "content-type: application/json" \
    -X POST \
    --data '{"tenantId":"tenant_demo_001","requesterId":"","title":"x","summary":"short"}' \
    "http://127.0.0.1:${PHASE44_PORT}/api/intake"
)"
if [ "${INVALID_HTTP_CODE}" != "422" ]; then
  echo "ERROR: expected invalid intake HTTP 422, got ${INVALID_HTTP_CODE}"
  exit 1
fi

VALID_HTTP_CODE="$(
  curl -sS -o "${VALID_FILE}" -w "%{http_code}" \
    -H "content-type: application/json" \
    -X POST \
    --data '{"tenantId":"tenant_demo_001","requesterId":"req_demo_001","title":"Board operating model setup","summary":"Establish first governed opportunity from a live intake flow."}' \
    "http://127.0.0.1:${PHASE44_PORT}/api/intake"
)"
if [ "${VALID_HTTP_CODE}" != "201" ]; then
  echo "ERROR: expected valid intake HTTP 201, got ${VALID_HTTP_CODE}"
  exit 1
fi

curl -fsS "http://127.0.0.1:${PHASE44_PORT}/api/opportunities" > "${OPPS_AFTER_FILE}"
curl -fsS "http://127.0.0.1:${PHASE44_PORT}/api/command-center/state" > "${AFTER_FILE}"
curl -fsS "http://127.0.0.1:${PHASE44_PORT}/phase44-demo" > "${HTML_FILE}"
curl -fsS "http://127.0.0.1:${PHASE44_PORT}/phase44-demo/app.js" > "${JS_FILE}"

if [ ! -f "${STATE_FILE}" ]; then
  echo "ERROR: state file not created"
  exit 1
fi

cp "${STATE_FILE}" "${STATE_FILE_OUT}"

node <<'NODE' "${STATE_FILE_OUT}"
const fs = require("fs");
const file = process.argv[1];
const state = JSON.parse(fs.readFileSync(file, "utf8"));
if (state.intakes.length !== 1) {
  console.error(`Expected 1 intake, found ${state.intakes.length}`);
  process.exit(1);
}
if (state.opportunities.length !== 1) {
  console.error(`Expected 1 opportunity, found ${state.opportunities.length}`);
  process.exit(1);
}
if (state.events.length < 3) {
  console.error(`Expected at least 3 events, found ${state.events.length}`);
  process.exit(1);
}
NODE

cat > "${SUMMARY_FILE}" <<EOF_SUMMARY
# Phase 44 Execution Summary

Status: PASS

Evidence directory:
${EVIDENCE_RUN_DIR}

Checks:
- health route PASS
- command-center before state PASS
- invalid intake blocked with 422 PASS
- valid intake accepted with 201 PASS
- opportunities after state PASS
- command-center after state PASS
- browser demo HTML served PASS
- browser demo JS served PASS
- persisted state snapshot PASS
EOF_SUMMARY

echo "PHASE_44_PASS"
echo "EVIDENCE_RUN_DIR=${EVIDENCE_RUN_DIR}"
