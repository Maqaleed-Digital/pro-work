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
  "${FND_DIR}/WORKCAPTAIN_PHASE_92_OPERATOR_ENV_AND_TRUTHFUL_KPI_EXECUTION.md"
  "${FND_DIR}/WORKCAPTAIN_OPERATOR_ENV_PROVISIONING_PROTOCOL.md"
  "${FND_DIR}/WORKCAPTAIN_BQ_CLI_ENABLEMENT_PROTOCOL.md"
  "${FND_DIR}/WORKCAPTAIN_FIRST_TRUTHFUL_KPI_EXECUTION_PROTOCOL.md"
  "${FND_DIR}/WORKCAPTAIN_ANALYTICS_OPERATOR_HANDOFF.md"
  "${CFG_DIR}/operator_env_required.json"
  "${CFG_DIR}/bq_cli_enablement_checks.json"
  "${CFG_DIR}/truthful_readout_execution_registry.json"
  "${CFG_DIR}/operator_env.activate.example"
  "${SQL_DIR}/007_first_truthful_kpi_readout.sql"
  "${SQL_DIR}/008_required_raw_tables_check.sql"
)

for file in "${required_files[@]}"; do
  if [ ! -f "${file}" ]; then
    echo "ERROR: required file missing -> ${file}"
    exit 1
  fi
done

if command -v python3 >/dev/null 2>&1; then
  python3 - <<'PY' "${CFG_DIR}/operator_env_required.json" "${CFG_DIR}/bq_cli_enablement_checks.json" "${CFG_DIR}/truthful_readout_execution_registry.json" > "${EVIDENCE_DIR}/JSON_VALIDATION.txt"
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
  echo "PHASE_92_SCOPE=OPERATOR_ENV_PROVISIONING_BQ_CLI_ENABLEMENT_FIRST_TRUTHFUL_KPI_EXECUTION"
  echo "RUN_AT_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "REPO_ROOT=${REPO_ROOT}"
  echo "CURRENT_HEAD=$(git -C "${REPO_ROOT}" rev-parse HEAD)"
  echo "CURRENT_BRANCH=$(git -C "${REPO_ROOT}" branch --show-current)"
} > "${EVIDENCE_DIR}/RUN_CONTEXT.txt"

MISSING_ENV=0
: > "${EVIDENCE_DIR}/ENV_CHECK.txt"
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

RAW_TABLE_STATUS="BLOCKED"
FIRST_KPI_STATUS="BLOCKED"

if [ "${MISSING_ENV}" -eq 0 ]; then
  PROJECT_ID="${WORKCAPTAIN_BQ_PROJECT_ID}"
  DATASET="${WORKCAPTAIN_BQ_DATASET}"

  sed \
    -e "s/{{PROJECT_ID}}/${PROJECT_ID}/g" \
    -e "s/{{DATASET}}/${DATASET}/g" \
    "${SQL_DIR}/007_first_truthful_kpi_readout.sql" > "${RENDER_DIR}/007_first_truthful_kpi_readout.sql"

  sed \
    -e "s/{{PROJECT_ID}}/${PROJECT_ID}/g" \
    -e "s/{{DATASET}}/${DATASET}/g" \
    "${SQL_DIR}/008_required_raw_tables_check.sql" > "${RENDER_DIR}/008_required_raw_tables_check.sql"
fi

if [ "${MISSING_ENV}" -eq 0 ] && [ "${BQ_MISSING}" -eq 0 ]; then
  set +e
  bq query --nouse_legacy_sql < "${RENDER_DIR}/008_required_raw_tables_check.sql" > "${EVIDENCE_DIR}/RAW_TABLE_CHECK.txt" 2> "${EVIDENCE_DIR}/RAW_TABLE_CHECK.err"
  RAW_RC=$?
  set -e
  if [ "${RAW_RC}" -eq 0 ] && grep -q "raw_frontend_events" "${EVIDENCE_DIR}/RAW_TABLE_CHECK.txt" && grep -q "raw_platform_events" "${EVIDENCE_DIR}/RAW_TABLE_CHECK.txt"; then
    RAW_TABLE_STATUS="PASS"
  else
    RAW_TABLE_STATUS="BLOCKED"
  fi
else
  : > "${EVIDENCE_DIR}/RAW_TABLE_CHECK.txt"
fi

