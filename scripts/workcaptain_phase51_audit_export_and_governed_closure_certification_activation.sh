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

READY=0
for _ in $(seq 1 40); do
  if curl -fsS "http://localhost:$PORT/health" >/dev/null 2>&1; then READY=1; break; fi
  sleep 0.25
done
[ "$READY" = "1" ] || { cat "$LOG"; fail "Server did not start"; }

# ─── Health check ─────────────────────────────────────────────────────────────
HEALTH=$(curl -sf "http://localhost:$PORT/health")
log "Health: $HEALTH"
echo "$HEALTH" > "$EVIDENCE_DIR/ROUTE_TEST_HEALTH.txt"

# ─── BLOCKED PATH 1: Invalid intake (422) ─────────────────────────────────────
log "--- Blocked: invalid intake ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/intake" \
  -H "content-type: application/json" \
  -d '{"tenantId":"","requesterId":"","title":"x","summary":"short"}')
assert_status "ROUTE_TEST_INVALID_INTAKE" 422 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/ROUTE_TEST_INVALID_INTAKE.txt"

# ─── BLOCKED PATH 2: Certification against missing evidence pack (404) ────────
log "--- Blocked: certification for missing evidence pack ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/evidence-packs/ep_nonexistent/certifications" \
  -H "content-type: application/json" \
  -H "x-actor-id: $OPERATOR_ID" \
  -H "x-actor-role: $OPERATOR_ROLE" \
  -d '{"title":"T","summary":"S","certificationType":"CLOSURE_CERTIFICATION"}')
assert_status "ROUTE_TEST_MISSING_EVIDENCE_PACK_CERTIFICATION_BLOCKED" 404 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/ROUTE_TEST_MISSING_EVIDENCE_PACK_CERTIFICATION_BLOCKED.txt"

# ─── ACTIVE PATH ──────────────────────────────────────────────────────────────
log "--- Active: create intake ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/intake" \
  -H "content-type: application/json" \
  -d "{\"tenantId\":\"tenant_001\",\"requesterId\":\"$REQUESTER_ID\",\"title\":\"Phase 51 Certification\",\"summary\":\"Audit export and governed closure certification for governance\"}")
assert_status "ROUTE_TEST_VALID_INTAKE" 201 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/ROUTE_TEST_VALID_INTAKE.txt"

OPP_ID=$(cat "$TMPBODY" | jq_node "d.data.opportunity.opportunityId")
log "Opportunity: $OPP_ID"

log "--- Active: advance opportunity ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/opportunities/$OPP_ID/advance" \
  -H "content-type: application/json" \
  -H "x-actor-id: $OPERATOR_ID" \
  -H "x-actor-role: $OPERATOR_ROLE" \
  -d '{"toStage":"BOARD_REVIEW"}')
assert_status "ROUTE_TEST_AUTHORIZED_ADVANCE" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/ROUTE_TEST_AUTHORIZED_ADVANCE.txt"

log "--- Active: approve opportunity ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/opportunities/$OPP_ID/approve" \
  -H "content-type: application/json" \
  -H "x-actor-id: $OPERATOR_ID" \
  -H "x-actor-role: $OPERATOR_ROLE" \
  -d '{"reason":"Meets closure certification requirements"}')
assert_status "ROUTE_TEST_AUTHORIZED_APPROVE" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/ROUTE_TEST_AUTHORIZED_APPROVE.txt"

log "--- Active: create work item ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/opportunities/$OPP_ID/work-items" \
  -H "content-type: application/json" \
  -H "x-actor-id: $OPERATOR_ID" \
  -H "x-actor-role: $OPERATOR_ROLE" \
  -d '{"title":"Closure Certification Work Item","summary":"Execute audit export and closure certification"}')
assert_status "ROUTE_TEST_AUTHORIZED_WORK_ITEM_CREATED" 201 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/ROUTE_TEST_AUTHORIZED_WORK_ITEM_CREATED.txt"

WI_ID=$(cat "$TMPBODY" | jq_node "d.data.item.workItemId")
log "Work item: $WI_ID"

log "--- Active: start work item ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/work-items/$WI_ID/start" \
  -H "x-actor-id: $OPERATOR_ID" \
  -H "x-actor-role: $OPERATOR_ROLE")
assert_status "ROUTE_TEST_AUTHORIZED_START" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/ROUTE_TEST_AUTHORIZED_START.txt"

log "--- Active: complete work item ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/work-items/$WI_ID/complete" \
  -H "x-actor-id: $OPERATOR_ID" \
  -H "x-actor-role: $OPERATOR_ROLE")
assert_status "ROUTE_TEST_AUTHORIZED_COMPLETE" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/ROUTE_TEST_AUTHORIZED_COMPLETE.txt"

log "--- Active: create delivery artifact ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/work-items/$WI_ID/delivery-artifacts" \
  -H "content-type: application/json" \
  -H "x-actor-id: $OPERATOR_ID" \
  -H "x-actor-role: $OPERATOR_ROLE" \
  -d '{"title":"Closure Deliverable","summary":"Final delivery artifact for closure certification","artifactType":"CLOSURE_PACK"}')
assert_status "ROUTE_TEST_AUTHORIZED_DELIVERY_CREATED" 201 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/ROUTE_TEST_AUTHORIZED_DELIVERY_CREATED.txt"

DA_ID=$(cat "$TMPBODY" | jq_node "d.data.item.deliveryArtifactId")
log "Delivery artifact: $DA_ID"

log "--- Active: create evidence pack ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/delivery-artifacts/$DA_ID/evidence-packs" \
  -H "content-type: application/json" \
  -H "x-actor-id: $OPERATOR_ID" \
  -H "x-actor-role: $OPERATOR_ROLE" \
  -d '{"title":"Trust closure pack","summary":"Capture the trust-bearing closure evidence pack.","packType":"AUDIT_EXPORT"}')
