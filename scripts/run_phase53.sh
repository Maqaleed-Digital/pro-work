#!/usr/bin/env bash
set -euo pipefail

PHASE=53
PORT=43153
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

STATE_FILE="prowork_runtime/api/data/phase53-runtime.json"
EVIDENCE_DIR="${EVIDENCE_RUN_DIR:-evidence/phase53_$(date +%Y%m%dT%H%M%S)}"
mkdir -p "$EVIDENCE_DIR"
LOG="$EVIDENCE_DIR/run.log"
TMPBODY=$(mktemp)
SERVER_JS="$REPO_ROOT/.tmp_phase53_server.js"

log() { echo "[$(date +%T)] $*" | tee -a "$LOG"; }
fail() { log "FAIL: $*"; exit 1; }

assert_status() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" -ne "$expected" ]; then fail "$label — expected HTTP $expected, got HTTP $actual"; fi
  log "OK $label (HTTP $actual)"
}

jq_node() { node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log($1)"; }

log "=== Phase $PHASE Evidence Run ==="
rm -f "$STATE_FILE"

cat > "$SERVER_JS" <<'NODESCRIPT'
const http = require("http");
const path = require("path");
const REPO = process.env.PHASE53_REPO_ROOT;
const handlers = require(path.join(REPO, "prowork_runtime/api/src/phase51/governedHandlers"));
const { readState } = require(path.join(REPO, "prowork_runtime/api/src/phase51/governedStore"));
const { createPhase53Module } = require(path.join(REPO, "prowork_runtime/api/src/phase53/phase53Module"));
const { createPhase52Module } = require(path.join(REPO, "prowork_runtime/api/src/phase52/phase52Module"));

const PORT = Number(process.env.PORT || "43153");

function resolveState() {
  const s = readState();
  return {
    opportunities: s.opportunities || [],
    workItems: s.workItems || [],
    deliveryArtifacts: s.deliveryArtifacts || [],
    evidencePacks: s.evidencePacks || [],
    certifications: s.certifications || []
  };
}

const phase52 = createPhase52Module({ resolveState });
const phase53 = createPhase53Module({ resolveState });

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", c => { body += c; });
    req.on("end", () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { resolve({}); } });
    req.on("error", reject);
  });
}

function send(res, result) { res.writeHead(result.statusCode, result.headers); res.end(result.body); }

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-actor-id, x-actor-role");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  const { method, url } = req;
  let m;
  try {
    if (method === "GET" && url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, phase: 53, port: PORT }));
      return;
    }
    if (method === "GET" && url === "/api/state") {
      const state = readState();
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(state, null, 2));
      return;
    }
    // Phase 53 routes first
    if (await phase53.route(req, res, url) !== false) return;
    // Phase 52 routes
    if (await phase52.route(req, res, url) !== false) return;
    // Phase 51 routes
    if (method === "POST" && url === "/api/intake") { send(res, handlers.createIntake(await parseBody(req))); return; }
    if (method === "GET" && url === "/api/opportunities") { send(res, handlers.getOpportunities()); return; }
    if (method === "GET" && (m = url.match(/^\/api\/opportunities\/([^/]+)$/))) { send(res, handlers.getOpportunityById(m[1])); return; }
    if (method === "POST" && (m = url.match(/^\/api\/opportunities\/([^/]+)\/advance$/))) { send(res, handlers.advanceOpportunityStage(m[1], await parseBody(req), req.headers)); return; }
    if (method === "POST" && (m = url.match(/^\/api\/opportunities\/([^/]+)\/approve$/))) { send(res, handlers.approveOpportunity(m[1], await parseBody(req), req.headers)); return; }
    if (method === "POST" && (m = url.match(/^\/api\/opportunities\/([^/]+)\/work-items$/))) { send(res, handlers.createWorkItem(m[1], await parseBody(req), req.headers)); return; }
    if (method === "POST" && (m = url.match(/^\/api\/work-items\/([^/]+)\/start$/))) { send(res, handlers.startWorkItem(m[1], req.headers)); return; }
    if (method === "POST" && (m = url.match(/^\/api\/work-items\/([^/]+)\/complete$/))) { send(res, handlers.completeWorkItem(m[1], req.headers)); return; }
    if (method === "POST" && (m = url.match(/^\/api\/work-items\/([^/]+)\/delivery-artifacts$/))) { send(res, handlers.createDeliveryArtifact(m[1], await parseBody(req), req.headers)); return; }
    if (method === "POST" && (m = url.match(/^\/api\/delivery-artifacts\/([^/]+)\/evidence-packs$/))) { send(res, handlers.createEvidencePack(m[1], await parseBody(req), req.headers)); return; }
    if (method === "POST" && (m = url.match(/^\/api\/evidence-packs\/([^/]+)\/certifications$/))) { send(res, handlers.createCertification(m[1], await parseBody(req), req.headers)); return; }
    if (method === "GET" && url === "/api/events") { send(res, handlers.getEvents()); return; }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, code: "NOT_FOUND" }));
  } catch (err) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, code: "INTERNAL_ERROR", error: err.message }));
  }
});

server.listen(PORT, () => console.log(`Phase 53 server running on port ${PORT}`));
NODESCRIPT

log "Starting Phase 53 server on port $PORT"
PORT=$PORT PHASE53_REPO_ROOT=$REPO_ROOT node "$SERVER_JS" >> "$LOG" 2>&1 &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true; rm -f $TMPBODY $SERVER_JS" EXIT

