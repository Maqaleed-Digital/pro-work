set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

mkdir -p "exports/sprint-s13"
TS_UTC="$(date -u +"%Y%m%dT%H%M%SZ")"
echo "${TS_UTC}" > "exports/sprint-s13/.ts_utc"

EVID_ROOT="${ROOT}/exports/sprint-s13/${TS_UTC}"
mkdir -p "${EVID_ROOT}/start" "${EVID_ROOT}/runtime" "${EVID_ROOT}/checks" "${EVID_ROOT}/notes"

{
  echo "timestamp_utc=${TS_UTC}"
  echo "repo=${ROOT}"
  git log -1 --oneline
  git branch --show-current
  git status --short
  node -v
  npm -v
} | tee "${EVID_ROOT}/start/baseline.txt"

echo "EVID_ROOT=${EVID_ROOT}"
