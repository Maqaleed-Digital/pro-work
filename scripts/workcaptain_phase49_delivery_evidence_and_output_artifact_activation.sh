#!/usr/bin/env bash
set -euo pipefail

PHASE="49"
PORT="43149"
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
  if [ "$i" -eq 40 ]; then echo "ERROR: Server did not start" >&2; exit 1; fi
done

# Health
curl -sf "$BASE_URL/health" | tee "$EVIDENCE_DIR/ROUTE_TEST_HEALTH.txt"
echo ""

# Blocked: invalid intake
echo "--- BLOCKED: invalid intake ---"
RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/intake" \
  -H "content-type: application/json" \
  -d '{"tenantId":"","requesterId":"","title":"x","summary":"y"}')
HTTP_STATUS=$(echo "$RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
echo "$RESP" | grep -v "HTTP_STATUS:" | tee "$EVIDENCE_DIR/ROUTE_TEST_INVALID_INTAKE.txt"
if [ "$HTTP_STATUS" != "422" ]; then echo "FAIL: invalid intake expected 422, got $HTTP_STATUS" >&2; exit 1; fi
echo "PASS: invalid intake returned 422"

# Active: valid intake
echo "--- ACTIVE: valid intake ---"
INTAKE_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/intake" \
  -H "content-type: application/json" \
  -d '{"tenantId":"tenant-alpha","requesterId":"user-001","title":"Delivery Evidence Initiative","summary":"Governed initiative for delivery evidence artifact activation"}')
HTTP_STATUS=$(echo "$INTAKE_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
INTAKE_BODY=$(echo "$INTAKE_RESP" | grep -v "HTTP_STATUS:")
echo "$INTAKE_BODY" | tee "$EVIDENCE_DIR/ROUTE_TEST_VALID_INTAKE.txt"
if [ "$HTTP_STATUS" != "201" ]; then echo "FAIL: valid intake expected 201, got $HTTP_STATUS" >&2; exit 1; fi
echo "PASS: valid intake returned 201"

OPP_ID=$(echo "$INTAKE_BODY" | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>console.log(JSON.parse(d).data.opportunity.opportunityId));")
echo "opportunityId: $OPP_ID"

# Active: advance
echo "--- ACTIVE: advance ---"
ADVANCE_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/opportunities/$OPP_ID/advance" \
  -H "content-type: application/json" -H "x-actor-id: operator-001" -H "x-actor-role: board_operator" \
  -d '{"toStage":"BOARD_REVIEW"}')
HTTP_STATUS=$(echo "$ADVANCE_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
echo "$ADVANCE_RESP" | grep -v "HTTP_STATUS:" | tee "$EVIDENCE_DIR/ROUTE_TEST_AUTHORIZED_ADVANCE.txt"
if [ "$HTTP_STATUS" != "200" ]; then echo "FAIL: advance expected 200, got $HTTP_STATUS" >&2; exit 1; fi
echo "PASS: advance returned 200"

# Active: approve
echo "--- ACTIVE: approve ---"
APPROVE_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/opportunities/$OPP_ID/approve" \
  -H "content-type: application/json" -H "x-actor-id: operator-001" -H "x-actor-role: board_operator" \
  -d '{"reason":"Approved for delivery evidence activation"}')
HTTP_STATUS=$(echo "$APPROVE_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
echo "$APPROVE_RESP" | grep -v "HTTP_STATUS:" | tee "$EVIDENCE_DIR/ROUTE_TEST_AUTHORIZED_APPROVE.txt"
if [ "$HTTP_STATUS" != "200" ]; then echo "FAIL: approve expected 200, got $HTTP_STATUS" >&2; exit 1; fi
echo "PASS: approve returned 200"

# Active: create work item
echo "--- ACTIVE: create work item ---"
WI_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/opportunities/$OPP_ID/work-items" \
  -H "content-type: application/json" -H "x-actor-id: operator-001" -H "x-actor-role: board_operator" \
  -d '{"title":"Execution Closure Pack","summary":"Assemble and complete the execution closure pack"}')
HTTP_STATUS=$(echo "$WI_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
WI_BODY=$(echo "$WI_RESP" | grep -v "HTTP_STATUS:")
echo "$WI_BODY" | tee "$EVIDENCE_DIR/ROUTE_TEST_AUTHORIZED_WORK_ITEM_CREATED.txt"
if [ "$HTTP_STATUS" != "201" ]; then echo "FAIL: work item create expected 201, got $HTTP_STATUS" >&2; exit 1; fi
echo "PASS: work item create returned 201"

WI_ID=$(echo "$WI_BODY" | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>console.log(JSON.parse(d).data.item.workItemId));")
echo "workItemId: $WI_ID"

# Blocked: delivery artifact before completion (work item is READY)
echo "--- BLOCKED: delivery before completion ---"
PRECOMP_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/work-items/$WI_ID/delivery-artifacts" \
  -H "content-type: application/json" -H "x-actor-id: operator-001" -H "x-actor-role: board_operator" \
  -d '{"title":"Early artifact","summary":"Trying to create before completion","artifactType":"PREMATURE"}')
HTTP_STATUS=$(echo "$PRECOMP_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
echo "$PRECOMP_RESP" | grep -v "HTTP_STATUS:" | tee "$EVIDENCE_DIR/ROUTE_TEST_PRECOMPLETION_DELIVERY_BLOCKED.txt"
if [ "$HTTP_STATUS" != "422" ]; then echo "FAIL: precompletion delivery expected 422, got $HTTP_STATUS" >&2; exit 1; fi
echo "PASS: precompletion delivery returned 422"

# Active: start work item
echo "--- ACTIVE: start work item ---"
START_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/work-items/$WI_ID/start" \
  -H "x-actor-id: operator-001" -H "x-actor-role: board_operator")
HTTP_STATUS=$(echo "$START_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
echo "$START_RESP" | grep -v "HTTP_STATUS:" | tee "$EVIDENCE_DIR/ROUTE_TEST_AUTHORIZED_START.txt"
if [ "$HTTP_STATUS" != "200" ]; then echo "FAIL: start expected 200, got $HTTP_STATUS" >&2; exit 1; fi
echo "PASS: start returned 200"

# Active: complete work item
echo "--- ACTIVE: complete work item ---"
COMPLETE_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/work-items/$WI_ID/complete" \
  -H "x-actor-id: operator-001" -H "x-actor-role: board_operator")
HTTP_STATUS=$(echo "$COMPLETE_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
echo "$COMPLETE_RESP" | grep -v "HTTP_STATUS:" | tee "$EVIDENCE_DIR/ROUTE_TEST_AUTHORIZED_COMPLETE.txt"
if [ "$HTTP_STATUS" != "200" ]; then echo "FAIL: complete expected 200, got $HTTP_STATUS" >&2; exit 1; fi
echo "PASS: complete returned 200"

# Blocked: unauthorized delivery (system_viewer)
echo "--- BLOCKED: unauthorized delivery ---"
UNAUTH_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/work-items/$WI_ID/delivery-artifacts" \
  -H "content-type: application/json" -H "x-actor-id: viewer-001" -H "x-actor-role: system_viewer" \
  -d '{"title":"Unauthorized artifact","summary":"Viewer trying to create delivery artifact","artifactType":"VIEWER_ATTEMPT"}')
HTTP_STATUS=$(echo "$UNAUTH_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
echo "$UNAUTH_RESP" | grep -v "HTTP_STATUS:" | tee "$EVIDENCE_DIR/ROUTE_TEST_UNAUTHORIZED_DELIVERY_BLOCKED.txt"
if [ "$HTTP_STATUS" != "403" ]; then echo "FAIL: unauthorized delivery expected 403, got $HTTP_STATUS" >&2; exit 1; fi
echo "PASS: unauthorized delivery returned 403"

# Active: create delivery artifact
echo "--- ACTIVE: create delivery artifact ---"
DELIVERY_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/work-items/$WI_ID/delivery-artifacts" \
  -H "content-type: application/json" -H "x-actor-id: operator-001" -H "x-actor-role: board_operator" \
  -d '{"title":"Execution closure pack","summary":"Capture the completed execution output as a governed delivery artifact","artifactType":"CLOSURE_PACK"}')
HTTP_STATUS=$(echo "$DELIVERY_RESP" | grep "HTTP_STATUS:" | cut -d: -f2)
DELIVERY_BODY=$(echo "$DELIVERY_RESP" | grep -v "HTTP_STATUS:")
echo "$DELIVERY_BODY" | tee "$EVIDENCE_DIR/ROUTE_TEST_AUTHORIZED_DELIVERY_CREATED.txt"
if [ "$HTTP_STATUS" != "201" ]; then echo "FAIL: delivery create expected 201, got $HTTP_STATUS" >&2; exit 1; fi
echo "PASS: delivery artifact creation returned 201"

DELIVERY_ID=$(echo "$DELIVERY_BODY" | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>console.log(JSON.parse(d).data.item.deliveryArtifactId));")
echo "deliveryArtifactId: $DELIVERY_ID"

# Delivery list
echo "--- ROUTE: delivery list ---"
curl -sf "$BASE_URL/api/delivery-artifacts" | tee "$EVIDENCE_DIR/ROUTE_TEST_DELIVERY_LIST.txt"
echo ""

# Delivery detail
echo "--- ROUTE: delivery detail ---"
curl -sf "$BASE_URL/api/delivery-artifacts/$DELIVERY_ID" | tee "$EVIDENCE_DIR/ROUTE_TEST_DELIVERY_DETAIL.txt"
echo ""

# Events
echo "--- ROUTE: events ---"
curl -sf "$BASE_URL/api/events" | tee "$EVIDENCE_DIR/ROUTE_TEST_EVENTS.txt"
echo ""

# Browser
echo "--- ROUTE: browser HTML ---"
curl -sf "$BASE_URL/phase49-demo" | tee "$EVIDENCE_DIR/ROUTE_TEST_BROWSER_HTML.txt"
echo ""

echo "--- ROUTE: browser JS ---"
curl -sf "$BASE_URL/phase49-demo/app.js" | tee "$EVIDENCE_DIR/ROUTE_TEST_BROWSER_JS.txt"
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
if (state.workItems.length < 1) errs.push('Expected >=1 work item, got ' + state.workItems.length);
const completedCount = state.workItems.filter(wi => wi.status === 'COMPLETED').length;
if (completedCount < 1) errs.push('Expected >=1 completed work item, got ' + completedCount);
if (state.deliveryArtifacts.length < 1) errs.push('Expected >=1 delivery artifact, got ' + state.deliveryArtifacts.length);
if (state.events.length < 16) errs.push('Expected >=16 events, got ' + state.events.length);
if (errs.length > 0) { console.error('VALIDATION FAILED:\n' + errs.join('\n')); process.exit(1); }
console.log('STATE VALIDATION PASSED');
console.log('  intakes:', state.intakes.length);
console.log('  opportunities:', state.opportunities.length);
console.log('  opportunity.stage:', state.opportunities[0].stage);
console.log('  workItems:', state.workItems.length);
console.log('  completed:', completedCount);
console.log('  deliveryArtifacts:', state.deliveryArtifacts.length);
console.log('  events:', state.events.length);
"

cat > "$EVIDENCE_DIR/SUMMARY.md" << SUMEOF
# Phase ${PHASE} Evidence Summary

## Run
- Date: $(date -u +%Y-%m-%dT%H:%M:%SZ)
- Port: ${PORT}

## Blocked Paths (all passed)
- Invalid intake → HTTP 422
- Delivery artifact before completion → HTTP 422
- Unauthorized delivery artifact (system_viewer) → HTTP 403

## Active Paths (all passed)
- Valid intake → HTTP 201
- Advance to BOARD_REVIEW → HTTP 200
- Approve opportunity → HTTP 200
- Create work item → HTTP 201
- Start work item → HTTP 200
- Complete work item → HTTP 200
- Create delivery artifact → HTTP 201

## State Validation
- 1 intake, 1 opportunity (stage=APPROVED)
- work item count >= 1, completed >= 1
- delivery artifact count >= 1
- event count >= 16
SUMEOF

echo ""
echo "=== PHASE ${PHASE} COMPLETE ==="
echo "EVIDENCE_RUN_DIR=$EVIDENCE_DIR"
