#!/usr/bin/env bash
set -euo pipefail

# ─── Phase 70: Acknowledgement Tracking + End-to-End Notification Closure Governance
# Validates Phase 62–69 evidence linkage.
# Measures current runtime posture via local server.
# Derives acknowledgement posture from Phase 68 dispatch audits and Phase 69 assurance status.
# Produces end-to-end closure governance artifacts.
# Does NOT mutate production state.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=43170
BASE_URL="http://localhost:$PORT"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_DIR="$REPO_ROOT/evidence/phase70_${TIMESTAMP}"
TMP_SERVER="$REPO_ROOT/.tmp_phase70_server.js"
TARGETS="$REPO_ROOT/ops/governance/acknowledgement_tracking_targets.json"

# ─── Locate prior phase evidence ─────────────────────────────────────────────
PHASE62_DIR="$(ls -d "$REPO_ROOT/evidence/phase62_"* 2>/dev/null | sort | tail -1 || true)"
PHASE63_DIR="$(ls -d "$REPO_ROOT/evidence/phase63_"* 2>/dev/null | sort | tail -1 || true)"
PHASE64_DIR="$(ls -d "$REPO_ROOT/evidence/phase64_"* 2>/dev/null | sort | tail -1 || true)"
PHASE65_DIR="$(ls -d "$REPO_ROOT/evidence/phase65_"* 2>/dev/null | sort | tail -1 || true)"
PHASE66_DIR="$(ls -d "$REPO_ROOT/evidence/phase66_"* 2>/dev/null | sort | tail -1 || true)"
PHASE67_DIR="$(ls -d "$REPO_ROOT/evidence/phase67_"* 2>/dev/null | sort | tail -1 || true)"
PHASE68_DIR="$(ls -d "$REPO_ROOT/evidence/phase68_"* 2>/dev/null | sort | tail -1 || true)"
PHASE69_DIR="$(ls -d "$REPO_ROOT/evidence/phase69_"* 2>/dev/null | sort | tail -1 || true)"

if [[ -z "$PHASE62_DIR" ]]; then echo "FAIL: no phase62 evidence directory found"; exit 1; fi
if [[ -z "$PHASE63_DIR" ]]; then echo "FAIL: no phase63 evidence directory found"; exit 1; fi
if [[ -z "$PHASE64_DIR" ]]; then echo "FAIL: no phase64 evidence directory found"; exit 1; fi
if [[ -z "$PHASE65_DIR" ]]; then echo "FAIL: no phase65 evidence directory found"; exit 1; fi
if [[ -z "$PHASE66_DIR" ]]; then echo "FAIL: no phase66 evidence directory found"; exit 1; fi
if [[ -z "$PHASE67_DIR" ]]; then echo "FAIL: no phase67 evidence directory found"; exit 1; fi
if [[ -z "$PHASE68_DIR" ]]; then echo "FAIL: no phase68 evidence directory found"; exit 1; fi
if [[ -z "$PHASE69_DIR" ]]; then echo "FAIL: no phase69 evidence directory found"; exit 1; fi

echo "Phase 62 evidence: $PHASE62_DIR"
echo "Phase 63 evidence: $PHASE63_DIR"
echo "Phase 64 evidence: $PHASE64_DIR"
echo "Phase 65 evidence: $PHASE65_DIR"
echo "Phase 66 evidence: $PHASE66_DIR"
echo "Phase 67 evidence: $PHASE67_DIR"
echo "Phase 68 evidence: $PHASE68_DIR"
echo "Phase 69 evidence: $PHASE69_DIR"

mkdir -p "$EVIDENCE_DIR/responses" "$EVIDENCE_DIR/samples"

# ─── Write inline server ──────────────────────────────────────────────────────
cat > "$TMP_SERVER" << 'SERVEREOF'
const http = require("http");
const fs   = require("fs");
const path = require("path");

const ROOT = process.env.PHASE70_REPO_ROOT;
if (!ROOT) { console.error("PHASE70_REPO_ROOT not set"); process.exit(1); }
const PORT = parseInt(process.env.PHASE70_PORT || "43170", 10);

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

