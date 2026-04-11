#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/Users/waheebmahmoud/dev/pro-work}"
PHASE45_PORT="${PHASE45_PORT:-43145}"
PHASE_TS="${PHASE_TS:-$(date -u +"%Y%m%dT%H%M%SZ")}"
EVIDENCE_RUN_DIR="${EVIDENCE_RUN_DIR:-${REPO_ROOT}/evidence/phase45_${PHASE_TS}}"

mkdir -p "${EVIDENCE_RUN_DIR}"

PRECHECK_FILE="${EVIDENCE_RUN_DIR}/PRECHECK.txt"
HEALTH_FILE="${EVIDENCE_RUN_DIR}/ROUTE_TEST_HEALTH.txt"
INVALID_FILE="${EVIDENCE_RUN_DIR}/ROUTE_TEST_INVALID_INTAKE.txt"
VALID_FILE="${EVIDENCE_RUN_DIR}/ROUTE_TEST_VALID_INTAKE.txt"
DETAIL_FILE="${EVIDENCE_RUN_DIR}/ROUTE_TEST_OPPORTUNITY_DETAIL.txt"
UNAUTH_FILE="${EVIDENCE_RUN_DIR}/ROUTE_TEST_UNAUTHORIZED_ADVANCE.txt"
AUTH_FILE="${EVIDENCE_RUN_DIR}/ROUTE_TEST_AUTHORIZED_ADVANCE.txt"
BOARD_FILE="${EVIDENCE_RUN_DIR}/ROUTE_TEST_BOARD_QUEUE.txt"
EVENTS_FILE="${EVIDENCE_RUN_DIR}/ROUTE_TEST_EVENTS.txt"
HTML_FILE="${EVIDENCE_RUN_DIR}/ROUTE_TEST_BROWSER_HTML.txt"
JS_FILE="${EVIDENCE_RUN_DIR}/ROUTE_TEST_BROWSER_JS.txt"
STATE_FILE_OUT="${EVIDENCE_RUN_DIR}/STATE_SNAPSHOT.json"
SUMMARY_FILE="${EVIDENCE_RUN_DIR}/SUMMARY.md"
SERVER_LOG="${EVIDENCE_RUN_DIR}/SERVER.log"
STATE_FILE="${REPO_ROOT}/prowork_runtime/api/data/phase45-runtime.json"

{
  echo "PHASE=45"
  echo "REPO_ROOT=${REPO_ROOT}"
  echo "PHASE45_PORT=${PHASE45_PORT}"
  echo "NODE=$(node --version)"
  echo "HEAD=$(git -C "${REPO_ROOT}" rev-parse HEAD)"
} > "${PRECHECK_FILE}"

rm -f "${STATE_FILE}"

node "${REPO_ROOT}/prowork_runtime/api/src/phase45/devServer.js" > "${SERVER_LOG}" 2>&1 &
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
  if curl -fsS "http://127.0.0.1:${PHASE45_PORT}/health" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.25
done

if [ "${READY}" != "1" ]; then
  echo "ERROR: phase 45 server did not become ready"
  cat "${SERVER_LOG}" || true
  exit 1
fi

curl -fsS "http://127.0.0.1:${PHASE45_PORT}/health" > "${HEALTH_FILE}"

INVALID_HTTP_CODE="$(
  curl -sS -o "${INVALID_FILE}" -w "%{http_code}" \
    -H "content-type: application/json" \
    -X POST \
    --data '{"tenantId":"tenant_demo_001","requesterId":"","title":"x","summary":"short"}' \
    "http://127.0.0.1:${PHASE45_PORT}/api/intake"
)"
if [ "${INVALID_HTTP_CODE}" != "422" ]; then
  echo "ERROR: expected invalid intake HTTP 422, got ${INVALID_HTTP_CODE}"
  exit 1
fi

