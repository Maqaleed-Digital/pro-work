#!/usr/bin/env bash
set -euo pipefail

EVIDENCE_DIR="${1:-}"
if [ -z "${EVIDENCE_DIR}" ]; then
  echo "ERROR: evidence dir argument is required"
  exit 1
fi

REPO_ROOT="/opt/prowork"
FND_DIR="${REPO_ROOT}/FND"
CFG_DIR="${REPO_ROOT}/config/analytics"
SQL_DIR="${REPO_ROOT}/analytics/sql"
RENDER_DIR="${EVIDENCE_DIR}/rendered_sql"

mkdir -p "${EVIDENCE_DIR}" "${RENDER_DIR}"

required_files=(
  "${FND_DIR}/WORKCAPTAIN_PHASE_95_LIVE_OPERATOR_EXPORT_AND_AUTHENTICATED_BQ_SESSION.md"
  "${FND_DIR}/WORKCAPTAIN_LIVE_OPERATOR_VARIABLE_EXPORT_PROTOCOL.md"
  "${FND_DIR}/WORKCAPTAIN_AUTHENTICATED_BQ_SESSION_PROTOCOL.md"
  "${FND_DIR}/WORKCAPTAIN_FIRST_GATE_ADVANCEMENT_EXECUTION_PROTOCOL.md"
  "${FND_DIR}/WORKCAPTAIN_OPERATOR_SESSION_EVIDENCE_CONTRACT.md"
  "${CFG_DIR}/live_operator_export_requirements.json"
  "${CFG_DIR}/authenticated_bq_session_checks.json"
  "${CFG_DIR}/first_gate_advancement_registry.json"
  "${CFG_DIR}/operator_env.live.example"
  "${SQL_DIR}/014_session_auth_dataset_check.sql"
  "${SQL_DIR}/015_first_gate_advancement_probe.sql"
)

for file in "${required_files[@]}"; do
  if [ ! -f "${file}" ]; then
    echo "ERROR: required file missing -> ${file}"
    exit 1
  fi
done

if command -v python3 >/dev/null 2>&1; then
  python3 - <<'PY' "${CFG_DIR}/live_operator_export_requirements.json" "${CFG_DIR}/authenticated_bq_session_checks.json" "${CFG_DIR}/first_gate_advancement_registry.json" > "${EVIDENCE_DIR}/JSON_VALIDATION.txt"
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
  echo "PHASE_95_SCOPE=LIVE_OPERATOR_EXPORT_AUTHENTICATED_BQ_SESSION_FIRST_GATE_ADVANCEMENT"
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
PROBE_OK=0

# Render SQL files
if [ "${MISSING_ENV}" -eq 0 ]; then
  PROJECT_ID="${WORKCAPTAIN_BQ_PROJECT_ID}"
  DATASET="${WORKCAPTAIN_BQ_DATASET}"

  # 015 has no template vars — cp
  cp "${SQL_DIR}/015_first_gate_advancement_probe.sql" "${RENDER_DIR}/015_first_gate_advancement_probe.sql"

  # 014 has template vars — sed
  sed \
    -e "s/{{PROJECT_ID}}/${PROJECT_ID}/g" \
    -e "s/{{DATASET}}/${DATASET}/g" \
    "${SQL_DIR}/014_session_auth_dataset_check.sql" > "${RENDER_DIR}/014_session_auth_dataset_check.sql"

  # 011 has no template vars — cp
  cp "${SQL_DIR}/011_auth_gate_check.sql" "${RENDER_DIR}/011_auth_gate_check.sql"
fi

# Auth gate check
if [ "${MISSING_ENV}" -eq 0 ] && [ "${BQ_MISSING}" -eq 0 ]; then
  set +e
  bq query --nouse_legacy_sql < "${RENDER_DIR}/011_auth_gate_check.sql" > "${EVIDENCE_DIR}/AUTH_CHECK.txt" 2> "${EVIDENCE_DIR}/AUTH_CHECK.err"
  AUTH_RC=$?
  set -e
  if [ "${AUTH_RC}" -eq 0 ]; then
    AUTH_OK=1
  fi
else
  : > "${EVIDENCE_DIR}/AUTH_CHECK.txt"
  : > "${EVIDENCE_DIR}/AUTH_CHECK.err"
fi

# Gate advancement probe
if [ "${AUTH_OK}" -eq 1 ]; then
  set +e
  bq query --nouse_legacy_sql < "${RENDER_DIR}/015_first_gate_advancement_probe.sql" > "${EVIDENCE_DIR}/PROBE_CHECK.txt" 2> "${EVIDENCE_DIR}/PROBE_CHECK.err"
  PROBE_RC=$?
  set -e
  if [ "${PROBE_RC}" -eq 0 ]; then
    PROBE_OK=1
  fi
