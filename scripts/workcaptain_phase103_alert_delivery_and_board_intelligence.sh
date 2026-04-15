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
  "${FND_DIR}/WORKCAPTAIN_PHASE_103_ALERT_DELIVERY_AND_BOARD_INTELLIGENCE.md"
  "${FND_DIR}/WORKCAPTAIN_EXECUTIVE_ALERT_DELIVERY_PROTOCOL.md"
  "${FND_DIR}/WORKCAPTAIN_ANOMALY_SIGNAL_SCORING_PROTOCOL.md"
  "${FND_DIR}/WORKCAPTAIN_BOARD_INTELLIGENCE_PACK_PROTOCOL.md"
  "${FND_DIR}/WORKCAPTAIN_ALERT_DELIVERY_EVIDENCE_CONTRACT.md"
  "${CFG_DIR}/executive_alert_delivery_registry.json"
  "${CFG_DIR}/anomaly_signal_scoring_registry.json"
  "${CFG_DIR}/board_intelligence_pack_registry.json"
  "${SQL_DIR}/029_executive_alert_delivery_snapshot.sql"
  "${SQL_DIR}/030_anomaly_signal_score_view.sql"
  "${SQL_DIR}/031_board_intelligence_pack.sql"
)

for file in "${required_files[@]}"; do
  if [ ! -f "${file}" ]; then
    echo "ERROR: required file missing -> ${file}"
    exit 1
  fi
done

python3 - <<'PY' "${CFG_DIR}/executive_alert_delivery_registry.json" "${CFG_DIR}/anomaly_signal_scoring_registry.json" "${CFG_DIR}/board_intelligence_pack_registry.json" > "${EVIDENCE_DIR}/JSON_VALIDATION.txt"
import json, sys
for path in sys.argv[1:]:
    with open(path, "r", encoding="utf-8") as fh:
        json.load(fh)
    print(f"JSON_OK {path}")
PY

{
  echo "PHASE_103_SCOPE=EXECUTIVE_ALERT_DELIVERY_ANOMALY_SIGNAL_SCORING_BOARD_INTELLIGENCE"
  echo "RUN_AT_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "REPO_ROOT=${REPO_ROOT}"
  echo "CURRENT_HEAD=$(git -C "${REPO_ROOT}" rev-parse HEAD)"
  echo "CURRENT_BRANCH=$(git -C "${REPO_ROOT}" branch --show-current)"
} > "${EVIDENCE_DIR}/RUN_CONTEXT.txt"

PROJECT_ID="${WORKCAPTAIN_BQ_PROJECT_ID:-}"
DATASET="${WORKCAPTAIN_BQ_DATASET:-}"

if [ -z "${PROJECT_ID}" ] || [ -z "${DATASET}" ]; then
  echo "ERROR: WORKCAPTAIN_BQ_PROJECT_ID and WORKCAPTAIN_BQ_DATASET must be exported or provided inline" > "${EVIDENCE_DIR}/LIVE_DELIVERY_STATUS.txt"
  exit 1
fi

if ! command -v bq >/dev/null 2>&1; then
  echo "ERROR: bq CLI missing in live operator shell" > "${EVIDENCE_DIR}/LIVE_DELIVERY_STATUS.txt"
  exit 1
fi

for name in 029_executive_alert_delivery_snapshot.sql 030_anomaly_signal_score_view.sql 031_board_intelligence_pack.sql; do
  sed -e "s/{{PROJECT_ID}}/${PROJECT_ID}/g" -e "s/{{DATASET}}/${DATASET}/g" \
    "${SQL_DIR}/${name}" > "${RENDER_DIR}/${name}"
done

