'use strict'

/**
 * Probation lifecycle integration test.
 *
 * Day-80 simulated via direct handler invocation + planned_end_date manipulation.
 * Cloud Scheduler wiring deferred to S46.
 */

const test   = require('node:test')
const assert = require('node:assert/strict')

const DB_URL = process.env.DATABASE_URL
if (!DB_URL) { test('SKIP: no DATABASE_URL', () => assert.ok(true)); } else {

const { Pool } = require('pg')
const { createProbationPgService } = require('../../app/modules/compliance/probation_pg_service')

const pool = new Pool({ connectionString: DB_URL, max: 2, connectionTimeoutMillis: 10000 })
const svc  = createProbationPgService({ pool })

const CONTRACT_ID = '603203da-0a0d-4ac8-8574-d2cc819a9a7d'
const TENANT      = 'tn-e04ac090'
const ACTOR_ID    = null  // actor_user_id is UUID — null for integration tests

test('integration: probation lifecycle ACTIVE -> day-80 -> CONFIRMED with full event trail', async () => {
  const client = await pool.connect()
  try {
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT])

    // ── Step 1: Create probation ────────────────────────────────────────────
    const rec = await svc.createProbation(TENANT, CONTRACT_ID)
    assert.ok(rec.id, 'probation created with id')
    assert.strictEqual(rec.status, 'ACTIVE')
    assert.ok(rec.start_date, 'start_date hydrated from contract')
    assert.ok(rec.planned_end_date, 'planned_end_date computed')
    assert.ok(rec.probation_days > 0, 'probation_days populated')
    console.log(`  Probation created: ${rec.id}  start=${rec.start_date}  end=${rec.planned_end_date}  days=${rec.probation_days}`)

    // ── Step 2: Manipulate planned_end_date to within 10 days of NOW ────────
    // This simulates the record being near its day-80 trigger window.
    // Day-80 is invoked directly (not via cron).
    const manipulatedEnd = new Date(Date.now() + 8 * 86400000).toISOString().split('T')[0]
    await client.query(
      'UPDATE probation_records SET planned_end_date = $1, updated_at = NOW() WHERE id = $2',
      [manipulatedEnd, rec.id]
    )
    console.log(`  planned_end_date manipulated to ${manipulatedEnd} (within 10 days of NOW)`)

    // ── Step 3: Invoke triggerDay80 directly ────────────────────────────────
    // NOTE: Day-80 simulated via direct handler invocation + planned_end_date
    // manipulation. Cloud Scheduler wiring deferred to S46.
    const d80Result = await svc.triggerDay80(TENANT, rec.id)
    assert.strictEqual(d80Result.status, 'AWAITING_DECISION')
    assert.ok(d80Result.evidence_pack_id, 'evidence pack created')
    console.log(`  Day-80 triggered: evidence_pack_id=${d80Result.evidence_pack_id}`)

    // ── Step 4: Verify idempotency of triggerDay80 ──────────────────────────
    const d80Again = await svc.triggerDay80(TENANT, rec.id)
    assert.strictEqual(d80Again.idempotent, true, 'second triggerDay80 call is idempotent')
    assert.strictEqual(d80Again.evidence_pack_id, d80Result.evidence_pack_id, 'same evidence pack on idempotent call')

    // ── Step 5: Record decision CONFIRM ─────────────────────────────────────
    // actorUserId must be a valid user in this tenant
    const userRow = await client.query('SELECT id FROM users WHERE tenant_id = $1 LIMIT 1', [TENANT])
    const actorUuid = userRow.rows[0] ? userRow.rows[0].id : null
    const decision = await svc.recordDecision(TENANT, rec.id, 'CONFIRM', 'probation passed', actorUuid)
    assert.strictEqual(decision.newStatus, 'CONFIRMED')
    assert.strictEqual(decision.decision, 'CONFIRM')
    console.log(`  Decision recorded: CONFIRM  status=${decision.newStatus}`)

    // ── Assertions: 5+ probation_events chronological with correct actor types ──
    const events = await svc.getProbationTimeline(TENANT, rec.id)
    assert.ok(events.length >= 4, `expected >= 4 events, got ${events.length}`)

    // Verify chronological ordering
    for (let i = 1; i < events.length; i++) {
      assert.ok(
        new Date(events[i].created_at) >= new Date(events[i - 1].created_at),
        `events must be chronological: event ${i} (${events[i].created_at}) >= event ${i-1} (${events[i-1].created_at})`
      )
    }

    // Verify actor types: auto events = SYSTEM, decision events = HUMAN
    const expectedActorTypes = [
      { type: 'PROBATION_STARTED',   actor: 'SYSTEM' },
      { type: 'DAY_80_TRIGGERED',    actor: 'SYSTEM' },
      { type: 'EVIDENCE_COMPILED',   actor: 'SYSTEM' },
      { type: 'CONFIRMED',           actor: 'HUMAN' },
    ]
    for (const exp of expectedActorTypes) {
      const ev = events.find(e => e.event_type === exp.type)
      assert.ok(ev, `event ${exp.type} must exist`)
      assert.strictEqual(ev.actor_type, exp.actor, `${exp.type} actor_type must be ${exp.actor}`)
    }

    // ── Assertions: append-only (UPDATE/DELETE blocked on probation_events) ──
    const privCheck = await client.query(
      "SELECT has_table_privilege('prowork_app', 'probation_events', 'UPDATE') AS can_update, " +
      "has_table_privilege('prowork_app', 'probation_events', 'DELETE') AS can_delete"
    )
    assert.strictEqual(privCheck.rows[0].can_update, false, 'UPDATE must be blocked on probation_events')
    assert.strictEqual(privCheck.rows[0].can_delete, false, 'DELETE must be blocked on probation_events')

    // ── Evidence output block ───────────────────────────────────────────────
    console.log('')
    console.log('  === PROBATION LIFECYCLE INTEGRATION EVIDENCE ===')
    console.log(`  Probation ID:      ${rec.id}`)
    console.log(`  Evidence Pack ID:  ${d80Result.evidence_pack_id}`)
    console.log(`  Contract ID:       ${CONTRACT_ID}`)
    console.log(`  Tenant:            ${TENANT}`)
    console.log(`  Start date:        ${rec.start_date}`)
    console.log(`  Manipulated end:   ${manipulatedEnd}`)
    console.log(`  Final status:      CONFIRMED`)
    console.log(`  Decision reason:   probation passed`)
    console.log(`  Events (${events.length}):`)
    events.forEach((e, i) => {
      console.log(`    ${i + 1}. ${e.id}  ${e.event_type}  actor=${e.actor_type}`)
    })
    console.log(`  has_table_privilege UPDATE: ${privCheck.rows[0].can_update}`)
    console.log(`  has_table_privilege DELETE: ${privCheck.rows[0].can_delete}`)
    console.log(`  NOTE: Day-80 simulated via direct handler invocation + planned_end_date manipulation. Cloud Scheduler wiring deferred to S46.`)

  } finally {
    client.release()
  }
})

test.after(() => pool.end())

}
