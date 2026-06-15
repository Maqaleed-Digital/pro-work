'use strict'

const test   = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const { createEsbService } = require('../../app/modules/compliance/esb_service')
const policyV1 = require('../../app/config/compliance/esb_policy_v1.json')

// ── fixtures ────────────────────────────────────────────────────────────────

const TENANT       = 'tn-unit-esb-001'
const CONTRACT_ID  = 'CTR-ESB-1'
const CANDIDATE_ID = 'C-ESB-1'
const ACTOR_ID     = 'usr-actor-esb-001'
const ACTIVATED_AT = '2026-04-19'

// ── pure function references ────────────────────────────────────────────────

// computeESB and yearsBetween are exported via the service instance
let computeESB, yearsBetween

test.before(() => {
  const svc = createEsbService({ pool: createMockPool() })
  computeESB = svc.computeESB
  yearsBetween = svc.yearsBetween
})

// ── mock pool ───────────────────────────────────────────────────────────────

function createMockPool(opts = {}) {
  const calculations = new Map()
  const events = new Map()           // calcId -> [event, ...]
  let currentTenant = null
  const contracts = new Map()
  const setCalls = []

  const contractType = opts.contractType || 'FTE'
  const qiwa = opts.qiwa || {
    wage_base: 15000,
    housing: 0,
    transport: 0,
    probation_days: 90,
    contract_duration: opts.contractDuration || 'indefinite',
  }

  contracts.set(CONTRACT_ID, {
    id: CONTRACT_ID,
    tenant_id: TENANT,
    candidate_id: CANDIDATE_ID,
    contract_type: contractType,
    qiwa_parity_json: JSON.stringify(qiwa),
    activated_at: ACTIVATED_AT,
  })

  if (opts.extraContracts) {
    for (const c of opts.extraContracts) contracts.set(c.id, c)
  }

  const mockClient = {
    query(sql, params) {
      // set_config for RLS
      if (/set_config/i.test(sql)) {
        currentTenant = params[0]
        setCalls.push({ tenant: params[0] })
        return { rows: [{}] }
      }

      // SELECT contract
      if (/FROM contracts WHERE id/i.test(sql)) {
        const c = contracts.get(params[0])
        return { rows: c ? [c] : [] }
      }

      // INSERT INTO esb_calculations
      if (/INSERT INTO esb_calculations/i.test(sql)) {
        const rec = {
          id: params[0], tenant_id: params[1], contract_id: params[2],
          candidate_id: params[3], policy_version: params[4],
          service_start_date: params[5], service_end_date: params[6],
          service_years: params[7], basic_salary_sar: params[8],
          total_salary_sar: params[9], termination_type: params[10],
          contract_type: params[11],
          calculation_inputs_json: params[12],
          calculation_breakdown_json: params[13],
          final_amount_sar: params[14],
          status: 'DRAFT',
          finalized_at: null, finalized_by: null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }
        calculations.set(rec.id, rec)
        return { rows: [rec] }
      }

      // INSERT INTO esb_calculation_events
      if (/INSERT INTO esb_calculation_events/i.test(sql)) {
        const evt = {
          id: params[0], tenant_id: params[1],
          esb_calculation_id: params[2], event_type: params[3],
          actor_user_id: params[4], actor_type: params[5],
          payload: params[6], created_at: new Date().toISOString(),
        }
        const list = events.get(evt.esb_calculation_id) || []
        list.push(evt)
        events.set(evt.esb_calculation_id, list)
        return { rows: [evt] }
      }

      // SELECT esb_calculations by id
      if (/FROM esb_calculations WHERE id/i.test(sql)) {
        const c = calculations.get(params[0])
        return { rows: c ? [c] : [] }
      }

      // UPDATE esb_calculations (recalculate)
      if (/UPDATE esb_calculations SET calculation_inputs_json/i.test(sql)) {
        const id = params[5]
        const existing = calculations.get(id)
        if (existing) {
          existing.calculation_inputs_json = params[0]
          existing.calculation_breakdown_json = params[1]
          existing.final_amount_sar = params[2]
          existing.termination_type = params[3]
          existing.service_years = params[4]
          existing.updated_at = new Date().toISOString()
        }
        return { rows: [] }
      }

      // UPDATE esb_calculations (finalize)
      if (/UPDATE esb_calculations SET status/i.test(sql)) {
        const id = params[2]
        const existing = calculations.get(id)
        if (existing) {
          existing.status = params[0]
          existing.finalized_by = params[1]
          existing.finalized_at = new Date().toISOString()
          existing.updated_at = new Date().toISOString()
        }
        return { rows: [] }
      }

      // SELECT events
      if (/FROM esb_calculation_events WHERE/i.test(sql)) {
        return { rows: events.get(params[0]) || [] }
      }

      // SELECT calculations by contract
      if (/FROM esb_calculations WHERE contract_id/i.test(sql)) {
        const rows = []
        for (const c of calculations.values()) {
          if (c.contract_id === params[0]) rows.push(c)
        }
        return { rows }
      }

      return { rows: [] }
    },
    release() {},
  }

  return {
    connect() { return Promise.resolve(mockClient) },
    _calculations: calculations,
    _events: events,
    _setCalls: setCalls,
    _contracts: contracts,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MATH REPRODUCIBILITY (8 scenarios)
// ═══════════════════════════════════════════════════════════════════════════

test('Math #1: Unlimited, 3yr, EMPLOYER_TERMINATION, salary=15000 → 22500', (t) => {
  const svc = createEsbService({ pool: createMockPool() })
  const { breakdown, finalAmount } = svc.computeESB(
    { serviceYears: 3, totalSalary: 15000, terminationType: 'EMPLOYER_TERMINATION', contractType: 'FTE_UNLIMITED' },
    policyV1
  )
  assert.equal(breakdown.first_5_amount, 22500)  // 3 * 15000 * 0.5
  assert.equal(breakdown.past_5_amount, 0)
  assert.equal(breakdown.termination_factor, 1.0)
  assert.equal(finalAmount, 22500)
})

test('Math #2: Unlimited, 7yr, EMPLOYER_TERMINATION, salary=15000 → 67500', (t) => {
  const svc = createEsbService({ pool: createMockPool() })
  const { breakdown, finalAmount } = svc.computeESB(
    { serviceYears: 7, totalSalary: 15000, terminationType: 'EMPLOYER_TERMINATION', contractType: 'FTE_UNLIMITED' },
    policyV1
  )
  assert.equal(breakdown.first_5_amount, 37500)  // 5 * 15000 * 0.5
  assert.equal(breakdown.past_5_amount, 30000)   // 2 * 15000 * 1.0
  assert.equal(breakdown.termination_factor, 1.0)
  assert.equal(finalAmount, 67500)
})

test('Math #3: Unlimited, 3yr, RESIGNATION, salary=15000 → 7492.50', (t) => {
  const svc = createEsbService({ pool: createMockPool() })
  const { breakdown, finalAmount } = svc.computeESB(
    { serviceYears: 3, totalSalary: 15000, terminationType: 'RESIGNATION', contractType: 'FTE_UNLIMITED' },
    policyV1
  )
  assert.equal(breakdown.gross_amount, 22500)
  assert.equal(breakdown.termination_factor, 0.333)
  assert.equal(finalAmount, 7492.5)
})

test('Math #4: Unlimited, 1yr, RESIGNATION → 0', (t) => {
  const svc = createEsbService({ pool: createMockPool() })
  const { breakdown, finalAmount } = svc.computeESB(
    { serviceYears: 1, totalSalary: 15000, terminationType: 'RESIGNATION', contractType: 'FTE_UNLIMITED' },
    policyV1
  )
  assert.equal(breakdown.termination_factor, 0)
  assert.equal(finalAmount, 0)
})

test('Math #5: Unlimited, 12yr, RESIGNATION, salary=15000 → 142500', (t) => {
  const svc = createEsbService({ pool: createMockPool() })
  const { breakdown, finalAmount } = svc.computeESB(
    { serviceYears: 12, totalSalary: 15000, terminationType: 'RESIGNATION', contractType: 'FTE_UNLIMITED' },
    policyV1
  )
  assert.equal(breakdown.first_5_amount, 37500)  // 5 * 15000 * 0.5
  assert.equal(breakdown.past_5_amount, 105000)  // 7 * 15000 * 1.0
  assert.equal(breakdown.gross_amount, 142500)
  assert.equal(breakdown.termination_factor, 1.0) // over_10_years_factor
  assert.equal(finalAmount, 142500)
})

test('Math #6: Fixed-term, 2yr, EXPIRY_OF_FIXED_TERM, salary=10000 → 10000', (t) => {
  const svc = createEsbService({ pool: createMockPool() })
  const { breakdown, finalAmount } = svc.computeESB(
    { serviceYears: 2, totalSalary: 10000, terminationType: 'EXPIRY_OF_FIXED_TERM', contractType: 'FTE_FIXED_TERM' },
    policyV1
  )
  assert.equal(breakdown.first_5_amount, 10000)  // 2 * 10000 * 0.5
  assert.equal(breakdown.termination_factor, 1.0)
  assert.equal(finalAmount, 10000)
})

test('Math #7: Fixed-term, 2yr, EMPLOYER_TERMINATION, salary=10000 → 10000', (t) => {
  const svc = createEsbService({ pool: createMockPool() })
  const { breakdown, finalAmount } = svc.computeESB(
    { serviceYears: 2, totalSalary: 10000, terminationType: 'EMPLOYER_TERMINATION', contractType: 'FTE_FIXED_TERM' },
    policyV1
  )
  assert.equal(breakdown.termination_factor, 1.0)
  assert.equal(finalAmount, 10000)
})

test('Math #8: Fixed-term, 2yr, RESIGNATION (early), salary=10000 → 0', (t) => {
  const svc = createEsbService({ pool: createMockPool() })
  const { breakdown, finalAmount } = svc.computeESB(
    { serviceYears: 2, totalSalary: 10000, terminationType: 'RESIGNATION', contractType: 'FTE_FIXED_TERM' },
    policyV1
  )
  assert.equal(breakdown.termination_factor, 0)
  assert.equal(finalAmount, 0)
})

// ═══════════════════════════════════════════════════════════════════════════
// POLICY ENGINE TESTS
// ═══════════════════════════════════════════════════════════════════════════

test('draftCalculation stores full inputs_json and policy_version', async (t) => {
  const pool = createMockPool()
  const svc = createEsbService({ pool })

  const result = await svc.draftCalculation(
    TENANT, CONTRACT_ID, 'EMPLOYER_TERMINATION', '2029-04-19', 'ksa-labor-law-v2015', ACTOR_ID
  )

  assert.equal(result.policy_version, 'ksa-labor-law-v2015')
  assert.ok(result.calculation_inputs_json, 'inputs_json must be stored')
  const inputs = typeof result.calculation_inputs_json === 'string'
    ? JSON.parse(result.calculation_inputs_json)
    : result.calculation_inputs_json
  assert.equal(inputs.terminationType, 'EMPLOYER_TERMINATION')
  assert.equal(inputs.totalSalary, 15000)
  assert.ok(inputs.serviceYears > 0)
})

test('recalculate on DRAFT works and emits RECALCULATED event', async (t) => {
  const pool = createMockPool()
  const svc = createEsbService({ pool })

  const draft = await svc.draftCalculation(
    TENANT, CONTRACT_ID, 'EMPLOYER_TERMINATION', '2029-04-19', 'ksa-labor-law-v2015', ACTOR_ID
  )

  const recalcResult = await svc.recalculate(TENANT, draft.id, { terminationType: 'RESIGNATION' }, ACTOR_ID)

  assert.ok(recalcResult.previous_amount > 0)
  assert.ok(typeof recalcResult.new_amount === 'number')
  assert.ok(recalcResult.breakdown)

  // Check event was emitted
  const evts = pool._events.get(draft.id)
  assert.ok(evts.length >= 2, 'should have DRAFTED + RECALCULATED events')
  const recalcEvent = evts.find(e => e.event_type === 'RECALCULATED')
  assert.ok(recalcEvent, 'RECALCULATED event must exist')
})

test('recalculate on FINALIZED blocked with 409', async (t) => {
  const pool = createMockPool()
  const svc = createEsbService({ pool })

  const draft = await svc.draftCalculation(
    TENANT, CONTRACT_ID, 'EMPLOYER_TERMINATION', '2029-04-19', 'ksa-labor-law-v2015', ACTOR_ID
  )
  await svc.finalize(TENANT, draft.id, ACTOR_ID)

  await assert.rejects(
    () => svc.recalculate(TENANT, draft.id, { terminationType: 'RESIGNATION' }, ACTOR_ID),
    (err) => {
      assert.equal(err.status, 409)
      return true
    }
  )
})

test('finalize stores finalized_at and finalized_by', async (t) => {
  const pool = createMockPool()
  const svc = createEsbService({ pool })

  const draft = await svc.draftCalculation(
    TENANT, CONTRACT_ID, 'EMPLOYER_TERMINATION', '2029-04-19', 'ksa-labor-law-v2015', ACTOR_ID
  )
  const result = await svc.finalize(TENANT, draft.id, ACTOR_ID)

  assert.equal(result.status, 'FINALIZED')
  assert.ok(result.final_amount_sar > 0)

  // Verify stored record
  const stored = pool._calculations.get(draft.id)
  assert.equal(stored.status, 'FINALIZED')
  assert.equal(stored.finalized_by, ACTOR_ID)
  assert.ok(stored.finalized_at)
})

test('Reproducibility: computeESB with same inputs produces identical result', (t) => {
  const svc = createEsbService({ pool: createMockPool() })
  const inputs = {
    serviceYears: 7, totalSalary: 15000,
    terminationType: 'EMPLOYER_TERMINATION', contractType: 'FTE_UNLIMITED',
  }
  const run1 = svc.computeESB(inputs, policyV1)
  const run2 = svc.computeESB(inputs, policyV1)
  assert.deepStrictEqual(run1, run2)
})

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT TYPE RESTRICTIONS
// ═══════════════════════════════════════════════════════════════════════════

test('FTE contract type is allowed (maps to FTE_UNLIMITED)', async (t) => {
  const pool = createMockPool({ contractType: 'FTE', contractDuration: 'indefinite' })
  const svc = createEsbService({ pool })

  const result = await svc.draftCalculation(
    TENANT, CONTRACT_ID, 'EMPLOYER_TERMINATION', '2029-04-19', 'ksa-labor-law-v2015', ACTOR_ID
  )
  assert.equal(result.contract_type, 'FTE_UNLIMITED')
  assert.ok(result.final_amount_sar > 0)
})

test('FREELANCER contract type is rejected with 422', async (t) => {
  const pool = createMockPool()
  pool._contracts.set(CONTRACT_ID, {
    id: CONTRACT_ID, tenant_id: TENANT, candidate_id: CANDIDATE_ID,
    contract_type: 'FREELANCER',
    qiwa_parity_json: JSON.stringify({ wage_base: 15000, probation_days: 90, contract_duration: 'indefinite' }),
    activated_at: ACTIVATED_AT,
  })
  const svc = createEsbService({ pool })

  await assert.rejects(
    () => svc.draftCalculation(TENANT, CONTRACT_ID, 'EMPLOYER_TERMINATION', '2029-04-19', 'ksa-labor-law-v2015', ACTOR_ID),
    (err) => {
      assert.equal(err.status, 422)
      return true
    }
  )
})

test('AI_EXECUTABLE contract type is rejected with 422', async (t) => {
  const pool = createMockPool()
  pool._contracts.set(CONTRACT_ID, {
    id: CONTRACT_ID, tenant_id: TENANT, candidate_id: CANDIDATE_ID,
    contract_type: 'AI_EXECUTABLE',
    qiwa_parity_json: JSON.stringify({ wage_base: 15000, probation_days: 90, contract_duration: 'indefinite' }),
    activated_at: ACTIVATED_AT,
  })
  const svc = createEsbService({ pool })

  await assert.rejects(
    () => svc.draftCalculation(TENANT, CONTRACT_ID, 'EMPLOYER_TERMINATION', '2029-04-19', 'ksa-labor-law-v2015', ACTOR_ID),
    (err) => {
      assert.equal(err.status, 422)
      return true
    }
  )
})

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT
// ═══════════════════════════════════════════════════════════════════════════

test('Events are append-only (INSERT only, no UPDATE/DELETE SQL)', async (t) => {
  const pool = createMockPool()
  const svc = createEsbService({ pool })

  const sqlLog = []
  const origQuery = pool.connect
  // Wrap to capture SQL
  const origClient = await pool.connect()
  const origQueryFn = origClient.query.bind(origClient)
  origClient.query = function (sql, params) {
    sqlLog.push(sql)
    return origQueryFn(sql, params)
  }
  pool.connect = () => Promise.resolve(origClient)

  const draft = await svc.draftCalculation(TENANT, CONTRACT_ID, 'EMPLOYER_TERMINATION', '2029-04-19', 'ksa-labor-law-v2015', ACTOR_ID)
  await svc.recalculate(TENANT, draft.id, { terminationType: 'RESIGNATION' }, ACTOR_ID)
  await svc.finalize(TENANT, draft.id, ACTOR_ID)

  // Filter SQL touching esb_calculation_events table
  const eventSql = sqlLog.filter(s => /esb_calculation_events/i.test(s))
  for (const s of eventSql) {
    assert.ok(/INSERT/i.test(s), `event SQL must be INSERT, got: ${s}`)
    assert.ok(!/UPDATE.*esb_calculation_events/i.test(s), `must not UPDATE events table`)
    assert.ok(!/DELETE.*esb_calculation_events/i.test(s), `must not DELETE from events table`)
  }
  assert.ok(eventSql.length >= 3, 'at least 3 event INSERTs (DRAFTED, RECALCULATED, FINALIZED)')
})

test('RLS set_config is called with tenant', async (t) => {
  const pool = createMockPool()
  const svc = createEsbService({ pool })

  await svc.draftCalculation(TENANT, CONTRACT_ID, 'EMPLOYER_TERMINATION', '2029-04-19', 'ksa-labor-law-v2015', ACTOR_ID)

  assert.ok(pool._setCalls.length > 0, 'set_config must be called')
  assert.equal(pool._setCalls[0].tenant, TENANT)
})

test('Actor type is HUMAN for all user actions', async (t) => {
  const pool = createMockPool()
  const svc = createEsbService({ pool })

  const draft = await svc.draftCalculation(TENANT, CONTRACT_ID, 'EMPLOYER_TERMINATION', '2029-04-19', 'ksa-labor-law-v2015', ACTOR_ID)
  await svc.recalculate(TENANT, draft.id, { terminationType: 'RESIGNATION' }, ACTOR_ID)
  await svc.finalize(TENANT, draft.id, ACTOR_ID)

  const evts = pool._events.get(draft.id) || []
  for (const evt of evts) {
    assert.equal(evt.actor_type, 'HUMAN', `event ${evt.event_type} actor_type must be HUMAN`)
  }
})

test('Constructor rejects missing pool', (t) => {
  assert.throws(() => createEsbService(), /pool is required/)
  assert.throws(() => createEsbService({}), /pool is required/)
  assert.throws(() => createEsbService(null), /pool is required/)
})

// ═══════════════════════════════════════════════════════════════════════════
// ADDITIONAL EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

test('yearsBetween calculates correctly', (t) => {
  const svc = createEsbService({ pool: createMockPool() })
  const years = svc.yearsBetween('2026-04-19', '2029-04-19')
  // ~3 years (365.25 day year)
  assert.ok(years >= 2.99 && years <= 3.01, `expected ~3, got ${years}`)
})

test('Invalid termination type rejected with 422', async (t) => {
  const pool = createMockPool()
  const svc = createEsbService({ pool })

  await assert.rejects(
    () => svc.draftCalculation(TENANT, CONTRACT_ID, 'INVALID_TYPE', '2029-04-19', 'ksa-labor-law-v2015', ACTOR_ID),
    (err) => {
      assert.equal(err.status, 422)
      return true
    }
  )
})

test('Contract not found returns 404', async (t) => {
  const pool = createMockPool()
  const svc = createEsbService({ pool })

  await assert.rejects(
    () => svc.draftCalculation(TENANT, 'NONEXISTENT', 'EMPLOYER_TERMINATION', '2029-04-19', 'ksa-labor-law-v2015', ACTOR_ID),
    (err) => {
      assert.equal(err.status, 404)
      return true
    }
  )
})

test('Fixed-term contract type mapping via qiwa_parity_json', async (t) => {
  const pool = createMockPool({ contractDuration: 'fixed_term' })
  const svc = createEsbService({ pool })

  const result = await svc.draftCalculation(
    TENANT, CONTRACT_ID, 'EXPIRY_OF_FIXED_TERM', '2028-04-19', 'ksa-labor-law-v2015', ACTOR_ID
  )
  assert.equal(result.contract_type, 'FTE_FIXED_TERM')
})

test('Unknown policy version returns 422', async (t) => {
  const pool = createMockPool()
  const svc = createEsbService({ pool })

  await assert.rejects(
    () => svc.draftCalculation(TENANT, CONTRACT_ID, 'EMPLOYER_TERMINATION', '2029-04-19', 'nonexistent-policy', ACTOR_ID),
    (err) => {
      assert.equal(err.status, 422)
      return true
    }
  )
})

test('Resignation 5-10 years uses 0.667 factor', (t) => {
  const svc = createEsbService({ pool: createMockPool() })
  const { breakdown, finalAmount } = svc.computeESB(
    { serviceYears: 7, totalSalary: 10000, terminationType: 'RESIGNATION', contractType: 'FTE_UNLIMITED' },
    policyV1
  )
  assert.equal(breakdown.termination_factor, 0.667)
  // gross = 5*10000*0.5 + 2*10000*1.0 = 25000+20000 = 45000
  assert.equal(breakdown.gross_amount, 45000)
  assert.equal(finalAmount, 30015)  // 45000 * 0.667
})

test('Finalize on already FINALIZED returns 409', async (t) => {
  const pool = createMockPool()
  const svc = createEsbService({ pool })

  const draft = await svc.draftCalculation(
    TENANT, CONTRACT_ID, 'EMPLOYER_TERMINATION', '2029-04-19', 'ksa-labor-law-v2015', ACTOR_ID
  )
  await svc.finalize(TENANT, draft.id, ACTOR_ID)

  await assert.rejects(
    () => svc.finalize(TENANT, draft.id, ACTOR_ID),
    (err) => {
      assert.equal(err.status, 409)
      return true
    }
  )
})