function errEnvelope(code, msg) {
  return { ok: false, code, data: null, errors: [msg], meta: { timestamp: new Date().toISOString() } };
}

const modules = [];
const { createPhase51Module } = require(path.join(ROOT, "prowork_runtime/api/src/phase51/phase51Module.js"));
modules.push(createPhase51Module({ dataDir: path.join(ROOT, "prowork_runtime/api/data") }));

for (let n = 52; n <= 61; n++) {
  const modPath = path.join(ROOT, `prowork_runtime/api/src/phase${n}/phase${n}Module.js`);
  if (!fs.existsSync(modPath)) continue;
  try {
    const mod = require(modPath);
    const factoryKey = Object.keys(mod).find(k => k.startsWith("create"));
    if (!factoryKey) continue;
    const resolveState = () => {
      try { return JSON.parse(fs.readFileSync(path.join(ROOT, "prowork_runtime/api/data/phase51-runtime.json"), "utf8")); } catch { return {}; }
    };
    const resolveProductionState = () => {
      try { return JSON.parse(fs.readFileSync(path.join(ROOT, "prowork_runtime/api/data/phase59-production-state.json"), "utf8")); } catch { return {}; }
    };
    const resolveHypercareState = () => {
      try { return JSON.parse(fs.readFileSync(path.join(ROOT, "prowork_runtime/api/data/phase61-hypercare-state.json"), "utf8")); } catch { return {}; }
    };
    let instance;
    if (n <= 58) instance = mod[factoryKey]({ resolveState });
    else if (n === 61) instance = mod[factoryKey]({ resolveProductionState, resolveHypercareState });
    else instance = mod[factoryKey]({ resolveProductionState });
    modules.push(instance);
  } catch(e) {
    console.error(`Warning: could not load phase${n}Module:`, e.message);
  }
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, `http://localhost:${PORT}`).pathname;
  for (const mod of modules) {
    if (typeof mod.route === "function") {
      const handled = await mod.route(req, res, pathname);
      if (handled) return;
    }
  }
  json(res, 404, errEnvelope(404, `Route not found: ${pathname}`));
});

server.listen(PORT, "127.0.0.1", () => console.log(`phase70-server listening on ${PORT}`));
SERVEREOF

# ─── Start server ─────────────────────────────────────────────────────────────
PHASE70_REPO_ROOT="$REPO_ROOT" PHASE70_PORT="$PORT" node "$TMP_SERVER" > "$EVIDENCE_DIR/server.log" 2>&1 &
SERVER_PID=$!
trap "kill $SERVER_PID 2>/dev/null || true; rm -f '$TMP_SERVER'" EXIT

for i in $(seq 1 20); do
  if curl -sf "$BASE_URL/api/production/status" \
      -H "x-actor-id: phase70-evidence" \
      -H "x-actor-role: GOVERNANCE_MONITOR" \
      -H "x-tenant-id: tenant_demo_001" \
      -H "x-api-key: demo-key-001" \
      -o /dev/null 2>/dev/null; then
    echo "Server ready after ${i} attempts"; break
  fi
  sleep 0.3
done

COMMON_HEADERS=(
  -H "x-actor-id: phase70-evidence"
  -H "x-actor-role: GOVERNANCE_MONITOR"
  -H "x-tenant-id: tenant_demo_001"
  -H "x-api-key: demo-key-001"
)

route_slug() {
  case "$1" in
    /api/production/status)                       echo "production_status" ;;
    /api/production/go-live-certification)        echo "go_live_certification" ;;
    /api/operations/hypercare/status)             echo "hypercare_status" ;;
    /api/operations/hypercare/rollback-readiness) echo "rollback_readiness" ;;
    *) echo "unknown" ;;
  esac
}

CRITICAL_ROUTES=(
  "/api/production/status"
  "/api/production/go-live-certification"
  "/api/operations/hypercare/status"
  "/api/operations/hypercare/rollback-readiness"
)

