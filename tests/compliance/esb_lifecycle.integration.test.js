'use strict'

const test   = require('node:test')
const assert = require('node:assert/strict')

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) { test('SKIP: no DATABASE_URL', () => assert.ok(true)); } else {

const { Pool } = require('pg')
const { createEsbService } = require('../../app/modules/compliance/esb_service')

const pool = new Pool({ connectionString: DATABASE_URL, max: 2, connectionTimeoutMillis: 10000 })
const svc = createEsbService({ pool })

const TENANT      = 'tn-e04ac090'
const CONTRACT_ID = '603203da-0a0d-4ac8-8574-d2cc819a9a7d'
const SERVICE_END = '2029-04-19'
const POLICY_VER  = 'ksa-labor-law-v2015'

test('ESB lifecycle: draft → recalculate → finalize → reproducibility', async () => {
  // Step 1: Draft with EMPLOYER_TERMINATION
  const draft = await svc.draftCalculation(TENANT, CONTRACT_ID, 'EMPLOYER_TERMINATION', SERVICE_END, POLICY_VER, null)
  assert.ok(draft.id)
  assert.strictEqual(draft.status, 'DRAFT')
  assert.strictEqual(draft.policy_version, POLICY_VER)
  const draftAmount = parseFloat(draft.final_amount_sar)
  assert.ok(draftAmount > 0)

  const breakdown = typeof draft.calculation_breakdown_json === 'string'
    ? JSON.parse(draft.calculation_breakdown_json) : draft.calculation_breakdown_json
  console.log(`  Draft: id=${draft.id} service_years=${breakdown.service_years} amount=${draftAmount}`)
  console.log(`  Breakdown: first5=${breakdown.first_5_amount} past5=${breakdown.past_5_amount} factor=${breakdown.termination_factor}`)

  // Step 2: Recalculate with RESIGNATION
  const recalc = await svc.recalculate(TENANT, draft.id, { terminationType: 'RESIGNATION' }, null)
  assert.strictEqual(recalc.calculationId, draft.id)
  const recalcAmount = recalc.new_amount
  console.log(`  Recalc: prev=${recalc.previous_amount} new=${recalcAmount} factor=${recalc.breakdown.termination_factor}`)

  // Step 3: Finalize
  const fin = await svc.finalize(TENANT, draft.id, null)
  assert.strictEqual(fin.status, 'FINALIZED')
  console.log(`  Finalized: amount=${fin.final_amount_sar}`)

  // Step 4: Further recalculate blocked
  await assert.rejects(() => svc.recalculate(TENANT, draft.id, { terminationType: 'EMPLOYER_TERMINATION' }, null), /DRAFT/)
  console.log('  Recalculate after finalize: blocked (409) ✓')

  // Step 5: Reproducibility
  const stored = await svc.getCalculation(TENANT, draft.id)
  assert.ok(stored)
  const storedInputs = typeof stored.calculation_inputs_json === 'string'
    ? JSON.parse(stored.calculation_inputs_json) : stored.calculation_inputs_json
  const { finalAmount: recomputed } = svc.computeESB(storedInputs, require('../../app/config/compliance/esb_policy_v1.json'))
  assert.strictEqual(recomputed, parseFloat(stored.final_amount_sar), 'reproducibility: recomputed must match stored')
  console.log(`  Reproducibility: stored=${stored.final_amount_sar} recomputed=${recomputed} ✓`)

  // Step 6: Events
  const events = await svc.getTimeline(TENANT, draft.id)
  assert.ok(events.length >= 3, `expected >=3 events, got ${events.length}`)
  for (let i = 1; i < events.length; i++) {
    assert.ok(new Date(events[i].created_at) >= new Date(events[i - 1].created_at))
  }
  console.log(`  Events: ${events.length} rows, chronological`)
  events.forEach((e, i) => console.log(`    ${i + 1}. ${e.id}  ${e.event_type}  actor=${e.actor_type}`))

  // Step 7: Append-only
  const client = await pool.connect()
  try {
    const priv = await client.query(
      "SELECT has_table_privilege('prowork_app', 'esb_calculation_events', 'UPDATE') AS can_update, " +
      "has_table_privilege('prowork_app', 'esb_calculation_events', 'DELETE') AS can_delete"
    )
    assert.strictEqual(priv.rows[0].can_update, false)
    assert.strictEqual(priv.rows[0].can_delete, false)
    console.log(`  Append-only: UPDATE=${priv.rows[0].can_update} DELETE=${priv.rows[0].can_delete} ✓`)
  } finally { client.release() }

  console.log('')
  console.log('  === S44-G4 ESB INTEGRATION EVIDENCE ===')
  console.log(`  Calculation ID: ${draft.id}`)
  console.log(`  Policy version: ${POLICY_VER}`)
  console.log(`  Service years: ${breakdown.service_years}`)
  console.log(`  Draft amount (EMPLOYER_TERMINATION): ${draftAmount}`)
  console.log(`  Recalc amount (RESIGNATION): ${recalcAmount}`)
  console.log(`  Reproducibility: ${stored.final_amount_sar} == ${recomputed} ✓`)
  console.log(`  Events: ${events.length}`)
  events.forEach((e, i) => console.log(`    ${i + 1}. ${e.id}  ${e.event_type}`))
  console.log(`  Append-only: UPDATE=false DELETE=false`)
})

test.after(() => pool.end())

}
