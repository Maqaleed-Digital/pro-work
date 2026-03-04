#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3010}"
BASE="http://127.0.0.1:${PORT}"

# Optional token
TOKEN="${ADMIN_TOKEN:-}"

AUTH_HEADER=()
if [[ -n "$TOKEN" ]]; then
  AUTH_HEADER=(-H "Authorization: Bearer $TOKEN")
fi

echo "=== PROWORK DOCTOR ==="
echo "Target: $BASE"
echo ""

echo "version:"
curl -s "${AUTH_HEADER[@]+"${AUTH_HEADER[@]}"}" "$BASE/api/admin/version" | head -c 200
echo ""
echo ""

echo "health:"
curl -s "${AUTH_HEADER[@]+"${AUTH_HEADER[@]}"}" "$BASE/api/admin/health" | head -c 200
echo ""
echo ""

echo "scheduler:"
curl -s "${AUTH_HEADER[@]+"${AUTH_HEADER[@]}"}" "$BASE/api/admin/scheduler/status" | head -c 200
echo ""
echo ""

echo "PASS"
