#!/usr/bin/env bash
set -euo pipefail

# ─── Phase 65: Governance Mirror Sync Service + Executive Live Dashboard Activation
# Validates Phase 62 + 63 + 64 evidence linkage.
# Measures current runtime posture.
# Computes mirror sync state and executive dashboard state.
# Produces machine-readable payloads for mirrors and dashboards.
# Does NOT mutate production state.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=43165
BASE_URL="http://localhost:$PORT"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_DIR="$REPO_ROOT/evidence/phase65_${TIMESTAMP}"
TMP_SERVER="$REPO_ROOT/.tmp_phase65_server.js"
TARGETS="$REPO_ROOT/ops/governance/governance_mirror_sync_targets.json"

# ─── Locate prior phase evidence ────────────────────────────────────────────
PHASE62_DIR="$(ls -d "$REPO_ROOT/evidence/phase62_"* 2>/dev/null | sort | tail -1 || true)"
PHASE63_DIR="$(ls -d "$REPO_ROOT/evidence/phase63_"* 2>/dev/null | sort | tail -1 || true)"
PHASE64_DIR="$(ls -d "$REPO_ROOT/evidence/phase64_"* 2>/dev/null | sort | tail -1 || true)"

if [[ -z "$PHASE62_DIR" ]]; then echo "FAIL: no phase62 evidence directory found"; exit 1; fi
if [[ -z "$PHASE63_DIR" ]]; then echo "FAIL: no phase63 evidence directory found"; exit 1; fi
if [[ -z "$PHASE64_DIR" ]]; then echo "FAIL: no phase64 evidence directory found"; exit 1; fi

echo "Phase 62 evidence: $PHASE62_DIR"
echo "Phase 63 evidence: $PHASE63_DIR"
echo "Phase 64 evidence: $PHASE64_DIR"

mkdir -p "$EVIDENCE_DIR/responses" "$EVIDENCE_DIR/samples"

# ─── Write inline server ─────────────────────────────────────────────────────
cat > "$TMP_SERVER" << 'SERVEREOF'
const http = require("http");
const fs   = require("fs");
const path = require("path");

const ROOT = process.env.PHASE65_REPO_ROOT;
if (!ROOT) { console.error("PHASE65_REPO_ROOT not set"); process.exit(1); }

const PORT = parseInt(process.env.PHASE65_PORT || "43165", 10);

function readJson(rel) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")); }
  catch { return null; }
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

function envelope(data) {
  return { ok: true, code: 200, data, errors: [], meta: { timestamp: new Date().toISOString() } };
}

function errEnvelope(code, message) {
  return { ok: false, code, data: null, errors: [message], meta: { timestamp: new Date().toISOString() } };
}

// ─── load modules ────────────────────────────────────────────────────────────
const modules = [];

// Phase 51 governed store
const { createPhase51Module } = require(path.join(ROOT, "prowork_runtime/api/src/phase51/phase51Module.js"));
modules.push(createPhase51Module({ dataDir: path.join(ROOT, "prowork_runtime/api/data") }));

// Phase 52 → 61: load them all
for (let n = 52; n <= 61; n++) {
  const modPath = path.join(ROOT, `prowork_runtime/api/src/phase${n}/phase${n}Module.js`);
  if (!fs.existsSync(modPath)) continue;
  try {
    const mod = require(modPath);
    const factoryKey = Object.keys(mod).find(k => k.startsWith("create"));
    if (!factoryKey) continue;
    const factory = mod[factoryKey];
    // Build resolver: reads the governed store state
    const resolveState = () => {
      const stateFile = path.join(ROOT, "prowork_runtime/api/data/phase51-runtime.json");
      try { return JSON.parse(fs.readFileSync(stateFile, "utf8")); } catch { return {}; }
    };
    const resolveProductionState = () => {
      const f = path.join(ROOT, "prowork_runtime/api/data/phase59-production-state.json");
      try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return {}; }
    };
    const resolveHypercareState = () => {
      const f = path.join(ROOT, "prowork_runtime/api/data/phase61-hypercare-state.json");
      try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return {}; }
    };
    let instance;
    if (n <= 58) {
      instance = factory({ resolveState });
    } else if (n === 61) {
      instance = factory({ resolveProductionState, resolveHypercareState });
    } else {
      instance = factory({ resolveProductionState });
    }
    modules.push(instance);
  } catch(e) {
    console.error(`Warning: could not load phase${n}Module:`, e.message);
  }
}

