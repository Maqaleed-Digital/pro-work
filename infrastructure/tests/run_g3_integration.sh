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

echo "=== Audit Provenance ==="
node -e "
const { Pool } = require('pg')
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
async function run() {
  const client = await pool.connect()
  try {
    const result = await client.query(
      \"SELECT id, timestamp::text as created_at, action_type, tenant_id, model_version, prompt_hash, confidence_score, substring(rationale from 1 for 100) as rationale_preview FROM recommendation_audit_logs ORDER BY timestamp ASC\"
    )
    console.log('Total rows:', result.rows.length)
    result.rows.forEach((r, i) => {
      console.log('  ' + (i+1) + '. ' + r.created_at + ' action=' + r.action_type + ' model=' + r.model_version + ' tenant=' + r.tenant_id)
    })
    const g4Rows = result.rows.filter(r => r.model_version === 'workcaptain-match-v1.0')
    const otherRows = result.rows.filter(r => r.model_version !== 'workcaptain-match-v1.0')
    console.log('G4 rows (model=workcaptain-match-v1.0):', g4Rows.length)
    console.log('Other rows:', otherRows.length)
    if (otherRows.length > 0) {
      console.log('Other row details:')
      otherRows.forEach((r, i) => {
        console.log('  ' + (i+1) + '. id=' + r.id + ' action=' + r.action_type + ' model=' + r.model_version + ' prompt=' + r.prompt_hash)
      })
    }
  } finally { client.release(); await pool.end() }
}
run().catch(e => console.error(e.message))
"

echo "=== G6 Integration ==="
node --test tests/hiring/offer_builder.integration.test.js

echo "=== G7 Integration ==="
node --test tests/hiring/recruit_evidence_pack.integration.test.js

echo "=== G5 Smoke Test ==="
sh /workspace/infrastructure/tests/run_g5_smoke.sh

echo "All integration tests complete."

echo "=== S44-G1 Integration ==="
node --test tests/contracts/contract_lifecycle.integration.test.js

echo "=== S44-G2 WPS Integration ==="
node --test tests/compliance/wps_lifecycle.integration.test.js

echo "=== S44-G3 Probation Integration ==="
node --test tests/compliance/probation_lifecycle.integration.test.js

echo "=== S44-G4 ESB Integration ==="
node --test tests/compliance/esb_lifecycle.integration.test.js

echo "=== S44-G5 Offboarding Integration ==="
node --test tests/compliance/offboarding_lifecycle.integration.test.js

echo "=== S44-G6 SDP Integration ==="
node --test tests/programs/sdp_lifecycle.integration.test.js
