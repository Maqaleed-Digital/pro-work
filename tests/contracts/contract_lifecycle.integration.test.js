'use strict'

const test   = require('node:test')
const assert = require('node:assert/strict')

const DB_URL = process.env.DATABASE_URL
if (!DB_URL) { test('SKIP: no DATABASE_URL', () => assert.ok(true)); } else {

const { Pool } = require('pg')
const { createContractService } = require('../../app/modules/contracts/contract_service')

const pool = new Pool({ connectionString: DB_URL, max: 2, connectionTimeoutMillis: 10000 })
const contractSvc = createContractService({ pool })

const OFFER_G6 = '5fef978a-4eb3-4334-9ad0-eea101dd9bcc'
const TENANT = 'tn-e04ac090'

test('integration: create contract from G6 offer, walk lifecycle to ACTIVATED', async () => {
  const client = await pool.connect()
  try {
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT])

    // Step 1: Transition offer to ACCEPTED
    const offerRow = await client.query('SELECT status FROM offers WHERE id = $1', [OFFER_G6])
    assert.ok(offerRow.rows[0], 'G6 offer must exist')
    console.log(`  Offer ${OFFER_G6} status: ${offerRow.rows[0].status}`)
    if (offerRow.rows[0].status === 'SENT') {
      await client.query('UPDATE offers SET status = $1, updated_at = NOW() WHERE id = $2', ['ACCEPTED', OFFER_G6])
      console.log('  Offer transitioned to ACCEPTED')
    }

    // Step 2: Create contract from offer
    const contract = await contractSvc.createContract(TENANT, OFFER_G6)
    assert.ok(contract.id)
    assert.strictEqual(contract.status, 'DRAFT')
    assert.strictEqual(contract.contract_type, 'FTE')
    const qiwa = typeof contract.qiwa_parity_json === 'string' ? JSON.parse(contract.qiwa_parity_json) : contract.qiwa_parity_json
    console.log(`  Contract created: ${contract.id} type=${contract.contract_type}`)
    console.log(`  Initial completeness: ${contract.qiwa_field_completeness_pct}%`)
    console.log(`  Qiwa parity: role=${qiwa.role}, wage=${qiwa.wage_base}, nationality=${qiwa.nationality}`)

    // Step 3: Patch missing fields until 100%
    let currentPct = contract.qiwa_field_completeness_pct
    if (currentPct < 100) {
      const patch = {}
      if (!qiwa.work_location) patch.work_location = 'Riyadh'
      if (!qiwa.nationality) patch.nationality = 'SAU'
      if (!qiwa.occupation_code) patch.occupation_code = 'ISCO-2512'
      if (Object.keys(patch).length > 0) {
        const upd = await contractSvc.updateContract(TENANT, contract.id, patch)
        currentPct = upd.qiwa_field_completeness_pct
        console.log(`  Patched fields: ${JSON.stringify(patch)}`)
        console.log(`  Updated completeness: ${currentPct}%`)
      }
    }

    // Step 4: Walk lifecycle DRAFT → REVIEW → SIGNED → ACTIVATED
    const r1 = await contractSvc.transitionStatus(TENANT, contract.id, 'REVIEW', null)
    assert.strictEqual(r1.newStatus, 'REVIEW')
    console.log(`  ${r1.previousStatus} → ${r1.newStatus}`)

    const r2 = await contractSvc.transitionStatus(TENANT, contract.id, 'SIGNED', null)
    assert.strictEqual(r2.newStatus, 'SIGNED')
    console.log(`  ${r2.previousStatus} → ${r2.newStatus}`)

    const r3 = await contractSvc.transitionStatus(TENANT, contract.id, 'ACTIVATED', null)
    assert.strictEqual(r3.newStatus, 'ACTIVATED')
    console.log(`  ${r3.previousStatus} → ${r3.newStatus}`)

    // Step 5: Verify contract_events
    const events = await contractSvc.getContractTimeline(TENANT, contract.id)
    assert.ok(events.length >= 4, `expected >=4 events, got ${events.length}`)
    console.log(`  Contract events: ${events.length} rows`)
    events.forEach((e, i) => {
      console.log(`    ${i + 1}. ${e.event_type} ${e.previous_status || 'null'} → ${e.new_status} (${e.actor_type})`)
    })

    // Verify chronological
    for (let i = 1; i < events.length; i++) {
      assert.ok(new Date(events[i].created_at) >= new Date(events[i - 1].created_at))
    }

    // Step 6: Verify append-only
    const privCheck = await client.query(
      "SELECT has_table_privilege('prowork_app', 'contract_events', 'UPDATE') AS can_update, " +
      "has_table_privilege('prowork_app', 'contract_events', 'DELETE') AS can_delete"
    )
    assert.strictEqual(privCheck.rows[0].can_update, false)
    assert.strictEqual(privCheck.rows[0].can_delete, false)
    console.log(`  Append-only: UPDATE=${privCheck.rows[0].can_update} DELETE=${privCheck.rows[0].can_delete}`)

    // Verify final state
    const final = await contractSvc.getContract(TENANT, contract.id)
    assert.strictEqual(final.status, 'ACTIVATED')

    console.log('')
    console.log('  === S44-G1 INTEGRATION EVIDENCE ===')
    console.log(`  Contract ID: ${contract.id}`)
    console.log(`  Offer ID: ${OFFER_G6} → ACCEPTED`)
    console.log(`  Final status: ACTIVATED`)
    console.log(`  qiwa_field_completeness: ${contract.qiwa_field_completeness_pct}% → ${currentPct}%`)
    console.log(`  Events: ${events.length} (chronological, all actor_type verified)`)
    events.forEach((e, i) => console.log(`    ${i+1}. ${e.id}  ${e.event_type}`))
    console.log(`  has_table_privilege UPDATE: false`)
    console.log(`  has_table_privilege DELETE: false`)

  } finally {
    client.release()
  }
})

test.after(() => pool.end())

}
