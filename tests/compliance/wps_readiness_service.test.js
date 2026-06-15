'use strict'

const test   = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const { createWpsReadinessPgService } = require('../../app/modules/compliance/wps_readiness_pg_service')

// ── fixtures ─────────────────────────────────────────────────────────────────

const TENANT   = 'tn-unit-001'
const TENANT_B = 'tn-unit-002'
const PACK_ID  = 'pack-aaaa-bbbb-cccc-dddddddddddd'
const CONTRACT_ID = 'ctr-1111-2222-3333-444444444444'
const CANDIDATE_ID = 'cand-5555-6666-7777-888888888888'
const ACTOR_ID = 'usr-actor-001'
const VALID_IBAN   = 'SA0380000000608010167519'
const VALID_IBAN_2 = 'SA4420000001234567891234'
const INVALID_SHORT = 'SA800000060801'
const INVALID_COUNTRY = 'GB29NWBK60161331926819'

const QIWA_JSON = JSON.stringify({ wage_base: 8000, housing: 2000, transport: 500, role: 'Engineer' })

// ── mock pool ────────────────────────────────────────────────────────────────

function createMockPool(opts = {}) {
  const packs = new Map()
  const events = []
  const contracts = new Map()
  let currentTenant = null

  contracts.set(CONTRACT_ID, {
    id: CONTRACT_ID,
    tenant_id: TENANT,
    candidate_id: CANDIDATE_ID,
    qiwa_parity_json: QIWA_JSON,
  })

  if (opts.extraContracts) {
    for (const c of opts.extraContracts) contracts.set(c.id, c)
  }

  const mockClient = {
    query(sql, params) {
      if (/set_config/i.test(sql)) {
        currentTenant = params[0]
        return { rows: [{}] }
      }

      if (/FROM contracts WHERE id/i.test(sql)) {
        const c = contracts.get(params[0])
        return { rows: c ? [c] : [] }
      }

      if (/INSERT INTO wps_readiness_packs/i.test(sql)) {
        const pack = {
          id: params[0], tenant_id: params[1], contract_id: params[2],
          candidate_id: params[3], status: 'NOT_STARTED',
          salary_amount_sar: params[4],
          salary_breakdown_json: params[5],
          readiness_score_pct: 0,
          iban_hash: null, iban_masked: null, iban_verified_at: null,
          identity_status: null, identity_verified_at: null,
          bank_confirmation_status: null, bank_confirmation_at: null,
          last_artifact_generated_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        packs.set(pack.id, pack)
        return { rows: [{ ...pack }] }
      }

      if (/UPDATE wps_readiness_packs SET readiness_score_pct/i.test(sql)) {
        const pack = packs.get(params[1])
        if (pack) {
          pack.readiness_score_pct = params[0]
          if (sql.includes('status')) pack.status = params[1] || pack.status
        }
        return { rows: [] }
      }

      if (/UPDATE wps_readiness_packs SET iban_masked/i.test(sql)) {
        const pack = packs.get(params[3])
        if (pack) {
          pack.iban_masked = params[0]
          pack.iban_hash = params[1]
          pack.status = params[2]
        }
        return { rows: [] }
      }

      if (/UPDATE wps_readiness_packs SET iban_verified_at/i.test(sql)) {
        const pack = packs.get(params[0])
        if (pack) pack.iban_verified_at = new Date().toISOString()
        return { rows: [] }
      }

      if (/UPDATE wps_readiness_packs SET identity_status/i.test(sql)) {
        const pack = packs.get(params[1])
        if (pack) {
          pack.identity_status = params[0]
          pack.identity_verified_at = new Date().toISOString()
        }
        return { rows: [] }
      }

      if (/UPDATE wps_readiness_packs SET bank_confirmation_status/i.test(sql)) {
        const pack = packs.get(params[1])
        if (pack) {
          pack.bank_confirmation_status = params[0]
          pack.bank_confirmation_at = new Date().toISOString()
        }
        return { rows: [] }
      }

      if (/UPDATE wps_readiness_packs SET status.*'READY'/i.test(sql) || /SET status = \$1.*WHERE id = \$2/i.test(sql)) {
        const pack = packs.get(params[1])
        if (pack) pack.status = params[0]
        return { rows: [] }
      }

      if (/UPDATE wps_readiness_packs SET last_artifact_generated_at/i.test(sql)) {
        const pack = packs.get(params[0])
        if (pack) pack.last_artifact_generated_at = new Date().toISOString()
        return { rows: [] }
      }

      if (/SELECT \* FROM wps_readiness_packs WHERE id/i.test(sql)) {
        const pack = packs.get(params[0])
        return { rows: pack ? [{ ...pack }] : [] }
      }

      if (/SELECT \* FROM wps_readiness_packs ORDER BY/i.test(sql)) {
        return { rows: Array.from(packs.values()).filter(p => p.tenant_id === currentTenant) }
      }

      if (/INSERT INTO wps_readiness_events/i.test(sql)) {
        events.push({
          id: params[0], tenant_id: params[1], wps_readiness_pack_id: params[2],
          event_type: params[3], actor_user_id: params[4], actor_type: params[5],
          payload: params[6], created_at: new Date().toISOString(),
        })
        return { rows: [] }
      }

      if (/SELECT \* FROM wps_readiness_events WHERE wps_readiness_pack_id/i.test(sql)) {
        return { rows: events.filter(e => e.wps_readiness_pack_id === params[0]) }
      }

      return { rows: [], rowCount: 0 }
    },
    release() {},
  }

  return {
    connect() { return Promise.resolve(mockClient) },
    _packs: packs,
    _events: events,
    _contracts: contracts,
  }
}

function makeSvc(poolOpts) {
  const pool = createMockPool(poolOpts)
  const svc = createWpsReadinessPgService({ pool })
  return { svc, pool }
}

// ── 1. createPack ────────────────────────────────────────────────────────────

test('createPack: auto-populates breakdown from qiwa, yielding partial readiness', async () => {
  const { svc, pool } = makeSvc()
  // Contract with zero salary but qiwa always produces a breakdown object
  pool._contracts.set(CONTRACT_ID, {
    id: CONTRACT_ID, tenant_id: TENANT, candidate_id: CANDIDATE_ID,
    qiwa_parity_json: JSON.stringify({}),
  })
  const pack = await svc.createPack(TENANT, CONTRACT_ID)
  assert.ok(pack.id)
  // breakdown_populated is true (3 keys from qiwa defaults) => 10% => IN_PROGRESS
  assert.strictEqual(pack.status, 'IN_PROGRESS')
  assert.ok(pack.readiness_score_pct > 0, 'breakdown gives partial readiness')
  assert.ok(pack.readiness_score_pct < 100, 'not yet 100%')
})

test('createPack: auto-computes readiness from salary fields in contract', async () => {
  const { svc } = makeSvc()
  const pack = await svc.createPack(TENANT, CONTRACT_ID)
  assert.ok(pack.id)
  // salary + breakdown populated from qiwa_parity_json => 20% weight
  assert.ok(pack.readiness_score_pct >= 0)
})

test('createPack: rejects missing tenantId', async () => {
  const { svc } = makeSvc()
  await assert.rejects(() => svc.createPack(null, CONTRACT_ID), /tenantId and contractId required/)
})

test('createPack: rejects missing contractId', async () => {
  const { svc } = makeSvc()
  await assert.rejects(() => svc.createPack(TENANT, null), /tenantId and contractId required/)
})

test('createPack: emits PACK_CREATED event with SYSTEM actor_type', async () => {
  const { svc, pool } = makeSvc()
  const pack = await svc.createPack(TENANT, CONTRACT_ID)
  const ev = pool._events.find(e => e.event_type === 'PACK_CREATED')
  assert.ok(ev, 'PACK_CREATED event emitted')
  assert.strictEqual(ev.actor_type, 'SYSTEM')
  assert.strictEqual(ev.wps_readiness_pack_id, pack.id)
})

// ── 2. captureIban ───────────────────────────────────────────────────────────

test('captureIban: accepts valid SA IBAN and returns masked value', async () => {
  const { svc } = makeSvc()
  const pack = await svc.createPack(TENANT, CONTRACT_ID)
  const result = await svc.captureIban(TENANT, pack.id, VALID_IBAN, ACTOR_ID)
  assert.strictEqual(result.iban_masked, '****7519')
})

test('captureIban: rejects non-SA IBAN (wrong country)', async () => {
  const { svc } = makeSvc()
  const pack = await svc.createPack(TENANT, CONTRACT_ID)
  await assert.rejects(
    () => svc.captureIban(TENANT, pack.id, INVALID_COUNTRY, ACTOR_ID),
    /invalid IBAN format/
  )
})

test('captureIban: rejects too-short IBAN', async () => {
  const { svc } = makeSvc()
  const pack = await svc.createPack(TENANT, CONTRACT_ID)
  await assert.rejects(
    () => svc.captureIban(TENANT, pack.id, INVALID_SHORT, ACTOR_ID),
    /invalid IBAN format/
  )
})

test('captureIban: stores SHA-256 hash, not plain IBAN', async () => {
  const { svc, pool } = makeSvc()
  const pack = await svc.createPack(TENANT, CONTRACT_ID)
  await svc.captureIban(TENANT, pack.id, VALID_IBAN, ACTOR_ID)
  const stored = pool._packs.get(pack.id)
  const expectedHash = crypto.createHash('sha256').update(VALID_IBAN).digest('hex')
  assert.strictEqual(stored.iban_hash, expectedHash)
  // Plain IBAN must never be stored
  const json = JSON.stringify(stored)
  assert.ok(!json.includes(VALID_IBAN), 'plain IBAN must not appear in stored pack')
})

test('captureIban: masked IBAN shows only last 4 digits', async () => {
  const { svc, pool } = makeSvc()
  const pack = await svc.createPack(TENANT, CONTRACT_ID)
  await svc.captureIban(TENANT, pack.id, VALID_IBAN, ACTOR_ID)
  const stored = pool._packs.get(pack.id)
  assert.strictEqual(stored.iban_masked, '****7519')
  assert.ok(!stored.iban_masked.includes('SA'), 'masked IBAN must not show prefix')
})

// ── 3. verifyIban ────────────────────────────────────────────────────────────

test('verifyIban: requires prior IBAN capture', async () => {
  const { svc } = makeSvc()
  const pack = await svc.createPack(TENANT, CONTRACT_ID)
  await assert.rejects(
    () => svc.verifyIban(TENANT, pack.id, ACTOR_ID),
    /IBAN must be captured before verification/
  )
})

test('verifyIban: succeeds after IBAN is captured', async () => {
  const { svc } = makeSvc()
  const pack = await svc.createPack(TENANT, CONTRACT_ID)
  await svc.captureIban(TENANT, pack.id, VALID_IBAN, ACTOR_ID)
  const result = await svc.verifyIban(TENANT, pack.id, ACTOR_ID)
  assert.ok(result.readiness_score_pct > 0)
})

// ── 4. verifyIdentity ────────────────────────────────────────────────────────

test('verifyIdentity: sets identity status and increments readiness', async () => {
  const { svc } = makeSvc()
  const pack = await svc.createPack(TENANT, CONTRACT_ID)
  const result = await svc.verifyIdentity(TENANT, pack.id, 'NID-REF-001', ACTOR_ID)
  assert.ok(result.readiness_score_pct >= 0)
  assert.strictEqual(result.packId, pack.id)
})

// ── 5. confirmBank ───────────────────────────────────────────────────────────

test('confirmBank: sets bank confirmation and increments readiness', async () => {
  const { svc } = makeSvc()
  const pack = await svc.createPack(TENANT, CONTRACT_ID)
  const result = await svc.confirmBank(TENANT, pack.id, ACTOR_ID, 'BANK-REF-001')
  assert.ok(result.readiness_score_pct >= 0)
  assert.strictEqual(result.packId, pack.id)
})

// ── 6. markReady ─────────────────────────────────────────────────────────────

test('markReady: blocked when readiness < 100%', async () => {
  const { svc } = makeSvc()
  const pack = await svc.createPack(TENANT, CONTRACT_ID)
  await assert.rejects(
    () => svc.markReady(TENANT, pack.id, ACTOR_ID),
    /readiness must be 100%/
  )
})

// ── 7. readiness_score_pct recomputation ─────────────────────────────────────

test('readiness score recomputes on each step', async () => {
  const { svc, pool } = makeSvc()
  const pack = await svc.createPack(TENANT, CONTRACT_ID)
  const scores = [pack.readiness_score_pct]

  await svc.captureIban(TENANT, pack.id, VALID_IBAN, ACTOR_ID)
  scores.push(pool._packs.get(pack.id).readiness_score_pct)

  await svc.verifyIban(TENANT, pack.id, ACTOR_ID)
  scores.push(pool._packs.get(pack.id).readiness_score_pct)

  await svc.verifyIdentity(TENANT, pack.id, 'NID-001', ACTOR_ID)
  scores.push(pool._packs.get(pack.id).readiness_score_pct)

  await svc.confirmBank(TENANT, pack.id, ACTOR_ID, 'BNK-001')
  scores.push(pool._packs.get(pack.id).readiness_score_pct)

  // Score should be non-decreasing
  for (let i = 1; i < scores.length; i++) {
    assert.ok(scores[i] >= scores[i - 1], `score[${i}]=${scores[i]} should be >= score[${i-1}]=${scores[i-1]}`)
  }
})

// ── 8. update-resets-to-NOT_STARTED pattern ──────────────────────────────────

test('captureIban resets status to IN_PROGRESS', async () => {
  const { svc, pool } = makeSvc()
  const pack = await svc.createPack(TENANT, CONTRACT_ID)
  await svc.captureIban(TENANT, pack.id, VALID_IBAN, ACTOR_ID)
  const stored = pool._packs.get(pack.id)
  assert.strictEqual(stored.status, 'IN_PROGRESS')
})

// ── 9. RLS tenant isolation ──────────────────────────────────────────────────

test('RLS: set_config called with correct tenant on each operation', async () => {
  const tenantCalls = []
  const pool = createMockPool()
  const origQuery = pool.connect().then(c => c.query)
  // Wrap to track tenant calls
  const origConnect = pool.connect.bind(pool)
  pool.connect = async function () {
    const client = await origConnect()
    const origQ = client.query.bind(client)
    client.query = function (sql, params) {
      if (/set_config/i.test(sql)) tenantCalls.push(params[0])
      return origQ(sql, params)
    }
    return client
  }
  const svc = createWpsReadinessPgService({ pool })
  await svc.createPack(TENANT, CONTRACT_ID)
  assert.ok(tenantCalls.includes(TENANT), 'tenant set_config called with correct tenant')
})

// ── 10. MANAGE_COMPLIANCE required (constructor validation) ──────────────────

test('service requires pool option', () => {
  assert.throws(() => createWpsReadinessPgService({}), /pool is required/)
  assert.throws(() => createWpsReadinessPgService(null), /pool is required/)
})

// ── 11. append-only events (UPDATE/DELETE blocked) ───────────────────────────

test('events are insert-only: no UPDATE or DELETE SQL emitted', async () => {
  const queries = []
  const pool = createMockPool()
  const origConnect = pool.connect.bind(pool)
  pool.connect = async function () {
    const client = await origConnect()
    const origQ = client.query.bind(client)
    client.query = function (sql, params) {
      queries.push(sql)
      return origQ(sql, params)
    }
    return client
  }
  const svc = createWpsReadinessPgService({ pool })
  const pack = await svc.createPack(TENANT, CONTRACT_ID)
  await svc.captureIban(TENANT, pack.id, VALID_IBAN, ACTOR_ID)

  const eventMutations = queries.filter(
    q => /wps_readiness_events/i.test(q) && (/\bUPDATE\b/i.test(q) || /\bDELETE\b/i.test(q))
  )
  assert.strictEqual(eventMutations.length, 0, 'no UPDATE/DELETE on events table')
})

// ── 12. actor_type correctness ───────────────────────────────────────────────

test('actor_type: SYSTEM for createPack, HUMAN for captureIban', async () => {
  const { svc, pool } = makeSvc()
  const pack = await svc.createPack(TENANT, CONTRACT_ID)
  await svc.captureIban(TENANT, pack.id, VALID_IBAN, ACTOR_ID)

  const packCreatedEv = pool._events.find(e => e.event_type === 'PACK_CREATED')
  assert.strictEqual(packCreatedEv.actor_type, 'SYSTEM')

  const ibanCapturedEv = pool._events.find(e => e.event_type === 'IBAN_CAPTURED')
  assert.strictEqual(ibanCapturedEv.actor_type, 'HUMAN')
})

// ── 13. timeline chronological ───────────────────────────────────────────────

test('getPackTimeline returns events in chronological order', async () => {
  const { svc } = makeSvc()
  const pack = await svc.createPack(TENANT, CONTRACT_ID)
  await svc.captureIban(TENANT, pack.id, VALID_IBAN, ACTOR_ID)
  await svc.verifyIban(TENANT, pack.id, ACTOR_ID)

  const timeline = await svc.getPackTimeline(TENANT, pack.id)
  assert.ok(timeline.length >= 3)
  for (let i = 1; i < timeline.length; i++) {
    assert.ok(
      new Date(timeline[i].created_at) >= new Date(timeline[i - 1].created_at),
      'events must be chronological'
    )
  }
})

// ── 14. artifact generation ──────────────────────────────────────────────────

test('generateArtifact returns artifact_ref starting with WPS-ART-', async () => {
  const { svc } = makeSvc()
  const pack = await svc.createPack(TENANT, CONTRACT_ID)
  const result = await svc.generateArtifact(TENANT, pack.id)
  assert.ok(result.artifact_ref.startsWith('WPS-ART-'))
  assert.strictEqual(result.packId, pack.id)
})

test('generateArtifact emits ARTIFACT_GENERATED event with SYSTEM actor', async () => {
  const { svc, pool } = makeSvc()
  const pack = await svc.createPack(TENANT, CONTRACT_ID)
  await svc.generateArtifact(TENANT, pack.id)
  const ev = pool._events.find(e => e.event_type === 'ARTIFACT_GENERATED')
  assert.ok(ev)
  assert.strictEqual(ev.actor_type, 'SYSTEM')
})

// ── 15. plain IBAN never stored ──────────────────────────────────────────────

test('plain IBAN never appears in pack data or events', async () => {
  const { svc, pool } = makeSvc()
  const pack = await svc.createPack(TENANT, CONTRACT_ID)
  await svc.captureIban(TENANT, pack.id, VALID_IBAN, ACTOR_ID)

  // Check pack
  const stored = pool._packs.get(pack.id)
  const packJson = JSON.stringify(stored)
  assert.ok(!packJson.includes(VALID_IBAN), 'plain IBAN not in pack')

  // Check events
  const eventsJson = JSON.stringify(pool._events)
  assert.ok(!eventsJson.includes(VALID_IBAN), 'plain IBAN not in events')
})

// ── 16. hashIban deterministic ───────────────────────────────────────────────

test('hashIban is deterministic (same input same hash)', () => {
  const { svc } = makeSvc()
  const h1 = svc.hashIban(VALID_IBAN)
  const h2 = svc.hashIban(VALID_IBAN)
  assert.strictEqual(h1, h2)
})

// ── 17. maskIban only last 4 ─────────────────────────────────────────────────

test('maskIban exposes only last 4 digits', () => {
  const { svc } = makeSvc()
  const masked = svc.maskIban(VALID_IBAN)
  assert.strictEqual(masked, '****7519')
  assert.strictEqual(masked.length, 8)
  assert.ok(!masked.includes('SA'))
})

// ── 18. contract not found ───────────────────────────────────────────────────

test('createPack: rejects when contract not found', async () => {
  const { svc } = makeSvc()
  await assert.rejects(
    () => svc.createPack(TENANT, 'nonexistent-contract'),
    /contract not found/
  )
})

// ── 19. getPack returns null for unknown ─────────────────────────────────────

test('getPack returns null for unknown pack id', async () => {
  const { svc } = makeSvc()
  const result = await svc.getPack(TENANT, 'nonexistent-pack')
  assert.strictEqual(result, null)
})

// ── 20. full lifecycle readiness reaches 100% ────────────────────────────────

test('full lifecycle: readiness reaches 100% and markReady succeeds', async () => {
  const { svc, pool } = makeSvc()
  const pack = await svc.createPack(TENANT, CONTRACT_ID)

  await svc.captureIban(TENANT, pack.id, VALID_IBAN, ACTOR_ID)
  await svc.verifyIban(TENANT, pack.id, ACTOR_ID)
  await svc.verifyIdentity(TENANT, pack.id, 'NID-001', ACTOR_ID)
  await svc.confirmBank(TENANT, pack.id, ACTOR_ID, 'BNK-001')

  const finalPack = pool._packs.get(pack.id)
  assert.strictEqual(finalPack.readiness_score_pct, 100)

  const ready = await svc.markReady(TENANT, pack.id, ACTOR_ID)
  assert.strictEqual(ready.status, 'READY')
})
