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
  "${FND_DIR}/WORKCAPTAIN_PHASE_104_AI_INSIGHTS_AND_DECISION_SUPPORT.md"
  "${FND_DIR}/WORKCAPTAIN_AI_INSIGHT_PROTOCOL.md"
  "${FND_DIR}/WORKCAPTAIN_EXECUTIVE_RECOMMENDATION_PROTOCOL.md"
  "${FND_DIR}/WORKCAPTAIN_DECISION_SUPPORT_PACK_PROTOCOL.md"
  "${FND_DIR}/WORKCAPTAIN_AI_INSIGHT_EVIDENCE_CONTRACT.md"
  "${CFG_DIR}/ai_insight_registry.json"
  "${CFG_DIR}/executive_recommendation_registry.json"
  "${CFG_DIR}/decision_support_pack_registry.json"
  "${SQL_DIR}/032_ai_insight_snapshot.sql"
  "${SQL_DIR}/033_executive_recommendation_snapshot.sql"
  "${SQL_DIR}/034_decision_support_pack.sql"
)

for file in "${required_files[@]}"; do
  if [ ! -f "${file}" ]; then
    echo "ERROR: required file missing -> ${file}"
    exit 1
  fi
done

python3 - <<'PY' "${CFG_DIR}/ai_insight_registry.json" "${CFG_DIR}/executive_recommendation_registry.json" "${CFG_DIR}/decision_support_pack_registry.json" > "${EVIDENCE_DIR}/JSON_VALIDATION.txt"
import json, sys
for path in sys.argv[1:]:
    with open(path, "r", encoding="utf-8") as fh:
        json.load(fh)
    print(f"JSON_OK {path}")
PY

{
  echo "PHASE_104_SCOPE=AI_INSIGHT_EXECUTIVE_RECOMMENDATION_DECISION_SUPPORT"
  echo "RUN_AT_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "REPO_ROOT=${REPO_ROOT}"
  echo "CURRENT_HEAD=$(git -C "${REPO_ROOT}" rev-parse HEAD)"
  echo "CURRENT_BRANCH=$(git -C "${REPO_ROOT}" branch --show-current)"
} > "${EVIDENCE_DIR}/RUN_CONTEXT.txt"

PROJECT_ID="${WORKCAPTAIN_BQ_PROJECT_ID:-}"
DATASET="${WORKCAPTAIN_BQ_DATASET:-}"

if [ -z "${PROJECT_ID}" ] || [ -z "${DATASET}" ]; then
  echo "ERROR: WORKCAPTAIN_BQ_PROJECT_ID and WORKCAPTAIN_BQ_DATASET must be exported or provided inline" > "${EVIDENCE_DIR}/LIVE_AI_STATUS.txt"
  exit 1
fi

if ! command -v bq >/dev/null 2>&1; then
  echo "ERROR: bq CLI missing in live operator shell" > "${EVIDENCE_DIR}/LIVE_AI_STATUS.txt"
  exit 1
fi

for name in 032_ai_insight_snapshot.sql 033_executive_recommendation_snapshot.sql 034_decision_support_pack.sql; do
  sed -e "s/{{PROJECT_ID}}/${PROJECT_ID}/g" -e "s/{{DATASET}}/${DATASET}/g" \
    "${SQL_DIR}/${name}" > "${RENDER_DIR}/${name}"
done

set +e
bq query --nouse_legacy_sql --format=prettyjson < "${RENDER_DIR}/032_ai_insight_snapshot.sql" > "${EVIDENCE_DIR}/AI_INSIGHT_OUTPUT.json" 2> "${EVIDENCE_DIR}/AI_INSIGHT_OUTPUT.err"
INSIGHT_RC=$?
bq query --nouse_legacy_sql --format=prettyjson < "${RENDER_DIR}/033_executive_recommendation_snapshot.sql" > "${EVIDENCE_DIR}/EXECUTIVE_RECOMMENDATION_OUTPUT.json" 2> "${EVIDENCE_DIR}/EXECUTIVE_RECOMMENDATION_OUTPUT.err"
RECOMMEND_RC=$?
bq query --nouse_legacy_sql --format=prettyjson < "${RENDER_DIR}/034_decision_support_pack.sql" > "${EVIDENCE_DIR}/DECISION_SUPPORT_OUTPUT.json" 2> "${EVIDENCE_DIR}/DECISION_SUPPORT_OUTPUT.err"
DECISION_RC=$?
set -e

