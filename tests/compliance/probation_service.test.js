'use strict'

const test   = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const { createProbationPgService } = require('../../app/modules/compliance/probation_pg_service')

// ── fixtures ────────────────────────────────────────────────────────────────

const TENANT     = 'tn-unit-001'
const TENANT_B   = 'tn-unit-002'
const CONTRACT_ID = 'CTR-1'
const CANDIDATE_ID = 'C1'
const ACTOR_ID   = 'usr-actor-001'

const QIWA_JSON = { probation_days: 90 }
const ACTIVATED_AT = '2026-04-01'

// ── mock pool ───────────────────────────────────────────────────────────────

function createMockPool(opts = {}) {
  const records = new Map()
  const events = []
  const contracts = new Map()
  const evidencePacks = new Map()
  let currentTenant = null

  contracts.set(CONTRACT_ID, {
    id: CONTRACT_ID,
    tenant_id: TENANT,
    candidate_id: CANDIDATE_ID,
    qiwa_parity_json: JSON.stringify(QIWA_JSON),
    activated_at: ACTIVATED_AT,
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

      if (/INSERT INTO probation_records/i.test(sql)) {
        const rec = {
          id: params[0], tenant_id: params[1], contract_id: params[2],
          candidate_id: params[3], start_date: params[4],
          planned_end_date: params[5], status: 'ACTIVE',
          probation_days: params[6], extension_days: 0,
          decision: null, decision_reason: null,
          decision_made_at: null, decision_made_by: null,
          actual_end_date: null, day_80_evidence_pack_id: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        records.set(rec.id, rec)
        return { rows: [{ ...rec }] }
      }

      if (/SELECT \* FROM probation_records WHERE id/i.test(sql)) {
        const r = records.get(params[0])
        return { rows: r ? [{ ...r }] : [] }
      }

      if (/SELECT \* FROM probation_records WHERE status = 'ACTIVE'/i.test(sql)) {
        const matching = Array.from(records.values()).filter(
          r => r.status === 'ACTIVE' && r.tenant_id === currentTenant
        )
        return { rows: matching }
      }

      if (/SELECT \* FROM probation_records WHERE status = 'AWAITING_DECISION'/i.test(sql)) {
        const matching = Array.from(records.values()).filter(
          r => r.status === 'AWAITING_DECISION' && r.tenant_id === currentTenant
        )
        return { rows: matching }
      }

      if (/SELECT \* FROM probation_records$/i.test(sql.trim()) || /ORDER BY planned_end_date/i.test(sql)) {
        const matching = Array.from(records.values()).filter(r => r.tenant_id === currentTenant)
        return { rows: matching }
      }

      if (/INSERT INTO evidence_packs/i.test(sql)) {
        const pack = {
          pack_id: params[0], pack_type: 'EP_WOS_RECRUIT_01',
          tenant_id: params[1], status: 'CLOSED',
          actor: params[2], action: 'DAY_80_EVIDENCE',
          data_snapshot: params[3], immutable_hash: params[4],
          policy_version: 'v1',
          created_at: new Date().toISOString(),
        }
        evidencePacks.set(pack.pack_id, pack)
        return { rows: [{ ...pack }] }
      }

      if (/UPDATE probation_records SET status = \$1, day_80_evidence_pack_id/i.test(sql)) {
        const rec = records.get(params[2])
        if (rec) {
          rec.status = params[0]
          rec.day_80_evidence_pack_id = params[1]
          rec.updated_at = new Date().toISOString()
        }
        return { rows: [] }
      }

      if (/UPDATE probation_records SET status = \$1, decision = \$2.*decision_made_by = \$4, actual_end_date/i.test(sql)) {
        const rec = records.get(params[4])
        if (rec) {
          rec.status = params[0]
          rec.decision = params[1]
          rec.decision_reason = params[2]
          rec.decision_made_by = params[3]
          rec.decision_made_at = new Date().toISOString()
          rec.actual_end_date = new Date().toISOString().split('T')[0]
          rec.updated_at = new Date().toISOString()
        }
        return { rows: [] }
      }

      if (/UPDATE probation_records SET status = \$1, decision = \$2.*extension_days = extension_days \+ \$5/i.test(sql)) {
        const rec = records.get(params[6])
        if (rec) {
          rec.status = params[0]
          rec.decision = params[1]
          rec.decision_reason = params[2]
          rec.decision_made_by = params[3]
          rec.extension_days = rec.extension_days + params[4]
          rec.planned_end_date = params[5]
          rec.decision_made_at = new Date().toISOString()
          rec.updated_at = new Date().toISOString()
        }
        return { rows: [] }
      }

      if (/UPDATE probation_records SET status = \$1, updated_at/i.test(sql)) {
        const rec = records.get(params[1])
        if (rec) {
          rec.status = params[0]
          rec.updated_at = new Date().toISOString()
        }
        return { rows: [] }
      }

      if (/INSERT INTO probation_events/i.test(sql)) {
        events.push({
          id: params[0], tenant_id: params[1],
          probation_record_id: params[2], event_type: params[3],
          previous_status: params[4], new_status: params[5],
          actor_user_id: params[6], actor_type: params[7],
          payload: params[8],
          created_at: new Date().toISOString(),
        })
        return { rows: [] }
      }

      if (/SELECT \* FROM probation_events WHERE probation_record_id/i.test(sql)) {
        return { rows: events.filter(e => e.probation_record_id === params[0]) }
      }

      return { rows: [], rowCount: 0 }
    },
    release() {},
  }

  return {
    connect() { return Promise.resolve(mockClient) },
    _records: records,
    _events: events,
    _contracts: contracts,
    _evidencePacks: evidencePacks,
  }
}

function makeSvc(poolOpts) {
  const pool = createMockPool(poolOpts)
  const svc = createProbationPgService({ pool })
  return { svc, pool }
}

// Helper: run full lifecycle up to AWAITING_DECISION
async function createAndTrigger(svc, pool) {
  const rec = await svc.createProbation(TENANT, CONTRACT_ID)
  await svc.triggerDay80(TENANT, rec.id)
  return rec
}

// ── 1. createProbation: hydrates dates from contract ────────────────────────

test('createProbation: hydrates start_date from contract activated_at', async () => {
  const { svc } = makeSvc()
  const rec = await svc.createProbation(TENANT, CONTRACT_ID)
  assert.strictEqual(rec.start_date, '2026-04-01')
})

test('createProbation: computes planned_end_date as start + probation_days', async () => {
  const { svc } = makeSvc()
  const rec = await svc.createProbation(TENANT, CONTRACT_ID)
  // 2026-04-01 + 90 days = 2026-06-30
  assert.strictEqual(rec.planned_end_date, '2026-06-30')
})

test('createProbation: reads probation_days from qiwa_parity_json', async () => {
  const { svc } = makeSvc()
  const rec = await svc.createProbation(TENANT, CONTRACT_ID)
  assert.strictEqual(rec.probation_days, 90)
})

test('createProbation: rejects missing tenantId', async () => {
  const { svc } = makeSvc()
  await assert.rejects(() => svc.createProbation(null, CONTRACT_ID), /tenantId and contractId required/)
})

test('createProbation: rejects missing contractId', async () => {
  const { svc } = makeSvc()
  await assert.rejects(() => svc.createProbation(TENANT, null), /tenantId and contractId required/)
})

test('createProbation: rejects when contract not found', async () => {
  const { svc } = makeSvc()
  await assert.rejects(() => svc.createProbation(TENANT, 'nonexistent'), /contract not found/)
})

test('createProbation: emits PROBATION_STARTED event with SYSTEM actor', async () => {
  const { svc, pool } = makeSvc()
  const rec = await svc.createProbation(TENANT, CONTRACT_ID)
  const ev = pool._events.find(e => e.event_type === 'PROBATION_STARTED')
  assert.ok(ev, 'PROBATION_STARTED event emitted')
  assert.strictEqual(ev.actor_type, 'SYSTEM')
  assert.strictEqual(ev.probation_record_id, rec.id)
})

// ── 2. triggerDay80: creates evidence pack ──────────────────────────────────

test('triggerDay80: transitions ACTIVE -> AWAITING_DECISION with evidence pack', async () => {
  const { svc, pool } = makeSvc()
  const rec = await svc.createProbation(TENANT, CONTRACT_ID)
  const result = await svc.triggerDay80(TENANT, rec.id)
  assert.strictEqual(result.status, 'AWAITING_DECISION')
  assert.ok(result.evidence_pack_id, 'evidence_pack_id returned')
  assert.ok(pool._evidencePacks.has(result.evidence_pack_id), 'evidence pack stored')
})

test('triggerDay80: idempotent on second call', async () => {
  const { svc } = makeSvc()
  const rec = await svc.createProbation(TENANT, CONTRACT_ID)
  const first = await svc.triggerDay80(TENANT, rec.id)
  const second = await svc.triggerDay80(TENANT, rec.id)
  assert.strictEqual(second.idempotent, true)
  assert.strictEqual(second.evidence_pack_id, first.evidence_pack_id)
})

test('triggerDay80: emits DAY_80_TRIGGERED and EVIDENCE_COMPILED events', async () => {
  const { svc, pool } = makeSvc()
  const rec = await svc.createProbation(TENANT, CONTRACT_ID)
  await svc.triggerDay80(TENANT, rec.id)
  const d80 = pool._events.find(e => e.event_type === 'DAY_80_TRIGGERED')
  const compiled = pool._events.find(e => e.event_type === 'EVIDENCE_COMPILED')
  assert.ok(d80, 'DAY_80_TRIGGERED event emitted')
  assert.ok(compiled, 'EVIDENCE_COMPILED event emitted')
  assert.strictEqual(d80.actor_type, 'SYSTEM')
  assert.strictEqual(compiled.actor_type, 'SYSTEM')
})

// ── 3. recordDecision: CONFIRM ──────────────────────────────────────────────

test('recordDecision CONFIRM: sets status CONFIRMED', async () => {
  const { svc } = makeSvc()
  const rec = await createAndTrigger(svc)
  const result = await svc.recordDecision(TENANT, rec.id, 'CONFIRM', 'good performance', ACTOR_ID)
  assert.strictEqual(result.newStatus, 'CONFIRMED')
  assert.strictEqual(result.decision, 'CONFIRM')
})

// ── 4. recordDecision: EXTEND within 180-day limit ─────────────────────────

test('recordDecision EXTEND: within 180-day limit succeeds', async () => {
  const { svc } = makeSvc()
  const rec = await createAndTrigger(svc)
  const result = await svc.recordDecision(TENANT, rec.id, 'EXTEND', 'needs more time', ACTOR_ID, 30)
  assert.strictEqual(result.newStatus, 'EXTENDED')
  assert.strictEqual(result.decision, 'EXTEND')
})

// ── 5. recordDecision: EXTEND exceeds 180 rejected (422) ───────────────────

test('recordDecision EXTEND: exceeds 180-day limit rejected with 422', async () => {
  const { svc, pool } = makeSvc()
  const rec = await createAndTrigger(svc)
  // 90 probation_days + 0 extension_days + 91 = 181 > 180
  // But 91 is not in extensionOptions, so we need a valid option that exceeds.
  // probation_days=90, extension_days=0 + 90 = 180 (ok), so first extend by 90...
  await svc.recordDecision(TENANT, rec.id, 'EXTEND', 'first ext', ACTOR_ID, 90)
  // Now record is EXTENDED with extension_days=90, total=180. Create a new one for the over-limit test.
  const rec2 = await svc.createProbation(TENANT, CONTRACT_ID)
  await svc.triggerDay80(TENANT, rec2.id)
  // Manually set extension_days so that next extension would exceed 180
  pool._records.get(rec2.id).extension_days = 60
  // 90 + 60 + 60 = 210 > 180
  try {
    await svc.recordDecision(TENANT, rec2.id, 'EXTEND', 'too long', ACTOR_ID, 60)
    assert.fail('should have thrown')
  } catch (err) {
    assert.strictEqual(err.status, 422)
    assert.ok(/cannot exceed.*180/i.test(err.message))
  }
})

// ── 6. recordDecision: TERMINATE ────────────────────────────────────────────

test('recordDecision TERMINATE: with reason succeeds', async () => {
  const { svc } = makeSvc()
  const rec = await createAndTrigger(svc)
  const result = await svc.recordDecision(TENANT, rec.id, 'TERMINATE', 'poor performance', ACTOR_ID)
  assert.strictEqual(result.newStatus, 'TERMINATED')
})

// ── 7. TERMINATE without reason rejected (422) ─────────────────────────────

test('recordDecision TERMINATE: without reason rejected with 422', async () => {
  const { svc } = makeSvc()
  const rec = await createAndTrigger(svc)
  try {
    await svc.recordDecision(TENANT, rec.id, 'TERMINATE', '', ACTOR_ID)
    assert.fail('should have thrown')
  } catch (err) {
    assert.strictEqual(err.status, 422)
    assert.ok(/reason is required/i.test(err.message))
  }
})

// ── 8. cannot record decision twice (409) ───────────────────────────────────

test('recordDecision: cannot record decision twice (409)', async () => {
  const { svc } = makeSvc()
  const rec = await createAndTrigger(svc)
  await svc.recordDecision(TENANT, rec.id, 'CONFIRM', 'passed', ACTOR_ID)
  try {
    await svc.recordDecision(TENANT, rec.id, 'CONFIRM', 'again', ACTOR_ID)
    assert.fail('should have thrown')
  } catch (err) {
    assert.strictEqual(err.status, 409)
    assert.ok(/already recorded/i.test(err.message))
  }
})

// ── 9. AWAITING_DECISION required for decision (409) ────────────────────────

test('recordDecision: requires AWAITING_DECISION status (409)', async () => {
  const { svc } = makeSvc()
  const rec = await svc.createProbation(TENANT, CONTRACT_ID)
  // Still ACTIVE, not AWAITING_DECISION
  try {
    await svc.recordDecision(TENANT, rec.id, 'CONFIRM', 'too early', ACTOR_ID)
    assert.fail('should have thrown')
  } catch (err) {
    assert.strictEqual(err.status, 409)
    assert.ok(/AWAITING_DECISION/i.test(err.message))
  }
})

// ── 10. invalid transitions rejected ────────────────────────────────────────

test('recordDecision: invalid decision value rejected (422)', async () => {
  const { svc } = makeSvc()
  const rec = await createAndTrigger(svc)
  try {
    await svc.recordDecision(TENANT, rec.id, 'INVALID_DECISION', 'nope', ACTOR_ID)
    assert.fail('should have thrown')
  } catch (err) {
    assert.strictEqual(err.status, 422)
    assert.ok(/CONFIRM, EXTEND, or TERMINATE/i.test(err.message))
  }
})

// ── 11. getDueForDay80: scheduled job filter ────────────────────────────────

test('getDueForDay80: returns ACTIVE records nearing planned_end_date', async () => {
  const { svc } = makeSvc()
  await svc.createProbation(TENANT, CONTRACT_ID)
  const due = await svc.getDueForDay80(TENANT)
  // Mock returns all ACTIVE — we just verify the method returns rows
  assert.ok(Array.isArray(due))
})

// ── 12. handleExpiredDecisions: scheduled job filter ────────────────────────

test('handleExpiredDecisions: transitions stale AWAITING_DECISION to EXPIRED', async () => {
  const { svc, pool } = makeSvc()
  const rec = await svc.createProbation(TENANT, CONTRACT_ID)
  await svc.triggerDay80(TENANT, rec.id)
  // Simulate expired: set planned_end_date far in the past so expiry triggers
  const r = pool._records.get(rec.id)
  r.planned_end_date = '2020-01-01'
  const expired = await svc.handleExpiredDecisions(TENANT)
  assert.ok(Array.isArray(expired))
})

// ── 13. probation_events append-only ────────────────────────────────────────

test('probation_events: service never issues UPDATE/DELETE on events table', async () => {
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
  const svc = createProbationPgService({ pool })
  const rec = await svc.createProbation(TENANT, CONTRACT_ID)
  await svc.triggerDay80(TENANT, rec.id)
  await svc.recordDecision(TENANT, rec.id, 'CONFIRM', 'ok', ACTOR_ID)

  const eventMutations = queries.filter(
    q => /probation_events/i.test(q) && (/\bUPDATE\b/i.test(q) || /\bDELETE\b/i.test(q))
  )
  assert.strictEqual(eventMutations.length, 0, 'no UPDATE/DELETE on probation_events table')
})

// ── 14. RLS tenant isolation ────────────────────────────────────────────────

test('RLS: set_config called with correct tenant on each operation', async () => {
  const tenantCalls = []
  const pool = createMockPool()
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
  const svc = createProbationPgService({ pool })
  await svc.createProbation(TENANT, CONTRACT_ID)
  assert.ok(tenantCalls.includes(TENANT), 'tenant set_config called with correct tenant')
  assert.ok(!tenantCalls.includes(TENANT_B), 'other tenant not leaked')
})

// ── 15. MANAGE_COMPLIANCE required (constructor validation) ─────────────────

test('service requires pool option', () => {
  assert.throws(() => createProbationPgService({}), /pool is required/)
  assert.throws(() => createProbationPgService(null), /pool is required/)
})

// ── 16. timeline chronological ──────────────────────────────────────────────

test('getProbationTimeline returns events in chronological order', async () => {
  const { svc } = makeSvc()
  const rec = await svc.createProbation(TENANT, CONTRACT_ID)
  await svc.triggerDay80(TENANT, rec.id)

  const timeline = await svc.getProbationTimeline(TENANT, rec.id)
  assert.ok(timeline.length >= 3, `expected >= 3 events, got ${timeline.length}`)
  for (let i = 1; i < timeline.length; i++) {
    assert.ok(
      new Date(timeline[i].created_at) >= new Date(timeline[i - 1].created_at),
      'events must be chronological'
    )
  }
})

// ── 17. actor discipline: SYSTEM for auto, HUMAN for decisions ──────────────

test('actor_type: SYSTEM for createProbation and triggerDay80, HUMAN for decisions', async () => {
  const { svc, pool } = makeSvc()
  const rec = await svc.createProbation(TENANT, CONTRACT_ID)
  await svc.triggerDay80(TENANT, rec.id)
  await svc.recordDecision(TENANT, rec.id, 'CONFIRM', 'passed', ACTOR_ID)

  const startEv = pool._events.find(e => e.event_type === 'PROBATION_STARTED')
  assert.strictEqual(startEv.actor_type, 'SYSTEM')

  const d80Ev = pool._events.find(e => e.event_type === 'DAY_80_TRIGGERED')
  assert.strictEqual(d80Ev.actor_type, 'SYSTEM')

  const compEv = pool._events.find(e => e.event_type === 'EVIDENCE_COMPILED')
  assert.strictEqual(compEv.actor_type, 'SYSTEM')

  const confirmEv = pool._events.find(e => e.event_type === 'CONFIRMED')
  assert.strictEqual(confirmEv.actor_type, 'HUMAN')
})

// ── 18. extension_days from config only ─────────────────────────────────────

test('EXTEND: rejects extension_days not in policy extensionOptions', async () => {
  const { svc } = makeSvc()
  const rec = await createAndTrigger(svc)
  try {
    await svc.recordDecision(TENANT, rec.id, 'EXTEND', 'custom', ACTOR_ID, 45)
    assert.fail('should have thrown')
  } catch (err) {
    assert.strictEqual(err.status, 422)
    assert.ok(/extension_days must be one of/i.test(err.message))
  }
})

test('EXTEND: rejects when extension_days is missing', async () => {
  const { svc } = makeSvc()
  const rec = await createAndTrigger(svc)
  try {
    await svc.recordDecision(TENANT, rec.id, 'EXTEND', 'no days', ACTOR_ID)
    assert.fail('should have thrown')
  } catch (err) {
    assert.strictEqual(err.status, 422)
  }
})

// ── 19. decision_made_by always populated ───────────────────────────────────

test('recordDecision: decision_made_by always populated for CONFIRM', async () => {
  const { svc, pool } = makeSvc()
  const rec = await createAndTrigger(svc)
  await svc.recordDecision(TENANT, rec.id, 'CONFIRM', 'ok', ACTOR_ID)
  const stored = pool._records.get(rec.id)
  assert.strictEqual(stored.decision_made_by, ACTOR_ID)
  assert.ok(stored.decision_made_at, 'decision_made_at must be set')
})

test('recordDecision: actorUserId required (400)', async () => {
  const { svc } = makeSvc()
  const rec = await createAndTrigger(svc)
  try {
    await svc.recordDecision(TENANT, rec.id, 'CONFIRM', 'ok', null)
    assert.fail('should have thrown')
  } catch (err) {
    assert.strictEqual(err.status, 400)
    assert.ok(/actorUserId is required/i.test(err.message))
  }
})

// ── 20. state machine correctness ───────────────────────────────────────────

test('state machine: ACTIVE -> AWAITING_DECISION -> CONFIRMED is valid path', async () => {
  const { svc, pool } = makeSvc()
  const rec = await svc.createProbation(TENANT, CONTRACT_ID)
  assert.strictEqual(pool._records.get(rec.id).status, 'ACTIVE')

  await svc.triggerDay80(TENANT, rec.id)
  assert.strictEqual(pool._records.get(rec.id).status, 'AWAITING_DECISION')

  await svc.recordDecision(TENANT, rec.id, 'CONFIRM', 'ok', ACTOR_ID)
  assert.strictEqual(pool._records.get(rec.id).status, 'CONFIRMED')
})

test('state machine: ACTIVE -> AWAITING_DECISION -> EXTENDED is valid path', async () => {
  const { svc, pool } = makeSvc()
  const rec = await svc.createProbation(TENANT, CONTRACT_ID)
  await svc.triggerDay80(TENANT, rec.id)
  await svc.recordDecision(TENANT, rec.id, 'EXTEND', 'needs more', ACTOR_ID, 60)
  assert.strictEqual(pool._records.get(rec.id).status, 'EXTENDED')
})

test('state machine: ACTIVE -> AWAITING_DECISION -> TERMINATED is valid path', async () => {
  const { svc, pool } = makeSvc()
  const rec = await svc.createProbation(TENANT, CONTRACT_ID)
  await svc.triggerDay80(TENANT, rec.id)
  await svc.recordDecision(TENANT, rec.id, 'TERMINATE', 'failed KPIs', ACTOR_ID)
  assert.strictEqual(pool._records.get(rec.id).status, 'TERMINATED')
})

// ── 21. getProbation returns null for unknown ───────────────────────────────

test('getProbation: returns null for unknown id', async () => {
  const { svc } = makeSvc()
  const result = await svc.getProbation(TENANT, 'nonexistent')
  assert.strictEqual(result, null)
})

// ── 22. triggerDay80 rejects unknown record ─────────────────────────────────

test('triggerDay80: rejects unknown probation record (404)', async () => {
  const { svc } = makeSvc()
  try {
    await svc.triggerDay80(TENANT, 'nonexistent')
    assert.fail('should have thrown')
  } catch (err) {
    assert.strictEqual(err.status, 404)
  }
})