READY=0
for _ in $(seq 1 40); do
  if curl -fsS "http://localhost:$PORT/health" >/dev/null 2>&1; then READY=1; break; fi
  sleep 0.25
done
[ "$READY" = "1" ] || { cat "$LOG"; fail "Server did not start"; }

HEALTH=$(curl -sf "http://localhost:$PORT/health")
log "Health: $HEALTH"

# Full flow
log "--- Active flow ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/intake" \
  -H "content-type: application/json" \
  -d '{"tenantId":"tenant_001","requesterId":"req_001","title":"Phase 53 AI Insight","summary":"AI board insight and anomaly detection integration test"}')
assert_status "create_intake" 201 "$STATUS"

OPP_ID=$(cat "$TMPBODY" | jq_node "d.data.opportunity.opportunityId")
log "Opportunity: $OPP_ID"

STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/opportunities/$OPP_ID/advance" \
  -H "content-type: application/json" -H "x-actor-id: op1" -H "x-actor-role: board_operator" \
  -d '{"toStage":"BOARD_REVIEW"}')
assert_status "advance" 200 "$STATUS"

STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/opportunities/$OPP_ID/approve" \
  -H "content-type: application/json" -H "x-actor-id: op1" -H "x-actor-role: board_operator" \
  -d '{"reason":"Approved for insight test"}')
assert_status "approve" 200 "$STATUS"

STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/opportunities/$OPP_ID/work-items" \
  -H "content-type: application/json" -H "x-actor-id: op1" -H "x-actor-role: board_operator" \
  -d '{"title":"AI insight work item","summary":"Execute AI insight work item"}')
assert_status "create_work_item" 201 "$STATUS"

WI_ID=$(cat "$TMPBODY" | jq_node "d.data.item.workItemId")

# Check anomalies BEFORE completion - work item not completed should appear
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/board/anomalies")
assert_status "anomalies_pre_complete" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/anomalies_pre_complete.json"
WI_ANOMALY=$(cat "$TMPBODY" | jq_node "d.data.filter(a=>a.type==='WORK_ITEM_NOT_COMPLETED').length")
[ "$WI_ANOMALY" -ge 1 ] || fail "Expected WORK_ITEM_NOT_COMPLETED anomaly before completion, got $WI_ANOMALY"
log "OK anomaly detected before completion: $WI_ANOMALY"

STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/work-items/$WI_ID/start" \
  -H "x-actor-id: op1" -H "x-actor-role: board_operator")
assert_status "start" 200 "$STATUS"

STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/work-items/$WI_ID/complete" \
  -H "x-actor-id: op1" -H "x-actor-role: board_operator")
assert_status "complete" 200 "$STATUS"

STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/work-items/$WI_ID/delivery-artifacts" \
  -H "content-type: application/json" -H "x-actor-id: op1" -H "x-actor-role: board_operator" \
  -d '{"title":"AI artifact","summary":"AI insight delivery artifact","artifactType":"INSIGHT_PACK"}')
assert_status "create_delivery_artifact" 201 "$STATUS"

DA_ID=$(cat "$TMPBODY" | jq_node "d.data.item.deliveryArtifactId")

STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/delivery-artifacts/$DA_ID/evidence-packs" \
  -H "content-type: application/json" -H "x-actor-id: op1" -H "x-actor-role: board_operator" \
  -d '{"title":"AI evidence pack","summary":"AI insight evidence pack","packType":"INSIGHT_EVIDENCE"}')
assert_status "create_evidence_pack" 201 "$STATUS"

EP_ID=$(cat "$TMPBODY" | jq_node "d.data.item.evidencePackId")

# Check anomalies BEFORE certification - MISSING_CERTIFICATION should appear
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/board/anomalies")
assert_status "anomalies_pre_cert" 200 "$STATUS"
CERT_ANOMALY=$(cat "$TMPBODY" | jq_node "d.data.filter(a=>a.type==='MISSING_CERTIFICATION').length")
[ "$CERT_ANOMALY" -ge 1 ] || fail "Expected MISSING_CERTIFICATION anomaly, got $CERT_ANOMALY"
log "OK MISSING_CERTIFICATION anomaly detected: $CERT_ANOMALY"

STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/evidence-packs/$EP_ID/certifications" \
  -H "content-type: application/json" -H "x-actor-id: op1" -H "x-actor-role: board_operator" \
  -d '{"title":"AI insight certification","summary":"Governed closure certification for AI insight","certificationType":"BOARD_ASSURANCE"}')
assert_status "create_certification" 201 "$STATUS"

# Phase 53 route tests
log "--- Phase 53 routes ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/board/insights")
assert_status "board_insights" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/board_insights.json"
TOTAL_ANOMALIES=$(cat "$TMPBODY" | jq_node "d.data.totalAnomalies")
log "OK board insights: totalAnomalies=$TOTAL_ANOMALIES"

STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/board/anomalies")
assert_status "board_anomalies" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/board_anomalies.json"

log "=== Phase $PHASE Evidence Run COMPLETE ==="
log "EVIDENCE_RUN_DIR=$EVIDENCE_DIR"
echo ""
echo "PHASE_53_PASS"
echo "EVIDENCE_RUN_DIR=$EVIDENCE_DIR"