const server = http.createServer(async (req, res) => {
  // auth headers for internal calls
  res.setHeader("x-phase65-server", "true");
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  for (const mod of modules) {
    if (typeof mod.route === "function") {
      const handled = await mod.route(req, res, pathname);
      if (handled) return;
    }
  }

  json(res, 404, errEnvelope(404, `Route not found: ${pathname}`));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`phase65-server listening on ${PORT}`);
});
SERVEREOF

# ─── Start server ────────────────────────────────────────────────────────────
PHASE65_REPO_ROOT="$REPO_ROOT" PHASE65_PORT="$PORT" node "$TMP_SERVER" > "$EVIDENCE_DIR/server.log" 2>&1 &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true; rm -f '$TMP_SERVER'" EXIT

# Wait for server to be ready
for i in $(seq 1 20); do
  if curl -sf "$BASE_URL/api/production/status" \
      -H "x-actor-id: phase65-evidence" \
      -H "x-actor-role: GOVERNANCE_MONITOR" \
      -H "x-tenant-id: tenant_demo_001" \
      -H "x-api-key: demo-key-001" \
      -o /dev/null 2>/dev/null; then
    echo "Server ready after ${i} attempts"
    break
  fi
  sleep 0.3
done

# ─── Critical routes ─────────────────────────────────────────────────────────
CRITICAL_ROUTES=(
  "/api/production/status"
  "/api/production/go-live-certification"
  "/api/operations/hypercare/status"
  "/api/operations/hypercare/rollback-readiness"
)

COMMON_HEADERS=(
  -H "x-actor-id: phase65-evidence"
  -H "x-actor-role: GOVERNANCE_MONITOR"
  -H "x-tenant-id: tenant_demo_001"
  -H "x-api-key: demo-key-001"
)

# ─── Capture fresh responses ──────────────────────────────────────────────────
for route in "${CRITICAL_ROUTES[@]}"; do
  safe="${route//\//_}"
  curl -sf "${COMMON_HEADERS[@]}" \
    -o "$EVIDENCE_DIR/responses/${safe}.json" \
    -w "%{http_code}\t%{time_total}\n" \
    "$BASE_URL$route" \
    >> "$EVIDENCE_DIR/responses/${safe}.timing" 2>/dev/null || true
done

# ─── Sample each critical route 5 times ──────────────────────────────────────
for route in "${CRITICAL_ROUTES[@]}"; do
  safe="${route//\//_}"
  SAMPLE_FILE="$EVIDENCE_DIR/samples/${safe}.tsv"
  echo -e "status_code\ttime_total" > "$SAMPLE_FILE"
  for _ in 1 2 3 4 5; do
    curl -sf "${COMMON_HEADERS[@]}" \
      -o /dev/null \
      -w "%{http_code}\t%{time_total}\n" \
      "$BASE_URL$route" >> "$SAMPLE_FILE" 2>/dev/null || echo -e "000\t0.000" >> "$SAMPLE_FILE"
  done
done

# ─── Python: validate linkage + compute mirror/dashboard state ────────────────
python3 - << PYEOF
import json, os, sys, subprocess
from datetime import datetime, timezone

ROOT         = "$REPO_ROOT"
EVIDENCE_DIR = "$EVIDENCE_DIR"
PHASE62_DIR  = "$PHASE62_DIR"
PHASE63_DIR  = "$PHASE63_DIR"
PHASE64_DIR  = "$PHASE64_DIR"
TARGETS_FILE = "$TARGETS"
TIMESTAMP    = "$TIMESTAMP"

def load_json(p):
    try:
        with open(p) as f: return json.load(f)
    except Exception as e:
        print(f"WARN: could not load {p}: {e}")
        return {}

def write_json(p, obj):
    with open(p, "w") as f: json.dump(obj, f, indent=2)

def write_text(p, text):
    with open(p, "w") as f: f.write(text)

def pluck(path, key):
    obj = load_json(path)
    d = obj.get("data", obj)
    return d.get(key) if isinstance(d, dict) else None

def git_head(repo):
    try:
        return subprocess.check_output(
            ["git", "-C", repo, "rev-parse", "HEAD"],
            stderr=subprocess.DEVNULL
        ).decode().strip()
    except Exception:
        return "unknown"

targets = load_json(TARGETS_FILE)

