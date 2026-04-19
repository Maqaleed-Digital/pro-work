'use strict'

const test   = require('node:test')
const assert = require('node:assert/strict')

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) { test('SKIP: no DATABASE_URL', () => assert.ok(true)); } else {

const { Pool } = require('pg')
const { createOffboardingPgService } = require('../../app/modules/compliance/offboarding_pg_service')
const checklist = require('../../app/config/compliance/offboarding_checklist_v1.json')

const pool = new Pool({ connectionString: DATABASE_URL, max: 2, connectionTimeoutMillis: 10000 })
const svc  = createOffboardingPgService({ pool })

const TENANT       = 'tn-e04ac090'
const CONTRACT_ID  = '603203da-0a0d-4ac8-8574-d2cc819a9a7d'
const WPS_ID       = '09f0b175-74bd-4a7c-b728-0188d4be5b0e'
const PROB_ID      = '91ac4596-8b73-47dc-918b-e39813afd1fb'
const ESB_ID       = '366fe90a-69f8-47ad-81d2-9fde3f97241b'

const ALL_ITEMS = checklist.items

test('Offboarding lifecycle: initiate → checklist → ESB → approvals → finalize', async () => {
  let reActivated = false

  // ── Step 0: Ensure contract is ACTIVATED ──────────────────────────────────
  // The contract may be TERMINATED from a prior test run. We must re-ACTIVATE
  // it before running the offboarding lifecycle.
  const client = await pool.connect()
  try {
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT])
    const cStatus = await client.query('SELECT status FROM contracts WHERE id = $1', [CONTRACT_ID])
    if (cStatus.rows[0] && cStatus.rows[0].status !== 'ACTIVATED') {
      await client.query(
        "UPDATE contracts SET status='ACTIVATED', terminated_at=NULL, termination_reason=NULL WHERE id=$1",
        [CONTRACT_ID]
      )
      reActivated = true
      console.log(`  Contract ${CONTRACT_ID.slice(0, 8)} re-activated for integration test (was TERMINATED from prior G4 run)`)
    }
  } finally { client.release() }

  // ── Step 1: Initiate offboarding ──────────────────────────────────────────
  const off = await svc.initiate(TENANT, CONTRACT_ID, 'RESIGNATION', 'Voluntary resignation - integration test', null, null)
  assert.ok(off.id, 'offboarding id must exist')
  assert.strictEqual(off.status, 'INITIATED')
  assert.strictEqual(off.contract_id, CONTRACT_ID)
  assert.strictEqual(off.reason_type, 'RESIGNATION')
  console.log(`  Initiated: id=${off.id} status=${off.status} notice=${off.notice_period_days}d`)

  const offId = off.id

  // ── Step 2: Complete all 11 checklist items ───────────────────────────────
  // hr_notification_received MUST be first (prerequisite for access_revocation_scheduled)
  await svc.completeChecklistItem(TENANT, offId, 'hr_notification_received', null, false)
  console.log('  Checklist: hr_notification_received COMPLETE')

  for (const item of ALL_ITEMS) {
    if (item.key === 'hr_notification_received') continue
    const isNa = item.key === 'exit_interview_completed'
    await svc.completeChecklistItem(TENANT, offId, item.key, null, isNa)
    console.log(`  Checklist: ${item.key} ${isNa ? 'N/A' : 'COMPLETE'}`)
  }

  // ── Step 3: Link ESB calculation ──────────────────────────────────────────
  const esbResult = await svc.linkEsbCalculation(TENANT, offId, ESB_ID)
  assert.strictEqual(esbResult.esb_linked, true)
  console.log(`  ESB linked: ${ESB_ID}`)

  // ── Step 4: Record 3 approvals (actor_user_id=null since FK requires valid user) ──
  const hrApproval = await svc.recordApproval(TENANT, offId, 'hr', null)
  assert.strictEqual(hrApproval.approvalType, 'hr')
  console.log(`  Approval: hr → ${hrApproval.newStatus}`)

  const finApproval = await svc.recordApproval(TENANT, offId, 'finance', null)
  assert.strictEqual(finApproval.approvalType, 'finance')
  console.log(`  Approval: finance → ${finApproval.newStatus}`)

  const mgrApproval = await svc.recordApproval(TENANT, offId, 'manager', null)
  assert.strictEqual(mgrApproval.approvalType, 'manager')
  console.log(`  Approval: manager → ${mgrApproval.newStatus}`)

  // ── Step 5: Assert READY_TO_FINALIZE ──────────────────────────────────────
  const preFinalize = await svc.getOffboarding(TENANT, offId)
  assert.strictEqual(preFinalize.status, 'READY_TO_FINALIZE')
  console.log(`  Status: ${preFinalize.status}`)

  // ── Step 6: Finalize ──────────────────────────────────────────────────────
  const t0 = Date.now()
  const result = await svc.finalize(TENANT, offId, null)
  const elapsedMs = Date.now() - t0

  assert.strictEqual(result.status, 'FINALIZED')
  assert.ok(result.evidence_pack_id, 'evidence_pack_id must exist')
  assert.ok(result.pack_hash, 'pack_hash must exist')
  console.log(`  Finalized: pack=${result.evidence_pack_id} hash=${result.pack_hash} elapsed=${elapsedMs}ms`)

  // ── Step 7: Assert EP-WOS-OFFBOARD-01 evidence pack created with hash ─────
  const packClient = await pool.connect()
  let packRow
  try {
    await packClient.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT])
    const pr = await packClient.query('SELECT * FROM evidence_packs WHERE pack_id = $1', [result.evidence_pack_id])
    packRow = pr.rows[0]
  } finally { packClient.release() }
  assert.ok(packRow, 'evidence pack row must exist')
  assert.ok(packRow.immutable_hash, 'pack must have hash')

  // ── Step 8: Assert pack snapshot entities ─────────────────────────────────
  const snapshot = typeof packRow.data_snapshot === 'string'
    ? JSON.parse(packRow.data_snapshot) : packRow.data_snapshot
  assert.ok(snapshot.contract, 'snapshot must contain contract')
  assert.ok(snapshot.wps_readiness, 'snapshot must contain wps_readiness')
  assert.ok(snapshot.probation, 'snapshot must contain probation')
  assert.ok(snapshot.esb_calculation, 'snapshot must contain esb_calculation')
  assert.ok(snapshot.offboarding, 'snapshot must contain offboarding')
  assert.ok(snapshot.events, 'snapshot must contain events')
  const snapshotEntities = Object.keys(snapshot).sort()
  console.log(`  Snapshot entities: ${snapshotEntities.join(', ')}`)

  // ── Step 9: Assert contract TERMINATED ────────────────────────────────────
  const cClient = await pool.connect()
  let contractStatus
  try {
    await cClient.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT])
    const cr = await cClient.query('SELECT status FROM contracts WHERE id = $1', [CONTRACT_ID])
    contractStatus = cr.rows[0].status
  } finally { cClient.release() }
  assert.strictEqual(contractStatus, 'TERMINATED')
  console.log(`  Contract ${CONTRACT_ID.slice(0, 8)} status: ${contractStatus}`)

  // ── Step 10: Assert 10+ offboarding_events chronological with correct actor_types ──
  const events = await svc.getTimeline(TENANT, offId)
  assert.ok(events.length >= 10, `expected >=10 events, got ${events.length}`)

  // Verify chronological order
  for (let i = 1; i < events.length; i++) {
    assert.ok(
      new Date(events[i].created_at) >= new Date(events[i - 1].created_at),
      'events must be chronological'
    )
  }

  // Verify actor_types
  const systemEventTypes = ['READY_FLAGGED', 'EVIDENCE_PACK_GENERATED']
  for (const e of events) {
    if (systemEventTypes.includes(e.event_type)) {
      assert.strictEqual(e.actor_type, 'SYSTEM', `${e.event_type} must be SYSTEM`)
    } else {
      assert.strictEqual(e.actor_type, 'HUMAN', `${e.event_type} must be HUMAN`)
    }
  }
  console.log(`  Events: ${events.length} rows, chronological`)
  events.forEach((e, i) => console.log(`    ${i + 1}. ${e.id}  ${e.event_type}  actor=${e.actor_type}`))

  // ── Step 11: Verify append-only privileges ────────────────────────────────
  const privClient = await pool.connect()
  try {
    const priv = await privClient.query(
      "SELECT has_table_privilege('prowork_app', 'offboarding_events', 'UPDATE') AS can_update, " +
      "has_table_privilege('prowork_app', 'offboarding_events', 'DELETE') AS can_delete"
    )
    assert.strictEqual(priv.rows[0].can_update, false, 'UPDATE must be denied on offboarding_events')
    assert.strictEqual(priv.rows[0].can_delete, false, 'DELETE must be denied on offboarding_events')
    console.log(`  Append-only: UPDATE=${priv.rows[0].can_update} DELETE=${priv.rows[0].can_delete}`)
  } finally { privClient.release() }

  // ── Evidence Block ────────────────────────────────────────────────────────
  console.log('')
  console.log('  === OFFBOARDING INTEGRATION EVIDENCE ===')
  console.log(`  offboarding_id:      ${offId}`)
  console.log(`  evidence_pack_id:    ${result.evidence_pack_id}`)
  console.log(`  pack_hash:           ${result.pack_hash}`)
  console.log(`  event_ids:           ${events.map(e => e.id).join(', ')}`)
  console.log(`  contract_status:     ${contractStatus}`)
  console.log(`  snapshot_entities:   ${snapshotEntities.join(', ')}`)
  console.log(`  elapsed_ms:          ${elapsedMs}`)
  if (reActivated) {
    console.log(`  note:                Contract ${CONTRACT_ID.slice(0, 8)} re-activated for integration test (was TERMINATED from prior G4 run)`)
  }
  console.log('  =========================================')
})

test.after(async () => {
  await pool.end()
})

} // end DATABASE_URL guard
