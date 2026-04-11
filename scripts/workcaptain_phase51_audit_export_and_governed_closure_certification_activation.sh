#!/usr/bin/env bash
set -euo pipefail

PHASE=51
PORT=43151
SERVER_SCRIPT="prowork_runtime/api/src/phase51/devServer.js"
STATE_FILE="prowork_runtime/api/data/phase51-runtime.json"
EVIDENCE_DIR="evidence/phase51_$(date +%Y%m%dT%H%M%S)"
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
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/intake" \
  -H "content-type: application/json" \
  -d '{"tenantId":"","requesterId":"","title":"x","summary":"short"}')
assert_status "blocked_intake_invalid" 422 "$STATUS"

# ─── BLOCKED PATH 2: Certification against missing evidence pack (404) ────────
log "--- Blocked: certification for missing evidence pack ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/evidence-packs/ep_nonexistent/certifications" \
  -H "content-type: application/json" \
  -H "x-actor-id: $OPERATOR_ID" \
  -H "x-actor-role: $OPERATOR_ROLE" \
  -d '{"title":"T","summary":"S","certificationType":"CLOSURE_CERTIFICATION"}')
assert_status "blocked_cert_missing_ep" 404 "$STATUS"

# ─── ACTIVE PATH ──────────────────────────────────────────────────────────────
log "--- Active: create intake ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/intake" \
  -H "content-type: application/json" \
  -d "{\"tenantId\":\"tenant_001\",\"requesterId\":\"$REQUESTER_ID\",\"title\":\"Phase 51 Certification\",\"summary\":\"Audit export and governed closure certification for governance\"}")
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
  -d '{"reason":"Meets closure certification requirements"}')
assert_status "approve_opportunity" 200 "$STATUS"

log "--- Active: create work item ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/opportunities/$OPP_ID/work-items" \
  -H "content-type: application/json" \
  -H "x-actor-id: $OPERATOR_ID" \
  -H "x-actor-role: $OPERATOR_ROLE" \
  -d '{"title":"Closure Certification Work Item","summary":"Execute audit export and closure certification"}')
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
  -d '{"title":"Closure Deliverable","summary":"Final delivery artifact for closure certification","artifactType":"EXECUTION_OUTPUT"}')
assert_status "create_delivery_artifact" 201 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/delivery_artifact.json"

DA_ID=$(cat "$TMPBODY" | jq_node "d.data.item.deliveryArtifactId")
log "Delivery artifact: $DA_ID"

log "--- Active: create evidence pack ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/delivery-artifacts/$DA_ID/evidence-packs" \
  -H "content-type: application/json" \
  -H "x-actor-id: $OPERATOR_ID" \
  -H "x-actor-role: $OPERATOR_ROLE" \
  -d '{"title":"Phase 51 Evidence Pack","summary":"Trust closure evidence pack for certification","packType":"DELIVERY_EVIDENCE"}')
assert_status "create_evidence_pack" 201 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/evidence_pack.json"

EP_ID=$(cat "$TMPBODY" | jq_node "d.data.item.evidencePackId")
log "Evidence pack: $EP_ID"

# ─── BLOCKED PATH 3: Unauthorized certification (403) ─────────────────────────
log "--- Blocked: unauthorized certification ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/evidence-packs/$EP_ID/certifications" \
  -H "content-type: application/json" \
  -H "x-actor-id: $REQUESTER_ID" \
  -H "x-actor-role: $REQUESTER_ROLE" \
  -d '{"title":"T","summary":"S","certificationType":"CLOSURE_CERTIFICATION"}')
assert_status "blocked_cert_unauthorized" 403 "$STATUS"

log "--- Active: create certification ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/evidence-packs/$EP_ID/certifications" \
  -H "content-type: application/json" \
  -H "x-actor-id: $OPERATOR_ID" \
  -H "x-actor-role: $OPERATOR_ROLE" \
  -d '{"title":"Phase 51 Closure Certification","summary":"Formal closure certification for governed execution with full audit trail","certificationType":"CLOSURE_CERTIFICATION"}')
assert_status "create_certification" 201 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/certification.json"

