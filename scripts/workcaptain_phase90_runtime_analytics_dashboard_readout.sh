#!/usr/bin/env bash
set -euo pipefail

EVIDENCE_DIR="${1:-}"
if [ -z "${EVIDENCE_DIR}" ]; then
  echo "ERROR: evidence dir argument is required"
  exit 1
fi

REPO_ROOT="/Users/waheebmahmoud/dev/pro-work"
FND_DIR="${REPO_ROOT}/FND"
CFG_DIR="${REPO_ROOT}/config/analytics"
SQL_DIR="${REPO_ROOT}/analytics/sql"

mkdir -p "${EVIDENCE_DIR}"

required_files=(
  "${FND_DIR}/WORKCAPTAIN_PHASE_90_RUNTIME_ANALYTICS_WIRING_AND_DASHBOARD_ACTIVATION.md"
  "${FND_DIR}/WORKCAPTAIN_RUNTIME_ANALYTICS_WIRING_PROTOCOL.md"
  "${FND_DIR}/WORKCAPTAIN_DASHBOARD_ACTIVATION_MODEL.md"
  "${FND_DIR}/WORKCAPTAIN_FIRST_KPI_LIVE_READOUT_PROTOCOL.md"
  "${FND_DIR}/WORKCAPTAIN_ANALYTICS_ENVIRONMENT_CONTRACT.md"
  "${CFG_DIR}/runtime_activation_targets.json"
  "${CFG_DIR}/dashboard_registry.json"
  "${CFG_DIR}/first_kpi_queries.json"
  "${CFG_DIR}/runtime_env.example"
  "${SQL_DIR}/001_mart_daily_product_kpis.sql"
  "${SQL_DIR}/002_mart_daily_execution_kpis.sql"
  "${SQL_DIR}/003_mart_daily_trust_kpis.sql"
  "${SQL_DIR}/004_mart_funnel_steps.sql"
)

for file in "${required_files[@]}"; do
  if [ ! -f "${file}" ]; then
    echo "ERROR: required file missing -> ${file}"
    exit 1
  fi
done

if command -v python3 >/dev/null 2>&1; then
  python3 - <<'PY' "${CFG_DIR}/runtime_activation_targets.json" "${CFG_DIR}/dashboard_registry.json" "${CFG_DIR}/first_kpi_queries.json" > "${EVIDENCE_DIR}/JSON_VALIDATION.txt"
import json, sys
for path in sys.argv[1:]:
    with open(path, "r", encoding="utf-8") as fh:
        json.load(fh)
    print(f"JSON_OK {path}")
PY
else
  echo "WARNING: python3 not found; JSON validation skipped" > "${EVIDENCE_DIR}/JSON_VALIDATION.txt"
fi

{
  echo "PHASE_90_SCOPE=RUNTIME_ANALYTICS_WIRING_DASHBOARD_ACTIVATION_FIRST_KPI_READOUT"
  echo "RUN_AT_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "REPO_ROOT=${REPO_ROOT}"
  echo "CURRENT_HEAD=$(git -C "${REPO_ROOT}" rev-parse HEAD)"
  echo "CURRENT_BRANCH=$(git -C "${REPO_ROOT}" branch --show-current)"
} > "${EVIDENCE_DIR}/RUN_CONTEXT.txt"

if [ -n "${WORKCAPTAIN_BQ_PROJECT_ID:-}" ] && [ -n "${WORKCAPTAIN_BQ_DATASET:-}" ]; then
  {
    echo "KPI_READOUT_STATUS=READY"
    echo "WORKCAPTAIN_BQ_PROJECT_ID=${WORKCAPTAIN_BQ_PROJECT_ID}"
    echo "WORKCAPTAIN_BQ_DATASET=${WORKCAPTAIN_BQ_DATASET}"
    echo "SELECTED_KPI=daily_active_users"
    echo "QUERY_PATH=analytics/sql/001_mart_daily_product_kpis.sql"
    echo "NOTE=Warehouse variables present. Real query execution may proceed in operator environment."
  } > "${EVIDENCE_DIR}/FIRST_KPI_READOUT.txt"
