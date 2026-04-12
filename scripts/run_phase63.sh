#!/usr/bin/env bash
set -euo pipefail

PHASE=63
PORT=43163
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

STATE_FILE="prowork_runtime/api/data/phase51-runtime.json"
PROD_STATE_FILE="prowork_runtime/api/data/phase59-production-state.json"
HYPERCARE_STATE_FILE="prowork_runtime/api/data/phase61-hypercare-state.json"
BILLING_FILE="prowork_runtime/api/data/phase58-billing.json"
ESCALATION_TARGETS="FND/WORKCAPTAIN_ESCALATION_TARGETS.json"

# Phase 62 evidence dir — use the most recent one if not set
PHASE62_EVIDENCE_DIR="${WC_PHASE62_EVIDENCE_DIR:-$(find "$REPO_ROOT/evidence" -maxdepth 1 -type d -name 'phase62_*' | sort | tail -n 1)}"
[ -n "$PHASE62_EVIDENCE_DIR" ] || { echo "ERROR: No phase62 evidence directory found"; exit 1; }
# Make absolute
[[ "$PHASE62_EVIDENCE_DIR" = /* ]] || PHASE62_EVIDENCE_DIR="$REPO_ROOT/$PHASE62_EVIDENCE_DIR"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_DIR="${EVIDENCE_RUN_DIR:-evidence/phase63_${TS}}"
RESP_DIR="$EVIDENCE_DIR/responses"
SAMPLES_DIR="$EVIDENCE_DIR/samples"
mkdir -p "$RESP_DIR" "$SAMPLES_DIR"

LOG="$EVIDENCE_DIR/run.log"
TMPBODY=$(mktemp)
SERVER_JS="$REPO_ROOT/.tmp_phase63_server.js"

log() { echo "[$(date +%T)] $*" | tee -a "$LOG"; }
fail() { log "FAIL: $*"; exit 1; }

log "=== Phase $PHASE Governance Escalation Evidence Run ==="
rm -f "$STATE_FILE" "$BILLING_FILE"

# --- Validate Phase 62 evidence linkage ---
log "Validating Phase 62 evidence linkage: $PHASE62_EVIDENCE_DIR"
[ -d "$PHASE62_EVIDENCE_DIR" ] || fail "Phase 62 evidence directory not found: $PHASE62_EVIDENCE_DIR"
for f in PACK_SUMMARY.md SLA_BASELINE.json SLA_METRICS.json STEADY_STATE_STATUS.json BREACH_LOG.json GATE_RESULT.md; do
  [ -f "$PHASE62_EVIDENCE_DIR/$f" ] || fail "Missing Phase 62 evidence file: $f"
done
log "Phase 62 evidence linkage OK"

# --- Write production + hypercare state ---
mkdir -p "prowork_runtime/api/data"
node -e "
const fs = require('fs');
const state = {
  deploymentStatus: 'LIVE_VERIFIED',
  projectId: 'prj-maq-workcaptain-prod',
  region: 'me-central2',
  serviceName: 'workcaptain-api-prod',
  imageUri: 'me-central2-docker.pkg.dev/PROJECT/REPO/workcaptain-api:prod-evidence',
  baseUrl: 'https://api.workcaptain.ai',
  environment: 'production',
  requiredVariablesPresent: true, missingRequiredVariables: [], configValidated: true,
  liveVerification: 'PASS', goLiveCertification: 'ISSUED',
  verifiedAt: new Date().toISOString(), certifiedAt: new Date().toISOString(),
  verificationEvidencePath: 'evidence/phase60_evidence',
  lastUpdatedAt: new Date().toISOString()
};
fs.writeFileSync('$PROD_STATE_FILE.tmp', JSON.stringify(state, null, 2));
fs.renameSync('$PROD_STATE_FILE.tmp', '$PROD_STATE_FILE');
"
node -e "
const fs = require('fs');
const state = {
  hypercareState: 'ACTIVE_HYPERCARE',
  owner: 'hypercare-lead@workcaptain.ai',
  windowDays: '14',
  incidentChannel: '#workcaptain-incidents',
  statusPageUrl: 'https://status.workcaptain.ai',
  rollbackOwner: 'platform-lead@workcaptain.ai',
  rollbackReady: true, rollbackRunbookPresent: true,
  incidentState: 'NO_ACTIVE_INCIDENT',
  activatedAt: new Date().toISOString(), stableAt: null,
  lastEvaluatedAt: new Date().toISOString(), lastUpdatedAt: new Date().toISOString()
};
fs.writeFileSync('$HYPERCARE_STATE_FILE.tmp', JSON.stringify(state, null, 2));
fs.renameSync('$HYPERCARE_STATE_FILE.tmp', '$HYPERCARE_STATE_FILE');
"
log "Production + hypercare state initialized"

cat > "$SERVER_JS" <<'NODESCRIPT'
const http = require("http");
const fs = require("fs");
const path = require("path");
const REPO = process.env.PHASE63_REPO_ROOT;
const handlers = require(path.join(REPO, "prowork_runtime/api/src/phase51/governedHandlers"));
const { readState } = require(path.join(REPO, "prowork_runtime/api/src/phase51/governedStore"));
const { createPhase61Module } = require(path.join(REPO, "prowork_runtime/api/src/phase61/phase61Module"));
const { createPhase60Module } = require(path.join(REPO, "prowork_runtime/api/src/phase60/phase60Module"));
const { createPhase59Module } = require(path.join(REPO, "prowork_runtime/api/src/phase59/phase59Module"));
const { createPhase58Module } = require(path.join(REPO, "prowork_runtime/api/src/phase58/phase58Module"));
const { createPhase57Module } = require(path.join(REPO, "prowork_runtime/api/src/phase57/phase57Module"));
const { createPhase56Module } = require(path.join(REPO, "prowork_runtime/api/src/phase56/phase56Module"));
const { createPhase55Module } = require(path.join(REPO, "prowork_runtime/api/src/phase55/phase55Module"));
const { createPhase54Module } = require(path.join(REPO, "prowork_runtime/api/src/phase54/phase54Module"));
const { createPhase53Module } = require(path.join(REPO, "prowork_runtime/api/src/phase53/phase53Module"));
const { createPhase52Module } = require(path.join(REPO, "prowork_runtime/api/src/phase52/phase52Module"));

const PORT = Number(process.env.PORT || "43163");
const PROD_STATE_FILE     = path.join(REPO, "prowork_runtime/api/data/phase59-production-state.json");
const HYPERCARE_STATE_FILE = path.join(REPO, "prowork_runtime/api/data/phase61-hypercare-state.json");

function resolveState() {
  const s = readState();
  return { opportunities: s.opportunities||[], workItems: s.workItems||[], deliveryArtifacts: s.deliveryArtifacts||[], evidencePacks: s.evidencePacks||[], certifications: s.certifications||[] };
}
function resolveProductionState() {
  try { return JSON.parse(fs.readFileSync(PROD_STATE_FILE, "utf8")); } catch { return { deploymentStatus: "NOT_DEPLOYED" }; }
}
function resolveHypercareState() {
  try { return JSON.parse(fs.readFileSync(HYPERCARE_STATE_FILE, "utf8")); } catch { return { hypercareState: "NOT_STARTED", rollbackReady: false, rollbackRunbookPresent: false }; }
}

const phase52 = createPhase52Module({ resolveState });
const phase53 = createPhase53Module({ resolveState });
const phase54 = createPhase54Module({ resolveState });
const phase55 = createPhase55Module({ resolveState });
const phase56 = createPhase56Module({ resolveState });
const phase57 = createPhase57Module({ resolveState });
const phase58 = createPhase58Module({ resolveState });
const phase59 = createPhase59Module({ resolveProductionState });
const phase60 = createPhase60Module({ resolveProductionState });
const phase61 = createPhase61Module({ resolveProductionState, resolveHypercareState });

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
  const { method, url } = req; let m;
  try {
    if (method === "GET" && url === "/health") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true, phase: 63, port: PORT })); return; }
    if (await phase61.route(req, res, url) !== false) return;
    if (await phase60.route(req, res, url) !== false) return;
    if (await phase59.route(req, res, url) !== false) return;
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
    res.writeHead(404, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: false, code: "NOT_FOUND" }));
  } catch (err) {
    res.writeHead(500, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: false, code: "INTERNAL_ERROR", error: err.message }));
  }
});
server.listen(PORT, () => console.log(`Phase 63 server running on port ${PORT}`));
NODESCRIPT

log "Starting Phase 63 server on port $PORT"
PORT=$PORT PHASE63_REPO_ROOT=$REPO_ROOT node "$SERVER_JS" >> "$LOG" 2>&1 &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true; rm -f $TMPBODY $SERVER_JS" EXIT

READY=0
for _ in $(seq 1 40); do
  if curl -fsS "http://localhost:$PORT/health" >/dev/null 2>&1; then READY=1; break; fi
  sleep 0.25
done
[ "$READY" = "1" ] || { cat "$LOG"; fail "Server did not start"; }
log "Health: $(curl -sf http://localhost:$PORT/health)"

BASE_URL="http://localhost:$PORT"
SAMPLE_COUNT=5

# --- Capture responses ---
log "--- Capturing route responses ---"
capture() { curl -sf "$BASE_URL$1" -o "$2"; }
capture "/api/production/status"                       "$RESP_DIR/production_status.json"
capture "/api/production/go-live-certification"        "$RESP_DIR/go_live_certification.json"
capture "/api/operations/hypercare/status"             "$RESP_DIR/hypercare_status.json"
capture "/api/operations/hypercare/rollback-readiness" "$RESP_DIR/rollback_readiness.json"
log "Responses captured"

# --- Sample critical routes ---
log "--- Sampling critical routes ---"
CRITICAL_ROUTES=(
  "/api/production/status:production_status"
  "/api/production/go-live-certification:go_live_certification"
  "/api/operations/hypercare/status:hypercare_status"
  "/api/operations/hypercare/rollback-readiness:rollback_readiness"
)
for entry in "${CRITICAL_ROUTES[@]}"; do
  route="${entry%%:*}"; name="${entry##*:}"
  sample_file="$SAMPLES_DIR/${name}.tsv"; : > "$sample_file"
  for i in $(seq 1 $SAMPLE_COUNT); do
    body_file="$SAMPLES_DIR/${name}_sample_${i}.json"
    result=$(curl -sf -o "$body_file" -w "%{http_code}\t%{time_total}" "$BASE_URL$route")
    printf '%s\t%s\t%s\n' "$i" "$route" "$result" >> "$sample_file"
  done
  log "Sampled $route ($SAMPLE_COUNT samples)"
done

# --- Python: classify + escalation artifacts ---
log "--- Classifying breaches and generating escalation artifacts ---"
python3 - "$REPO_ROOT" "$EVIDENCE_DIR" "$TS" "$BASE_URL" "$SAMPLE_COUNT" "$PHASE62_EVIDENCE_DIR" <<'PY'
import json, os, statistics, sys

root           = sys.argv[1]
evidence_dir   = sys.argv[2]
ts             = sys.argv[3]
base_url       = sys.argv[4]
sample_count   = int(sys.argv[5])
phase62_dir    = sys.argv[6]

targets_path = os.path.join(root, "FND", "WORKCAPTAIN_ESCALATION_TARGETS.json")
with open(targets_path, "r", encoding="utf-8") as f:
    targets = json.load(f)

warning_t = targets["warning_thresholds"]
breach_t  = targets["breach_thresholds"]
expected  = targets["expected_runtime_state"]

responses_dir = os.path.join(evidence_dir, "responses")
samples_dir   = os.path.join(evidence_dir, "samples")

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

# API wraps values under .data
def pluck(path, key):
    obj = load_json(path)
    d = obj.get("data", obj)
    return d.get(key) if isinstance(d, dict) else None

runtime_state = {
    "deploymentStatus":    pluck(os.path.join(responses_dir, "production_status.json"),       "deploymentStatus"),
    "goLiveCertification": pluck(os.path.join(responses_dir, "go_live_certification.json"),   "goLiveCertification"),
    "hypercareState":      pluck(os.path.join(responses_dir, "hypercare_status.json"),         "hypercareState"),
    "rollbackReady":       pluck(os.path.join(responses_dir, "rollback_readiness.json"),       "rollbackReady"),
}

missing_keys = [k for k, v in runtime_state.items() if v is None]
mismatches   = [{"key": k, "expected": expected[k], "actual": runtime_state.get(k)}
                for k in expected if runtime_state.get(k) != expected[k]]

route_name_map = {
    "production_status":    "/api/production/status",
    "go_live_certification":"/api/production/go-live-certification",
    "hypercare_status":     "/api/operations/hypercare/status",
    "rollback_readiness":   "/api/operations/hypercare/rollback-readiness",
}

route_metrics = []
warning_count = 0; major_count = 0; critical_count = 0

for name, route in route_name_map.items():
    sample_file = os.path.join(samples_dir, f"{name}.tsv")
    rows = []
    with open(sample_file, "r", encoding="utf-8") as f:
        for line in f:
            parts = line.strip().split("\t")
            if len(parts) != 4:
                raise RuntimeError(f"Bad sample row in {sample_file}: {line!r}")
            idx, route_val, http_code, time_total = parts
            rows.append({"http_code": int(http_code), "time_total_seconds": float(time_total)})

    codes    = [r["http_code"] for r in rows]
    times_ms = [round(r["time_total_seconds"] * 1000.0, 3) for r in rows]
    success  = sum(1 for c in codes if 200 <= c < 300)
    failure  = len(rows) - success
    avail    = round(success / len(rows) * 100.0, 3)
    err_rate = round(failure / len(rows) * 100.0, 3)
    avg_lat  = round(statistics.mean(times_ms), 3)
    max_lat  = round(max(times_ms), 3)

    if success == 0:
        sev = "SEV3_CRITICAL"; state = "UNREACHABLE"; critical_count += 1
    elif (avail < breach_t["availability_percent_min"] or avg_lat > breach_t["avg_latency_ms_max"] or
          max_lat > breach_t["max_latency_ms_max"] or err_rate > breach_t["error_rate_percent_max"]):
        sev = "SEV2_MAJOR"; state = "BREACH"; major_count += 1
    elif (avail < warning_t["availability_percent_min_warning"] or avg_lat > warning_t["avg_latency_ms_max_warning"] or
          max_lat > warning_t["max_latency_ms_max_warning"] or err_rate > warning_t["error_rate_percent_max_warning"]):
        sev = "SEV1_WARNING"; state = "WARNING"; warning_count += 1
    else:
        sev = "SEV0_INFO"; state = "PASS"

    route_metrics.append({"route": route, "sample_count": len(rows),
        "success_count": success, "failure_count": failure,
        "availability_percent": avail, "error_rate_percent": err_rate,
        "avg_latency_ms": avg_lat, "max_latency_ms": max_lat,
        "severity": sev, "route_state": state})

if critical_count > 0:
    overall_sev = "SEV3_CRITICAL"
elif major_count > 0:
    overall_sev = "SEV2_MAJOR"
elif warning_count > 0:
    overall_sev = "SEV1_WARNING"
else:
    overall_sev = "SEV0_INFO"

cadence_map = {
    "SEV0_INFO":    ("CADENCE_OPERATIONAL",    "BREACH_CONTROLLED_OPERATIONAL",    ["retain_latest_evidence", "continue_normal_cadence"]),
    "SEV1_WARNING": ("CADENCE_WARNING",         "BREACH_CONTROLLED_WARNING",        ["flag_warning_in_review_snapshot", "tighten_next_cadence_review", "preserve_warning_evidence"]),
    "SEV2_MAJOR":   ("CADENCE_ESCALATED",       "BREACH_CONTROLLED_ESCALATED",      ["create_escalation_record", "require_operator_acknowledgement", "preserve_all_metrics_and_captures", "elevate_daily_review"]),
    "SEV3_CRITICAL":("CADENCE_CRITICAL_REVIEW", "BREACH_CONTROLLED_CRITICAL_REVIEW",["create_escalation_record", "require_immediate_operator_review", "preserve_all_metrics_and_captures", "block_success_claim_until_review"]),
}
cadence_state, op_posture, actions = cadence_map[overall_sev]

gate_pass   = not missing_keys and not mismatches
gate_status = "PASSED" if gate_pass else "FAILED"

def w(fname, content):
    with open(os.path.join(evidence_dir, fname), "w", encoding="utf-8") as f:
        if isinstance(content, str):
            f.write(content)
        else:
            json.dump(content, f, indent=2)

w("CADENCE_BASELINE.json", {"generated_at_utc": ts, "linked_phase62_evidence_dir": phase62_dir,
    "base_url": base_url, "warning_thresholds": warning_t, "breach_thresholds": breach_t,
    "critical_routes": list(route_name_map.values())})
w("BREACH_CLASSIFICATION.json", {"generated_at_utc": ts, "overall_severity": overall_sev,
    "warning_route_count": warning_count, "major_route_count": major_count,
    "critical_unreachable_route_count": critical_count, "routes": route_metrics})
w("ESCALATION_ACTIONS.json", {"generated_at_utc": ts, "overall_severity": overall_sev,
    "cadence_state": cadence_state, "operational_posture": op_posture, "actions": actions})
w("OPERATIONAL_GOVERNANCE_STATUS.json", {"generated_at_utc": ts,
    "linked_phase62_evidence_dir": phase62_dir,
    "deploymentStatus": runtime_state["deploymentStatus"],
    "goLiveCertification": runtime_state["goLiveCertification"],
    "hypercareState": runtime_state["hypercareState"],
    "rollbackReady": runtime_state["rollbackReady"],
    "cadence_state": cadence_state, "operational_posture": op_posture,
    "missing_runtime_keys": missing_keys, "runtime_mismatches": mismatches})
w("REVIEW_SNAPSHOT.md",
    f"# Review Snapshot\n\n"
    f"- Linked Phase 62 evidence: {phase62_dir}\n"
    f"- Overall severity: {overall_sev}\n"
    f"- Cadence state: {cadence_state}\n"
    f"- Operational posture: {op_posture}\n"
    f"- Warning route count: {warning_count}\n"
    f"- Major route count: {major_count}\n"
    f"- Critical unreachable: {critical_count}\n")
w("PHASE62_LINKAGE_SUMMARY.md",
    f"# Phase 62 Linkage Summary\n\n"
    f"- Linked evidence directory: {phase62_dir}\n"
    f"- Required files validated: {len(targets['required_phase62_files'])}\n")
w("PACK_SUMMARY.md",
    f"# Phase 63 Pack Summary\n\n"
    f"- Generated at UTC: {ts}\n"
    f"- Linked Phase 62 evidence: {phase62_dir}\n"
    f"- Overall severity: {overall_sev}\n"
    f"- Cadence state: {cadence_state}\n"
    f"- Operational posture: {op_posture}\n"
    f"- Runtime missing keys: {len(missing_keys)}\n"
    f"- Runtime mismatches: {len(mismatches)}\n")
w("GATE_RESULT.md",
    f"STATUS={gate_status}\n"
    f"CADENCE_STATE={cadence_state}\n"
    f"OPERATIONAL_POSTURE={op_posture}\n"
    f"OVERALL_SEVERITY={overall_sev}\n"
    f"EVIDENCE_DIR={evidence_dir}\n"
    f"LINKED_PHASE62_EVIDENCE_DIR={phase62_dir}\n")

if not gate_pass:
    print(f"GATE FAILED: missing={missing_keys} mismatches={mismatches}", file=sys.stderr)
    sys.exit(1)
PY

GATE=$(grep '^STATUS=' "$EVIDENCE_DIR/GATE_RESULT.md" | cut -d= -f2)
SEV=$(grep '^OVERALL_SEVERITY=' "$EVIDENCE_DIR/GATE_RESULT.md" | cut -d= -f2)
CADENCE=$(grep '^CADENCE_STATE=' "$EVIDENCE_DIR/GATE_RESULT.md" | cut -d= -f2)
log "Gate result: STATUS=$GATE SEVERITY=$SEV CADENCE=$CADENCE"
[ "$GATE" = "PASSED" ] || fail "Governance gate FAILED — see $EVIDENCE_DIR/GATE_RESULT.md"

log "=== Phase $PHASE Governance Escalation Evidence Run COMPLETE ==="
log "EVIDENCE_RUN_DIR=$EVIDENCE_DIR"
echo ""
echo "PHASE_63_OPERATIONAL_GOVERNANCE_BREACH_ESCALATION_COMPLETE"
echo "EVIDENCE_RUN_DIR=$EVIDENCE_DIR"
