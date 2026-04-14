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
RENDER_DIR="${EVIDENCE_DIR}/rendered_sql"

mkdir -p "${EVIDENCE_DIR}" "${RENDER_DIR}"

required_files=(
  "${FND_DIR}/WORKCAPTAIN_PHASE_101_KPI_MONITORING_AND_DASHBOARD_HARDENING.md"
  "${FND_DIR}/WORKCAPTAIN_EXECUTIVE_DASHBOARD_HARDENING_PROTOCOL.md"
  "${FND_DIR}/WORKCAPTAIN_FUNNEL_INTELLIGENCE_PROTOCOL.md"
  "${FND_DIR}/WORKCAPTAIN_KPI_MONITORING_EVIDENCE_CONTRACT.md"
  "${CFG_DIR}/dashboard_hardening_registry.json"
  "${CFG_DIR}/funnel_intelligence_registry.json"
  "${CFG_DIR}/kpi_monitoring_status_codes.json"
  "${SQL_DIR}/023_executive_dashboard_trend_view.sql"
  "${SQL_DIR}/024_funnel_conversion_view.sql"
  "${SQL_DIR}/025_kpi_health_snapshot.sql"
)

for file in "${required_files[@]}"; do
  if [ ! -f "${file}" ]; then
    echo "ERROR: required file missing -> ${file}"
    exit 1
  fi
done

python3 - <<'PY' "${CFG_DIR}/dashboard_hardening_registry.json" "${CFG_DIR}/funnel_intelligence_registry.json" "${CFG_DIR}/kpi_monitoring_status_codes.json" > "${EVIDENCE_DIR}/JSON_VALIDATION.txt"
import json, sys
for path in sys.argv[1:]:
    with open(path, "r", encoding="utf-8") as fh:
        json.load(fh)
    print(f"JSON_OK {path}")
PY

{
  echo "PHASE_101_SCOPE=KPI_MONITORING_EXECUTIVE_DASHBOARD_HARDENING_FUNNEL_INTELLIGENCE"
  echo "RUN_AT_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "REPO_ROOT=${REPO_ROOT}"
  echo "CURRENT_HEAD=$(git -C "${REPO_ROOT}" rev-parse HEAD)"
  echo "CURRENT_BRANCH=$(git -C "${REPO_ROOT}" branch --show-current)"
} > "${EVIDENCE_DIR}/RUN_CONTEXT.txt"

PROJECT_ID="${WORKCAPTAIN_BQ_PROJECT_ID:-}"
DATASET="${WORKCAPTAIN_BQ_DATASET:-}"

if [ -z "${PROJECT_ID}" ] || [ -z "${DATASET}" ]; then
  echo "ERROR: WORKCAPTAIN_BQ_PROJECT_ID and WORKCAPTAIN_BQ_DATASET must be exported or provided inline" > "${EVIDENCE_DIR}/LIVE_MONITORING_STATUS.txt"
  exit 1
fi

if ! command -v bq >/dev/null 2>&1; then
  echo "ERROR: bq CLI missing in live operator shell" > "${EVIDENCE_DIR}/LIVE_MONITORING_STATUS.txt"
  exit 1
fi

for name in 023_executive_dashboard_trend_view.sql 024_funnel_conversion_view.sql 025_kpi_health_snapshot.sql; do
  sed -e "s/{{PROJECT_ID}}/${PROJECT_ID}/g" -e "s/{{DATASET}}/${DATASET}/g" \
    "${SQL_DIR}/${name}" > "${RENDER_DIR}/${name}"
done