# ─── Capture fresh responses ──────────────────────────────────────────────────
for route in "${CRITICAL_ROUTES[@]}"; do
  name="$(route_slug "$route")"
  curl -sf "${COMMON_HEADERS[@]}" \
    -o "$EVIDENCE_DIR/responses/${name}.json" \
    -w "%{http_code}\t%{time_total}\n" \
    "$BASE_URL$route" \
    >> "$EVIDENCE_DIR/responses/${name}.timing" 2>/dev/null || true
done

# ─── Sample each critical route 5 times ──────────────────────────────────────
for route in "${CRITICAL_ROUTES[@]}"; do
  name="$(route_slug "$route")"
  SAMPLE_FILE="$EVIDENCE_DIR/samples/${name}.tsv"
  echo -e "sample_index\troute\thttp_code\ttime_total_seconds" > "$SAMPLE_FILE"
  for i in 1 2 3 4 5; do
    result="$(curl -sf "${COMMON_HEADERS[@]}" \
      -o /dev/null \
      -w "%{http_code}\t%{time_total}" \
      "$BASE_URL$route" 2>/dev/null || echo "000\t0.000")"
    printf '%s\t%s\t%s\n' "$i" "$route" "$result" >> "$SAMPLE_FILE"
  done
done

# ─── Python: validate linkage + compute closure + write artifacts ─────────────
python3 - << PYEOF
import json, os, sys, subprocess, statistics
from datetime import datetime, timezone

ROOT         = "$REPO_ROOT"
EVIDENCE_DIR = "$EVIDENCE_DIR"
PHASE62_DIR  = "$PHASE62_DIR"
PHASE63_DIR  = "$PHASE63_DIR"
PHASE64_DIR  = "$PHASE64_DIR"
PHASE65_DIR  = "$PHASE65_DIR"
PHASE66_DIR  = "$PHASE66_DIR"
PHASE67_DIR  = "$PHASE67_DIR"
PHASE68_DIR  = "$PHASE68_DIR"
PHASE69_DIR  = "$PHASE69_DIR"
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

# ── Evidence linkage validation ───────────────────────────────────────────────
phase_dirs = {
    "phase62": PHASE62_DIR,
    "phase63": PHASE63_DIR,
    "phase64": PHASE64_DIR,
    "phase65": PHASE65_DIR,
    "phase66": PHASE66_DIR,
    "phase67": PHASE67_DIR,
    "phase68": PHASE68_DIR,
    "phase69": PHASE69_DIR,
}
required_map = {
    "phase62": targets.get("required_phase62_files", []),
    "phase63": targets.get("required_phase63_files", []),
    "phase64": targets.get("required_phase64_files", []),
    "phase65": targets.get("required_phase65_files", []),
    "phase66": targets.get("required_phase66_files", []),
    "phase67": targets.get("required_phase67_files", []),
    "phase68": targets.get("required_phase68_files", []),
    "phase69": targets.get("required_phase69_files", []),
}

linkage = {}
for phase, d in phase_dirs.items():
    missing = [f for f in required_map[phase] if not os.path.isfile(os.path.join(d, f))]
    linkage[phase] = {"directory": d, "status": "LINKED" if not missing else "BROKEN", "missing": missing}

linkage_ok = all(l["status"] == "LINKED" for l in linkage.values())

# ── Fresh runtime state (pluck unwraps .data envelope) ───────────────────────
RESP = os.path.join(EVIDENCE_DIR, "responses")

deploy_status = pluck(os.path.join(RESP, "production_status.json"),    "deploymentStatus")
cert_status   = pluck(os.path.join(RESP, "go_live_certification.json"),"goLiveCertification")
hc_state      = pluck(os.path.join(RESP, "hypercare_status.json"),     "hypercareState")
rb_ready      = pluck(os.path.join(RESP, "rollback_readiness.json"),   "rollbackReady")

runtime_state = {
    "deploymentStatus":    deploy_status,
    "goLiveCertification": cert_status,
    "hypercareState":      hc_state,
    "rollbackReady":       rb_ready,
}

expected      = targets.get("expected_runtime_state", {})
missing_keys  = [k for k, v in runtime_state.items() if v is None]
mismatches    = [{"key": k, "expected": expected[k], "actual": runtime_state[k]}
                 for k in expected if runtime_state.get(k) != expected[k]]
