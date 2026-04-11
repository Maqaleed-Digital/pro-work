#!/usr/bin/env bash
set -euo pipefail

PHASE=56
PORT=43156
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

STATE_FILE="prowork_runtime/api/data/phase51-runtime.json"
EVIDENCE_DIR="${EVIDENCE_RUN_DIR:-evidence/phase56_$(date +%Y%m%dT%H%M%S)}"
mkdir -p "$EVIDENCE_DIR"
LOG="$EVIDENCE_DIR/run.log"
TMPBODY=$(mktemp)
SERVER_JS="$REPO_ROOT/.tmp_phase56_server.js"

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
const REPO = process.env.PHASE56_REPO_ROOT;
const handlers = require(path.join(REPO, "prowork_runtime/api/src/phase51/governedHandlers"));
const { readState } = require(path.join(REPO, "prowork_runtime/api/src/phase51/governedStore"));
const { createPhase56Module } = require(path.join(REPO, "prowork_runtime/api/src/phase56/phase56Module"));
const { createPhase55Module } = require(path.join(REPO, "prowork_runtime/api/src/phase55/phase55Module"));
const { createPhase54Module } = require(path.join(REPO, "prowork_runtime/api/src/phase54/phase54Module"));
const { createPhase53Module } = require(path.join(REPO, "prowork_runtime/api/src/phase53/phase53Module"));
const { createPhase52Module } = require(path.join(REPO, "prowork_runtime/api/src/phase52/phase52Module"));

const PORT = Number(process.env.PORT || "43156");

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
const phase54 = createPhase54Module({ resolveState });
const phase55 = createPhase55Module({ resolveState });
const phase56 = createPhase56Module({ resolveState });

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
      res.end(JSON.stringify({ ok: true, phase: 56, port: PORT }));
      return;
    }
    if (await phase56.route(req, res, url) !== false) return;
    if (await phase55.route(req, res, url) !== false) return;
    if (await phase54.route(req, res, url) !== false) return;
    if (await phase53.route(req, res, url) !== false) return;
    if (await phase52.route(req, res, url) !== false) return;
    if (method === "POST" && url === "/api/intake") { send(res, handlers.createIntake(await parseBody(req))); return; }
    if (method === "GET" && url === "/api/opportunities") { send(res, handlers.getOpportunities()); return; }
    if (method === "POST" && (m = url.match(/^\/api\/opportunities\/([^/]+)\/advance$/))) { send(res, handlers.advanceOpportunityStage(m[1], await parseBody(req), req.headers)); return; }
    if (method === "POST" && (m = url.match(/^\/api\/opportunities\/([^/]+)\/approve$/))) { send(res, handlers.approveOpportunity(m[1], await parseBody(req), req.headers)); return; }
    if (method === "POST" && (m = url.match(/^\/api\/opportunities\/([^/]+)\/work-items$/))) { send(res, handlers.createWorkItem(m[1], await parseBody(req), req.headers)); return; }
    if (method === "POST" && (m = url.match(/^\/api\/work-items\/([^/]+)\/start$/))) { send(res, handlers.startWorkItem(m[1], req.headers)); return; }
    if (method === "POST" && (m = url.match(/^\/api\/work-items\/([^/]+)\/complete$/))) { send(res, handlers.completeWorkItem(m[1], req.headers)); return; }
    if (method === "POST" && (m = url.match(/^\/api\/work-items\/([^/]+)\/delivery-artifacts$/))) { send(res, handlers.createDeliveryArtifact(m[1], await parseBody(req), req.headers)); return; }
    if (method === "POST" && (m = url.match(/^\/api\/delivery-artifacts\/([^/]+)\/evidence-packs$/))) { send(res, handlers.createEvidencePack(m[1], await parseBody(req), req.headers)); return; }
    if (method === "POST" && (m = url.match(/^\/api\/evidence-packs\/([^/]+)\/certifications$/))) { send(res, handlers.createCertification(m[1], await parseBody(req), req.headers)); return; }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, code: "NOT_FOUND" }));
  } catch (err) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, code: "INTERNAL_ERROR", error: err.message }));
  }
});

server.listen(PORT, () => console.log(`Phase 56 server running on port ${PORT}`));
NODESCRIPT

log "Starting Phase 56 server on port $PORT"
PORT=$PORT PHASE56_REPO_ROOT=$REPO_ROOT node "$SERVER_JS" >> "$LOG" 2>&1 &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true; rm -f $TMPBODY $SERVER_JS" EXIT

READY=0
for _ in $(seq 1 40); do
  if curl -fsS "http://localhost:$PORT/health" >/dev/null 2>&1; then READY=1; break; fi
  sleep 0.25
