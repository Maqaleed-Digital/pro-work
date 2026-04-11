#!/usr/bin/env bash
set -euo pipefail

PHASE=58
PORT=43158
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

STATE_FILE="prowork_runtime/api/data/phase51-runtime.json"
BILLING_FILE="prowork_runtime/api/data/phase58-billing.json"
EVIDENCE_DIR="${EVIDENCE_RUN_DIR:-evidence/phase58_$(date +%Y%m%dT%H%M%S)}"
mkdir -p "$EVIDENCE_DIR"
LOG="$EVIDENCE_DIR/run.log"
TMPBODY=$(mktemp)
SERVER_JS="$REPO_ROOT/.tmp_phase58_server.js"

log() { echo "[$(date +%T)] $*" | tee -a "$LOG"; }
fail() { log "FAIL: $*"; exit 1; }

assert_status() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" -ne "$expected" ]; then fail "$label — expected HTTP $expected, got HTTP $actual"; fi
  log "OK $label (HTTP $actual)"
}

jq_node() { node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log($1)"; }

log "=== Phase $PHASE Evidence Run ==="
rm -f "$STATE_FILE" "$BILLING_FILE"

cat > "$SERVER_JS" <<'NODESCRIPT'
const http = require("http");
const path = require("path");
const REPO = process.env.PHASE58_REPO_ROOT;
const handlers = require(path.join(REPO, "prowork_runtime/api/src/phase51/governedHandlers"));
const { readState } = require(path.join(REPO, "prowork_runtime/api/src/phase51/governedStore"));
const { createPhase58Module } = require(path.join(REPO, "prowork_runtime/api/src/phase58/phase58Module"));
const { createPhase57Module } = require(path.join(REPO, "prowork_runtime/api/src/phase57/phase57Module"));
const { createPhase56Module } = require(path.join(REPO, "prowork_runtime/api/src/phase56/phase56Module"));
const { createPhase55Module } = require(path.join(REPO, "prowork_runtime/api/src/phase55/phase55Module"));
const { createPhase54Module } = require(path.join(REPO, "prowork_runtime/api/src/phase54/phase54Module"));
const { createPhase53Module } = require(path.join(REPO, "prowork_runtime/api/src/phase53/phase53Module"));
const { createPhase52Module } = require(path.join(REPO, "prowork_runtime/api/src/phase52/phase52Module"));

const PORT = Number(process.env.PORT || "43158");

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
const phase58 = createPhase58Module({ resolveState });

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
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-actor-id, x-actor-role, x-tenant-id, x-api-key");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  const { method, url } = req;
  let m;
  try {
    if (method === "GET" && url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, phase: 58, port: PORT }));
      return;
    }
    if (await phase58.route(req, res, url) !== false) return;
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

server.listen(PORT, () => console.log(`Phase 58 server running on port ${PORT}`));
NODESCRIPT

log "Starting Phase 58 server on port $PORT"
PORT=$PORT PHASE58_REPO_ROOT=$REPO_ROOT node "$SERVER_JS" >> "$LOG" 2>&1 &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true; rm -f $TMPBODY $SERVER_JS" EXIT

READY=0
for _ in $(seq 1 40); do
  if curl -fsS "http://localhost:$PORT/health" >/dev/null 2>&1; then READY=1; break; fi
  sleep 0.25
done
[ "$READY" = "1" ] || { cat "$LOG"; fail "Server did not start"; }

log "Health: $(curl -sf http://localhost:$PORT/health)"

log "--- Phase 58 routes ---"

# Missing API key → 401
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/external/secure-health")
assert_status "secure_health_no_key" 401 "$STATUS"
log "OK secure-health without key → 401"

# Invalid API key → 401
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/external/secure-health" \
  -H "x-api-key: bad-key")
assert_status "secure_health_bad_key" 401 "$STATUS"
log "OK secure-health with bad key → 401"

# Valid API key → 200
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/external/secure-health" \
  -H "x-api-key: demo-key-001")
assert_status "secure_health_valid" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/secure_health.json"
TENANT=$(cat "$TMPBODY" | jq_node "d.data.tenantId")
[ "$TENANT" = "tenant_demo_001" ] || fail "Expected tenantId tenant_demo_001, got $TENANT"
log "OK secure-health tenantId=$TENANT"

# Second tenant
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/external/secure-health" \
  -H "x-api-key: demo-key-002")
assert_status "secure_health_tenant2" 200 "$STATUS"
TENANT2=$(cat "$TMPBODY" | jq_node "d.data.tenantId")
[ "$TENANT2" = "tenant_demo_002" ] || fail "Expected tenantId tenant_demo_002, got $TENANT2"
log "OK secure-health tenant2=$TENANT2"

# Call once more for demo-key-001 so we have 2 records for that tenant
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/external/secure-health" \
  -H "x-api-key: demo-key-001")
assert_status "secure_health_extra" 200 "$STATUS"

# Billing usage — should have 3 records total
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/billing/usage")
assert_status "billing_usage" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/billing_usage.json"
USAGE_COUNT=$(cat "$TMPBODY" | jq_node "d.data.length")
[ "$USAGE_COUNT" -eq 3 ] || fail "Expected 3 billing records, got $USAGE_COUNT"
log "OK billing usage records: $USAGE_COUNT"

# Billing summary — should show both tenants
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/billing/summary")
assert_status "billing_summary" 200 "$STATUS"
cp "$TMPBODY" "$EVIDENCE_DIR/billing_summary.json"
UNITS_001=$(cat "$TMPBODY" | jq_node "d.data['tenant_demo_001'] || 0")
UNITS_002=$(cat "$TMPBODY" | jq_node "d.data['tenant_demo_002'] || 0")
[ "$UNITS_001" -eq 2 ] || fail "Expected 2 units for tenant_demo_001, got $UNITS_001"
[ "$UNITS_002" -eq 1 ] || fail "Expected 1 unit for tenant_demo_002, got $UNITS_002"
log "OK billing summary: tenant_demo_001=$UNITS_001 tenant_demo_002=$UNITS_002"

# Verify prior phase routes still reachable
STATUS=$(curl -s -w "%{http_code}" -o "$TMPBODY" "http://localhost:$PORT/api/external/health" \
  -H "x-tenant-id: tenant_demo_001")
assert_status "phase57_external_health" 200 "$STATUS"
log "OK phase57 external/health still reachable"

log "=== Phase $PHASE Evidence Run COMPLETE ==="
log "EVIDENCE_RUN_DIR=$EVIDENCE_DIR"
echo ""
echo "PHASE_58_PASS"
echo "EVIDENCE_RUN_DIR=$EVIDENCE_DIR"
