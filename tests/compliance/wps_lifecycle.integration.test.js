'use strict'

const test   = require('node:test')
const assert = require('node:assert/strict')

const DB_URL = process.env.DATABASE_URL
if (!DB_URL) { test('SKIP: no DATABASE_URL', () => assert.ok(true)); } else {

const { Pool } = require('pg')
const { createWpsReadinessPgService } = require('../../app/modules/compliance/wps_readiness_pg_service')

const pool = new Pool({ connectionString: DB_URL, max: 2, connectionTimeoutMillis: 10000 })
const svc  = createWpsReadinessPgService({ pool })

const CONTRACT_ID = '603203da-0a0d-4ac8-8574-d2cc819a9a7d'
const TENANT      = 'tn-e04ac090'
const IBAN        = 'SA0380000000608010167519'
const ACTOR_ID    = null  // actor_user_id is UUID — null for integration tests

test('integration: WPS lifecycle 0% -> 100% with full event trail', async () => {
  const client = await pool.connect()
  try {
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [TENANT])

    // ── Step 1: Create WPS pack ──────────────────────────────────────────────
    const pack = await svc.createPack(TENANT, CONTRACT_ID)
    assert.ok(pack.id, 'pack created with id')
    const initialPct = pack.readiness_score_pct
    console.log(`  Pack created: ${pack.id}  initial readiness: ${initialPct}%`)

    const progression = [initialPct]

    // ── Step 2: Capture IBAN ─────────────────────────────────────────────────
    const ibanResult = await svc.captureIban(TENANT, pack.id, IBAN, ACTOR_ID)
    assert.strictEqual(ibanResult.iban_masked, '****7519', 'masked IBAN shows only last 4')
    assert.ok(!ibanResult.iban_masked.includes('SA'), 'masked IBAN hides prefix')
    progression.push(ibanResult.readiness_score_pct)
    console.log(`  IBAN captured: masked=${ibanResult.iban_masked}  readiness: ${ibanResult.readiness_score_pct}%`)

    // ── Step 3: Verify IBAN ──────────────────────────────────────────────────
    const verifyIbanResult = await svc.verifyIban(TENANT, pack.id, ACTOR_ID)
    progression.push(verifyIbanResult.readiness_score_pct)
    console.log(`  IBAN verified: readiness: ${verifyIbanResult.readiness_score_pct}%`)

    // ── Step 4: Verify identity ──────────────────────────────────────────────
    const idResult = await svc.verifyIdentity(TENANT, pack.id, 'NID-INTEG-001', ACTOR_ID)
    progression.push(idResult.readiness_score_pct)
    console.log(`  Identity verified: readiness: ${idResult.readiness_score_pct}%`)

    // ── Step 5: Confirm bank ─────────────────────────────────────────────────
    const bankResult = await svc.confirmBank(TENANT, pack.id, ACTOR_ID, 'BANK-INTEG-001')
    progression.push(bankResult.readiness_score_pct)
    console.log(`  Bank confirmed: readiness: ${bankResult.readiness_score_pct}%`)

    // ── Step 6: Mark ready ───────────────────────────────────────────────────
    const readyResult = await svc.markReady(TENANT, pack.id, ACTOR_ID)
    assert.strictEqual(readyResult.status, 'READY')
    console.log(`  Marked READY`)

    // ── Step 7: Generate artifact ────────────────────────────────────────────
    const artifact = await svc.generateArtifact(TENANT, pack.id)
    assert.ok(artifact.artifact_ref.startsWith('WPS-ART-'), 'artifact ref format')
    console.log(`  Artifact generated: ${artifact.artifact_ref}`)

    // ── Assertions: readiness progression 0% -> 100% ─────────────────────────
    const lastPct = progression[progression.length - 1]
    assert.strictEqual(lastPct, 100, 'final readiness must be 100%')
    assert.ok(progression[0] < 100, 'initial readiness must be < 100%')
    for (let i = 1; i < progression.length; i++) {
      assert.ok(progression[i] >= progression[i - 1],
        `readiness must be non-decreasing: step ${i} (${progression[i]}%) >= step ${i-1} (${progression[i-1]}%)`)
    }

    // ── Assertions: event trail ──────────────────────────────────────────────
    const events = await svc.getPackTimeline(TENANT, pack.id)
    assert.ok(events.length >= 7, `expected >= 7 events, got ${events.length}`)

    // Verify actor_types
    const expectedTypes = [
      { type: 'PACK_CREATED',       actor: 'SYSTEM' },
      { type: 'IBAN_CAPTURED',      actor: 'HUMAN' },
      { type: 'IBAN_VERIFIED',      actor: 'HUMAN' },
      { type: 'IDENTITY_VERIFIED',  actor: 'HUMAN' },
      { type: 'BANK_CONFIRMED',     actor: 'HUMAN' },
      { type: 'MARKED_READY',       actor: 'HUMAN' },
      { type: 'ARTIFACT_GENERATED', actor: 'SYSTEM' },
    ]
    for (const exp of expectedTypes) {
      const ev = events.find(e => e.event_type === exp.type)
      assert.ok(ev, `event ${exp.type} must exist`)
      assert.strictEqual(ev.actor_type, exp.actor, `${exp.type} actor_type must be ${exp.actor}`)
    }

    // Verify chronological ordering
    for (let i = 1; i < events.length; i++) {
      assert.ok(
        new Date(events[i].created_at) >= new Date(events[i - 1].created_at),
        'events must be chronological'
      )
    }

    // ── Assertions: masked IBAN (last 4 only) ────────────────────────────────
    const finalPack = await svc.getPack(TENANT, pack.id)
    assert.strictEqual(finalPack.iban_masked, '****7519')
    assert.ok(!JSON.stringify(finalPack).includes(IBAN), 'plain IBAN must not appear in stored pack')

    // ── Assertions: append-only (UPDATE/DELETE blocked on events) ────────────
    const privCheck = await client.query(
      "SELECT has_table_privilege('prowork_app', 'wps_readiness_events', 'UPDATE') AS can_update, " +
      "has_table_privilege('prowork_app', 'wps_readiness_events', 'DELETE') AS can_delete"
    )
    assert.strictEqual(privCheck.rows[0].can_update, false, 'UPDATE must be blocked on events')
    assert.strictEqual(privCheck.rows[0].can_delete, false, 'DELETE must be blocked on events')

    // ── Evidence output block ────────────────────────────────────────────────
    console.log('')
    console.log('  === S44-G2 WPS LIFECYCLE INTEGRATION EVIDENCE ===')
    console.log(`  Pack ID:       ${pack.id}`)
    console.log(`  Contract ID:   ${CONTRACT_ID}`)
    console.log(`  Tenant:        ${TENANT}`)
    console.log(`  Readiness:     ${progression.join('% -> ')}%`)
    console.log(`  Final status:  READY`)
    console.log(`  Artifact ref:  ${artifact.artifact_ref}`)
    console.log(`  Masked IBAN:   ${finalPack.iban_masked}`)
    console.log(`  Events (${events.length}):`)
    events.forEach((e, i) => {
      console.log(`    ${i + 1}. ${e.id}  ${e.event_type}  actor=${e.actor_type}`)
    })
    console.log(`  has_table_privilege UPDATE: ${privCheck.rows[0].can_update}`)
    console.log(`  has_table_privilege DELETE: ${privCheck.rows[0].can_delete}`)

  } finally {
    client.release()
  }
})

test.after(() => pool.end())

}