runtime_valid = not missing_keys and not mismatches

# ── Sampling metrics ──────────────────────────────────────────────────────────
warn_thresh   = targets.get("warning_thresholds", {})
breach_thresh = targets.get("breach_thresholds", {})

route_name_map = {
    "production_status":    "/api/production/status",
    "go_live_certification":"/api/production/go-live-certification",
    "hypercare_status":     "/api/operations/hypercare/status",
    "rollback_readiness":   "/api/operations/hypercare/rollback-readiness",
}

route_metrics   = []
warning_count   = 0
escalated_count = 0
critical_count  = 0
SAMPLES = os.path.join(EVIDENCE_DIR, "samples")

for name, route in route_name_map.items():
    sample_file = os.path.join(SAMPLES, f"{name}.tsv")
    rows = []
    try:
        lines = open(sample_file).read().strip().split("\n")[1:]
        for line in lines:
            parts = line.strip().split("\t")
            if len(parts) == 4:
                _, _, http_code, time_total = parts
                rows.append({"http_code": int(http_code), "time_ms": float(time_total) * 1000})
    except Exception as e:
        print(f"WARN: could not parse samples for {name}: {e}")

    n = len(rows)
    if n == 0:
        route_metrics.append({"route": route, "sample_count": 0, "route_posture": "CRITICAL"})
        critical_count += 1
        continue

    ok_count   = sum(1 for r in rows if 200 <= r["http_code"] < 300)
    fail_count = n - ok_count
    avail      = round(ok_count / n * 100, 4)
    err_rate   = round(fail_count / n * 100, 4)
    times_ms   = [r["time_ms"] for r in rows]
    avg_lat    = round(statistics.mean(times_ms), 3)
    max_lat    = round(max(times_ms), 3)

    if ok_count == 0:
        posture = "CRITICAL"; critical_count += 1
    elif (avail   < breach_thresh.get("availability_percent_min", 99.9) or
          avg_lat > breach_thresh.get("avg_latency_ms_max", 1000) or
          max_lat > breach_thresh.get("max_latency_ms_max", 2500) or
          err_rate > breach_thresh.get("error_rate_percent_max", 0.5)):
        posture = "ESCALATED"; escalated_count += 1
    elif (avail   < warn_thresh.get("availability_percent_min_warning", 99.95) or
          avg_lat > warn_thresh.get("avg_latency_ms_max_warning", 850) or
          max_lat > warn_thresh.get("max_latency_ms_max_warning", 2000) or
          err_rate > warn_thresh.get("error_rate_percent_max_warning", 0.1)):
        posture = "WARNING"; warning_count += 1
    else:
        posture = "PASS"

    route_metrics.append({
        "route":                route,
        "sample_count":         n,
        "success_count":        ok_count,
        "failure_count":        fail_count,
        "availability_percent": avail,
        "error_rate_percent":   err_rate,
        "avg_latency_ms":       avg_lat,
        "max_latency_ms":       max_lat,
        "route_posture":        posture,
    })

# ── Prior gate check ──────────────────────────────────────────────────────────
def gate_passed(d):
    try: return "STATUS=PASSED" in open(os.path.join(d, "GATE_RESULT.md")).read()
    except: return False

prior_gates_ok = all(gate_passed(phase_dirs[p]) for p in phase_dirs)

# ── Load phase68 dispatch audits and phase69 assurance for ack computation ────
slack_dispatch   = load_json(os.path.join(PHASE68_DIR, "SLACK_DISPATCH_AUDIT.json"))
email_dispatch   = load_json(os.path.join(PHASE68_DIR, "EMAIL_DISPATCH_AUDIT.json"))
webhook_dispatch = load_json(os.path.join(PHASE68_DIR, "WEBHOOK_DISPATCH_AUDIT.json"))
assurance_status = load_json(os.path.join(PHASE69_DIR, "NOTIFICATION_ASSURANCE_STATUS.json"))

channel_assurance_map = assurance_status.get("channelAssurance", {})