# ── Evidence linkage validation ──────────────────────────────────────────────
required_62 = targets.get("required_phase62_files", [])
required_63 = targets.get("required_phase63_files", [])
required_64 = targets.get("required_phase64_files", [])

def check_linkage(evidence_dir, required_files, label):
    missing = []
    for f in required_files:
        fp = os.path.join(evidence_dir, f)
        if not os.path.isfile(fp):
            missing.append(f)
    status = "LINKED" if not missing else "BROKEN"
    return {"label": label, "directory": evidence_dir, "status": status, "missing": missing}

link62 = check_linkage(PHASE62_DIR, required_62, "Phase62")
link63 = check_linkage(PHASE63_DIR, required_63, "Phase63")
link64 = check_linkage(PHASE64_DIR, required_64, "Phase64")

linkage_ok = all(l["status"] == "LINKED" for l in [link62, link63, link64])

# ── Fresh runtime state ──────────────────────────────────────────────────────
RESPONSE_DIR = os.path.join(EVIDENCE_DIR, "responses")
SAMPLE_DIR   = os.path.join(EVIDENCE_DIR, "samples")

def read_response(route_slug):
    p = os.path.join(RESPONSE_DIR, f"{route_slug}.json")
    try:
        raw = open(p).read().strip()
        lines = raw.split("\n")
        body_lines = [l for l in lines if not (len(l.split("\t")) == 2 and l.split("\t")[0].isdigit())]
        return json.loads("\n".join(body_lines))
    except Exception:
        return {}

def read_samples(route_slug):
    p = os.path.join(SAMPLE_DIR, f"{route_slug}.tsv")
    rows = []
    try:
        lines = open(p).read().strip().split("\n")[1:]  # skip header
        for line in lines:
            parts = line.strip().split("\t")
            if len(parts) == 2:
                rows.append({"status_code": parts[0], "time_total": float(parts[1])})
    except Exception:
        pass
    return rows

critical_routes = targets.get("critical_routes", [])
warn_thresh     = targets.get("warning_thresholds", {})
breach_thresh   = targets.get("breach_thresholds", {})
expected_state  = targets.get("expected_runtime_state", {})

route_metrics = {}
for route in critical_routes:
    slug = route.replace("/", "_")
    samples = read_samples(slug)
    n = len(samples)
    ok_count = sum(1 for s in samples if s["status_code"] in ("200", "201", "204"))
    availability = (ok_count / n * 100) if n > 0 else 0.0
    times_ms = [s["time_total"] * 1000 for s in samples]
    avg_lat = (sum(times_ms) / len(times_ms)) if times_ms else 0.0
    max_lat = max(times_ms) if times_ms else 0.0
    err_rate = ((n - ok_count) / n * 100) if n > 0 else 100.0
    route_metrics[route] = {
        "availability_percent": round(availability, 4),
        "avg_latency_ms": round(avg_lat, 2),
        "max_latency_ms": round(max_lat, 2),
        "error_rate_percent": round(err_rate, 4),
        "sample_count": n,
    }

# ── Runtime state check ──────────────────────────────────────────────────────
status_resp = read_response("_api_production_status")
deploy_status   = pluck(os.path.join(RESPONSE_DIR, "_api_production_status.json"), "deploymentStatus")
cert_resp       = read_response("_api_production_go-live-certification")
cert_status     = pluck(os.path.join(RESPONSE_DIR, "_api_production_go-live-certification.json"), "goLiveCertification")
hc_resp         = read_response("_api_operations_hypercare_status")
hc_state        = pluck(os.path.join(RESPONSE_DIR, "_api_operations_hypercare_status.json"), "hypercareState")
rb_resp         = read_response("_api_operations_hypercare_rollback-readiness")
rb_ready        = pluck(os.path.join(RESPONSE_DIR, "_api_operations_hypercare_rollback-readiness.json"), "rollbackReady")

runtime_valid = (
    deploy_status == expected_state.get("deploymentStatus") and
    cert_status   == expected_state.get("goLiveCertification") and
    hc_state      == expected_state.get("hypercareState") and
    rb_ready      == expected_state.get("rollbackReady")
)

