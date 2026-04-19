#!/bin/sh
set -e
echo "S43-G3 Integration Test — running against Cloud SQL..."
echo "DATABASE_URL present: $([ -n "$DATABASE_URL" ] && echo 'yes' || echo 'no')"

cd /workspace
export NODE_PATH=/workspace/app/node_modules

echo "=== G3 Integration ==="
node --test tests/hiring/candidate_application.integration.test.js

echo "=== G4 Integration ==="
node --test tests/hiring/ai_matching.integration.test.js

echo "All integration tests complete."