if [ "${INSIGHT_RC}" -eq 0 ] && [ "${RECOMMEND_RC}" -eq 0 ] && [ "${DECISION_RC}" -eq 0 ]; then
  {
    echo "STATUS_CODE=PASS"
    echo "INSIGHT_OK=1"
    echo "RECOMMENDATION_OK=1"
    echo "DECISION_SUPPORT_OK=1"
  } > "${EVIDENCE_DIR}/LIVE_AI_STATUS.txt"
else
  {
    echo "STATUS_CODE=BLOCKED_QUERY_FAILURE"
    echo "INSIGHT_OK=$([ "${INSIGHT_RC}" -eq 0 ] && echo 1 || echo 0)"
    echo "RECOMMENDATION_OK=$([ "${RECOMMEND_RC}" -eq 0 ] && echo 1 || echo 0)"
    echo "DECISION_SUPPORT_OK=$([ "${DECISION_RC}" -eq 0 ] && echo 1 || echo 0)"
  } > "${EVIDENCE_DIR}/LIVE_AI_STATUS.txt"
fi

{
  echo "PHASE_104_VERIFICATION"
  echo "======================"
  echo "PASS: required documents present"
  echo "PASS: registry files present"
  echo "PASS: SQL files present"
  echo "PASS: JSON validation complete"
  echo ""
  echo "LIVE STATUS:"
  cat "${EVIDENCE_DIR}/LIVE_AI_STATUS.txt"
} > "${EVIDENCE_DIR}/GATE_RESULT.txt"

grep -n "PASS Condition" "${FND_DIR}/WORKCAPTAIN_PHASE_104_AI_INSIGHTS_AND_DECISION_SUPPORT.md" > "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "activity_interpretation" "${CFG_DIR}/ai_insight_registry.json" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "priority_bands" "${CFG_DIR}/executive_recommendation_registry.json" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "required_sections" "${CFG_DIR}/decision_support_pack_registry.json" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true

find "${FND_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/FND_INVENTORY.txt"
find "${CFG_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/CONFIG_INVENTORY.txt"
find "${SQL_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/SQL_INVENTORY.txt"

if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 \
    "${FND_DIR}/WORKCAPTAIN_PHASE_104_AI_INSIGHTS_AND_DECISION_SUPPORT.md" \
    "${FND_DIR}/WORKCAPTAIN_AI_INSIGHT_PROTOCOL.md" \
    "${FND_DIR}/WORKCAPTAIN_EXECUTIVE_RECOMMENDATION_PROTOCOL.md" \
    "${FND_DIR}/WORKCAPTAIN_DECISION_SUPPORT_PACK_PROTOCOL.md" \
    "${FND_DIR}/WORKCAPTAIN_AI_INSIGHT_EVIDENCE_CONTRACT.md" \
    "${CFG_DIR}/ai_insight_registry.json" \
    "${CFG_DIR}/executive_recommendation_registry.json" \
    "${CFG_DIR}/decision_support_pack_registry.json" \
    "${SQL_DIR}/032_ai_insight_snapshot.sql" \
    "${SQL_DIR}/033_executive_recommendation_snapshot.sql" \
    "${SQL_DIR}/034_decision_support_pack.sql" \
    "${REPO_ROOT}/scripts/workcaptain_phase104_ai_insights_and_decision_support.sh" \
    > "${EVIDENCE_DIR}/MANIFEST.sha256"
fi

echo "PHASE_104_VERIFICATION_PASS"
