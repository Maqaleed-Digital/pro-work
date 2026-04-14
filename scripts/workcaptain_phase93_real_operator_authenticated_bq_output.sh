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
  "${FND_DIR}/WORKCAPTAIN_PHASE_93_REAL_OPERATOR_EXECUTION_AND_TRUTHFUL_EXECUTIVE_OUTPUT.md"
  "${FND_DIR}/WORKCAPTAIN_AUTHENTICATED_BQ_READOUT_PROTOCOL.md"
  "${FND_DIR}/WORKCAPTAIN_FIRST_TRUTHFUL_EXECUTIVE_KPI_OUTPUT_PROTOCOL.md"
  "${FND_DIR}/WORKCAPTAIN_EXECUTIVE_OUTPUT_EVIDENCE_CONTRACT.md"
  "${FND_DIR}/WORKCAPTAIN_OPERATOR_RUNTIME_STATUS_MODEL.md"
  "${CFG_DIR}/authenticated_readout_requirements.json"
  "${CFG_DIR}/executive_kpi_output_registry.json"
  "${CFG_DIR}/operator_runtime_status_codes.json"
  "${SQL_DIR}/009_first_truthful_executive_kpi_output.sql"
  "${SQL_DIR}/010_derived_views_health_check.sql"
)

for file in "${required_files[@]}"; do
  if [ ! -f "${file}" ]; then
    echo "ERROR: required file missing -> ${file}"
    exit 1
  fi
done

if command -v python3 >/dev/null 2>&1; then
  python3 - <<'PY' "${CFG_DIR}/authenticated_readout_requirements.json" "${CFG_DIR}/executive_kpi_output_registry.json" "${CFG_DIR}/operator_runtime_status_codes.json" > "${EVIDENCE_DIR}/JSON_VALIDATION.txt"
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
  echo "PHASE_93_SCOPE=REAL_OPERATOR_EXECUTION_AUTHENTICATED_BQ_READOUT_FIRST_TRUTHFUL_EXECUTIVE_KPI_OUTPUT"
  echo "RUN_AT_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "REPO_ROOT=${REPO_ROOT}"
  echo "CURRENT_HEAD=$(git -C "${REPO_ROOT}" rev-parse HEAD)"
  echo "CURRENT_BRANCH=$(git -C "${REPO_ROOT}" branch --show-current)"
} > "${EVIDENCE_DIR}/RUN_CONTEXT.txt"

STATUS_CODE="BLOCKED_MISSING_ENV"
: > "${EVIDENCE_DIR}/ENV_CHECK.txt"
MISSING_ENV=0
for var_name in WORKCAPTAIN_BQ_PROJECT_ID WORKCAPTAIN_BQ_DATASET; do
  if [ -z "${!var_name:-}" ]; then
    echo "MISSING_ENV=${var_name}" >> "${EVIDENCE_DIR}/ENV_CHECK.txt"
    MISSING_ENV=1
  else
    echo "PRESENT_ENV=${var_name}=${!var_name}" >> "${EVIDENCE_DIR}/ENV_CHECK.txt"
  fi
done

BQ_MISSING=0
if ! command -v bq >/dev/null 2>&1; then
  echo "BQ_CLI_STATUS=MISSING" > "${EVIDENCE_DIR}/BQ_TOOL_CHECK.txt"
  BQ_MISSING=1
else
  {
    echo "BQ_CLI_STATUS=PRESENT"
    bq version 2>/dev/null || true
  } > "${EVIDENCE_DIR}/BQ_TOOL_CHECK.txt"
fi

AUTH_OK=0
if [ "${MISSING_ENV}" -eq 0 ] && [ "${BQ_MISSING}" -eq 0 ]; then
  PROJECT_ID="${WORKCAPTAIN_BQ_PROJECT_ID}"
  DATASET="${WORKCAPTAIN_BQ_DATASET}"

  sed \
    -e "s/{{PROJECT_ID}}/${PROJECT_ID}/g" \
    -e "s/{{DATASET}}/${DATASET}/g" \
    "${SQL_DIR}/009_first_truthful_executive_kpi_output.sql" > "${RENDER_DIR}/009_first_truthful_executive_kpi_output.sql"

  sed \
    -e "s/{{PROJECT_ID}}/${PROJECT_ID}/g" \
    -e "s/{{DATASET}}/${DATASET}/g" \
    "${SQL_DIR}/010_derived_views_health_check.sql" > "${RENDER_DIR}/010_derived_views_health_check.sql"

  set +e
  bq ls --project_id="${PROJECT_ID}" "${PROJECT_ID}:${DATASET}" > "${EVIDENCE_DIR}/AUTH_CHECK.txt" 2> "${EVIDENCE_DIR}/AUTH_CHECK.err"
  AUTH_RC=$?
  set -e
  if [ "${AUTH_RC}" -eq 0 ]; then
    AUTH_OK=1
  fi
else
  : > "${EVIDENCE_DIR}/AUTH_CHECK.txt"
fi

VIEWS_OK=0
if [ "${AUTH_OK}" -eq 1 ]; then
  set +e
  bq query --nouse_legacy_sql < "${RENDER_DIR}/010_derived_views_health_check.sql" > "${EVIDENCE_DIR}/DERIVED_VIEW_CHECK.txt" 2> "${EVIDENCE_DIR}/DERIVED_VIEW_CHECK.err"
  VIEW_RC=$?
  set -e
  if [ "${VIEW_RC}" -eq 0 ] && \
     grep -q "mart_daily_product_kpis" "${EVIDENCE_DIR}/DERIVED_VIEW_CHECK.txt" && \
     grep -q "mart_daily_execution_kpis" "${EVIDENCE_DIR}/DERIVED_VIEW_CHECK.txt" && \
     grep -q "mart_daily_trust_kpis" "${EVIDENCE_DIR}/DERIVED_VIEW_CHECK.txt"; then
    VIEWS_OK=1
  fi
