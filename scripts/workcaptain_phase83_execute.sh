#!/usr/bin/env bash
set -euo pipefail

if [ "${#}" -ne 3 ]; then
  echo "usage: workcaptain_phase83_execute.sh <repo_root> <prior_evidence_dir> <output_evidence_dir>"
  exit 1
fi

REPO_ROOT="$1"
PRIOR_EVIDENCE_DIR="$2"
OUTPUT_EVIDENCE_DIR="$3"

if [ ! -d "${REPO_ROOT}" ]; then
  echo "FAIL_CLOSED: repo root missing: ${REPO_ROOT}"
  exit 1
fi

if [ ! -d "${PRIOR_EVIDENCE_DIR}" ]; then
  echo "FAIL_CLOSED: prior evidence dir missing: ${PRIOR_EVIDENCE_DIR}"
  exit 1
fi

mkdir -p "${OUTPUT_EVIDENCE_DIR}"

python3 "${REPO_ROOT}/scripts/workcaptain_phase83_human_validation.py" \
  "${PRIOR_EVIDENCE_DIR}" \
  "${OUTPUT_EVIDENCE_DIR}" \
  "${REPO_ROOT}/config/intelligence/blocker_human_validation_defaults.json"

cat > "${OUTPUT_EVIDENCE_DIR}/EXECUTION_REPORT.md" <<REPORT
# PHASE 83 EXECUTION REPORT

- Repo root: ${REPO_ROOT}
- Prior evidence dir: ${PRIOR_EVIDENCE_DIR}
- Output evidence dir: ${OUTPUT_EVIDENCE_DIR}
- Phase 83 status: COMPLETE
- Human validation mode: ENFORCED
- No-guessing role: ENFORCED
- Certification rerun posture: BLOCKED_UNTIL_ALL_BLOCKERS_HUMAN_VALIDATED
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
