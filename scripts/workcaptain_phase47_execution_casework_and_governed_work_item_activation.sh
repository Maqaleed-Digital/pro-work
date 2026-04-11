#!/usr/bin/env bash
set -euo pipefail

PHASE="47"
PORT="43147"
SERVER_SCRIPT="prowork_runtime/api/src/phase${PHASE}/devServer.js"
EVIDENCE_DIR="evidence/phase${PHASE}_$(date +%Y%m%d_%H%M%S)"
BASE_URL="http://127.0.0.1:${PORT}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

mkdir -p "$EVIDENCE_DIR"

echo "=== PHASE ${PHASE} EVIDENCE RUN ===" | tee "$EVIDENCE_DIR/PRECHECK.txt"
echo "DATE: $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$EVIDENCE_DIR/PRECHECK.txt"
echo "REPO: $REPO_ROOT" | tee -a "$EVIDENCE_DIR/PRECHECK.txt"
echo "PORT: $PORT" | tee -a "$EVIDENCE_DIR/PRECHECK.txt"
echo "NODE: $(node --version)" | tee -a "$EVIDENCE_DIR/PRECHECK.txt"

# Start server
node "$SERVER_SCRIPT" &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true" EXIT

# Wait for readiness
echo "Waiting for server..."
for i in $(seq 1 30); do
  if curl -sf "$BASE_URL/health" >/dev/null 2>&1; then
    echo "Server ready after ${i}s"
    break
  fi
  sleep 1
  if [ "$i" -eq 30 ]; then
    echo "ERROR: Server did not start in 30s" >&2
    exit 1
  fi
done

# Health
echo "--- HEALTH ---"
curl -sf "$BASE_URL/health" | tee "$EVIDENCE_DIR/ROUTE_TEST_HEALTH.txt"
echo ""

# Blocked: invalid intake (missing fields)
echo "--- BLOCKED: invalid intake ---"
RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/intake" \
  -H "content-type: application/json" \
  -d '{"tenantId":""}')
HTTP_STATUS=$(echo "$RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
BODY=$(echo "$RESP" | grep -v "HTTP_STATUS:")
echo "$BODY" | tee "$EVIDENCE_DIR/ROUTE_TEST_INVALID_INTAKE.txt"
if [ "$HTTP_STATUS" != "422" ]; then
  echo "FAIL: expected 422 for invalid intake, got $HTTP_STATUS" >&2
  exit 1
fi
echo "PASS: invalid intake returned 422"

# Active: valid intake
echo "--- ACTIVE: valid intake ---"
INTAKE_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/intake" \
  -H "content-type: application/json" \
  -d '{
    "tenantId": "tenant-alpha",
    "requesterId": "user-001",
    "title": "Execution Ready Initiative",
    "summary": "A governed initiative ready for execution casework activation"
  }')
