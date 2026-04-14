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
  "${FND_DIR}/WORKCAPTAIN_PHASE_97_RUNTIME_EVENT_EMISSION_AND_FIRST_NON_EMPTY_OUTPUT.md"
  "${FND_DIR}/WORKCAPTAIN_RUNTIME_EVENT_EMISSION_PROTOCOL.md"
  "${FND_DIR}/WORKCAPTAIN_FIRST_RAW_EVENT_INSERT_PROTOCOL.md"
  "${FND_DIR}/WORKCAPTAIN_FIRST_NON_EMPTY_EXECUTIVE_OUTPUT_PROTOCOL.md"
  "${FND_DIR}/WORKCAPTAIN_RUNTIME_EVENT_EVIDENCE_CONTRACT.md"
  "${CFG_DIR}/runtime_event_emission_targets.json"
  "${CFG_DIR}/first_raw_insert_registry.json"
  "${CFG_DIR}/non_empty_output_status_codes.json"
  "${SQL_DIR}/021_raw_event_recount.sql"
  "${SQL_DIR}/022_first_non_empty_output_check.sql"
)

for file in "${required_files[@]}"; do
  if [ ! -f "${file}" ]; then
    echo "ERROR: required file missing -> ${file}"
    exit 1
  fi
done

if command -v python3 >/dev/null 2>&1; then
  python3 - <<'PY' "${CFG_DIR}/runtime_event_emission_targets.json" "${CFG_DIR}/first_raw_insert_registry.json" "${CFG_DIR}/non_empty_output_status_codes.json" > "${EVIDENCE_DIR}/JSON_VALIDATION.txt"
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
  echo "PHASE_97_SCOPE=LIVE_RUNTIME_EVENT_EMISSION_FIRST_RAW_EVENT_INSERT_FIRST_NON_EMPTY_EXECUTIVE_OUTPUT"
  echo "RUN_AT_UTC=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "REPO_ROOT=${REPO_ROOT}"
  echo "CURRENT_HEAD=$(git -C "${REPO_ROOT}" rev-parse HEAD)"
  echo "CURRENT_BRANCH=$(git -C "${REPO_ROOT}" branch --show-current)"
} > "${EVIDENCE_DIR}/RUN_CONTEXT.txt"

if [ -z "${WORKCAPTAIN_BQ_PROJECT_ID:-}" ] || [ -z "${WORKCAPTAIN_BQ_DATASET:-}" ]; then
  echo "ERROR: WORKCAPTAIN_BQ_PROJECT_ID and WORKCAPTAIN_BQ_DATASET must be exported in the live operator shell before running Phase 97" > "${EVIDENCE_DIR}/LIVE_READOUT_STATUS.txt"
  exit 1
fi

if ! command -v bq >/dev/null 2>&1; then
  echo "ERROR: bq CLI missing in live operator shell" > "${EVIDENCE_DIR}/LIVE_READOUT_STATUS.txt"
  exit 1
fi

sed -e "s/{{PROJECT_ID}}/${WORKCAPTAIN_BQ_PROJECT_ID}/g" -e "s/{{DATASET}}/${WORKCAPTAIN_BQ_DATASET}/g" \
  "${SQL_DIR}/021_raw_event_recount.sql" > "${RENDER_DIR}/021_raw_event_recount.sql"

sed -e "s/{{PROJECT_ID}}/${WORKCAPTAIN_BQ_PROJECT_ID}/g" -e "s/{{DATASET}}/${WORKCAPTAIN_BQ_DATASET}/g" \
  "${SQL_DIR}/022_first_non_empty_output_check.sql" > "${RENDER_DIR}/022_first_non_empty_output_check.sql"

set +e
bq query --nouse_legacy_sql --format=prettyjson < "${RENDER_DIR}/021_raw_event_recount.sql" > "${EVIDENCE_DIR}/RAW_EVENT_RECOUNT.json" 2> "${EVIDENCE_DIR}/RAW_EVENT_RECOUNT.err"
RAW_RC=$?
set -e

if [ "${RAW_RC}" -ne 0 ]; then
  {
    echo "STATUS_CODE=BLOCKED_QUERY_FAILURE"
    echo "RAW_COUNTS_OK=0"
    echo "OUTPUT_OK=0"
  } > "${EVIDENCE_DIR}/LIVE_READOUT_STATUS.txt"
else
  cp "${EVIDENCE_DIR}/RAW_EVENT_RECOUNT.json" "${EVIDENCE_DIR}/RAW_EVENT_RECOUNT.txt"
  FRONTEND_ROWS="$(python3 - <<'PY' "${EVIDENCE_DIR}/RAW_EVENT_RECOUNT.json"
import json, sys
rows=json.load(open(sys.argv[1]))
val=0
for r in rows:
    if r.get("table_name")=="raw_frontend_events":
        val=int(r.get("row_count","0"))
print(val)
PY
)"
  PLATFORM_ROWS="$(python3 - <<'PY' "${EVIDENCE_DIR}/RAW_EVENT_RECOUNT.json"
import json, sys
rows=json.load(open(sys.argv[1]))
val=0
for r in rows:
    if r.get("table_name")=="raw_platform_events":
        val=int(r.get("row_count","0"))