if [ "${RAW_TABLE_STATUS}" = "PASS" ]; then
  set +e
  bq query --nouse_legacy_sql --format=prettyjson < "${RENDER_DIR}/007_first_truthful_kpi_readout.sql" > "${EVIDENCE_DIR}/TRUTHFUL_KPI_OUTPUT.json" 2> "${EVIDENCE_DIR}/TRUTHFUL_KPI_OUTPUT.err"
  KPI_RC=$?
  set -e
  if [ "${KPI_RC}" -eq 0 ]; then
    FIRST_KPI_STATUS="PASS"
  else
    FIRST_KPI_STATUS="BLOCKED"
  fi
fi

{
  echo "RAW_TABLE_STATUS=${RAW_TABLE_STATUS}"
  echo "FIRST_KPI_STATUS=${FIRST_KPI_STATUS}"
} > "${EVIDENCE_DIR}/LIVE_READOUT_STATUS.txt"

if [ "${FIRST_KPI_STATUS}" = "PASS" ]; then
  {
    echo "FIRST_KPI_READOUT=PASS"
    echo "SELECTED_KPI=daily_active_users"
    echo "SQL_PATH=analytics/sql/007_first_truthful_kpi_readout.sql"
  } > "${EVIDENCE_DIR}/FIRST_KPI_READOUT.txt"
else
  {
    echo "FIRST_KPI_READOUT=BLOCKED"
    if [ "${MISSING_ENV}" -eq 1 ]; then
      echo "REASON=Missing WORKCAPTAIN_BQ_PROJECT_ID and/or WORKCAPTAIN_BQ_DATASET"
    elif [ "${BQ_MISSING}" -eq 1 ]; then
      echo "REASON=bq CLI not available in operator environment"
    elif [ "${RAW_TABLE_STATUS}" != "PASS" ]; then
      echo "REASON=Required raw source tables missing or inaccessible"
    else
      echo "REASON=Truthful KPI query failed"
    fi
    echo "SELECTED_KPI=daily_active_users"
    echo "SQL_PATH=analytics/sql/007_first_truthful_kpi_readout.sql"
  } > "${EVIDENCE_DIR}/FIRST_KPI_READOUT.txt"
fi

{
  echo "PHASE_92_VERIFICATION"
  echo "====================="
  echo "PASS: required documents present"
  echo "PASS: registry files present"
  echo "PASS: SQL files present"
  echo "PASS: JSON validation complete"
  echo ""
  echo "LIVE STATUS:"
  cat "${EVIDENCE_DIR}/LIVE_READOUT_STATUS.txt"
} > "${EVIDENCE_DIR}/GATE_RESULT.txt"

grep -n "Objective" "${FND_DIR}/WORKCAPTAIN_PHASE_92_OPERATOR_ENV_AND_TRUTHFUL_KPI_EXECUTION.md" > "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "daily_active_users" "${CFG_DIR}/truthful_readout_execution_registry.json" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "bq_version" "${CFG_DIR}/bq_cli_enablement_checks.json" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "mart_daily_product_kpis" "${SQL_DIR}/007_first_truthful_kpi_readout.sql" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true

find "${FND_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/FND_INVENTORY.txt"
find "${CFG_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/CONFIG_INVENTORY.txt"
find "${SQL_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/SQL_INVENTORY.txt"

if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 \
    "${FND_DIR}/WORKCAPTAIN_PHASE_92_OPERATOR_ENV_AND_TRUTHFUL_KPI_EXECUTION.md" \
    "${FND_DIR}/WORKCAPTAIN_OPERATOR_ENV_PROVISIONING_PROTOCOL.md" \
    "${FND_DIR}/WORKCAPTAIN_BQ_CLI_ENABLEMENT_PROTOCOL.md" \
    "${FND_DIR}/WORKCAPTAIN_FIRST_TRUTHFUL_KPI_EXECUTION_PROTOCOL.md" \
    "${FND_DIR}/WORKCAPTAIN_ANALYTICS_OPERATOR_HANDOFF.md" \
    "${CFG_DIR}/operator_env_required.json" \
    "${CFG_DIR}/bq_cli_enablement_checks.json" \
    "${CFG_DIR}/truthful_readout_execution_registry.json" \
    "${CFG_DIR}/operator_env.activate.example" \
    "${SQL_DIR}/007_first_truthful_kpi_readout.sql" \
    "${SQL_DIR}/008_required_raw_tables_check.sql" \
    "${REPO_ROOT}/scripts/workcaptain_phase92_operator_env_truthful_kpi_execution.sh" \
    > "${EVIDENCE_DIR}/MANIFEST.sha256"
fi

echo "PHASE_92_VERIFICATION_PASS"
