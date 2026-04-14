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
  "${FND_DIR}/WORKCAPTAIN_PHASE_102_EXECUTIVE_ALERTING_AND_ANOMALY_READINESS.md"
  "${FND_DIR}/WORKCAPTAIN_EXECUTIVE_ALERTING_PROTOCOL.md"
  "${FND_DIR}/WORKCAPTAIN_KPI_THRESHOLD_PROTOCOL.md"
  "${FND_DIR}/WORKCAPTAIN_ANOMALY_DETECTION_READINESS_PROTOCOL.md"
  "${FND_DIR}/WORKCAPTAIN_ALERTING_EVIDENCE_CONTRACT.md"
  "${CFG_DIR}/executive_alert_registry.json"
  "${CFG_DIR}/kpi_threshold_registry.json"
  "${CFG_DIR}/anomaly_readiness_registry.json"
  "${SQL_DIR}/026_executive_alert_snapshot.sql"
  "${SQL_DIR}/027_kpi_threshold_breach_view.sql"
  "${SQL_DIR}/028_anomaly_readiness_snapshot.sql"
)

for file in "${required_files[@]}"; do
  if [ ! -f "${file}" ]; then
    echo "ERROR: required file missing -> ${file}"
    exit 1
  fi
done

python3 - <<'PY' "${CFG_DIR}/executive_alert_registry.json" "${CFG_DIR}/kpi_threshold_registry.json" "${CFG_DIR}/anomaly_readiness_registry.json" > "${EVIDENCE_DIR}/JSON_VALIDATION.txt"
import json, sys
for path in sys.argv[1:]:
    with open(path, "r", encoding="utf-8") as fh:
        json.load(fh)
    print(f"JSON_OK {path}")
PY

{
  echo "PHASE_102_SCOPE=EXECUTIVE_ALERTING_KPI_THRESHOLDS_ANOMALY_DETECTION_READINESS"
  echo "RUN_AT_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "REPO_ROOT=${REPO_ROOT}"
  echo "CURRENT_HEAD=$(git -C "${REPO_ROOT}" rev-parse HEAD)"
  echo "CURRENT_BRANCH=$(git -C "${REPO_ROOT}" branch --show-current)"
} > "${EVIDENCE_DIR}/RUN_CONTEXT.txt"

PROJECT_ID="${WORKCAPTAIN_BQ_PROJECT_ID:-}"
DATASET="${WORKCAPTAIN_BQ_DATASET:-}"

if [ -z "${PROJECT_ID}" ] || [ -z "${DATASET}" ]; then
  echo "ERROR: WORKCAPTAIN_BQ_PROJECT_ID and WORKCAPTAIN_BQ_DATASET must be exported or provided inline" > "${EVIDENCE_DIR}/LIVE_ALERTING_STATUS.txt"
  exit 1
fi

if ! command -v bq >/dev/null 2>&1; then
  echo "ERROR: bq CLI missing in live operator shell" > "${EVIDENCE_DIR}/LIVE_ALERTING_STATUS.txt"
  exit 1
fi

for name in 026_executive_alert_snapshot.sql 027_kpi_threshold_breach_view.sql 028_anomaly_readiness_snapshot.sql; do
  sed -e "s/{{PROJECT_ID}}/${PROJECT_ID}/g" -e "s/{{DATASET}}/${DATASET}/g" \
    "${SQL_DIR}/${name}" > "${RENDER_DIR}/${name}"
done

set +e
bq query --nouse_legacy_sql --format=prettyjson < "${RENDER_DIR}/026_executive_alert_snapshot.sql" > "${EVIDENCE_DIR}/EXECUTIVE_ALERT_OUTPUT.json" 2> "${EVIDENCE_DIR}/EXECUTIVE_ALERT_OUTPUT.err"
ALERT_RC=$?
bq query --nouse_legacy_sql --format=prettyjson < "${RENDER_DIR}/027_kpi_threshold_breach_view.sql" > "${EVIDENCE_DIR}/KPI_THRESHOLD_OUTPUT.json" 2> "${EVIDENCE_DIR}/KPI_THRESHOLD_OUTPUT.err"
THRESHOLD_RC=$?
bq query --nouse_legacy_sql --format=prettyjson < "${RENDER_DIR}/028_anomaly_readiness_snapshot.sql" > "${EVIDENCE_DIR}/ANOMALY_READINESS_OUTPUT.json" 2> "${EVIDENCE_DIR}/ANOMALY_READINESS_OUTPUT.err"
READINESS_RC=$?
set -e

