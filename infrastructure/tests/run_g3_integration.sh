#!/bin/sh
set -e
echo "S43-G3 Integration Test — running against Cloud SQL..."
echo "DATABASE_URL present: $([ -n "$DATABASE_URL" ] && echo 'yes' || echo 'no')"

cd /workspace
export NODE_PATH=/workspace/app/node_modules
node --test tests/hiring/candidate_application.integration.test.js

echo "Integration test complete."
