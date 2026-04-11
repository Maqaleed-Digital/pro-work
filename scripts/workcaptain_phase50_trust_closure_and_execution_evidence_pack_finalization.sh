#!/usr/bin/env bash
set -euo pipefail

PHASE=50
PORT=43150
SERVER_SCRIPT="prowork_runtime/api/src/phase50/devServer.js"
STATE_FILE="prowork_runtime/api/data/phase50-runtime.json"
EVIDENCE_DIR="evidence/phase50_$(date +%Y%m%dT%H%M%S)"
OPERATOR_ID="operator_evidence_run"
OPERATOR_ROLE="board_operator"
REQUESTER_ID="requester_evidence_run"
REQUESTER_ROLE="requester"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

mkdir -p "$EVIDENCE_DIR"
LOG="$EVIDENCE_DIR/run.log"
TMPBODY=$(mktemp)
trap "rm -f $TMPBODY" EXIT

log() { echo "[$(date +%T)] $*" | tee -a "$LOG"; }
fail() { log "FAIL: $*"; exit 1; }

assert_status() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" -ne "$expected" ]; then
    fail "$label — expected HTTP $expected, got HTTP $actual"
  fi
  log "OK $label (HTTP $actual)"
}

assert_gte() {
  local label="$1" actual="$2" min="$3"
  if [ "$actual" -lt "$min" ]; then
    fail "$label — expected >= $min, got $actual"
  fi
  log "OK $label ($actual >= $min)"
}

jq_node() {
  node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log($1)"
}

# ─── Clean state ──────────────────────────────────────────────────────────────
log "=== Phase $PHASE Evidence Run ==="
log "Cleaning state file"
rm -f "$STATE_FILE"

# ─── Start server ─────────────────────────────────────────────────────────────
log "Starting dev server on port $PORT"
node "$SERVER_SCRIPT" >> "$LOG" 2>&1 &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true; rm -f $TMPBODY" EXIT

sleep 1

# ─── Health check ─────────────────────────────────────────────────────────────
HEALTH=$(curl -sf "http://localhost:$PORT/health") || fail "Health check failed"
log "Health: $HEALTH"

# ─── BLOCKED PATH 1: Invalid intake (422) ─────────────────────────────────────
log "--- Blocked: invalid intake ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/intakes" \
  -H "content-type: application/json" \
  -d '{"tenantId":"","requesterId":"","title":"x","summary":"short"}')
assert_status "blocked_intake_invalid" 422 "$STATUS"

# ─── BLOCKED PATH 2: Evidence pack against missing delivery artifact (404) ────
log "--- Blocked: evidence pack for missing delivery artifact ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/delivery-artifacts/da_nonexistent/evidence-packs" \
  -H "content-type: application/json" \
  -H "x-actor-id: $OPERATOR_ID" \
  -H "x-actor-role: $OPERATOR_ROLE" \
  -d '{"title":"T","summary":"S","packType":"DELIVERY_EVIDENCE"}')
assert_status "blocked_ep_missing_da" 404 "$STATUS"

# ─── ACTIVE PATH ──────────────────────────────────────────────────────────────
log "--- Active: create intake ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/intakes" \
  -H "content-type: application/json" \
  -d "{\"tenantId\":\"tenant_001\",\"requesterId\":\"$REQUESTER_ID\",\"title\":\"Phase 50 Trust Closure\",\"summary\":\"Full trust closure and evidence pack finalization for governance\"}")
assert_status "create_intake" 201 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/intake.json"

OPP_ID=$(cat "$TMPBODY" | jq_node "d.data.opportunity.opportunityId")
log "Opportunity: $OPP_ID"

log "--- Active: advance opportunity ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/opportunities/$OPP_ID/advance" \
  -H "content-type: application/json" \
  -H "x-actor-id: $OPERATOR_ID" \
  -H "x-actor-role: $OPERATOR_ROLE" \
  -d '{"toStage":"BOARD_REVIEW"}')
assert_status "advance_opportunity" 200 "$STATUS"

log "--- Active: approve opportunity ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/opportunities/$OPP_ID/approve" \
  -H "content-type: application/json" \
  -H "x-actor-id: $OPERATOR_ID" \
  -H "x-actor-role: $OPERATOR_ROLE" \
  -d '{"reason":"Meets trust closure requirements"}')
assert_status "approve_opportunity" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/approve.json"

log "--- Active: create work item ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/opportunities/$OPP_ID/work-items" \
  -H "content-type: application/json" \
  -H "x-actor-id: $OPERATOR_ID" \
  -H "x-actor-role: $OPERATOR_ROLE" \
  -d '{"title":"Trust Closure Work Item","summary":"Execute trust closure and finalize evidence packs"}')
assert_status "create_work_item" 201 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/workitem.json"

WI_ID=$(cat "$TMPBODY" | jq_node "d.data.item.workItemId")
log "Work item: $WI_ID"

log "--- Active: start work item ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/work-items/$WI_ID/start" \
  -H "x-actor-id: $OPERATOR_ID" \
  -H "x-actor-role: $OPERATOR_ROLE")
assert_status "start_work_item" 200 "$STATUS"

log "--- Active: complete work item ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/work-items/$WI_ID/complete" \
  -H "x-actor-id: $OPERATOR_ID" \
  -H "x-actor-role: $OPERATOR_ROLE")
assert_status "complete_work_item" 200 "$STATUS"