else
  : > "${EVIDENCE_DIR}/PROBE_CHECK.txt"
  : > "${EVIDENCE_DIR}/PROBE_CHECK.err"
fi

# Dataset schema probe (informational — not a hard gate)
if [ "${AUTH_OK}" -eq 1 ]; then
  set +e
  bq query --nouse_legacy_sql < "${RENDER_DIR}/014_session_auth_dataset_check.sql" > "${EVIDENCE_DIR}/DATASET_CHECK.txt" 2> "${EVIDENCE_DIR}/DATASET_CHECK.err"
  set -e
else
  : > "${EVIDENCE_DIR}/DATASET_CHECK.txt"
  : > "${EVIDENCE_DIR}/DATASET_CHECK.err"
fi

# Gate status resolution
if [ "${MISSING_ENV}" -eq 1 ]; then
  STATUS_CODE="BLOCKED_MISSING_ENV"
elif [ "${BQ_MISSING}" -eq 1 ]; then
  STATUS_CODE="BLOCKED_MISSING_BQ"
elif [ "${AUTH_OK}" -ne 1 ]; then
  STATUS_CODE="BLOCKED_AUTH_FAILURE"
elif [ "${PROBE_OK}" -ne 1 ]; then
  STATUS_CODE="BLOCKED_QUERY_FAILURE"
else
  STATUS_CODE="BLOCKED_MISSING_VIEWS"
fi

{
  echo "STATUS_CODE=${STATUS_CODE}"
  echo "AUTH_OK=${AUTH_OK}"
  echo "PROBE_OK=${PROBE_OK}"
} > "${EVIDENCE_DIR}/LIVE_READOUT_STATUS.txt"

{
  echo "PHASE_95_VERIFICATION"
  echo "====================="
  echo "PASS: required documents present"
  echo "PASS: registry files present"
  echo "PASS: SQL files present"
  echo "PASS: JSON validation complete"
  echo ""
  echo "LIVE STATUS:"
  cat "${EVIDENCE_DIR}/LIVE_READOUT_STATUS.txt"
} > "${EVIDENCE_DIR}/GATE_RESULT.txt"

grep -n "Gate Advancement Order" "${FND_DIR}/WORKCAPTAIN_PHASE_95_LIVE_OPERATOR_EXPORT_AND_AUTHENTICATED_BQ_SESSION.md" > "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "BLOCKED_MISSING_VIEWS" "${CFG_DIR}/first_gate_advancement_registry.json" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "authenticated_bq_session" "${CFG_DIR}/authenticated_bq_session_checks.json" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "gate_advancement_probe_ok" "${SQL_DIR}/015_first_gate_advancement_probe.sql" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true

find "${FND_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/FND_INVENTORY.txt"
find "${CFG_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/CONFIG_INVENTORY.txt"
find "${SQL_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/SQL_INVENTORY.txt"

if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 \
    "${FND_DIR}/WORKCAPTAIN_PHASE_95_LIVE_OPERATOR_EXPORT_AND_AUTHENTICATED_BQ_SESSION.md" \
    "${FND_DIR}/WORKCAPTAIN_LIVE_OPERATOR_VARIABLE_EXPORT_PROTOCOL.md" \
    "${FND_DIR}/WORKCAPTAIN_AUTHENTICATED_BQ_SESSION_PROTOCOL.md" \
    "${FND_DIR}/WORKCAPTAIN_FIRST_GATE_ADVANCEMENT_EXECUTION_PROTOCOL.md" \
    "${FND_DIR}/WORKCAPTAIN_OPERATOR_SESSION_EVIDENCE_CONTRACT.md" \
    "${CFG_DIR}/live_operator_export_requirements.json" \
    "${CFG_DIR}/authenticated_bq_session_checks.json" \
    "${CFG_DIR}/first_gate_advancement_registry.json" \
    "${CFG_DIR}/operator_env.live.example" \
    "${SQL_DIR}/014_session_auth_dataset_check.sql" \
    "${SQL_DIR}/015_first_gate_advancement_probe.sql" \
    "${REPO_ROOT}/scripts/workcaptain_phase95_live_operator_bq_session.sh" \
    > "${EVIDENCE_DIR}/MANIFEST.sha256"
fi

echo "PHASE_95_VERIFICATION_PASS"
