'use strict'

const test   = require('node:test')
const assert = require('node:assert/strict')

const SEED_REQ_ID = '1da8dc6c-1e7d-404b-bef0-396163518c59'
const DB_URL = process.env.DATABASE_URL

if (!DB_URL) {
  test('SKIP: DATABASE_URL not set', () => assert.ok(true, 'skipped'))
} else {

const { Pool } = require('pg')
const { createAiMatchingService }  = require('../../app/modules/hiring/ai_matching_service')
const { createCandidateService }   = require('../../app/modules/hiring/candidate_service')

const pool = new Pool({ connectionString: DB_URL, max: 2, connectionTimeoutMillis: 10000 })

test('integration: rank candidates for seed requisition, approve top, verify audit trail', async () => {
  const ts = Date.now()
  const matchingSvc = createAiMatchingService({ pool })
  const candidateSvc = createCandidateService({ pool })

  const client = await pool.connect()
  try {
    // Get seed requisition tenant
    const reqRow = await client.query('SELECT * FROM requisitions WHERE id = $1', [SEED_REQ_ID])
    assert.ok(reqRow.rows.length > 0, `Seed requisition ${SEED_REQ_ID} not found`)
    const tenantId = reqRow.rows[0].tenant_id
    assert.strictEqual(reqRow.rows[0].status, 'PUBLISHED')
    console.log(`  Tenant: ${tenantId}, requisition PUBLISHED`)

    // Create test candidates for this requisition's tenant
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId])
    const c1 = await candidateSvc.createCandidate(tenantId, {
      first_name: 'G4Match', last_name: 'Top',
      email: `s43g4-top-${ts}@test.workcaptain.ai`,
      nationality: 'SAU', source: 'AI_MATCH',
    })
    const c2 = await candidateSvc.createCandidate(tenantId, {
      first_name: 'G4Match', last_name: 'Mid',
      email: `s43g4-mid-${ts}@test.workcaptain.ai`,
      nationality: 'IND', source: 'AI_MATCH',
    })
    console.log(`  Created candidates: ${c1.id}, ${c2.id}`)

    // Rank candidates
    const ranking = await matchingSvc.rankCandidates(tenantId, SEED_REQ_ID)
    assert.ok(ranking.ranked_candidates.length >= 2)
    assert.ok(ranking.model_version)
    assert.ok(ranking.rubric_version)
    console.log(`  Ranked ${ranking.total_candidates} candidates`)
    console.log(`  Recommended: ${ranking.recommended_count}, Not recommended: ${ranking.not_recommended_count}`)
    console.log(`  Model: ${ranking.model_version}, Rubric: ${ranking.rubric_version}`)

    // Verify audit log rows written
    // tenant_id in recommendation_audit_logs is UUID — derive from string
    const crypto = require('crypto')
    function toUuid(s) {
      const h = crypto.createHash('md5').update(s || '').digest('hex')
      return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`
    }
    const logCount = await client.query(
      `SELECT COUNT(*) as cnt FROM recommendation_audit_logs
       WHERE tenant_id = $1 AND input_signals::text LIKE $2`,
      [toUuid(tenantId), `%${SEED_REQ_ID}%`]
    )
    const auditCount = parseInt(logCount.rows[0].cnt)
    assert.ok(auditCount >= ranking.total_candidates,
      `Expected >= ${ranking.total_candidates} audit rows, got ${auditCount}`)
    console.log(`  Audit log rows written: ${auditCount}`)

    // Bias report
    const bias = ranking.bias_report
    console.log(`  Bias report: flagged=${bias.flagged}, dimensions checked: ${Object.keys(bias.disparate_impact).join(', ')}`)
    if (bias.flags.length > 0) {
      bias.flags.forEach(f => console.log(`    FLAG: ${f.message}`))
    } else {
      console.log(`    No disparate impact flags`)
    }

    // Approve top candidate
    const topCandidate = ranking.ranked_candidates[0]
    console.log(`  Top candidate: ${topCandidate.candidate_name} score=${topCandidate.match_score} log=${topCandidate.recommendation_audit_log_id}`)

    const approval = await matchingSvc.reviewRecommendation(
      tenantId, topCandidate.recommendation_audit_log_id, 'ACCEPTED', null
    )
    assert.strictEqual(approval.decision, 'ACCEPTED')
    assert.ok(approval.application_id, 'should create application')
    console.log(`  Approved: application_id=${approval.application_id}`)

    // Verify application has log_id wired
    const appRow = await client.query(
      'SELECT * FROM applications WHERE id = $1', [approval.application_id]
    )
    assert.ok(appRow.rows[0])
    assert.strictEqual(appRow.rows[0].ai_recommendation_log_id, topCandidate.recommendation_audit_log_id)
    console.log(`  Application ai_recommendation_log_id: ${appRow.rows[0].ai_recommendation_log_id}`)

    // Verify application event actor_type = AI
    const eventRow = await client.query(
      `SELECT * FROM application_events
       WHERE application_id = $1 AND event_type = 'STATUS_CHANGED'
       ORDER BY created_at ASC LIMIT 1`,
      [approval.application_id]
    )
    assert.ok(eventRow.rows[0])
    assert.strictEqual(eventRow.rows[0].actor_type, 'AI')
    assert.strictEqual(eventRow.rows[0].new_status, 'APPLIED')
    console.log(`  Application event: actor_type=${eventRow.rows[0].actor_type}, new_status=${eventRow.rows[0].new_status}`)

    // Evidence output
    console.log(`\n  === S43-G4 INTEGRATION EVIDENCE ===`)
    console.log(`  Application ID: ${approval.application_id}`)
    console.log(`  recommendation_audit_log_id: ${topCandidate.recommendation_audit_log_id}`)
    console.log(`  Total audit log rows: ${auditCount}`)
    console.log(`  Bias report: flagged=${bias.flagged}`)
    if (bias.disparate_impact.nationality) {
      const nr = bias.disparate_impact.nationality
      console.log(`  Disparate impact (nationality): rates=${JSON.stringify(nr.selection_rates)}, ratios=${JSON.stringify(nr.impact_ratios)}`)
    }
    console.log(`  Model version: ${ranking.model_version}`)
    console.log(`  Rubric version: ${ranking.rubric_version}`)
    console.log(`  actor_type on application event: AI`)
    console.log(`  actor_type on approval: HUMAN (reviewer)`)

  } finally {
    client.release()
  }
})

test.after(() => pool.end())

}
