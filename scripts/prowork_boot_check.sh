#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/prowork"

echo "=== PROWORK BOOT CHECK ==="

test -f "${ROOT}/app/server.js"
test -f "${ROOT}/deploy/systemd/prowork.service"
test -f "${ROOT}/deploy/nginx/prowork.conf"
test -f "${ROOT}/.env.production.example"

echo "OK required files present"

node -e "const c=require('${ROOT}/app/config/runtime_config'); const cfg=c.loadRuntimeConfig(process.env); c.validateRuntimeConfig(cfg); console.log('OK runtime config valid')"

echo "DONE"
