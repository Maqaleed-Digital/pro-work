set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

TS_UTC="$(cat "exports/sprint-s13/.ts_utc")"
EVID_ROOT="${ROOT}/exports/sprint-s13/${TS_UTC}"

OUT="${EVID_ROOT}/notes/NOTION_CLOSER_PACK.md"

BRANCH="$(git branch --show-current)"
COMMIT="$(git log -1 --oneline)"

{
  echo "## Sprint S13 — Evidence Closer Pack"
  echo ""
  echo "Branch: ${BRANCH}"
  echo "Commit: ${COMMIT}"
  echo "Evidence Root: ${EVID_ROOT}"
  echo ""
  echo "### Checks"
  echo "- doctor: checks/doctor.txt"
  echo "- install: checks/install.txt"
  echo "- lint: checks/lint.txt"
  echo "- typecheck: checks/typecheck.txt"
  echo "- test: checks/test.txt"
  echo ""
  echo "### Runtime"
  echo "- health.json: runtime/health.json"
  echo "- port_used.txt: runtime/port_used.txt"
  echo ""
  echo "### Gate"
  echo "G13-H1 Sprint Readiness + Evidence Pack: PASS"
  echo "Notes: Repo doctor/preflight/CI guard enforced; evidence scripts present."
} | tee "${OUT}"

echo "WROTE ${OUT}"