log "--- Active: create delivery artifact ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/work-items/$WI_ID/delivery-artifacts" \
  -H "content-type: application/json" \
  -H "x-actor-id: $OPERATOR_ID" \
  -H "x-actor-role: $OPERATOR_ROLE" \
  -d '{"title":"Trust Closure Deliverable","summary":"Final delivery artifact for trust closure execution","artifactType":"EXECUTION_OUTPUT"}')
assert_status "create_delivery_artifact" 201 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/delivery_artifact.json"

DA_ID=$(cat "$TMPBODY" | jq_node "d.data.item.deliveryArtifactId")
log "Delivery artifact: $DA_ID"

# ─── BLOCKED PATH 3: Unauthorized evidence pack (403) ─────────────────────────
log "--- Blocked: unauthorized evidence pack ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/delivery-artifacts/$DA_ID/evidence-packs" \
  -H "content-type: application/json" \
  -H "x-actor-id: $REQUESTER_ID" \
  -H "x-actor-role: $REQUESTER_ROLE" \
  -d '{"title":"T","summary":"S","packType":"DELIVERY_EVIDENCE"}')
assert_status "blocked_ep_unauthorized" 403 "$STATUS"

log "--- Active: create evidence pack ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/delivery-artifacts/$DA_ID/evidence-packs" \
  -H "content-type: application/json" \
  -H "x-actor-id: $OPERATOR_ID" \
  -H "x-actor-role: $OPERATOR_ROLE" \
  -d '{"title":"Phase 50 Evidence Pack","summary":"Trust closure evidence pack finalized with full chain of custody","packType":"DELIVERY_EVIDENCE"}')
assert_status "create_evidence_pack" 201 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/evidence_pack.json"

EP_ID=$(cat "$TMPBODY" | jq_node "d.data.item.evidencePackId")
log "Evidence pack: $EP_ID"

# ─── GET endpoints ────────────────────────────────────────────────────────────
log "--- Fetching evidence packs for delivery artifact ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/delivery-artifacts/$DA_ID/evidence-packs")
assert_status "get_ep_for_da" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/evidence_packs_for_da.json"

log "--- Fetching all evidence packs ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/evidence-packs")
assert_status "get_all_eps" 200 "$STATUS"

log "--- Fetching evidence pack by ID ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/evidence-packs/$EP_ID")
assert_status "get_ep_by_id" 200 "$STATUS"

log "--- Fetching delivery artifact by ID ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/delivery-artifacts/$DA_ID")
assert_status "get_da_by_id" 200 "$STATUS"

# ─── State validation ─────────────────────────────────────────────────────────
log "--- State validation ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/state")
assert_status "get_state" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/final_state.json"

STATE=$(cat "$EVIDENCE_DIR/final_state.json")
INTAKE_COUNT=$(echo "$STATE"  | jq_node "d.intakes.length")
OPP_COUNT=$(echo "$STATE"    | jq_node "d.opportunities.length")
WI_COUNT=$(echo "$STATE"     | jq_node "d.workItems.length")
DA_COUNT=$(echo "$STATE"     | jq_node "d.deliveryArtifacts.length")
EP_COUNT=$(echo "$STATE"     | jq_node "d.evidencePacks.length")
EVENT_COUNT=$(echo "$STATE"  | jq_node "d.events.length")
WI_STATUS=$(echo "$STATE"    | jq_node "d.workItems[0] ? d.workItems[0].status : 'none'")
OPP_STAGE=$(echo "$STATE"    | jq_node "d.opportunities[0] ? d.opportunities[0].stage : 'none'")
EP_TRUST=$(echo "$STATE"     | jq_node "d.evidencePacks[0] ? d.evidencePacks[0].trustState : 'none'")
EP_EXPORT=$(echo "$STATE"    | jq_node "d.evidencePacks[0] ? d.evidencePacks[0].exportState : 'none'")

log "intakeCount=$INTAKE_COUNT oppCount=$OPP_COUNT wiCount=$WI_COUNT daCount=$DA_COUNT epCount=$EP_COUNT eventCount=$EVENT_COUNT"

[ "$INTAKE_COUNT" -ge 1 ] || fail "intakeCount must be >= 1, got $INTAKE_COUNT"
[ "$OPP_COUNT"    -ge 1 ] || fail "opportunityCount must be >= 1, got $OPP_COUNT"
[ "$WI_COUNT"     -ge 1 ] || fail "workItemCount must be >= 1, got $WI_COUNT"
[ "$DA_COUNT"     -ge 1 ] || fail "deliveryArtifactCount must be >= 1, got $DA_COUNT"
[ "$EP_COUNT"     -ge 1 ] || fail "evidencePackCount must be >= 1, got $EP_COUNT"
assert_gte "eventCount" "$EVENT_COUNT" 19

[ "$OPP_STAGE" = "APPROVED"       ] || fail "opportunity stage must be APPROVED, got $OPP_STAGE"
[ "$WI_STATUS" = "COMPLETED"      ] || fail "work item status must be COMPLETED, got $WI_STATUS"
[ "$EP_TRUST"  = "TRUST_CAPTURED" ] || fail "evidencePack.trustState must be TRUST_CAPTURED, got $EP_TRUST"
[ "$EP_EXPORT" = "PACK_VISIBLE"   ] || fail "evidencePack.exportState must be PACK_VISIBLE, got $EP_EXPORT"

log "OK state validation passed"

# ─── Summary ──────────────────────────────────────────────────────────────────
log "=== Phase $PHASE Evidence Run COMPLETE ==="
log "EVIDENCE_RUN_DIR=$EVIDENCE_DIR"
echo ""
echo "EVIDENCE_RUN_DIR=$EVIDENCE_DIR"