# ── SLA posture ──────────────────────────────────────────────────────────────
def route_sla_posture(m):
    if (m["availability_percent"] < breach_thresh.get("availability_percent_min", 99.9) or
        m["avg_latency_ms"]       > breach_thresh.get("avg_latency_ms_max", 1000) or
        m["max_latency_ms"]       > breach_thresh.get("max_latency_ms_max", 2500) or
        m["error_rate_percent"]   > breach_thresh.get("error_rate_percent_max", 0.5)):
        return "BREACH"
    if (m["availability_percent"] < warn_thresh.get("availability_percent_min_warning", 99.95) or
        m["avg_latency_ms"]       > warn_thresh.get("avg_latency_ms_max_warning", 850) or
        m["max_latency_ms"]       > warn_thresh.get("max_latency_ms_max_warning", 2000) or
        m["error_rate_percent"]   > warn_thresh.get("error_rate_percent_max_warning", 0.1)):
        return "WARNING"
    return "HEALTHY"

postures = {r: route_sla_posture(route_metrics[r]) for r in critical_routes}
any_breach  = any(p == "BREACH"  for p in postures.values())
any_warning = any(p == "WARNING" for p in postures.values())

# ── Prior phase escalation ───────────────────────────────────────────────────
def gate_passed(evidence_dir):
    gate_file = os.path.join(evidence_dir, "GATE_RESULT.md")
    try:
        content = open(gate_file).read()
        return "STATUS=PASSED" in content
    except Exception:
        return False

p62_gate = gate_passed(PHASE62_DIR)
p63_gate = gate_passed(PHASE63_DIR)
p64_gate = gate_passed(PHASE64_DIR)
prior_gates_ok = p62_gate and p63_gate and p64_gate

# ── Mirror sync state ─────────────────────────────────────────────────────────
if not linkage_ok or not runtime_valid:
    mirror_sync_state = "MIRROR_SYNC_BLOCKED"
elif any_breach or not prior_gates_ok:
    mirror_sync_state = "MIRROR_SYNC_ESCALATED"
elif any_warning:
    mirror_sync_state = "MIRROR_SYNC_WARNING"
else:
    mirror_sync_state = "MIRROR_SYNC_OPERATIONAL"

# ── Dashboard state ───────────────────────────────────────────────────────────
if mirror_sync_state == "MIRROR_SYNC_BLOCKED":
    dashboard_state = "DASHBOARD_BLOCKED"
elif mirror_sync_state == "MIRROR_SYNC_ESCALATED":
    dashboard_state = "DASHBOARD_ESCALATED"
elif mirror_sync_state == "MIRROR_SYNC_WARNING":
    dashboard_state = "DASHBOARD_WARNING"
else:
    dashboard_state = "DASHBOARD_OPERATIONAL"

# ── Activation readiness ──────────────────────────────────────────────────────
if dashboard_state in ("DASHBOARD_OPERATIONAL", "DASHBOARD_WARNING"):
    activation_readiness = "READY"
elif dashboard_state == "DASHBOARD_ESCALATED":
    activation_readiness = "REVIEW_REQUIRED"
else:
    activation_readiness = "BLOCKED"

# ── Source of truth ───────────────────────────────────────────────────────────
source_commit = git_head(ROOT)

# ── Sync actions ──────────────────────────────────────────────────────────────
if mirror_sync_state == "MIRROR_SYNC_BLOCKED":
    sync_actions = [{"action": "MIRROR_SYNC_HOLD", "reason": "Evidence chain broken or runtime invalid"}]
elif mirror_sync_state == "MIRROR_SYNC_ESCALATED":
    sync_actions = [{"action": "MIRROR_SYNC_ESCALATE", "reason": "Prior phase gate failed or SLA breach"}]
elif mirror_sync_state == "MIRROR_SYNC_WARNING":
    sync_actions = [{"action": "MIRROR_SYNC_PUBLISH", "reason": "Warning posture — publish with advisory"}, {"action": "MIRROR_SYNC_HOLD", "reason": "Monitor threshold proximity"}]
else:
    sync_actions = [{"action": "MIRROR_SYNC_PUBLISH", "reason": "All checks passed — publish mirror payload"}]

# ─── Write artifacts ──────────────────────────────────────────────────────────
write_json(os.path.join(EVIDENCE_DIR, "MIRROR_SYNC_BASELINE.json"), {
    "timestamp": TIMESTAMP,
    "sourceOfTruthCommit": source_commit,
    "phase62Dir": PHASE62_DIR,
    "phase63Dir": PHASE63_DIR,
    "phase64Dir": PHASE64_DIR,
    "phase65Dir": EVIDENCE_DIR,
    "mirrorSyncState": mirror_sync_state,
    "linkageStatus": {
        "phase62": link62["status"],
        "phase63": link63["status"],
        "phase64": link64["status"],
    },
    "runtimeValid": runtime_valid,
    "priorGatesOk": prior_gates_ok,
    "routeMetrics": route_metrics,
    "routePostures": postures,
})