done
[ "$READY" = "1" ] || { cat "$LOG"; fail "Server did not start"; }

log "Health: $(curl -sf http://localhost:$PORT/health)"

# Setup state via full flow
log "--- Active flow ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/intake" \
  -H "content-type: application/json" \
  -d '{"tenantId":"tenant_001","requesterId":"req_001","title":"Phase 56 Decision Simulation","summary":"Governed action simulation and decision impact modeling integration test"}')
assert_status "create_intake" 201 "$STATUS"

OPP_ID=$(cat "$TMPBODY" | jq_node "d.data.opportunity.opportunityId")
log "Opportunity: $OPP_ID"

# GET simulate — should list supported actions before any work
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/board/simulate/$OPP_ID")
assert_status "simulate_get_options" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/simulate_options.json"
ACTION_COUNT=$(cat "$TMPBODY" | jq_node "d.data.supportedActions.length")
[ "$ACTION_COUNT" -eq 4 ] || fail "Expected 4 supported actions, got $ACTION_COUNT"
log "OK simulate options: $ACTION_COUNT actions"

# POST simulate COMPLETE_WORK_ITEMS
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/board/simulate/$OPP_ID" \
  -H "content-type: application/json" \
  -d '{"action":"COMPLETE_WORK_ITEMS"}')
assert_status "simulate_complete_work_items" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/simulate_complete_work_items.json"
RISK_RED=$(cat "$TMPBODY" | jq_node "d.data.expectedRiskReduction")
CLOSURE=$(cat "$TMPBODY" | jq_node "d.data.expectedClosureImpact")
[ "$RISK_RED" = "0.3" ] || fail "Expected riskReduction 0.3, got $RISK_RED"
[ "$CLOSURE" = "IMPROVES" ] || fail "Expected closureImpact IMPROVES, got $CLOSURE"
log "OK simulate COMPLETE_WORK_ITEMS: riskReduction=$RISK_RED closureImpact=$CLOSURE"

# POST simulate CREATE_EVIDENCE_PACK
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/board/simulate/$OPP_ID" \
  -H "content-type: application/json" \
  -d '{"action":"CREATE_EVIDENCE_PACK"}')
assert_status "simulate_create_evidence_pack" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/simulate_create_evidence_pack.json"
RISK_RED=$(cat "$TMPBODY" | jq_node "d.data.expectedRiskReduction")
[ "$RISK_RED" = "0.2" ] || fail "Expected riskReduction 0.2, got $RISK_RED"
log "OK simulate CREATE_EVIDENCE_PACK: riskReduction=$RISK_RED"

# POST simulate ISSUE_CERTIFICATION
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/board/simulate/$OPP_ID" \
  -H "content-type: application/json" \
  -d '{"action":"ISSUE_CERTIFICATION"}')
assert_status "simulate_issue_certification" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/simulate_issue_certification.json"
CERT_STATE=$(cat "$TMPBODY" | jq_node "d.data.expectedCertificationState")
[ "$CERT_STATE" = "CERTIFIED" ] || fail "Expected certificationState CERTIFIED, got $CERT_STATE"
log "OK simulate ISSUE_CERTIFICATION: certState=$CERT_STATE"

# POST simulate ESCALATE_TO_BOARD
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/board/simulate/$OPP_ID" \
  -H "content-type: application/json" \
  -d '{"action":"ESCALATE_TO_BOARD"}')
assert_status "simulate_escalate" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/simulate_escalate.json"
CLOSURE=$(cat "$TMPBODY" | jq_node "d.data.expectedClosureImpact")
[ "$CLOSURE" = "ESCALATED" ] || fail "Expected closureImpact ESCALATED, got $CLOSURE"
log "OK simulate ESCALATE_TO_BOARD: closureImpact=$CLOSURE"

# POST simulate missing action → 422
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/board/simulate/$OPP_ID" \
  -H "content-type: application/json" \
  -d '{}')
assert_status "simulate_missing_action" 422 "$STATUS"
log "OK simulate missing action → 422"

# Verify prior phases still operational
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/board/recommendations/$OPP_ID")
assert_status "phase55_recommendations" 200 "$STATUS"
log "OK phase55 recommendations still reachable"

STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/board/risk-forecast/$OPP_ID")
assert_status "phase54_risk_forecast" 200 "$STATUS"
log "OK phase54 risk forecast still reachable"

log "=== Phase $PHASE Evidence Run COMPLETE ==="
log "EVIDENCE_RUN_DIR=$EVIDENCE_DIR"
echo ""
echo "PHASE_56_PASS"
echo "EVIDENCE_RUN_DIR=$EVIDENCE_DIR"
