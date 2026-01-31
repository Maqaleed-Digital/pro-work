set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

TS_UTC="$(cat "exports/sprint-s13/.ts_utc")"
EVID_ROOT="${ROOT}/exports/sprint-s13/${TS_UTC}"

mkdir -p "${EVID_ROOT}/checks" "${EVID_ROOT}/runtime" "${EVID_ROOT}/notes"

bash "scripts/prowork_doctor.sh" | tee "${EVID_ROOT}/checks/doctor.txt"

cd "${ROOT}/app"

( npm ci 2>&1 || npm install 2>&1 ) | tee "${EVID_ROOT}/checks/install.txt"
( npm run lint 2>&1 ) | tee "${EVID_ROOT}/checks/lint.txt"
( npm run typecheck 2>&1 ) | tee "${EVID_ROOT}/checks/typecheck.txt"
( npm test 2>&1 || npm run test 2>&1 ) | tee "${EVID_ROOT}/checks/test.txt"

PORT="3010"
curl -sS "http://127.0.0.1:${PORT}/api/health" | tee "${EVID_ROOT}/runtime/health.json"
echo "port=${PORT}" | tee "${EVID_ROOT}/runtime/port_used.txt"

echo "DONE EVID_ROOT=${EVID_ROOT}"