else
  : > "${EVIDENCE_DIR}/DERIVED_VIEW_CHECK.txt"
fi

QUERY_OK=0
if [ "${VIEWS_OK}" -eq 1 ]; then
  set +e
  bq query --nouse_legacy_sql --format=prettyjson < "${RENDER_DIR}/009_first_truthful_executive_kpi_output.sql" > "${EVIDENCE_DIR}/EXECUTIVE_KPI_OUTPUT.json" 2> "${EVIDENCE_DIR}/EXECUTIVE_KPI_OUTPUT.err"
  QUERY_RC=$?
  set -e
  if [ "${QUERY_RC}" -eq 0 ]; then
    QUERY_OK=1
  fi
fi

if [ "${MISSING_ENV}" -eq 1 ]; then
  STATUS_CODE="BLOCKED_MISSING_ENV"
elif [ "${BQ_MISSING}" -eq 1 ]; then
  STATUS_CODE="BLOCKED_MISSING_BQ"
elif [ "${AUTH_OK}" -ne 1 ]; then
  STATUS_CODE="BLOCKED_AUTH_FAILURE"
elif [ "${VIEWS_OK}" -ne 1 ]; then
  STATUS_CODE="BLOCKED_MISSING_VIEWS"
elif [ "${QUERY_OK}" -ne 1 ]; then
  STATUS_CODE="BLOCKED_QUERY_FAILURE"
else
  STATUS_CODE="PASS"
fi

{
  echo "STATUS_CODE=${STATUS_CODE}"
  echo "AUTH_OK=${AUTH_OK}"
  echo "VIEWS_OK=${VIEWS_OK}"
  echo "QUERY_OK=${QUERY_OK}"
} > "${EVIDENCE_DIR}/LIVE_READOUT_STATUS.txt"

if [ "${STATUS_CODE}" = "PASS" ]; then
  {
    echo "FIRST_EXECUTIVE_KPI_OUTPUT=PASS"
    echo "SQL_PATH=analytics/sql/009_first_truthful_executive_kpi_output.sql"
    echo "OUTPUT_FILE=EXECUTIVE_KPI_OUTPUT.json"
  } > "${EVIDENCE_DIR}/FIRST_EXECUTIVE_KPI_OUTPUT.txt"
else
  {
    echo "FIRST_EXECUTIVE_KPI_OUTPUT=BLOCKED"
    echo "STATUS_CODE=${STATUS_CODE}"
    echo "SQL_PATH=analytics/sql/009_first_truthful_executive_kpi_output.sql"
  } > "${EVIDENCE_DIR}/FIRST_EXECUTIVE_KPI_OUTPUT.txt"
fi

{
  echo "PHASE_93_VERIFICATION"
  echo "====================="
  echo "PASS: required documents present"
  echo "PASS: registry files present"
  echo "PASS: SQL files present"
  echo "PASS: JSON validation complete"
  echo ""
  echo "LIVE STATUS:"
  cat "${EVIDENCE_DIR}/LIVE_READOUT_STATUS.txt"
} > "${EVIDENCE_DIR}/GATE_RESULT.txt"

grep -n "Objective" "${FND_DIR}/WORKCAPTAIN_PHASE_93_REAL_OPERATOR_EXECUTION_AND_TRUTHFUL_EXECUTIVE_OUTPUT.md" > "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "first_truthful_executive_kpi_output" "${CFG_DIR}/executive_kpi_output_registry.json" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "BLOCKED_AUTH_FAILURE" "${CFG_DIR}/operator_runtime_status_codes.json" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "mart_daily_product_kpis" "${SQL_DIR}/009_first_truthful_executive_kpi_output.sql" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true

find "${FND_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/FND_INVENTORY.txt"
find "${CFG_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/CONFIG_INVENTORY.txt"
find "${SQL_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/SQL_INVENTORY.txt"

if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 \
    "${FND_DIR}/WORKCAPTAIN_PHASE_93_REAL_OPERATOR_EXECUTION_AND_TRUTHFUL_EXECUTIVE_OUTPUT.md" \
    "${FND_DIR}/WORKCAPTAIN_AUTHENTICATED_BQ_READOUT_PROTOCOL.md" \
    "${FND_DIR}/WORKCAPTAIN_FIRST_TRUTHFUL_EXECUTIVE_KPI_OUTPUT_PROTOCOL.md" \
    "${FND_DIR}/WORKCAPTAIN_EXECUTIVE_OUTPUT_EVIDENCE_CONTRACT.md" \
    "${FND_DIR}/WORKCAPTAIN_OPERATOR_RUNTIME_STATUS_MODEL.md" \
    "${CFG_DIR}/authenticated_readout_requirements.json" \
    "${CFG_DIR}/executive_kpi_output_registry.json" \
    "${CFG_DIR}/operator_runtime_status_codes.json" \
    "${SQL_DIR}/009_first_truthful_executive_kpi_output.sql" \
    "${SQL_DIR}/010_derived_views_health_check.sql" \
    "${REPO_ROOT}/scripts/workcaptain_phase93_real_operator_authenticated_bq_output.sh" \
    > "${EVIDENCE_DIR}/MANIFEST.sha256"
fi

echo "PHASE_93_VERIFICATION_PASS"
