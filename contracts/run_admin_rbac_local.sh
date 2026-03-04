#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="${ROOT}/app"
API="${API:-http://127.0.0.1:3010}"
LOG="${LOG:-/tmp/prowork_local_server.log}"

PID_ON_3010="$(lsof -nP -iTCP:3010 -sTCP:LISTEN -t 2>/dev/null || true)"
if [ -n "${PID_ON_3010:-}" ]; then
  kill "${PID_ON_3010}" || true
  sleep 1
fi

cd "${APP}" || exit 1
node -c "server.js"
npm ci
npm run lint

rm -f "${LOG}" || true
export APP_PORT="${APP_PORT:-3010}"
export ADMIN_BOOTSTRAP_TOKEN="${ADMIN_BOOTSTRAP_TOKEN:-CHANGE_ME_ONCE}"

nohup node "server.js" >"${LOG}" 2>&1 &
SERVER_PID="$!"
disown "${SERVER_PID}" >/dev/null 2>&1 || true
sleep 1

if ! ps -p "${SERVER_PID}" >/dev/null 2>&1; then
  echo "ERROR: server exited immediately"
  tail -n 200 "${LOG}" | cat || true
  exit 1
fi

lsof -nP -iTCP:3010 -sTCP:LISTEN || true
curl -sS -i "${API}/health" | sed -n '1,25p' | cat
echo ""

cd "${ROOT}" || exit 1
set +e
API="${API}" ADMIN_BOOTSTRAP_TOKEN="${ADMIN_BOOTSTRAP_TOKEN}" bash "${ROOT}/contracts/validate_admin_rbac.sh" | cat
RC="$?"
set -e

echo ""
tail -n 200 "${LOG}" | cat || true

echo ""
echo "KEEP_RUNNING_NOTE: Server is running in background as PID=${SERVER_PID}"
echo "STOP_COMMAND: kill ${SERVER_PID}"
exit "${RC}"
