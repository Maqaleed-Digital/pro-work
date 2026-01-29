#!/usr/bin/env bash
set -euo pipefail

PORT_FILE="/Users/waheebmahmoud/dev/pro-work/app/.runtime/port.txt"

if [ ! -f "${PORT_FILE}" ]; then
  echo "ERROR: port file missing: ${PORT_FILE}"
  echo "Start the server first (it creates .runtime/port.txt)."
  exit 1
fi

PORT="$(cat "${PORT_FILE}")"
curl -sS "http://127.0.0.1:${PORT}/api/health" | cat
echo