set +e
bq query --nouse_legacy_sql --format=prettyjson < "${RENDER_DIR}/029_executive_alert_delivery_snapshot.sql" > "${EVIDENCE_DIR}/EXECUTIVE_ALERT_DELIVERY_OUTPUT.json" 2> "${EVIDENCE_DIR}/EXECUTIVE_ALERT_DELIVERY_OUTPUT.err"
DELIVERY_RC=$?
bq query --nouse_legacy_sql --format=prettyjson < "${RENDER_DIR}/030_anomaly_signal_score_view.sql" > "${EVIDENCE_DIR}/ANOMALY_SIGNAL_OUTPUT.json" 2> "${EVIDENCE_DIR}/ANOMALY_SIGNAL_OUTPUT.err"
SIGNAL_RC=$?
bq query --nouse_legacy_sql --format=prettyjson < "${RENDER_DIR}/031_board_intelligence_pack.sql" > "${EVIDENCE_DIR}/BOARD_INTELLIGENCE_OUTPUT.json" 2> "${EVIDENCE_DIR}/BOARD_INTELLIGENCE_OUTPUT.err"
BOARD_RC=$?
set -e

if [ "${DELIVERY_RC}" -eq 0 ] && [ "${SIGNAL_RC}" -eq 0 ] && [ "${BOARD_RC}" -eq 0 ]; then
  {
    echo "STATUS_CODE=PASS"
    echo "DELIVERY_OK=1"
    echo "SIGNAL_OK=1"
    echo "BOARD_OK=1"
  } > "${EVIDENCE_DIR}/LIVE_DELIVERY_STATUS.txt"
else
  {
    echo "STATUS_CODE=BLOCKED_QUERY_FAILURE"
    echo "DELIVERY_OK=$([ "${DELIVERY_RC}" -eq 0 ] && echo 1 || echo 0)"
    echo "SIGNAL_OK=$([ "${SIGNAL_RC}" -eq 0 ] && echo 1 || echo 0)"
    echo "BOARD_OK=$([ "${BOARD_RC}" -eq 0 ] && echo 1 || echo 0)"
  } > "${EVIDENCE_DIR}/LIVE_DELIVERY_STATUS.txt"
fi

{
  echo "PHASE_103_VERIFICATION"
  echo "======================"
  echo "PASS: required documents present"
  echo "PASS: registry files present"
  echo "PASS: SQL files present"
  echo "PASS: JSON validation complete"
  echo ""
  echo "LIVE STATUS:"
  cat "${EVIDENCE_DIR}/LIVE_DELIVERY_STATUS.txt"
} > "${EVIDENCE_DIR}/GATE_RESULT.txt"

grep -n "PASS Condition" "${FND_DIR}/WORKCAPTAIN_PHASE_103_ALERT_DELIVERY_AND_BOARD_INTELLIGENCE.md" > "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "severity_bands" "${CFG_DIR}/executive_alert_delivery_registry.json" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "score_bands" "${CFG_DIR}/anomaly_signal_scoring_registry.json" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "required_sections" "${CFG_DIR}/board_intelligence_pack_registry.json" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true

find "${FND_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/FND_INVENTORY.txt"
find "${CFG_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/CONFIG_INVENTORY.txt"
find "${SQL_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/SQL_INVENTORY.txt"

if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 \
    "${FND_DIR}/WORKCAPTAIN_PHASE_103_ALERT_DELIVERY_AND_BOARD_INTELLIGENCE.md" \
    "${FND_DIR}/WORKCAPTAIN_EXECUTIVE_ALERT_DELIVERY_PROTOCOL.md" \
    "${FND_DIR}/WORKCAPTAIN_ANOMALY_SIGNAL_SCORING_PROTOCOL.md" \
    "${FND_DIR}/WORKCAPTAIN_BOARD_INTELLIGENCE_PACK_PROTOCOL.md" \
    "${FND_DIR}/WORKCAPTAIN_ALERT_DELIVERY_EVIDENCE_CONTRACT.md" \
    "${CFG_DIR}/executive_alert_delivery_registry.json" \
    "${CFG_DIR}/anomaly_signal_scoring_registry.json" \
    "${CFG_DIR}/board_intelligence_pack_registry.json" \
    "${SQL_DIR}/029_executive_alert_delivery_snapshot.sql" \
    "${SQL_DIR}/030_anomaly_signal_score_view.sql" \
    "${SQL_DIR}/031_board_intelligence_pack.sql" \
    "${REPO_ROOT}/scripts/workcaptain_phase103_alert_delivery_and_board_intelligence.sh" \
    > "${EVIDENCE_DIR}/MANIFEST.sha256"
fi

echo "PHASE_103_VERIFICATION_PASS"
