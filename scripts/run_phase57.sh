#!/usr/bin/env bash
set -euo pipefail

PHASE=57
PORT=43157
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

STATE_FILE="prowork_runtime/api/data/phase51-runtime.json"
USAGE_FILE="prowork_runtime/api/data/phase57-usage.json"
EVIDENCE_DIR="${EVIDENCE_RUN_DIR:-evidence/phase57_$(date +%Y%m%dT%H%M%S)}"
mkdir -p "$EVIDENCE_DIR"
LOG="$EVIDENCE_DIR/run.log"
TMPBODY=$(mktemp)
SERVER_JS="$REPO_ROOT/.tmp_phase57_server.js"

log() { echo "[$(date +%T)] $*" | tee -a "$LOG"; }
fail() { log "FAIL: $*"; exit 1; }

assert_status() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" -ne "$expected" ]; then fail "$label — expected HTTP $expected, got HTTP $actual"; fi
  log "OK $label (HTTP $actual)"
}

jq_node() { node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log($1)"; }

log "=== Phase $PHASE Evidence Run ==="
rm -f "$STATE_FILE" "$USAGE_FILE"

cat > "$SERVER_JS" <<'NODESCRIPT'
const http = require("http");
const path = require("path");
const REPO = process.env.PHASE57_REPO_ROOT;
const handlers = require(path.join(REPO, "prowork_runtime/api/src/phase51/governedHandlers"));
const { readState } = require(path.join(REPO, "prowork_runtime/api/src/phase51/governedStore"));
const { createPhase57Module } = require(path.join(REPO, "prowork_runtime/api/src/phase57/phase57Module"));
const { createPhase56Module } = require(path.join(REPO, "prowork_runtime/api/src/phase56/phase56Module"));
const { createPhase55Module } = require(path.join(REPO, "prowork_runtime/api/src/phase55/phase55Module"));
const { createPhase54Module } = require(path.join(REPO, "prowork_runtime/api/src/phase54/phase54Module"));
const { createPhase53Module } = require(path.join(REPO, "prowork_runtime/api/src/phase53/phase53Module"));
const { createPhase52Module } = require(path.join(REPO, "prowork_runtime/api/src/phase52/phase52Module"));

const PORT = Number(process.env.PORT || "43157");

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
const phase57 = createPhase57Module({ resolveState });

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
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-actor-id, x-actor-role, x-tenant-id");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  const { method, url } = req;
  let m;
  try {
    if (method === "GET" && url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, phase: 57, port: PORT }));
      return;
    }
    if (await phase57.route(req, res, url) !== false) return;
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

server.listen(PORT, () => console.log(`Phase 57 server running on port ${PORT}`));
NODESCRIPT

log "Starting Phase 57 server on port $PORT"
PORT=$PORT PHASE57_REPO_ROOT=$REPO_ROOT node "$SERVER_JS" >> "$LOG" 2>&1 &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true; rm -f $TMPBODY $SERVER_JS" EXIT

READY=0
for _ in $(seq 1 40); do
  if curl -fsS "http://localhost:$PORT/health" >/dev/null 2>&1; then READY=1; break; fi
  sleep 0.25
done
[ "$READY" = "1" ] || { cat "$LOG"; fail "Server did not start"; }

log "Health: $(curl -sf http://localhost:$PORT/health)"

# Create two tenants via intake
log "--- Setup: two tenants ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/intake" \
  -H "content-type: application/json" \
  -d '{"tenantId":"tenant_alpha","requesterId":"req_001","title":"Alpha Opportunity","summary":"Tenant alpha test"}')
assert_status "intake_alpha" 201 "$STATUS"
OPP_ALPHA=$(cat "$TMPBODY" | jq_node "d.data.opportunity.opportunityId")
log "Alpha opp: $OPP_ALPHA"

STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/intake" \
  -H "content-type: application/json" \
  -d '{"tenantId":"tenant_beta","requesterId":"req_002","title":"Beta Opportunity","summary":"Tenant beta test"}')
assert_status "intake_beta" 201 "$STATUS"
OPP_BETA=$(cat "$TMPBODY" | jq_node "d.data.opportunity.opportunityId")
log "Beta opp: $OPP_BETA"

# External health — missing tenant → 400
log "--- Phase 57 routes ---"
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/external/health")
assert_status "external_health_no_tenant" 400 "$STATUS"
log "OK external/health without tenant → 400"

# External health with tenant
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/external/health" \
  -H "x-tenant-id: tenant_alpha")
assert_status "external_health_alpha" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/external_health.json"
log "OK external/health for tenant_alpha"

# External opportunities — tenant isolation: alpha only sees alpha
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/external/opportunities" \
  -H "x-tenant-id: tenant_alpha")
assert_status "external_opps_alpha" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/external_opportunities_alpha.json"
ALPHA_COUNT=$(cat "$TMPBODY" | jq_node "d.data.length")
[ "$ALPHA_COUNT" -eq 1 ] || fail "Expected 1 opportunity for tenant_alpha, got $ALPHA_COUNT"
log "OK tenant_alpha sees only $ALPHA_COUNT opportunity"

STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/external/opportunities" \
  -H "x-tenant-id: tenant_beta")
assert_status "external_opps_beta" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/external_opportunities_beta.json"
BETA_COUNT=$(cat "$TMPBODY" | jq_node "d.data.length")
[ "$BETA_COUNT" -eq 1 ] || fail "Expected 1 opportunity for tenant_beta, got $BETA_COUNT"
log "OK tenant_beta sees only $BETA_COUNT opportunity"

# Usage tracking — should have recorded health + 2 opportunity calls
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/usage")
assert_status "usage" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/usage.json"
USAGE_COUNT=$(cat "$TMPBODY" | jq_node "d.data.length")
[ "$USAGE_COUNT" -ge 3 ] || fail "Expected >= 3 usage records, got $USAGE_COUNT"
log "OK usage records: $USAGE_COUNT"

# Tenants list
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/tenants")
assert_status "tenants" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/tenants.json"
TENANT_COUNT=$(cat "$TMPBODY" | jq_node "d.data.length")
[ "$TENANT_COUNT" -ge 2 ] || fail "Expected >= 2 tenants, got $TENANT_COUNT"
log "OK tenants: $TENANT_COUNT"

# Verify prior phase routes still work
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" -X POST "http://localhost:$PORT/api/board/simulate/$OPP_ALPHA" \
  -H "content-type: application/json" -d '{"action":"ISSUE_CERTIFICATION"}')
assert_status "phase56_simulate" 200 "$STATUS"
log "OK phase56 simulate still reachable"

log "=== Phase $PHASE Evidence Run COMPLETE ==="
log "EVIDENCE_RUN_DIR=$EVIDENCE_DIR"
echo ""
echo "PHASE_57_PASS"
echo "EVIDENCE_RUN_DIR=$EVIDENCE_DIR"
