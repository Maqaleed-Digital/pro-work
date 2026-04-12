#!/usr/bin/env bash
# Phase 71-72-73 — Governance Analytics + Advisory Intelligence + Portfolio Signal Engine
# Pure filesystem analytics. No server. No HTTP calls.
set -euo pipefail

REPO_ROOT="${1:-/Users/waheebmahmoud/dev/pro-work}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_DIR="${REPO_ROOT}/evidence/phase71_72_73_${TIMESTAMP}"

SCRIPTS_DIR="${REPO_ROOT}/scripts"
CONFIG_DIR="${REPO_ROOT}/config/intelligence"
EVIDENCE_ROOT="${REPO_ROOT}/evidence"

PHASE71_SCRIPT="${SCRIPTS_DIR}/workcaptain_phase71_analytics.py"
PHASE72_SCRIPT="${SCRIPTS_DIR}/workcaptain_phase72_advisory.py"
PHASE73_SCRIPT="${SCRIPTS_DIR}/workcaptain_phase73_portfolio.py"

ADVISORY_THRESHOLDS="${CONFIG_DIR}/advisory_thresholds.json"
PORTFOLIO_REGISTRY="${CONFIG_DIR}/portfolio_registry.json"

EXPECTED_SOT="935d291f6cc8dede245ebf5ea64d214a85287c29"

echo "============================================================"
echo "Phase 71-72-73 Governance Analytics + Advisory + Portfolio"
echo "Timestamp: ${TIMESTAMP}"
echo "Evidence Dir: ${EVIDENCE_DIR}"
echo "============================================================"

# Validate SOT
CURRENT_HEAD="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
if [ "${CURRENT_HEAD}" != "${EXPECTED_SOT}" ]; then
  echo "ERROR: HEAD mismatch. Expected ${EXPECTED_SOT}, got ${CURRENT_HEAD}"
  exit 1
fi
echo "SOT validated: ${CURRENT_HEAD}"

# Validate evidence root exists
if [ ! -d "${EVIDENCE_ROOT}" ]; then
  echo "ERROR: evidence root not found: ${EVIDENCE_ROOT}"
  exit 1
fi

# Validate scripts
for f in "${PHASE71_SCRIPT}" "${PHASE72_SCRIPT}" "${PHASE73_SCRIPT}"; do
  if [ ! -f "${f}" ]; then
    echo "ERROR: script not found: ${f}"
    exit 1
  fi
done

# Validate config
for f in "${ADVISORY_THRESHOLDS}" "${PORTFOLIO_REGISTRY}"; do
  if [ ! -f "${f}" ]; then
    echo "ERROR: config not found: ${f}"
    exit 1
  fi
done

mkdir -p "${EVIDENCE_DIR}"
echo "Evidence directory created: ${EVIDENCE_DIR}"

# ─── Phase 71 ─────────────────────────────────────────────────
echo ""
echo "--- Phase 71: Governance Analytics ---"
python3 "${PHASE71_SCRIPT}" "${EVIDENCE_ROOT}" "${EVIDENCE_DIR}"

METRICS_PATH="${EVIDENCE_DIR}/governance_metrics.json"
if [ ! -f "${METRICS_PATH}" ]; then
  echo "ERROR: Phase 71 did not produce governance_metrics.json"
  exit 1
fi
echo "Phase 71 complete."

# ─── Phase 72 ─────────────────────────────────────────────────
echo ""
echo "--- Phase 72: Advisory Intelligence ---"
python3 "${PHASE72_SCRIPT}" "${METRICS_PATH}" "${ADVISORY_THRESHOLDS}" "${EVIDENCE_DIR}"

ADVISORY_SIGNALS_PATH="${EVIDENCE_DIR}/advisory_signals.json"
if [ ! -f "${ADVISORY_SIGNALS_PATH}" ]; then
  echo "ERROR: Phase 72 did not produce advisory_signals.json"
  exit 1
fi
echo "Phase 72 complete."

# ─── Phase 73 ─────────────────────────────────────────────────
echo ""
echo "--- Phase 73: Portfolio Signal Engine ---"
python3 "${PHASE73_SCRIPT}" "${PORTFOLIO_REGISTRY}" "${ADVISORY_SIGNALS_PATH}" "${EVIDENCE_DIR}"

BOARD_INTEL_PATH="${EVIDENCE_DIR}/board_intelligence.json"
if [ ! -f "${BOARD_INTEL_PATH}" ]; then
  echo "ERROR: Phase 73 did not produce board_intelligence.json"
  exit 1
fi
echo "Phase 73 complete."

# ─── Execution Report ─────────────────────────────────────────
echo ""
echo "--- Writing Execution Report ---"

PHASE71_POSTURE="$(python3 -c "import json; d=json.load(open('${METRICS_PATH}')); print(d.get('overall_governance_posture','UNKNOWN'))")"
PHASE72_SEVERITY="$(python3 -c "import json; d=json.load(open('${ADVISORY_SIGNALS_PATH}')); print(d.get('overall_advisory_severity','UNKNOWN'))")"
PHASE73_STATE="$(python3 -c "import json; d=json.load(open('${BOARD_INTEL_PATH}')); print(d.get('portfolio_state','UNKNOWN'))")"

cat > "${EVIDENCE_DIR}/EXECUTION_REPORT.md" << REPORT_EOF
# Phase 71-72-73 Execution Report

Timestamp: ${TIMESTAMP}
SOT Commit: ${CURRENT_HEAD}
Evidence Dir: ${EVIDENCE_DIR}

## Phase 71 — Governance Analytics
- Overall Governance Posture: ${PHASE71_POSTURE}

## Phase 72 — Advisory Intelligence
- Overall Advisory Severity: ${PHASE72_SEVERITY}

## Phase 73 — Portfolio Signal Engine
- Portfolio State: ${PHASE73_STATE}

## Status
STATUS=PASSED
REPORT_EOF

echo "  wrote EXECUTION_REPORT.md"

# ─── Manifest ─────────────────────────────────────────────────
echo ""
echo "--- Writing Manifest ---"
(
  cd "${EVIDENCE_DIR}"
  find . -type f | sort > MANIFEST.txt
  echo "  wrote MANIFEST.txt"
  if command -v shasum &>/dev/null; then
    shasum -a 256 -c /dev/null 2>/dev/null || true
    find . -type f ! -name "MANIFEST.sha256" | sort | xargs shasum -a 256 > MANIFEST.sha256
    echo "  wrote MANIFEST.sha256"
  fi
)

# ─── Output ───────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "PHASE_71_72_73_PASS"
echo "NEW_SOURCE_OF_TRUTH_COMMIT=${CURRENT_HEAD}"
echo "EVIDENCE_RUN_DIR=evidence/phase71_72_73_${TIMESTAMP}"
echo "GOVERNANCE_POSTURE=${PHASE71_POSTURE}"
echo "ADVISORY_SEVERITY=${PHASE72_SEVERITY}"
echo "PORTFOLIO_STATE=${PHASE73_STATE}"
echo "============================================================"