VALID_HTTP_CODE="$(
  curl -sS -o "${VALID_FILE}" -w "%{http_code}" \
    -H "content-type: application/json" \
    -X POST \
    --data '{"tenantId":"tenant_demo_001","requesterId":"req_demo_001","title":"Institutional board package","summary":"Advance the first opportunity into board review through a governed runtime flow."}' \
    "http://127.0.0.1:${PHASE45_PORT}/api/intake"
)"
if [ "${VALID_HTTP_CODE}" != "201" ]; then
  echo "ERROR: expected valid intake HTTP 201, got ${VALID_HTTP_CODE}"
  exit 1
fi

OPPORTUNITY_ID="$(
  node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(data.data.opportunity.opportunityId);' "${VALID_FILE}"
)"

curl -fsS "http://127.0.0.1:${PHASE45_PORT}/api/opportunities/${OPPORTUNITY_ID}" > "${DETAIL_FILE}"

UNAUTH_HTTP_CODE="$(
  curl -sS -o "${UNAUTH_FILE}" -w "%{http_code}" \
    -H "content-type: application/json" \
    -H "x-actor-id: req_demo_001" \
    -H "x-actor-role: requester" \
    -X POST \
    --data '{"toStage":"BOARD_REVIEW"}' \
    "http://127.0.0.1:${PHASE45_PORT}/api/opportunities/${OPPORTUNITY_ID}/advance"
)"
if [ "${UNAUTH_HTTP_CODE}" != "403" ]; then
  echo "ERROR: expected unauthorized advance HTTP 403, got ${UNAUTH_HTTP_CODE}"
  exit 1
fi

AUTH_HTTP_CODE="$(
  curl -sS -o "${AUTH_FILE}" -w "%{http_code}" \
    -H "content-type: application/json" \
    -H "x-actor-id: board_ops_001" \
    -H "x-actor-role: board_operator" \
    -X POST \
    --data '{"toStage":"BOARD_REVIEW"}' \
    "http://127.0.0.1:${PHASE45_PORT}/api/opportunities/${OPPORTUNITY_ID}/advance"
)"
if [ "${AUTH_HTTP_CODE}" != "200" ]; then
  echo "ERROR: expected authorized advance HTTP 200, got ${AUTH_HTTP_CODE}"
  exit 1
fi

curl -fsS "http://127.0.0.1:${PHASE45_PORT}/api/board/queue" > "${BOARD_FILE}"
curl -fsS "http://127.0.0.1:${PHASE45_PORT}/api/events" > "${EVENTS_FILE}"
curl -fsS "http://127.0.0.1:${PHASE45_PORT}/phase45-demo" > "${HTML_FILE}"
curl -fsS "http://127.0.0.1:${PHASE45_PORT}/phase45-demo/app.js" > "${JS_FILE}"

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
if (state.opportunities[0].stage !== "BOARD_REVIEW") {
  console.error(`Expected opportunity stage BOARD_REVIEW, found ${state.opportunities[0].stage}`);
  process.exit(1);
}
const boardItems = state.opportunities.filter((item) => item.stage === "BOARD_REVIEW" || item.stage === "APPROVED");
if (boardItems.length < 1) {
  console.error("Expected at least 1 board queue item");
  process.exit(1);
}
if (state.events.length < 5) {
  console.error(`Expected at least 5 events, found ${state.events.length}`);
  process.exit(1);
}
NODE

cat > "${SUMMARY_FILE}" <<EOF_SUMMARY
# Phase 45 Execution Summary

Status: PASS

Evidence directory:
${EVIDENCE_RUN_DIR}

Checks:
- health route PASS
- invalid intake blocked with 422 PASS
- valid intake accepted with 201 PASS
- opportunity detail route PASS
- unauthorized stage advance blocked with 403 PASS
- authorized stage advance accepted with 200 PASS
- board queue route PASS
- event inspection route PASS
- browser demo HTML served PASS
- browser demo JS served PASS
- persisted state snapshot PASS
EOF_SUMMARY

echo "PHASE_45_PASS"
echo "EVIDENCE_RUN_DIR=${EVIDENCE_RUN_DIR}"