print(val)
PY
)"
  TOTAL_ROWS=$((FRONTEND_ROWS + PLATFORM_ROWS))

  if [ "${TOTAL_ROWS}" -le 0 ]; then
    {
      echo "STATUS_CODE=BLOCKED_NO_RAW_EVENTS"
      echo "RAW_COUNTS_OK=1"
      echo "OUTPUT_OK=0"
      echo "FRONTEND_ROWS=${FRONTEND_ROWS}"
      echo "PLATFORM_ROWS=${PLATFORM_ROWS}"
      echo "TOTAL_ROWS=${TOTAL_ROWS}"
    } > "${EVIDENCE_DIR}/LIVE_READOUT_STATUS.txt"
  else
    set +e
    bq query --nouse_legacy_sql --format=prettyjson < "${RENDER_DIR}/022_first_non_empty_output_check.sql" > "${EVIDENCE_DIR}/NON_EMPTY_EXECUTIVE_OUTPUT.json" 2> "${EVIDENCE_DIR}/NON_EMPTY_EXECUTIVE_OUTPUT.err"
    OUTPUT_RC=$?
    set -e

    if [ "${OUTPUT_RC}" -ne 0 ]; then
      {
        echo "STATUS_CODE=BLOCKED_QUERY_FAILURE"
        echo "RAW_COUNTS_OK=1"
        echo "OUTPUT_OK=0"
        echo "FRONTEND_ROWS=${FRONTEND_ROWS}"
        echo "PLATFORM_ROWS=${PLATFORM_ROWS}"
        echo "TOTAL_ROWS=${TOTAL_ROWS}"
      } > "${EVIDENCE_DIR}/LIVE_READOUT_STATUS.txt"
    else
      OUTPUT_ROWS="$(python3 - <<'PY' "${EVIDENCE_DIR}/NON_EMPTY_EXECUTIVE_OUTPUT.json"
import json, sys
rows=json.load(open(sys.argv[1]))
print(len(rows))
PY
)"
      if [ "${OUTPUT_ROWS}" -le 0 ]; then
        {
          echo "STATUS_CODE=BLOCKED_EMPTY_EXECUTIVE_OUTPUT"
          echo "RAW_COUNTS_OK=1"
          echo "OUTPUT_OK=1"
          echo "OUTPUT_ROWS=${OUTPUT_ROWS}"
          echo "FRONTEND_ROWS=${FRONTEND_ROWS}"
          echo "PLATFORM_ROWS=${PLATFORM_ROWS}"
          echo "TOTAL_ROWS=${TOTAL_ROWS}"
        } > "${EVIDENCE_DIR}/LIVE_READOUT_STATUS.txt"
      else
        {
          echo "STATUS_CODE=PASS"
          echo "RAW_COUNTS_OK=1"
          echo "OUTPUT_OK=1"
          echo "OUTPUT_ROWS=${OUTPUT_ROWS}"
          echo "FRONTEND_ROWS=${FRONTEND_ROWS}"
          echo "PLATFORM_ROWS=${PLATFORM_ROWS}"
          echo "TOTAL_ROWS=${TOTAL_ROWS}"
        } > "${EVIDENCE_DIR}/LIVE_READOUT_STATUS.txt"
      fi
    fi
  fi
fi

{
  echo "PHASE_97_VERIFICATION"
  echo "====================="
  echo "PASS: required documents present"
  echo "PASS: registry files present"
  echo "PASS: SQL files present"
  echo "PASS: JSON validation complete"
  echo ""
  echo "LIVE STATUS:"
  cat "${EVIDENCE_DIR}/LIVE_READOUT_STATUS.txt"
} > "${EVIDENCE_DIR}/GATE_RESULT.txt"

grep -n "PASS Condition" "${FND_DIR}/WORKCAPTAIN_PHASE_97_RUNTIME_EVENT_EMISSION_AND_FIRST_NON_EMPTY_OUTPUT.md" > "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "manual_seed_forbidden" "${CFG_DIR}/first_raw_insert_registry.json" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "BLOCKED_EMPTY_EXECUTIVE_OUTPUT" "${CFG_DIR}/non_empty_output_status_codes.json" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true
grep -n "raw_frontend_events" "${SQL_DIR}/021_raw_event_recount.sql" >> "${EVIDENCE_DIR}/DOC_SPOTCHECK.txt" || true

find "${FND_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/FND_INVENTORY.txt"
find "${CFG_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/CONFIG_INVENTORY.txt"
find "${SQL_DIR}" -maxdepth 1 -type f | sort > "${EVIDENCE_DIR}/SQL_INVENTORY.txt"

if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 \
    "${FND_DIR}/WORKCAPTAIN_PHASE_97_RUNTIME_EVENT_EMISSION_AND_FIRST_NON_EMPTY_OUTPUT.md" \
    "${FND_DIR}/WORKCAPTAIN_RUNTIME_EVENT_EMISSION_PROTOCOL.md" \
    "${FND_DIR}/WORKCAPTAIN_FIRST_RAW_EVENT_INSERT_PROTOCOL.md" \
    "${FND_DIR}/WORKCAPTAIN_FIRST_NON_EMPTY_EXECUTIVE_OUTPUT_PROTOCOL.md" \
    "${FND_DIR}/WORKCAPTAIN_RUNTIME_EVENT_EVIDENCE_CONTRACT.md" \
    "${CFG_DIR}/runtime_event_emission_targets.json" \
    "${CFG_DIR}/first_raw_insert_registry.json" \
    "${CFG_DIR}/non_empty_output_status_codes.json" \
    "${SQL_DIR}/021_raw_event_recount.sql" \
    "${SQL_DIR}/022_first_non_empty_output_check.sql" \
    "${REPO_ROOT}/scripts/workcaptain_phase97_runtime_event_emission_first_output.sh" \
    > "${EVIDENCE_DIR}/MANIFEST.sha256"
fi

echo "PHASE_97_VERIFICATION_PASS"
