#!/usr/bin/env bash
set -euo pipefail

PORTS=(3010 3011 3012 3013)

for p in "${PORTS[@]}"; do
  PIDS="$(lsof -t -iTCP:"$p" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "${PIDS:-}" ]; then
    echo "Killing port $p: $PIDS"
    kill $PIDS 2>/dev/null || true
    sleep 1
    kill -9 $PIDS 2>/dev/null || true
  else
    echo "Port $p: free"
  fi
done

