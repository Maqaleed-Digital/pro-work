#!/bin/sh
set -e
cd /workspace
export NODE_PATH=/workspace/app/node_modules
node -e "
const { Pool } = require('pg')
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
async function run() {
  const client = await pool.connect()
  try {
    const result = await client.query(
      'SELECT id, timestamp::text as created_at, action_type, tenant_id, model_version, prompt_hash, confidence_score, substring(rationale from 1 for 100) as rationale_preview FROM recommendation_audit_logs ORDER BY timestamp ASC'
    )
    console.log('Total rows:', result.rows.length)
    result.rows.forEach((r, i) => {
      console.log('  ' + (i+1) + '. ' + r.created_at + ' action=' + r.action_type + ' model=' + r.model_version + ' tenant=' + r.tenant_id)
      console.log('     rationale: ' + (r.rationale_preview || 'null'))
    })

    // Separate G4 runs (model=workcaptain-match-v1.0) from other
    const g4Rows = result.rows.filter(r => r.model_version === 'workcaptain-match-v1.0')
    const otherRows = result.rows.filter(r => r.model_version !== 'workcaptain-match-v1.0')
    console.log('')
    console.log('G4 rows (model=workcaptain-match-v1.0): ' + g4Rows.length)
    console.log('Other rows: ' + otherRows.length)
    if (otherRows.length > 0) {
      console.log('Other row details:')
      otherRows.forEach((r, i) => {
        console.log('  ' + (i+1) + '. id=' + r.id + ' action=' + r.action_type + ' model=' + r.model_version + ' prompt=' + r.prompt_hash)
      })
    }
  } finally {
    client.release()
    await pool.end()
  }
}
run().catch(e => console.error(e.message))
"