HTTP_STATUS=$(echo "$INTAKE_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
INTAKE_BODY=$(echo "$INTAKE_RESP" | grep -v "HTTP_STATUS:")
echo "$INTAKE_BODY" | tee "$EVIDENCE_DIR/ROUTE_TEST_VALID_INTAKE.txt"
if [ "$HTTP_STATUS" != "201" ]; then
  echo "FAIL: expected 201 for valid intake, got $HTTP_STATUS" >&2
  exit 1
fi
echo "PASS: valid intake returned 201"

OPP_ID=$(echo "$INTAKE_BODY" | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{ const j=JSON.parse(d); console.log(j.data.opportunity.opportunityId); })")
echo "opportunityId: $OPP_ID"

# Active: advance to BOARD_REVIEW
echo "--- ACTIVE: advance to BOARD_REVIEW ---"
ADVANCE_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/opportunities/$OPP_ID/advance" \
  -H "content-type: application/json" \
  -H "x-actor-id: operator-001" \
  -H "x-actor-role: board_operator" \
  -d '{"toStage":"BOARD_REVIEW"}')
HTTP_STATUS=$(echo "$ADVANCE_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
ADVANCE_BODY=$(echo "$ADVANCE_RESP" | grep -v "HTTP_STATUS:")
echo "$ADVANCE_BODY" | tee "$EVIDENCE_DIR/ROUTE_TEST_AUTHORIZED_ADVANCE.txt"
if [ "$HTTP_STATUS" != "200" ]; then
  echo "FAIL: expected 200 for advance, got $HTTP_STATUS" >&2
  exit 1
fi
echo "PASS: advance returned 200"

# Blocked: work item before approval
echo "--- BLOCKED: work item before approval ---"
PREAPPROVAL_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/opportunities/$OPP_ID/work-items" \
  -H "content-type: application/json" \
  -H "x-actor-id: operator-001" \
  -H "x-actor-role: board_operator" \
  -d '{"title":"Early Work Item","summary":"Attempting to create work item before approval"}')
HTTP_STATUS=$(echo "$PREAPPROVAL_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
PREAPPROVAL_BODY=$(echo "$PREAPPROVAL_RESP" | grep -v "HTTP_STATUS:")
echo "$PREAPPROVAL_BODY" | tee "$EVIDENCE_DIR/ROUTE_TEST_PREAPPROVAL_WORK_ITEM_BLOCKED.txt"
if [ "$HTTP_STATUS" != "422" ]; then
  echo "FAIL: expected 422 for preapproval work item, got $HTTP_STATUS" >&2
  exit 1
fi
echo "PASS: preapproval work item returned 422"

# Active: approve opportunity
echo "--- ACTIVE: approve opportunity ---"
APPROVE_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/opportunities/$OPP_ID/approve" \
  -H "content-type: application/json" \
  -H "x-actor-id: operator-001" \
  -H "x-actor-role: board_operator" \
  -d '{"reason":"Initiative meets all execution criteria"}')
HTTP_STATUS=$(echo "$APPROVE_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
APPROVE_BODY=$(echo "$APPROVE_RESP" | grep -v "HTTP_STATUS:")
echo "$APPROVE_BODY" | tee "$EVIDENCE_DIR/ROUTE_TEST_AUTHORIZED_APPROVE.txt"
if [ "$HTTP_STATUS" != "200" ]; then
  echo "FAIL: expected 200 for approve, got $HTTP_STATUS" >&2
  exit 1
fi
echo "PASS: approve returned 200"

# Blocked: unauthorized work item creation
echo "--- BLOCKED: unauthorized work item ---"
UNAUTH_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/opportunities/$OPP_ID/work-items" \
  -H "content-type: application/json" \
  -H "x-actor-id: viewer-001" \
  -H "x-actor-role: system_viewer" \
  -d '{"title":"Unauthorized Work Item","summary":"Attempting work item as system_viewer"}')
HTTP_STATUS=$(echo "$UNAUTH_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
UNAUTH_BODY=$(echo "$UNAUTH_RESP" | grep -v "HTTP_STATUS:")
echo "$UNAUTH_BODY" | tee "$EVIDENCE_DIR/ROUTE_TEST_UNAUTHORIZED_WORK_ITEM_BLOCKED.txt"
if [ "$HTTP_STATUS" != "403" ]; then
  echo "FAIL: expected 403 for unauthorized work item, got $HTTP_STATUS" >&2
  exit 1
fi
echo "PASS: unauthorized work item returned 403"

# Active: create work item
echo "--- ACTIVE: create work item ---"
WI_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/opportunities/$OPP_ID/work-items" \
  -H "content-type: application/json" \
  -H "x-actor-id: operator-001" \
  -H "x-actor-role: board_operator" \
  -d '{"title":"Execution Task Alpha","summary":"First governed work item for execution queue activation"}')
HTTP_STATUS=$(echo "$WI_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
WI_BODY=$(echo "$WI_RESP" | grep -v "HTTP_STATUS:")
echo "$WI_BODY" | tee "$EVIDENCE_DIR/ROUTE_TEST_AUTHORIZED_WORK_ITEM_CREATED.txt"
if [ "$HTTP_STATUS" != "201" ]; then
  echo "FAIL: expected 201 for work item creation, got $HTTP_STATUS" >&2
  exit 1
fi
echo "PASS: work item creation returned 201"

WI_ID=$(echo "$WI_BODY" | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{ const j=JSON.parse(d); console.log(j.data.item.workItemId); })")
echo "workItemId: $WI_ID"

# Work item list
echo "--- ROUTE: work item list ---"
curl -sf "$BASE_URL/api/work-items" | tee "$EVIDENCE_DIR/ROUTE_TEST_WORK_ITEM_LIST.txt"
echo ""

# Work item detail
echo "--- ROUTE: work item detail ---"
curl -sf "$BASE_URL/api/work-items/$WI_ID" | tee "$EVIDENCE_DIR/ROUTE_TEST_WORK_ITEM_DETAIL.txt"
echo ""

# Execution queue
echo "--- ROUTE: execution queue ---"
curl -sf "$BASE_URL/api/execution/queue" | tee "$EVIDENCE_DIR/ROUTE_TEST_EXECUTION_QUEUE.txt"
echo ""

# Events
echo "--- ROUTE: events ---"
curl -sf "$BASE_URL/api/events" | tee "$EVIDENCE_DIR/ROUTE_TEST_EVENTS.txt"
echo ""

# Browser routes
echo "--- ROUTE: browser HTML ---"
curl -sf "$BASE_URL/phase47-demo" | tee "$EVIDENCE_DIR/ROUTE_TEST_BROWSER_HTML.txt"
echo ""

echo "--- ROUTE: browser JS ---"
curl -sf "$BASE_URL/phase47-demo/app.js" | tee "$EVIDENCE_DIR/ROUTE_TEST_BROWSER_JS.txt"
echo ""

# State snapshot
echo "--- STATE SNAPSHOT ---"
STATE_FILE="prowork_runtime/api/data/phase47-runtime.json"
cp "$STATE_FILE" "$EVIDENCE_DIR/STATE_SNAPSHOT.json"
cat "$EVIDENCE_DIR/STATE_SNAPSHOT.json"

# Validate state
echo "--- VALIDATING STATE ---"
node -e "
const state = JSON.parse(require('fs').readFileSync('$STATE_FILE', 'utf8'));
const errs = [];
if (state.intakes.length !== 1) errs.push('Expected 1 intake, got ' + state.intakes.length);
if (state.opportunities.length !== 1) errs.push('Expected 1 opportunity, got ' + state.opportunities.length);
if (state.opportunities[0].stage !== 'APPROVED') errs.push('Expected stage APPROVED, got ' + state.opportunities[0].stage);
if (state.workItems.length < 1) errs.push('Expected >=1 work item, got ' + state.workItems.length);
const queue = state.workItems.filter(wi => ['READY','IN_PROGRESS'].includes(wi.status));
if (queue.length < 1) errs.push('Expected >=1 item in execution queue, got ' + queue.length);
if (state.events.length < 10) errs.push('Expected >=10 events, got ' + state.events.length);
if (errs.length > 0) { console.error('VALIDATION FAILED:\\n' + errs.join('\\n')); process.exit(1); }
console.log('STATE VALIDATION PASSED');
console.log('  intakes:', state.intakes.length);
console.log('  opportunities:', state.opportunities.length);
console.log('  opportunity.stage:', state.opportunities[0].stage);
console.log('  workItems:', state.workItems.length);
console.log('  executionQueue:', queue.length);
console.log('  events:', state.events.length);
"

# Summary
cat > "$EVIDENCE_DIR/SUMMARY.md" << SUMEOF
# Phase ${PHASE} Evidence Summary

## Run
- Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)
- Port: ${PORT}

## Blocked Paths (all passed)
- Invalid intake → HTTP 422
- Work item before approval → HTTP 422
- Unauthorized work item (system_viewer) → HTTP 403

## Active Paths (all passed)
- Valid intake → HTTP 201
- Advance to BOARD_REVIEW → HTTP 200
- Approve opportunity → HTTP 200
- Create work item → HTTP 201

## State Validation
- 1 intake
- 1 opportunity (stage=APPROVED)
- work item count >= 1
- execution queue count >= 1
- event count >= 10
SUMEOF

echo ""
echo "=== PHASE ${PHASE} COMPLETE ==="
echo "EVIDENCE_RUN_DIR=$EVIDENCE_DIR"