def build_ack(channel_type, dispatch_audit):
    prior_dispatch  = dispatch_audit.get("executionResult")
    prior_assurance = channel_assurance_map.get(channel_type)

    if prior_dispatch is None or prior_assurance is None:
        return {
            "channelType":           channel_type,
            "priorDispatchResult":   prior_dispatch,
            "priorAssuranceStatus":  prior_assurance,
            "acknowledgementStatus": "ACKNOWLEDGEMENT_BLOCKED",
            "closureContribution":   "BLOCKED",
            "decisionAtUtc":         TIMESTAMP,
            "resultSummary":         "Acknowledgement blocked because required dispatch or assurance linkage is missing.",
        }
    if prior_dispatch == "SUCCESS" and prior_assurance == "ASSURED":
        return {
            "channelType":           channel_type,
            "priorDispatchResult":   prior_dispatch,
            "priorAssuranceStatus":  prior_assurance,
            "acknowledgementStatus": "ACKNOWLEDGED",
            "closureContribution":   "CLOSED",
            "decisionAtUtc":         TIMESTAMP,
            "resultSummary":         "Acknowledged based on successful prior dispatch and assured prior notification state.",
        }
    return {
        "channelType":           channel_type,
        "priorDispatchResult":   prior_dispatch,
        "priorAssuranceStatus":  prior_assurance,
        "acknowledgementStatus": "PENDING_ACKNOWLEDGEMENT",
        "closureContribution":   "PARTIAL_CLOSURE",
        "decisionAtUtc":         TIMESTAMP,
        "resultSummary":         "Acknowledgement not fully closed because prior delivery assurance is not complete.",
    }

slack_ack   = build_ack("SLACK_CHANNEL",   slack_dispatch)
email_ack   = build_ack("EMAIL_CHANNEL",   email_dispatch)
webhook_ack = build_ack("WEBHOOK_CHANNEL", webhook_dispatch)

acks              = [slack_ack, email_ack, webhook_ack]
acknowledged_count= sum(1 for a in acks if a["acknowledgementStatus"] == "ACKNOWLEDGED")
pending_count     = sum(1 for a in acks if a["acknowledgementStatus"] == "PENDING_ACKNOWLEDGEMENT")
blocked_count     = sum(1 for a in acks if a["acknowledgementStatus"] == "ACKNOWLEDGEMENT_BLOCKED")

# ── Closure state ─────────────────────────────────────────────────────────────
if not linkage_ok or not runtime_valid or critical_count > 0 or blocked_count > 0:
    closure_state    = "CLOSURE_BLOCKED"
    activation_ready = "BLOCKED"
    closure_actions  = [
        "block_closure_claim",
        "require_immediate_operator_review",
        "preserve_all_current_artifacts",
    ]
elif not prior_gates_ok or escalated_count > 0:
    closure_state    = "CLOSURE_ESCALATED"
    activation_ready = "REVIEW_REQUIRED"
    closure_actions  = [
        "record_escalated_closure_audit",
        "require_operator_review",
        "preserve_all_current_artifacts",
    ]
elif warning_count > 0 or pending_count > 0:
    closure_state    = "CLOSURE_WARNING"
    activation_ready = "READY"
    closure_actions  = [
        "record_warning_closure_audit",
        "flag_pending_acknowledgements",
        "tighten_next_review",
    ]
else:
    closure_state    = "CLOSURE_OPERATIONAL"
    activation_ready = "READY"
    closure_actions  = [
        "record_acknowledgement_closure",
        "retain_latest_evidence",
        "confirm_end_to_end_notification_closure",
    ]

source_commit = git_head(ROOT)

# ── Write artifacts ───────────────────────────────────────────────────────────
write_json(os.path.join(EVIDENCE_DIR, "ACKNOWLEDGEMENT_BASELINE.json"), {
    "generated_at_utc":    TIMESTAMP,
    "sourceOfTruthCommit": source_commit,
    "linkedEvidenceDirs":  phase_dirs,
    "critical_routes":     targets.get("critical_routes", []),
    "warning_thresholds":  warn_thresh,
    "breach_thresholds":   breach_thresh,
})

