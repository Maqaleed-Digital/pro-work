#!/usr/bin/env bash
set -e

PORT="${PORT:-3010}"
BASE="http://127.0.0.1:${PORT}"

echo "=== PROWORK DOCTOR ==="
echo "Checking server at $BASE"
echo ""

echo "version:"
curl -s "$BASE/api/admin/version" | head -c 200
echo ""

echo "health:"
curl -s "$BASE/api/admin/health" | head -c 200
echo ""

echo "scheduler:"
curl -s "$BASE/api/admin/scheduler/status" | head -c 200
echo ""

echo "PASS"
