#!/usr/bin/env bash
set -euo pipefail

PHASE="48"
PORT="43148"
SERVER_SCRIPT="prowork_runtime/api/src/phase${PHASE}/devServer.js"
EVIDENCE_DIR="${EVIDENCE_RUN_DIR:-evidence/phase${PHASE}_$(date +%Y%m%d_%H%M%S)}"
BASE_URL="http://127.0.0.1:${PORT}"
STATE_FILE="prowork_runtime/api/data/phase${PHASE}-runtime.json"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

mkdir -p "$EVIDENCE_DIR"

echo "=== PHASE ${PHASE} EVIDENCE RUN ===" | tee "$EVIDENCE_DIR/PRECHECK.txt"
echo "DATE: $(date -u +%Y-%m-%dT%H:%M:%SZ)" | tee -a "$EVIDENCE_DIR/PRECHECK.txt"
echo "REPO: $REPO_ROOT" | tee -a "$EVIDENCE_DIR/PRECHECK.txt"
echo "PORT: $PORT" | tee -a "$EVIDENCE_DIR/PRECHECK.txt"
echo "NODE: $(node --version)" | tee -a "$EVIDENCE_DIR/PRECHECK.txt"
echo "HEAD: $(git rev-parse HEAD)" | tee -a "$EVIDENCE_DIR/PRECHECK.txt"

rm -f "$STATE_FILE"

node "$SERVER_SCRIPT" &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true" EXIT

echo "Waiting for server..."
for i in $(seq 1 40); do
  if curl -sf "$BASE_URL/health" >/dev/null 2>&1; then
    echo "Server ready after ${i} attempts"
    break
  fi
  sleep 0.5
  if [ "$i" -eq 40 ]; then
    echo "ERROR: Server did not start" >&2
    exit 1
  fi
done

# Health
curl -sf "$BASE_URL/health" | tee "$EVIDENCE_DIR/ROUTE_TEST_HEALTH.txt"
echo ""

# Blocked: invalid intake (missing requesterId)
echo "--- BLOCKED: invalid intake ---"
RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/intake" \
  -H "content-type: application/json" \
  -d '{"tenantId":"tenant-alpha","requesterId":"","title":"x","summary":"short"}')
HTTP_STATUS=$(echo "$RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
echo "$RESP" | grep -v "HTTP_STATUS:" | tee "$EVIDENCE_DIR/ROUTE_TEST_INVALID_INTAKE.txt"
if [ "$HTTP_STATUS" != "422" ]; then echo "FAIL: invalid intake expected 422, got $HTTP_STATUS" >&2; exit 1; fi
echo "PASS: invalid intake returned 422"

# Active: valid intake
echo "--- ACTIVE: valid intake ---"
INTAKE_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/intake" \
  -H "content-type: application/json" \
  -d '{
    "tenantId": "tenant-alpha",
    "requesterId": "user-001",
    "title": "Lifecycle Test Initiative",
    "summary": "Governed initiative for lifecycle transition testing phase 48"
  }')
