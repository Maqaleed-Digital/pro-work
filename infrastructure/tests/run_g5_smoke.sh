#!/bin/sh
set -e
cd /workspace
export NODE_PATH=/workspace/app/node_modules

node -e "
const { Pool } = require('pg')
const crypto = require('crypto')
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 10000 })

async function run() {
  const client = await pool.connect()
  try {
    const TENANT = 'tn-e04ac090'
    const SEED_REQ = '1da8dc6c-1e7d-404b-bef0-396163518c59'
    const APP_G3 = 'c8fd9992-0ea8-4773-9d09-bec51bcfd3c8'
    const APP_G4 = '016e6d82-2098-47bd-8bc9-afc56845ee97'
    const LOG_G4 = '263ad170-64d7-4aa5-bbb2-ddc9aec8a3d2'

    await client.query(\"SELECT set_config('app.current_tenant_id', \$1, false)\", [TENANT])

    // STEP 1: Find or confirm users in tenant
    console.log('=== STEP 1: Users in tenant', TENANT, '===')
    const users = await client.query(
      'SELECT id, email, role, status FROM users WHERE tenant_id = \$1 ORDER BY created_at ASC',
      [TENANT]
    )
    users.rows.forEach(u => console.log('  User:', u.id.slice(0,8), u.email, 'role=' + u.role, 'status=' + u.status))
    console.log('  Total users:', users.rows.length)

    // STEP 2: Verify seed requisition
    console.log('')
    console.log('=== STEP 2: Seed requisition ===')
    const req = await client.query('SELECT id, title, status FROM requisitions WHERE id = \$1', [SEED_REQ])
    if (req.rows[0]) {
      console.log('  Requisition:', req.rows[0].id, req.rows[0].title, 'status=' + req.rows[0].status)
    } else {
      console.log('  ERROR: seed requisition not found')
    }

    // STEP 3: Fetch seeded applications
    console.log('')
    console.log('=== STEP 3: Seeded applications ===')
    const apps = await client.query(
      'SELECT id, status, requisition_id, ai_recommendation_log_id, candidate_id, match_score, match_confidence FROM applications WHERE requisition_id = \$1 ORDER BY applied_at ASC',
      [SEED_REQ]
    )
    console.log('  Total applications for seed requisition:', apps.rows.length)
    apps.rows.forEach(a => {
      const isG3 = a.id === APP_G3
      const isG4 = a.id === APP_G4
      const tag = isG3 ? ' [G3]' : isG4 ? ' [G4]' : ''
      console.log('  Application' + tag + ':')
      console.log(JSON.stringify({
        id: a.id,
        status: a.status,
        requisition_id: a.requisition_id,
        ai_recommendation_log_id: a.ai_recommendation_log_id,
        match_score: a.match_score,
        match_confidence: a.match_confidence,
      }, null, 4))
    })

    // Find specific G3 and G4 applications
    const g3App = apps.rows.find(a => a.id === APP_G3)
    const g4App = apps.rows.find(a => a.id === APP_G4)
    console.log('')
    console.log('  G3 application (c8fd9992):', g3App ? 'FOUND status=' + g3App.status : 'NOT FOUND')
    console.log('  G4 application (016e6d82):', g4App ? 'FOUND status=' + g4App.status + ' log_id=' + g4App.ai_recommendation_log_id : 'NOT FOUND')

    // STEP 4: Fetch recommendation detail for G4 log
    console.log('')
    console.log('=== STEP 4: Recommendation audit log detail ===')
    // Set app.tenant_id for RLS on recommendation_audit_logs (UUID type)
    const tenantUuid = (() => {
      const h = crypto.createHash('md5').update(TENANT).digest('hex')
      return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20,32)
    })()
    await client.query(\"SELECT set_config('app.tenant_id', \$1, false)\", [tenantUuid])

    const log = await client.query(
      'SELECT id, action_type, confidence_score, bias_score, model_version, prompt_hash, reviewer_decision, reviewer_id, override_reason, substring(rationale from 1 for 200) as rationale_excerpt, substring(input_signals::text from 1 for 200) as input_excerpt FROM recommendation_audit_logs WHERE id = \$1',
      [LOG_G4]
    )
    if (log.rows[0]) {
      console.log(JSON.stringify({
        id: log.rows[0].id,
        action_type: log.rows[0].action_type,
        confidence_score: log.rows[0].confidence_score,
        bias_score: log.rows[0].bias_score,
        model_version: log.rows[0].model_version,
        prompt_hash: log.rows[0].prompt_hash,
        reviewer_decision: log.rows[0].reviewer_decision,
        reviewer_id: log.rows[0].reviewer_id,
        override_reason: log.rows[0].override_reason,
        rationale_excerpt: log.rows[0].rationale_excerpt,
        input_signals_excerpt: log.rows[0].input_excerpt,
      }, null, 2))
    } else {
      console.log('  Recommendation log', LOG_G4, 'NOT FOUND')
    }

    // STEP 5: Verify application_events for G3 and G4 apps
    console.log('')
    console.log('=== STEP 5: Application events ===')
    if (g3App) {
      const evG3 = await client.query('SELECT id, event_type, previous_status, new_status, actor_type FROM application_events WHERE application_id = \$1 ORDER BY created_at ASC', [APP_G3])
      console.log('  G3 events (c8fd9992):', evG3.rows.length, 'rows')
      evG3.rows.forEach(e => console.log('    ', e.previous_status || 'null', '->', e.new_status, '(' + e.actor_type + ')'))
    }
    if (g4App) {
      const evG4 = await client.query('SELECT id, event_type, previous_status, new_status, actor_type FROM application_events WHERE application_id = \$1 ORDER BY created_at ASC', [APP_G4])
      console.log('  G4 events (016e6d82):', evG4.rows.length, 'rows')
      evG4.rows.forEach(e => console.log('    ', e.previous_status || 'null', '->', e.new_status, '(' + e.actor_type + ')'))
    }

    console.log('')
    console.log('=== G5 SMOKE TEST COMPLETE ===')
  } finally {
    client.release()
    await pool.end()
  }
}
run().catch(e => { console.error('SMOKE TEST FAILED:', e.message); process.exit(1) })
"