CERT_ID=$(cat "$TMPBODY" | jq_node "d.data.item.certificationId")
log "Certification: $CERT_ID"

# ─── GET endpoints ────────────────────────────────────────────────────────────
log "--- Fetching certifications for evidence pack ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/evidence-packs/$EP_ID/certifications")
assert_status "get_certs_for_ep" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/certifications_for_ep.json"

log "--- Fetching all certifications ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/certifications")
assert_status "get_all_certs" 200 "$STATUS"

log "--- Fetching certification by ID ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/certifications/$CERT_ID")
assert_status "get_cert_by_id" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/certification_detail.json"

log "--- Fetching audit export ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/certifications/$CERT_ID/audit-export")
assert_status "get_audit_export" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/audit_export.json"

# ─── State validation ─────────────────────────────────────────────────────────
log "--- State validation ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/state")
assert_status "get_state" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/final_state.json"

STATE=$(cat "$EVIDENCE_DIR/final_state.json")
INTAKE_COUNT=$(echo "$STATE"   | jq_node "d.intakes.length")
OPP_COUNT=$(echo "$STATE"      | jq_node "d.opportunities.length")
WI_COUNT=$(echo "$STATE"       | jq_node "d.workItems.length")
DA_COUNT=$(echo "$STATE"       | jq_node "d.deliveryArtifacts.length")
EP_COUNT=$(echo "$STATE"       | jq_node "d.evidencePacks.length")
CERT_COUNT=$(echo "$STATE"     | jq_node "d.certifications.length")
EVENT_COUNT=$(echo "$STATE"    | jq_node "d.events.length")
OPP_STAGE=$(echo "$STATE"      | jq_node "d.opportunities[0] ? d.opportunities[0].stage : 'none'")
WI_STATUS=$(echo "$STATE"      | jq_node "d.workItems[0] ? d.workItems[0].status : 'none'")
CERT_STATE=$(echo "$STATE"     | jq_node "d.certifications[0] ? d.certifications[0].certificationState : 'none'")
AUDIT_STATE=$(echo "$STATE"    | jq_node "d.certifications[0] ? d.certifications[0].auditExportState : 'none'")

log "intakeCount=$INTAKE_COUNT oppCount=$OPP_COUNT wiCount=$WI_COUNT daCount=$DA_COUNT epCount=$EP_COUNT certCount=$CERT_COUNT eventCount=$EVENT_COUNT"

[ "$INTAKE_COUNT" -ge 1 ] || fail "intakeCount must be >= 1, got $INTAKE_COUNT"
[ "$OPP_COUNT"    -ge 1 ] || fail "opportunityCount must be >= 1, got $OPP_COUNT"
[ "$WI_COUNT"     -ge 1 ] || fail "workItemCount must be >= 1, got $WI_COUNT"
[ "$DA_COUNT"     -ge 1 ] || fail "deliveryArtifactCount must be >= 1, got $DA_COUNT"
[ "$EP_COUNT"     -ge 1 ] || fail "evidencePackCount must be >= 1, got $EP_COUNT"
[ "$CERT_COUNT"   -ge 1 ] || fail "certificationCount must be >= 1, got $CERT_COUNT"
assert_gte "eventCount" "$EVENT_COUNT" 22

[ "$OPP_STAGE" = "APPROVED"    ] || fail "opportunity stage must be APPROVED, got $OPP_STAGE"
[ "$WI_STATUS" = "COMPLETED"   ] || fail "work item status must be COMPLETED, got $WI_STATUS"
[ "$CERT_STATE" = "CERTIFIED"  ] || fail "certification.certificationState must be CERTIFIED, got $CERT_STATE"
[ "$AUDIT_STATE" = "EXPORT_READY" ] || fail "certification.auditExportState must be EXPORT_READY, got $AUDIT_STATE"

log "OK state validation passed"

# ─── Summary ──────────────────────────────────────────────────────────────────
log "=== Phase $PHASE Evidence Run COMPLETE ==="
log "EVIDENCE_RUN_DIR=$EVIDENCE_DIR"
echo ""
echo "EVIDENCE_RUN_DIR=$EVIDENCE_DIR"
