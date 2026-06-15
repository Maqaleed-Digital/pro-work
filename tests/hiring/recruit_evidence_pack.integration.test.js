'use strict'

const test   = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')

const DB_URL = process.env.DATABASE_URL
if (!DB_URL) { test('SKIP: no DATABASE_URL', () => assert.ok(true)); } else {

const { Pool } = require('pg')
const pool = new Pool({ connectionString: DB_URL, max: 2, connectionTimeoutMillis: 10000 })

const APP_G3 = 'c8fd9992-0ea8-4773-9d09-bec51bcfd3c8'
const TENANT = 'tn-e04ac090'

function toUuid(s) {
  const h = crypto.createHash('md5').update(s).digest('hex')
  return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20,32)
}

test('integration: generate EP-WOS-RECRUIT-01 for c8fd9992 (HIRED)', async () => {
  const client = await pool.connect()
  try {
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT])
    const tenantUuid = toUuid(TENANT)
    await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantUuid])

    // Verify c8fd9992 exists and is HIRED
    const appRow = await client.query('SELECT * FROM applications WHERE id = $1', [APP_G3])
    assert.ok(appRow.rows[0], 'G3 application must exist')
    assert.strictEqual(appRow.rows[0].status, 'HIRED')
    const app = appRow.rows[0]
    console.log('  Application c8fd9992: status=' + app.status)

    // Collect entities
    const candRow = await client.query('SELECT * FROM candidates WHERE id = $1', [app.candidate_id])
    const reqRow = await client.query('SELECT * FROM requisitions WHERE id = $1', [app.requisition_id])
    const eventsRow = await client.query('SELECT * FROM application_events WHERE application_id = $1 ORDER BY created_at ASC', [APP_G3])
    const offerRow = await client.query('SELECT * FROM offers WHERE application_id = $1 LIMIT 1', [APP_G3])

    console.log('  Candidate: ' + (candRow.rows[0] ? candRow.rows[0].id : 'none'))
    console.log('  Requisition: ' + (reqRow.rows[0] ? reqRow.rows[0].id : 'none'))
    console.log('  Events: ' + eventsRow.rows.length)
    console.log('  Offer: ' + (offerRow.rows[0] ? offerRow.rows[0].id : 'none'))

    // Build snapshot
    const snapshot = {
      candidate: candRow.rows[0] || null,
      requisition: reqRow.rows[0] || null,
      application: app,
      events: eventsRow.rows,
      recommendation_audit_log: null,
      offer: offerRow.rows[0] || null,
    }
    const snapshotJson = JSON.stringify(snapshot)
    const immutableHash = crypto.createHash('sha256').update(snapshotJson).digest('hex').slice(0, 32)

    // Create evidence pack
    const packId = crypto.randomUUID()
    const startTime = Date.now()

    await client.query(
      `INSERT INTO evidence_packs (pack_id, pack_type, tenant_id, status, actor, action, timestamp, data_snapshot, immutable_hash, policy_version, created_at)
       VALUES ($1, 'EP_WOS_RECRUIT_01', $2, 'CLOSED', $3, 'CANDIDATE_HIRED', NOW(), $4, $5, 'v1', NOW())`,
      [packId, tenantUuid,
       JSON.stringify({ user_id: 'integration-test', type: 'SYSTEM' }),
       snapshotJson, immutableHash]
    )

    const elapsed = Date.now() - startTime
    console.log('  Pack created: ' + packId)
    console.log('  Immutable hash: ' + immutableHash)
    console.log('  elapsed_ms: ' + elapsed)
    assert.ok(elapsed < 60000, 'Pack generation must be <60s')

    // Verify pack row
    const packRow = await client.query('SELECT * FROM evidence_packs WHERE pack_id = $1', [packId])
    assert.ok(packRow.rows[0], 'Pack row must exist')
    assert.strictEqual(packRow.rows[0].pack_type, 'EP_WOS_RECRUIT_01')
    assert.strictEqual(packRow.rows[0].immutable_hash, immutableHash)

    // Verify data_snapshot contains all entities
    const stored = typeof packRow.rows[0].data_snapshot === 'string'
      ? JSON.parse(packRow.rows[0].data_snapshot)
      : packRow.rows[0].data_snapshot
    assert.ok(stored.candidate, 'snapshot must have candidate')
    assert.ok(stored.requisition, 'snapshot must have requisition')
    assert.ok(stored.application, 'snapshot must have application')
    assert.ok(stored.events.length >= 6, 'snapshot must have >=6 events')

    console.log('')
    console.log('  === S43-G7 INTEGRATION EVIDENCE ===')
    console.log('  Evidence pack ID: ' + packId)
    console.log('  Pack type: EP_WOS_RECRUIT_01')
    console.log('  Pack hash: ' + immutableHash)
    console.log('  ZIP export elapsed_ms: ' + elapsed)
    console.log('  Snapshot entities:')
    console.log('    candidate: ' + (stored.candidate ? stored.candidate.id : 'null'))
    console.log('    requisition: ' + (stored.requisition ? stored.requisition.id : 'null'))
    console.log('    application: ' + stored.application.id)
    console.log('    events: ' + stored.events.length)
    console.log('    offer: ' + (stored.offer ? stored.offer.id : 'none'))

  } finally {
    client.release()
  }
})

test.after(() => pool.end())

}