write_json(os.path.join(EVIDENCE_DIR, "EXECUTIVE_DASHBOARD_STATUS.json"), {
    "timestamp": TIMESTAMP,
    "dashboardState": dashboard_state,
    "mirrorSyncState": mirror_sync_state,
    "activationReadiness": activation_readiness,
    "sourceOfTruthCommit": source_commit,
    "runtimePosture": {
        "deploymentStatus": deploy_status,
        "goLiveCertification": cert_status,
        "hypercareState": hc_state,
        "rollbackReady": rb_ready,
    },
    "slaPosture": route_metrics,
    "routePostures": postures,
    "linkage": {
        "phase62": link62["status"],
        "phase63": link63["status"],
        "phase64": link64["status"],
    },
})

# Mirror payload: metadata only, no file contents
write_json(os.path.join(EVIDENCE_DIR, "GOVERNANCE_MIRROR_PAYLOAD.json"), {
    "metadataOnly": True,
    "timestamp": TIMESTAMP,
    "sourceOfTruthCommit": source_commit,
    "mirrorSyncState": mirror_sync_state,
    "evidenceChain": {
        "phase62Dir": PHASE62_DIR,
        "phase63Dir": PHASE63_DIR,
        "phase64Dir": PHASE64_DIR,
        "phase65Dir": EVIDENCE_DIR,
    },
    "runtimeValid": runtime_valid,
    "routePostures": postures,
    "activationReadiness": activation_readiness,
})

# Executive dashboard payload: metadata only, no file contents
write_json(os.path.join(EVIDENCE_DIR, "EXECUTIVE_LIVE_DASHBOARD_PAYLOAD.json"), {
    "metadataOnly": True,
    "timestamp": TIMESTAMP,
    "sourceOfTruthCommit": source_commit,
    "dashboardState": dashboard_state,
    "mirrorSyncState": mirror_sync_state,
    "activationReadiness": activation_readiness,
    "evidenceChain": {
        "phase62Dir": PHASE62_DIR,
        "phase63Dir": PHASE63_DIR,
        "phase64Dir": PHASE64_DIR,
        "phase65Dir": EVIDENCE_DIR,
    },
    "runtimePosture": {
        "deploymentStatus": deploy_status,
        "goLiveCertification": cert_status,
        "hypercareState": hc_state,
        "rollbackReady": rb_ready,
    },
    "slaPosture": {r: {"posture": postures[r], "metrics": route_metrics[r]} for r in critical_routes},
})

write_json(os.path.join(EVIDENCE_DIR, "SYNC_ACTIONS.json"), {
    "timestamp": TIMESTAMP,
    "mirrorSyncState": mirror_sync_state,
    "actions": sync_actions,
})

write_json(os.path.join(EVIDENCE_DIR, "ACTIVATION_READINESS.json"), {
    "timestamp": TIMESTAMP,
    "activationReadiness": activation_readiness,
    "dashboardState": dashboard_state,
    "mirrorSyncState": mirror_sync_state,
    "sourceOfTruthCommit": source_commit,
})

# ── Linkage summaries ─────────────────────────────────────────────────────────
for lnk in [link62, link63, link64]:
    label = lnk["label"]
    fn    = f"PHASE{label[5:]}_LINKAGE_SUMMARY.md"
    lines = [
        f"# {label} Linkage Summary",
        f"",
        f"Directory: {lnk['directory']}",
        f"Status: {lnk['status']}",
        f"",
        f"## Required Files",
    ]
    req = required_62 if label == "Phase62" else (required_63 if label == "Phase63" else required_64)
    for f in req:
        fp   = os.path.join(lnk["directory"], f)
        mark = "PRESENT" if os.path.isfile(fp) else "MISSING"
        lines.append(f"- [{mark}] {f}")
    if lnk["missing"]:
        lines += ["", f"MISSING FILES: {', '.join(lnk['missing'])}"]
    write_text(os.path.join(EVIDENCE_DIR, fn), "\n".join(lines) + "\n")