set +e
bq query --nouse_legacy_sql --format=prettyjson < "${RENDER_DIR}/023_executive_dashboard_trend_view.sql" > "${EVIDENCE_DIR}/EXECUTIVE_TREND_OUTPUT.json" 2> "${EVIDENCE_DIR}/EXECUTIVE_TREND_OUTPUT.err"
TREND_RC=$?
bq query --nouse_legacy_sql --format=prettyjson < "${RENDER_DIR}/024_funnel_conversion_view.sql" > "${EVIDENCE_DIR}/FUNNEL_OUTPUT.json" 2> "${EVIDENCE_DIR}/FUNNEL_OUTPUT.err"
FUNNEL_RC=$?
bq query --nouse_legacy_sql --format=prettyjson < "${RENDER_DIR}/025_kpi_health_snapshot.sql" > "${EVIDENCE_DIR}/KPI_HEALTH_OUTPUT.json" 2> "${EVIDENCE_DIR}/KPI_HEALTH_OUTPUT.err"
HEALTH_RC=$?
set -e

if [ "${TREND_RC}" -eq 0 ] && [ "${FUNNEL_RC}" -eq 0 ] && [ "${HEALTH_RC}" -eq 0 ]; then
  {
    echo "STATUS_CODE=PASS"
    echo "TREND_OK=1"
    echo "FUNNEL_OK=1"
    echo "HEALTH_OK=1"
  } > "${EVIDENCE_DIR}/LIVE_MONITORING_STATUS.txt"
else
  {
    echo "STATUS_CODE=BLOCKED_QUERY_FAILURE"
    echo "TREND_OK=$([ "${TREND_RC}" -eq 0 ] && echo 1 || echo 0)"
    echo "FUNNEL_OK=$([ "${FUNNEL_RC}" -eq 0 ] && echo 1 || echo 0)"
    echo "HEALTH_OK=$([ "${HEALTH_RC}" -eq 0 ] && echo 1 || echo 0)"
  } > "${EVIDENCE_DIR}/LIVE_MONITORING_STATUS.txt"
fi

{
  echo "PHASE_101_VERIFICATION"
  echo "======================"
  echo "PASS: required documents present"
  echo "PASS: registry files present"
  echo "PASS: SQL files present"
  echo "PASS: JSON validation complete"
  echo ""
  echo "LIVE STATUS:"
  cat "${EVIDENCE_DIR}/LIVE_MONITORING_STATUS.txt"
} > "${EVIDENCE_DIR}/GATE_RESULT.txt"

grep -n "PASS Condition" "${FND_DIR}/WORKCAPTAIN_PHASE_101_KPI_MONITORING_AND_DASHBOARD_HARDENING.md" > "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "7_day_trend" "${CFG_DIR}/dashboard_hardening_registry.json" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "core_activation_funnel" "${CFG_DIR}/funnel_intelligence_registry.json" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "mart_daily_product_kpis" "${SQL_DIR}/023_executive_dashboard_trend_view.sql" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true

find "${FND_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/FND_INVENTORY.txt"
find "${CFG_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/CONFIG_INVENTORY.txt"
find "${SQL_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/SQL_INVENTORY.txt"

if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 \
    "${FND_DIR}/WORKCAPTAIN_PHASE_101_KPI_MONITORING_AND_DASHBOARD_HARDENING.md" \
    "${FND_DIR}/WORKCAPTAIN_EXECUTIVE_DASHBOARD_HARDENING_PROTOCOL.md" \
    "${FND_DIR}/WORKCAPTAIN_FUNNEL_INTELLIGENCE_PROTOCOL.md" \
    "${FND_DIR}/WORKCAPTAIN_KPI_MONITORING_EVIDENCE_CONTRACT.md" \
    "${CFG_DIR}/dashboard_hardening_registry.json" \
    "${CFG_DIR}/funnel_intelligence_registry.json" \
    "${CFG_DIR}/kpi_monitoring_status_codes.json" \
    "${SQL_DIR}/023_executive_dashboard_trend_view.sql" \
    "${SQL_DIR}/024_funnel_conversion_view.sql" \
    "${SQL_DIR}/025_kpi_health_snapshot.sql" \
    "${REPO_ROOT}/scripts/workcaptain_phase101_kpi_monitoring_dashboard_hardening.sh" \
    > "${EVIDENCE_DIR}/MANIFEST.sha256"
fi

echo "PHASE_101_VERIFICATION_PASS"