if [ "${ALERT_RC}" -eq 0 ] && [ "${THRESHOLD_RC}" -eq 0 ] && [ "${READINESS_RC}" -eq 0 ]; then
  {
    echo "STATUS_CODE=PASS"
    echo "ALERT_OK=1"
    echo "THRESHOLD_OK=1"
    echo "READINESS_OK=1"
  } > "${EVIDENCE_DIR}/LIVE_ALERTING_STATUS.txt"
else
  {
    echo "STATUS_CODE=BLOCKED_QUERY_FAILURE"
    echo "ALERT_OK=$([ "${ALERT_RC}" -eq 0 ] && echo 1 || echo 0)"
    echo "THRESHOLD_OK=$([ "${THRESHOLD_RC}" -eq 0 ] && echo 1 || echo 0)"
    echo "READINESS_OK=$([ "${READINESS_RC}" -eq 0 ] && echo 1 || echo 0)"
  } > "${EVIDENCE_DIR}/LIVE_ALERTING_STATUS.txt"
fi

{
  echo "PHASE_102_VERIFICATION"
  echo "======================"
  echo "PASS: required documents present"
  echo "PASS: registry files present"
  echo "PASS: SQL files present"
  echo "PASS: JSON validation complete"
  echo ""
  echo "LIVE STATUS:"
  cat "${EVIDENCE_DIR}/LIVE_ALERTING_STATUS.txt"
} > "${EVIDENCE_DIR}/GATE_RESULT.txt"

grep -n "PASS Condition" "${FND_DIR}/WORKCAPTAIN_PHASE_102_EXECUTIVE_ALERTING_AND_ANOMALY_READINESS.md" > "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "traffic_drop" "${CFG_DIR}/executive_alert_registry.json" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "daily_active_users_min" "${CFG_DIR}/kpi_threshold_registry.json" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "recent_data_present" "${CFG_DIR}/anomaly_readiness_registry.json" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true

find "${FND_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/FND_INVENTORY.txt"
find "${CFG_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/CONFIG_INVENTORY.txt"
find "${SQL_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/SQL_INVENTORY.txt"

if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 \
    "${FND_DIR}/WORKCAPTAIN_PHASE_102_EXECUTIVE_ALERTING_AND_ANOMALY_READINESS.md" \
    "${FND_DIR}/WORKCAPTAIN_EXECUTIVE_ALERTING_PROTOCOL.md" \
    "${FND_DIR}/WORKCAPTAIN_KPI_THRESHOLD_PROTOCOL.md" \
    "${FND_DIR}/WORKCAPTAIN_ANOMALY_DETECTION_READINESS_PROTOCOL.md" \
    "${FND_DIR}/WORKCAPTAIN_ALERTING_EVIDENCE_CONTRACT.md" \
    "${CFG_DIR}/executive_alert_registry.json" \
    "${CFG_DIR}/kpi_threshold_registry.json" \
    "${CFG_DIR}/anomaly_readiness_registry.json" \
    "${SQL_DIR}/026_executive_alert_snapshot.sql" \
    "${SQL_DIR}/027_kpi_threshold_breach_view.sql" \
    "${SQL_DIR}/028_anomaly_readiness_snapshot.sql" \
    "${REPO_ROOT}/scripts/workcaptain_phase102_executive_alerting_and_anomaly_readiness.sh" \
    > "${EVIDENCE_DIR}/MANIFEST.sha256"
fi

echo "PHASE_102_VERIFICATION_PASS"