write_json(os.path.join(EVIDENCE_DIR, "ACKNOWLEDGEMENT_TRACKING_STATUS.json"), {
    "generated_at_utc":    TIMESTAMP,
    "sourceOfTruthCommit": source_commit,
    "latestEvidenceDir":   EVIDENCE_DIR,
    "runtimeState":        runtime_state,
    "closureState":        closure_state,
    "activationReadiness": activation_ready,
    "routeMetrics":        route_metrics,
    "missingRuntimeKeys":  missing_keys,
    "runtimeMismatches":   mismatches,
    "linkageStatus":       {p: l["status"] for p, l in linkage.items()},
    "priorGatesOk":        prior_gates_ok,
})

write_json(os.path.join(EVIDENCE_DIR, "SLACK_ACKNOWLEDGEMENT_AUDIT.json"),   slack_ack)
write_json(os.path.join(EVIDENCE_DIR, "EMAIL_ACKNOWLEDGEMENT_AUDIT.json"),   email_ack)
write_json(os.path.join(EVIDENCE_DIR, "WEBHOOK_ACKNOWLEDGEMENT_AUDIT.json"), webhook_ack)

write_json(os.path.join(EVIDENCE_DIR, "END_TO_END_NOTIFICATION_CLOSURE_STATUS.json"), {
    "generated_at_utc":    TIMESTAMP,
    "sourceOfTruthCommit": source_commit,
    "closureState":        closure_state,
    "activationReadiness": activation_ready,
    "acknowledgementTracking": {
        "SLACK_CHANNEL":   slack_ack["acknowledgementStatus"],
        "EMAIL_CHANNEL":   email_ack["acknowledgementStatus"],
        "WEBHOOK_CHANNEL": webhook_ack["acknowledgementStatus"],
    },
    "closureContribution": {
        "SLACK_CHANNEL":   slack_ack["closureContribution"],
        "EMAIL_CHANNEL":   email_ack["closureContribution"],
        "WEBHOOK_CHANNEL": webhook_ack["closureContribution"],
    },
})

write_json(os.path.join(EVIDENCE_DIR, "CLOSURE_GOVERNANCE_ACTIONS.json"), {
    "generated_at_utc": TIMESTAMP,
    "closureState":     closure_state,
    "actions":          closure_actions,
})

write_json(os.path.join(EVIDENCE_DIR, "ACKNOWLEDGEMENT_ASSURANCE_SUMMARY.json"), {
    "generated_at_utc":              TIMESTAMP,
    "sourceOfTruthCommit":           source_commit,
    "closureState":                  closure_state,
    "activationReadiness":           activation_ready,
    "acknowledgedChannelCount":      acknowledged_count,
    "pendingAcknowledgementCount":   pending_count,
    "blockedAcknowledgementCount":   blocked_count,
    "recommendedActions":            closure_actions,
})

write_json(os.path.join(EVIDENCE_DIR, "CHANNEL_CLOSURE_READINESS.json"), {
    "generated_at_utc":              TIMESTAMP,
    "acknowledgedChannelCount":      acknowledged_count,
    "pendingAcknowledgementCount":   pending_count,
    "blockedAcknowledgementCount":   blocked_count,
    "allChannelsAcknowledged":       acknowledged_count == len(acks),
})

# ── Linkage summaries ─────────────────────────────────────────────────────────
for phase, lnk in linkage.items():
    label = phase.upper()
    lines = [
        f"# {label} Linkage Summary", "",
        f"Directory: {lnk['directory']}",
        f"Status: {lnk['status']}", "",
        "## Required Files",
    ]
    for f in required_map[phase]:
        fp   = os.path.join(lnk["directory"], f)
        mark = "PRESENT" if os.path.isfile(fp) else "MISSING"
        lines.append(f"- [{mark}] {f}")
    if lnk["missing"]:
        lines += ["", f"MISSING FILES: {', '.join(lnk['missing'])}"]
    write_text(os.path.join(EVIDENCE_DIR, f"{label}_LINKAGE_SUMMARY.md"), "\n".join(lines) + "\n")