assert_status "ROUTE_TEST_AUTHORIZED_EVIDENCE_PACK_CREATED" 201 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/ROUTE_TEST_AUTHORIZED_EVIDENCE_PACK_CREATED.txt"

EP_ID=$(cat "$TMPBODY" | jq_node "d.data.item.evidencePackId")
log "Evidence pack: $EP_ID"

# ─── BLOCKED PATH 3: Unauthorized certification (403) ─────────────────────────
log "--- Blocked: unauthorized certification ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/evidence-packs/$EP_ID/certifications" \
  -H "content-type: application/json" \
  -H "x-actor-id: $REQUESTER_ID" \
  -H "x-actor-role: $REQUESTER_ROLE" \
  -d '{"title":"T","summary":"S","certificationType":"CLOSURE_CERTIFICATION"}')
assert_status "ROUTE_TEST_UNAUTHORIZED_CERTIFICATION_BLOCKED" 403 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/ROUTE_TEST_UNAUTHORIZED_CERTIFICATION_BLOCKED.txt"

log "--- Active: create certification ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/evidence-packs/$EP_ID/certifications" \
  -H "content-type: application/json" \
  -H "x-actor-id: $OPERATOR_ID" \
  -H "x-actor-role: $OPERATOR_ROLE" \
  -d '{"title":"Closure certification record","summary":"Capture the first governed closure certification from an evidence pack.","certificationType":"BOARD_ASSURANCE"}')
assert_status "ROUTE_TEST_AUTHORIZED_CERTIFICATION_CREATED" 201 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/ROUTE_TEST_AUTHORIZED_CERTIFICATION_CREATED.txt"

CERT_ID=$(cat "$TMPBODY" | jq_node "d.data.item.certificationId")
log "Certification: $CERT_ID"

# ─── GET endpoints ────────────────────────────────────────────────────────────
log "--- Fetching certification list ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/evidence-packs/$EP_ID/certifications")
assert_status "ROUTE_TEST_CERTIFICATION_LIST" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/ROUTE_TEST_CERTIFICATION_LIST.txt"

log "--- Fetching certification detail ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/certifications/$CERT_ID")
assert_status "ROUTE_TEST_CERTIFICATION_DETAIL" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/ROUTE_TEST_CERTIFICATION_DETAIL.txt"

log "--- Fetching audit export ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/certifications/$CERT_ID/audit-export")
assert_status "ROUTE_TEST_AUDIT_EXPORT" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/ROUTE_TEST_AUDIT_EXPORT.txt"

log "--- Fetching events ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/events")
assert_status "ROUTE_TEST_EVENTS" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/ROUTE_TEST_EVENTS.txt"

log "--- Fetching browser demo HTML ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/phase51-demo")
assert_status "ROUTE_TEST_BROWSER_HTML" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/ROUTE_TEST_BROWSER_HTML.txt"

log "--- Fetching browser demo JS ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/phase51-demo/app.js")
assert_status "ROUTE_TEST_BROWSER_JS" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/ROUTE_TEST_BROWSER_JS.txt"

# ─── State validation ─────────────────────────────────────────────────────────
log "--- State validation ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/state")
assert_status "get_state" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/STATE_SNAPSHOT.json"

STATE=$(cat "$EVIDENCE_DIR/STATE_SNAPSHOT.json")
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

[ "$OPP_STAGE"   = "APPROVED"      ] || fail "opportunity stage must be APPROVED, got $OPP_STAGE"
[ "$WI_STATUS"   = "COMPLETED"     ] || fail "work item status must be COMPLETED, got $WI_STATUS"
[ "$CERT_STATE"  = "CERTIFIED"     ] || fail "certification.certificationState must be CERTIFIED, got $CERT_STATE"
[ "$AUDIT_STATE" = "EXPORT_READY"  ] || fail "certification.auditExportState must be EXPORT_READY, got $AUDIT_STATE"

log "OK state validation passed"

# Write SUMMARY.md
cat > "$EVIDENCE_DIR/SUMMARY.md" <<EOF_SUMMARY
# Phase 51 Execution Summary

Status: PASS

Evidence directory: $EVIDENCE_DIR
Server: $SERVER_SCRIPT (port $PORT)

Checks:
- health route PASS
- invalid intake blocked with 422 PASS
- missing evidence pack certification blocked with 404 PASS
- valid intake accepted with 201 PASS
- authorized advance accepted with 200 PASS
- authorized approve accepted with 200 PASS
- authorized work item creation accepted with 201 PASS
- authorized start accepted with 200 PASS
- authorized complete accepted with 200 PASS
- authorized delivery artifact created with 201 PASS
- authorized evidence pack created with 201 PASS
- unauthorized certification blocked with 403 PASS
- authorized certification created with 201 PASS
- certification list route PASS
- certification detail route PASS
- audit export route PASS
- events route PASS
- browser demo HTML served PASS
- browser demo JS served PASS

State: intakeCount=$INTAKE_COUNT, oppCount=$OPP_COUNT, wiCount=$WI_COUNT, daCount=$DA_COUNT, epCount=$EP_COUNT, certCount=$CERT_COUNT, eventCount=$EVENT_COUNT
EOF_SUMMARY

# ─── Summary ──────────────────────────────────────────────────────────────────
log "=== Phase $PHASE Evidence Run COMPLETE ==="
log "EVIDENCE_RUN_DIR=$EVIDENCE_DIR"
echo ""
echo "PHASE_51_PASS"
echo "EVIDENCE_RUN_DIR=$EVIDENCE_DIR"