# ── Review snapshot ───────────────────────────────────────────────────────────
write_text(os.path.join(EVIDENCE_DIR, "REVIEW_SNAPSHOT.md"), f"""# Phase 65 — Governance Mirror Sync Review Snapshot

Timestamp: {TIMESTAMP}
Source of Truth Commit: {source_commit}

## Mirror Sync State
{mirror_sync_state}

## Dashboard State
{dashboard_state}

## Activation Readiness
{activation_readiness}

## Runtime Posture
- deploymentStatus:    {deploy_status}
- goLiveCertification: {cert_status}
- hypercareState:      {hc_state}
- rollbackReady:       {rb_ready}

## SLA Posture
{json.dumps(postures, indent=2)}

## Evidence Linkage
- Phase 62: {link62['status']}
- Phase 63: {link63['status']}
- Phase 64: {link64['status']}

## Prior Gates
- Phase 62: {"PASSED" if p62_gate else "FAILED"}
- Phase 63: {"PASSED" if p63_gate else "FAILED"}
- Phase 64: {"PASSED" if p64_gate else "FAILED"}

## Sync Actions
{json.dumps(sync_actions, indent=2)}
""")

# ── Pack summary ──────────────────────────────────────────────────────────────
write_text(os.path.join(EVIDENCE_DIR, "PACK_SUMMARY.md"), f"""# Phase 65 — Governance Mirror Sync Service + Executive Live Dashboard Activation
## Execution Pack Summary

Timestamp:             {TIMESTAMP}
Source of Truth:       {source_commit}
Mirror Sync State:     {mirror_sync_state}
Dashboard State:       {dashboard_state}
Activation Readiness:  {activation_readiness}
Runtime Valid:         {runtime_valid}
Prior Gates OK:        {prior_gates_ok}
Linkage Phase 62:      {link62['status']}
Linkage Phase 63:      {link63['status']}
Linkage Phase 64:      {link64['status']}
""")

# ── Gate result ───────────────────────────────────────────────────────────────
gate_passed_flag = (
    linkage_ok and
    runtime_valid and
    prior_gates_ok and
    mirror_sync_state in ("MIRROR_SYNC_OPERATIONAL", "MIRROR_SYNC_WARNING") and
    dashboard_state in ("DASHBOARD_OPERATIONAL", "DASHBOARD_WARNING")
)

gate_status = "PASSED" if gate_passed_flag else "FAILED"

gate_lines = [
    f"# Phase 65 Gate Result",
    f"",
    f"STATUS={gate_status}",
    f"MIRROR_SYNC_STATE={mirror_sync_state}",
    f"DASHBOARD_STATE={dashboard_state}",
    f"ACTIVATION_READINESS={activation_readiness}",
    f"TIMESTAMP={TIMESTAMP}",
    f"SOURCE_OF_TRUTH_COMMIT={source_commit}",
    f"",
]

if not gate_passed_flag:
    gate_lines.append("## Failure Reasons")
    if not linkage_ok:
        for lnk in [link62, link63, link64]:
            if lnk["status"] != "LINKED":
                gate_lines.append(f"- {lnk['label']} linkage BROKEN — missing: {lnk['missing']}")
    if not runtime_valid:
        gate_lines.append("- Runtime state invalid")
    if not prior_gates_ok:
        gate_lines.append(f"- Prior gates: p62={p62_gate} p63={p63_gate} p64={p64_gate}")
    if mirror_sync_state not in ("MIRROR_SYNC_OPERATIONAL", "MIRROR_SYNC_WARNING"):
        gate_lines.append(f"- Mirror sync state: {mirror_sync_state}")

write_text(os.path.join(EVIDENCE_DIR, "GATE_RESULT.md"), "\n".join(gate_lines) + "\n")

print(f"MIRROR_SYNC_STATE={mirror_sync_state}")
print(f"DASHBOARD_STATE={dashboard_state}")
print(f"ACTIVATION_READINESS={activation_readiness}")
print(f"GATE={gate_status}")
print(f"EVIDENCE_DIR={EVIDENCE_DIR}")

if not gate_passed_flag:
    sys.exit(1)
PYEOF

echo ""
echo "─── Phase 65 Evidence Run Complete ───"
echo "EVIDENCE_DIR=$EVIDENCE_DIR"
echo ""
cat "$EVIDENCE_DIR/GATE_RESULT.md"