# ── Review snapshot ───────────────────────────────────────────────────────────
write_text(os.path.join(EVIDENCE_DIR, "REVIEW_SNAPSHOT.md"), f"""# Phase 70 — Acknowledgement Tracking + End-to-End Closure Review Snapshot

Timestamp: {TIMESTAMP}
Source of Truth Commit: {source_commit}

## Closure State
{closure_state}

## Activation Readiness
{activation_ready}

## Channel Acknowledgement
- Slack:   {slack_ack['acknowledgementStatus']} ({slack_ack['closureContribution']})
- Email:   {email_ack['acknowledgementStatus']} ({email_ack['closureContribution']})
- Webhook: {webhook_ack['acknowledgementStatus']} ({webhook_ack['closureContribution']})

## Closure Summary
- Acknowledged: {acknowledged_count}/3
- Pending:      {pending_count}/3
- Blocked:      {blocked_count}/3

## Runtime State
- deploymentStatus:    {deploy_status}
- goLiveCertification: {cert_status}
- hypercareState:      {hc_state}
- rollbackReady:       {rb_ready}

## Route Summary
- Warning routes:   {warning_count}
- Escalated routes: {escalated_count}
- Critical routes:  {critical_count}

## Evidence Linkage
{chr(10).join(f"- {p.upper()}: {l['status']}" for p, l in linkage.items())}

## Prior Gates
{chr(10).join(f"- {p.upper()}: {'PASSED' if gate_passed(d) else 'FAILED'}" for p, d in phase_dirs.items())}

## Closure Actions
{json.dumps(closure_actions, indent=2)}
""")

# ── Pack summary ──────────────────────────────────────────────────────────────
write_text(os.path.join(EVIDENCE_DIR, "PACK_SUMMARY.md"), f"""# Phase 70 — Acknowledgement Tracking + End-to-End Notification Closure Governance
## Execution Pack Summary

Timestamp:             {TIMESTAMP}
Source of Truth:       {source_commit}
Closure State:         {closure_state}
Activation Readiness:  {activation_ready}
Runtime Valid:         {runtime_valid}
Prior Gates OK:        {prior_gates_ok}
Acknowledged:          {acknowledged_count}/3
Pending:               {pending_count}/3
Blocked:               {blocked_count}/3
{chr(10).join(f"Linkage {p.upper()}:".ljust(23) + l['status'] for p, l in linkage.items())}
""")

# ── Gate result ───────────────────────────────────────────────────────────────
gate_pass   = closure_state != "CLOSURE_BLOCKED"
gate_status = "PASSED" if gate_pass else "FAILED"

gate_lines = [
    "# Phase 70 Gate Result", "",
    f"STATUS={gate_status}",
    f"CLOSURE_STATE={closure_state}",
    f"ACTIVATION_READINESS={activation_ready}",
    f"TIMESTAMP={TIMESTAMP}",
    f"SOURCE_OF_TRUTH_COMMIT={source_commit}", "",
]

if not gate_pass:
    gate_lines.append("## Failure Reasons")
    if not linkage_ok:
        for p, l in linkage.items():
            if l["status"] != "LINKED":
                gate_lines.append(f"- {p} linkage BROKEN — missing: {l['missing']}")
    if not runtime_valid:
        gate_lines.append(f"- Runtime state invalid — missing: {missing_keys}, mismatches: {mismatches}")
    if critical_count > 0:
        gate_lines.append(f"- {critical_count} critical route(s)")
    if blocked_count > 0:
        gate_lines.append(f"- {blocked_count} blocked acknowledgement(s)")

write_text(os.path.join(EVIDENCE_DIR, "GATE_RESULT.md"), "\n".join(gate_lines) + "\n")

print(f"CLOSURE_STATE={closure_state}")
print(f"ACTIVATION_READINESS={activation_ready}")
print(f"ACKNOWLEDGED={acknowledged_count}/3")
print(f"GATE={gate_status}")
print(f"EVIDENCE_DIR={EVIDENCE_DIR}")

if not gate_pass:
    sys.exit(1)
PYEOF

echo ""
echo "─── Phase 70 Evidence Run Complete ───"
echo "EVIDENCE_DIR=$EVIDENCE_DIR"
echo ""
cat "$EVIDENCE_DIR/GATE_RESULT.md"