else
  {
    echo "KPI_READOUT_STATUS=BLOCKED"
    echo "REASON=Missing WORKCAPTAIN_BQ_PROJECT_ID and/or WORKCAPTAIN_BQ_DATASET"
    echo "SELECTED_KPI=daily_active_users"
    echo "QUERY_PATH=analytics/sql/001_mart_daily_product_kpis.sql"
  } > "${EVIDENCE_DIR}/FIRST_KPI_READOUT.txt"
fi

TARGET_JSON="${CFG_DIR}/runtime_activation_targets.json"
python3 - <<'PY' "${TARGET_JSON}" "${REPO_ROOT}" > "${EVIDENCE_DIR}/RUNTIME_TARGET_DISCOVERY.txt"
import json, os, sys
target_json, repo_root = sys.argv[1], sys.argv[2]
with open(target_json, "r", encoding="utf-8") as fh:
    data = json.load(fh)
for target in data["activation_targets"]:
    found = []
    for path in target["candidate_paths"]:
        abs_path = os.path.join(repo_root, path)
        if os.path.exists(abs_path):
            found.append(path)
    print(f"TARGET_CLASS={target['target_class']}")
    print(f"REQUIRED={str(target['required']).upper()}")
    if found:
        print("FOUND=" + ",".join(found))
    else:
        print("FOUND=")
    print("---")
PY

{
  echo "PHASE_90_VERIFICATION"
  echo "====================="
  echo "PASS: required documents present"
  echo "PASS: activation registries present"
  echo "PASS: dashboard registry present"
  echo "PASS: KPI query registry present"
  echo "PASS: SQL view definitions present"
  echo "PASS: JSON registry validation complete"
  echo ""
  echo "NOTE:"
  echo "This phase intentionally defines runtime activation contracts, dashboard assets, and readout tooling"
  echo "without mutating undocumented runtime source files."
  echo "Live KPI readout is READY only when warehouse variables are provided."
} > "${EVIDENCE_DIR}/GATE_RESULT.txt"

grep -n "Objective" "${FND_DIR}/WORKCAPTAIN_PHASE_90_RUNTIME_ANALYTICS_WIRING_AND_DASHBOARD_ACTIVATION.md" > "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "executive_overview" "${CFG_DIR}/dashboard_registry.json" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "daily_active_users" "${CFG_DIR}/first_kpi_queries.json" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "mart_daily_product_kpis" "${SQL_DIR}/001_mart_daily_product_kpis.sql" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true

find "${FND_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/FND_INVENTORY.txt"
find "${CFG_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/CONFIG_INVENTORY.txt"
find "${SQL_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/SQL_INVENTORY.txt"

if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 \
    "${FND_DIR}/WORKCAPTAIN_PHASE_90_RUNTIME_ANALYTICS_WIRING_AND_DASHBOARD_ACTIVATION.md" \
    "${FND_DIR}/WORKCAPTAIN_RUNTIME_ANALYTICS_WIRING_PROTOCOL.md" \
    "${FND_DIR}/WORKCAPTAIN_DASHBOARD_ACTIVATION_MODEL.md" \
    "${FND_DIR}/WORKCAPTAIN_FIRST_KPI_LIVE_READOUT_PROTOCOL.md" \
    "${FND_DIR}/WORKCAPTAIN_ANALYTICS_ENVIRONMENT_CONTRACT.md" \
    "${CFG_DIR}/runtime_activation_targets.json" \
    "${CFG_DIR}/dashboard_registry.json" \
    "${CFG_DIR}/first_kpi_queries.json" \
    "${CFG_DIR}/runtime_env.example" \
    "${SQL_DIR}/001_mart_daily_product_kpis.sql" \
    "${SQL_DIR}/002_mart_daily_execution_kpis.sql" \
    "${SQL_DIR}/003_mart_daily_trust_kpis.sql" \
    "${SQL_DIR}/004_mart_funnel_steps.sql" \
    > "${EVIDENCE_DIR}/MANIFEST.sha256"
fi

echo "PHASE_90_VERIFICATION_PASS"
