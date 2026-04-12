#!/usr/bin/env bash
set -euo pipefail

if [ "${#}" -ne 4 ]; then
  echo "usage: workcaptain_phase78_rerun_execute.sh <repo_root> <prior_evidence_dir> <output_evidence_dir> <thresholds_json>"
  exit 1
fi

REPO_ROOT="$1"
PRIOR_EVIDENCE_DIR="$2"
OUTPUT_EVIDENCE_DIR="$3"
THRESHOLDS_JSON="$4"

if [ ! -d "${REPO_ROOT}" ]; then
  echo "FAIL_CLOSED: repo root missing: ${REPO_ROOT}"
  exit 1
fi

if [ ! -d "${PRIOR_EVIDENCE_DIR}" ]; then
  echo "FAIL_CLOSED: prior evidence dir missing: ${PRIOR_EVIDENCE_DIR}"
  exit 1
fi

mkdir -p "${OUTPUT_EVIDENCE_DIR}"

python3 "${REPO_ROOT}/scripts/workcaptain_phase78_rerun.py" \
  "${PRIOR_EVIDENCE_DIR}" \
  "${OUTPUT_EVIDENCE_DIR}" \
  "${THRESHOLDS_JSON}"

cat > "${OUTPUT_EVIDENCE_DIR}/EXECUTION_REPORT.md" <<REPORT
# PHASE 78 RERUN EXECUTION REPORT

- Repo root: ${REPO_ROOT}
- Prior evidence dir: ${PRIOR_EVIDENCE_DIR}
- Output evidence dir: ${OUTPUT_EVIDENCE_DIR}
- Phase 78 rerun status: COMPLETE
- Reassessment mode: EVIDENCE_BACKED
- Authority mode: HUMAN_AUTHORITY_FINAL
REPORT

echo "  wrote EXECUTION_REPORT.md"

(
  cd "${OUTPUT_EVIDENCE_DIR}"
  find . -type f | sort | sed 's#^\./##' > MANIFEST.txt
  while IFS= read -r file; do
    shasum -a 256 "${file}"
  done < MANIFEST.txt > MANIFEST.sha256
)

echo "  wrote MANIFEST.txt + MANIFEST.sha256"
