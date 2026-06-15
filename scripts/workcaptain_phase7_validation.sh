#!/usr/bin/env bash
set -e

echo "=== PHASE 7 VALIDATION ==="

echo ""
echo "Health check:"
curl -s -o /dev/null -w "%{http_code}\n" https://api.workcaptain.ai/health

echo ""
echo "Admin check (must NOT be 200):"
curl -s -o /dev/null -w "%{http_code}\n" https://api.workcaptain.ai/admin

echo ""
echo "Root check:"
curl -s -o /dev/null -w "%{http_code}\n" https://api.workcaptain.ai/