HTTP_STATUS=$(echo "$INTAKE_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
INTAKE_BODY=$(echo "$INTAKE_RESP" | grep -v "HTTP_STATUS:")
echo "$INTAKE_BODY" | tee "$EVIDENCE_DIR/ROUTE_TEST_VALID_INTAKE.txt"
if [ "$HTTP_STATUS" != "201" ]; then echo "FAIL: valid intake expected 201, got $HTTP_STATUS" >&2; exit 1; fi
echo "PASS: valid intake returned 201"

OPP_ID=$(echo "$INTAKE_BODY" | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>console.log(JSON.parse(d).data.opportunity.opportunityId));")
echo "opportunityId: $OPP_ID"

# Active: advance
echo "--- ACTIVE: advance to BOARD_REVIEW ---"
ADVANCE_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/opportunities/$OPP_ID/advance" \
  -H "content-type: application/json" \
  -H "x-actor-id: operator-001" -H "x-actor-role: board_operator" \
  -d '{"toStage":"BOARD_REVIEW"}')
HTTP_STATUS=$(echo "$ADVANCE_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
echo "$ADVANCE_RESP" | grep -v "HTTP_STATUS:" | tee "$EVIDENCE_DIR/ROUTE_TEST_AUTHORIZED_ADVANCE.txt"
if [ "$HTTP_STATUS" != "200" ]; then echo "FAIL: advance expected 200, got $HTTP_STATUS" >&2; exit 1; fi
echo "PASS: advance returned 200"

# Active: approve
echo "--- ACTIVE: approve ---"
APPROVE_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/opportunities/$OPP_ID/approve" \
  -H "content-type: application/json" \
  -H "x-actor-id: operator-001" -H "x-actor-role: board_operator" \
  -d '{"reason":"Approved for lifecycle activation"}')
HTTP_STATUS=$(echo "$APPROVE_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
echo "$APPROVE_RESP" | grep -v "HTTP_STATUS:" | tee "$EVIDENCE_DIR/ROUTE_TEST_AUTHORIZED_APPROVE.txt"
if [ "$HTTP_STATUS" != "200" ]; then echo "FAIL: approve expected 200, got $HTTP_STATUS" >&2; exit 1; fi
echo "PASS: approve returned 200"

# Active: create work item A
echo "--- ACTIVE: create work item A ---"
WI_A_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/opportunities/$OPP_ID/work-items" \
  -H "content-type: application/json" \
  -H "x-actor-id: operator-001" -H "x-actor-role: board_operator" \
  -d '{"title":"Execution Command Pack","summary":"Assemble and complete the operational execution pack"}')
HTTP_STATUS=$(echo "$WI_A_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
WI_A_BODY=$(echo "$WI_A_RESP" | grep -v "HTTP_STATUS:")
echo "$WI_A_BODY" | tee "$EVIDENCE_DIR/ROUTE_TEST_AUTHORIZED_WORK_ITEM_CREATED.txt"
if [ "$HTTP_STATUS" != "201" ]; then echo "FAIL: work item A create expected 201, got $HTTP_STATUS" >&2; exit 1; fi
echo "PASS: work item A created returned 201"

WI_A_ID=$(echo "$WI_A_BODY" | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>console.log(JSON.parse(d).data.item.workItemId));")
echo "workItemId A: $WI_A_ID"

# Create work item B
echo "--- Create work item B ---"
WI_B_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/opportunities/$OPP_ID/work-items" \
  -H "content-type: application/json" \
  -H "x-actor-id: operator-001" -H "x-actor-role: board_operator" \
  -d '{"title":"Dependency Collection","summary":"Collect delivery dependency inputs then move to blocked"}')
HTTP_STATUS=$(echo "$WI_B_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
WI_B_BODY=$(echo "$WI_B_RESP" | grep -v "HTTP_STATUS:")
if [ "$HTTP_STATUS" != "201" ]; then echo "FAIL: work item B create expected 201, got $HTTP_STATUS" >&2; exit 1; fi
echo "PASS: work item B created returned 201"

WI_B_ID=$(echo "$WI_B_BODY" | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>console.log(JSON.parse(d).data.item.workItemId));")
echo "workItemId B: $WI_B_ID"

# Blocked: unauthorized start (system_viewer)
echo "--- BLOCKED: unauthorized start ---"
UNAUTH_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/work-items/$WI_A_ID/start" \
  -H "x-actor-id: viewer-001" -H "x-actor-role: system_viewer")
HTTP_STATUS=$(echo "$UNAUTH_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
echo "$UNAUTH_RESP" | grep -v "HTTP_STATUS:" | tee "$EVIDENCE_DIR/ROUTE_TEST_UNAUTHORIZED_START_BLOCKED.txt"
if [ "$HTTP_STATUS" != "403" ]; then echo "FAIL: unauthorized start expected 403, got $HTTP_STATUS" >&2; exit 1; fi
echo "PASS: unauthorized start returned 403"

# Blocked: invalid complete from READY (no start first)
echo "--- BLOCKED: invalid complete from READY ---"
INVALID_COMPLETE_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/work-items/$WI_A_ID/complete" \
  -H "x-actor-id: operator-001" -H "x-actor-role: board_operator")
HTTP_STATUS=$(echo "$INVALID_COMPLETE_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
echo "$INVALID_COMPLETE_RESP" | grep -v "HTTP_STATUS:" | tee "$EVIDENCE_DIR/ROUTE_TEST_INVALID_COMPLETE_BLOCKED.txt"
if [ "$HTTP_STATUS" != "422" ]; then echo "FAIL: invalid complete expected 422, got $HTTP_STATUS" >&2; exit 1; fi
echo "PASS: invalid complete from READY returned 422"

# Active: start work item A (READY → IN_PROGRESS)
echo "--- ACTIVE: start work item A ---"
START_A_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/work-items/$WI_A_ID/start" \
  -H "x-actor-id: operator-001" -H "x-actor-role: board_operator")
HTTP_STATUS=$(echo "$START_A_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
echo "$START_A_RESP" | grep -v "HTTP_STATUS:" | tee "$EVIDENCE_DIR/ROUTE_TEST_AUTHORIZED_START.txt"
if [ "$HTTP_STATUS" != "200" ]; then echo "FAIL: start A expected 200, got $HTTP_STATUS" >&2; exit 1; fi
echo "PASS: start work item A returned 200"

# Start work item B then block it (READY → IN_PROGRESS → BLOCKED)
echo "--- Start work item B (before blocking) ---"
curl -s -X POST "$BASE_URL/api/work-items/$WI_B_ID/start" \
  -H "x-actor-id: operator-001" -H "x-actor-role: board_operator" >/dev/null

# Active: block work item B (IN_PROGRESS → BLOCKED)
echo "--- ACTIVE: block work item B ---"
BLOCK_B_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/work-items/$WI_B_ID/block" \
  -H "x-actor-id: operator-001" -H "x-actor-role: board_operator")
HTTP_STATUS=$(echo "$BLOCK_B_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
echo "$BLOCK_B_RESP" | grep -v "HTTP_STATUS:" | tee "$EVIDENCE_DIR/ROUTE_TEST_AUTHORIZED_BLOCK.txt"
if [ "$HTTP_STATUS" != "200" ]; then echo "FAIL: block B expected 200, got $HTTP_STATUS" >&2; exit 1; fi
echo "PASS: block work item B returned 200"

# Active: complete work item A (IN_PROGRESS → COMPLETED)
echo "--- ACTIVE: complete work item A ---"
COMPLETE_A_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/work-items/$WI_A_ID/complete" \
  -H "x-actor-id: operator-001" -H "x-actor-role: board_operator")
HTTP_STATUS=$(echo "$COMPLETE_A_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
echo "$COMPLETE_A_RESP" | grep -v "HTTP_STATUS:" | tee "$EVIDENCE_DIR/ROUTE_TEST_AUTHORIZED_COMPLETE.txt"
if [ "$HTTP_STATUS" != "200" ]; then echo "FAIL: complete A expected 200, got $HTTP_STATUS" >&2; exit 1; fi
echo "PASS: complete work item A returned 200"

# Work item detail
echo "--- ROUTE: work item detail ---"
curl -sf "$BASE_URL/api/work-items/$WI_A_ID" | tee "$EVIDENCE_DIR/ROUTE_TEST_WORK_ITEM_DETAIL.txt"
echo ""

# Execution queue
echo "--- ROUTE: execution queue ---"
curl -sf "$BASE_URL/api/execution/queue" | tee "$EVIDENCE_DIR/ROUTE_TEST_EXECUTION_QUEUE.txt"
echo ""

# Events
echo "--- ROUTE: events ---"
curl -sf "$BASE_URL/api/events" | tee "$EVIDENCE_DIR/ROUTE_TEST_EVENTS.txt"
echo ""

# Browser
echo "--- ROUTE: browser HTML ---"
curl -sf "$BASE_URL/phase48-demo" | tee "$EVIDENCE_DIR/ROUTE_TEST_BROWSER_HTML.txt"
echo ""

echo "--- ROUTE: browser JS ---"
curl -sf "$BASE_URL/phase48-demo/app.js" | tee "$EVIDENCE_DIR/ROUTE_TEST_BROWSER_JS.txt"
echo ""

# State snapshot
echo "--- STATE SNAPSHOT ---"
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
if (state.workItems.length < 2) errs.push('Expected >=2 work items, got ' + state.workItems.length);
const completedCount = state.workItems.filter(wi => wi.status === 'COMPLETED').length;
if (completedCount < 1) errs.push('Expected >=1 completed work item, got ' + completedCount);
const blockedCount = state.workItems.filter(wi => wi.status === 'BLOCKED').length;
if (blockedCount < 1) errs.push('Expected >=1 blocked work item, got ' + blockedCount);
const queueCount = state.workItems.filter(wi => ['READY','IN_PROGRESS'].includes(wi.status)).length;
if (queueCount !== 0) errs.push('Expected execution queue count = 0, got ' + queueCount);
if (state.events.length < 16) errs.push('Expected >=16 events, got ' + state.events.length);
if (errs.length > 0) { console.error('VALIDATION FAILED:\n' + errs.join('\n')); process.exit(1); }
console.log('STATE VALIDATION PASSED');
console.log('  intakes:', state.intakes.length);
console.log('  opportunities:', state.opportunities.length);
console.log('  opportunity.stage:', state.opportunities[0].stage);
console.log('  workItems:', state.workItems.length);
console.log('  completed:', completedCount);
console.log('  blocked:', blockedCount);
console.log('  executionQueue:', queueCount);
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
- Unauthorized lifecycle start (system_viewer) → HTTP 403
- Invalid complete from READY → HTTP 422

## Active Paths (all passed)
- Valid intake → HTTP 201
- Advance to BOARD_REVIEW → HTTP 200
- Approve opportunity → HTTP 200
- Create work item A → HTTP 201
- Create work item B → HTTP 201
- Start work item A (READY → IN_PROGRESS) → HTTP 200
- Block work item B (IN_PROGRESS → BLOCKED) → HTTP 200
- Complete work item A (IN_PROGRESS → COMPLETED) → HTTP 200

## State Validation
- 1 intake, 1 opportunity (stage=APPROVED)
- work item count >= 2
- completed count >= 1, blocked count >= 1
- execution queue = 0
- event count >= 16
SUMEOF

echo ""
echo "=== PHASE ${PHASE} COMPLETE ==="
echo "EVIDENCE_RUN_DIR=$EVIDENCE_DIR"
