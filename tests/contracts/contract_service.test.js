'use strict'

const test   = require('node:test')
const assert = require('node:assert/strict')
const { createContractService } = require('../../app/modules/contracts/contract_service')
const lifecycle = require('../../app/config/contracts/lifecycle_v1.json')

function createMockPool() {
  const contracts = new Map()
  const events = new Map()
  const offers = new Map()
  const applications = new Map()
  const candidates = new Map()
  const requisitions = new Map()

  offers.set('OFF-1', { id: 'OFF-1', tenant_id: 'T1', application_id: 'APP-1', candidate_id: 'C1', requisition_id: 'REQ-1', offer_type: 'FTE', payload: JSON.stringify({ base_salary: 15000, probation_days: 90, notice_period_days: 30 }) })
  offers.set('OFF-FL', { id: 'OFF-FL', tenant_id: 'T1', application_id: 'APP-2', candidate_id: 'C2', requisition_id: 'REQ-1', offer_type: 'FREELANCER', payload: JSON.stringify({ milestones: [{ name: 'M1', amount: 5000 }], escrow_terms: 'Standard' }) })
  offers.set('OFF-AI', { id: 'OFF-AI', tenant_id: 'T1', application_id: 'APP-3', candidate_id: 'C3', requisition_id: 'REQ-1', offer_type: 'AI_EXECUTABLE', payload: JSON.stringify({ delivery_window: '2026-06-01', outcome_criteria: ['KPI met'], model_version: 'v2' }) })
  applications.set('APP-1', { id: 'APP-1', candidate_id: 'C1', requisition_id: 'REQ-1' })
  applications.set('APP-2', { id: 'APP-2', candidate_id: 'C2', requisition_id: 'REQ-1' })
  applications.set('APP-3', { id: 'APP-3', candidate_id: 'C3', requisition_id: 'REQ-1' })
  candidates.set('C1', { id: 'C1', nationality: 'SAU', first_name: 'A', last_name: 'B' })
  candidates.set('C2', { id: 'C2', nationality: 'IND', first_name: 'C', last_name: 'D' })
  candidates.set('C3', { id: 'C3', nationality: null, first_name: 'E', last_name: 'F' })
  requisitions.set('REQ-1', { id: 'REQ-1', title: 'Engineer', occupation_code: 'ISCO-2512', salary_min: 10000, salary_max: 20000 })

  const mockClient = {
    query(sql, params) {
      if (/set_config/i.test(sql)) return { rows: [{}] }
      if (/FROM offers WHERE id/i.test(sql)) { const o = offers.get(params[0]); return { rows: o ? [o] : [] } }
      if (/FROM applications WHERE id/i.test(sql)) { const a = applications.get(params[0]); return { rows: a ? [a] : [] } }
      if (/FROM candidates WHERE id/i.test(sql)) { const c = candidates.get(params[0]); return { rows: c ? [c] : [] } }
      if (/FROM requisitions WHERE id/i.test(sql)) { const r = requisitions.get(params[0]); return { rows: r ? [r] : [] } }

      if (/INSERT INTO contracts/i.test(sql)) {
        const c = { id: params[0], tenant_id: params[1], application_id: params[2], offer_id: params[3],
          candidate_id: params[4], requisition_id: params[5], contract_type: params[6], status: 'DRAFT',
          qiwa_parity_json: params[7], qiwa_field_completeness_pct: params[8], template_version: params[9] }
        contracts.set(c.id, c)
        return { rows: [c] }
      }
      if (/SELECT \* FROM contract_events/i.test(sql)) {
        return { rows: Array.from(events.values()).filter(e => e.contract_id === params[0]) }
      }
      if (/INSERT INTO contract_events/i.test(sql)) {
        const ev = { id: params[0], tenant_id: params[1], contract_id: params[2], event_type: params[3],
          previous_status: params[4], new_status: params[5], actor_user_id: params[6], actor_type: params[7] }
        events.set(ev.id, ev)
        return { rows: [ev] }
      }
      if (/FROM contracts WHERE id/i.test(sql)) { const c = contracts.get(params[0]); return { rows: c ? [c] : [] } }
      if (/SELECT \* FROM contracts\b/i.test(sql) && !/WHERE id/i.test(sql)) {
        return { rows: Array.from(contracts.values()) }
      }
      if (/UPDATE contracts SET qiwa_parity_json/i.test(sql)) {
        const c = contracts.get(params[2])
        if (c) { c.qiwa_parity_json = params[0]; c.qiwa_field_completeness_pct = params[1] }
        return { rows: [] }
      }
      if (/UPDATE contracts SET status.*terminated/i.test(sql)) {
        const c = contracts.get(params[2])
        if (c) { c.status = params[0]; c.termination_reason = params[1] }
        return { rows: [] }
      }
      if (/UPDATE contracts SET status.*signed_at/i.test(sql)) {
        const c = contracts.get(params[1])
        if (c) { c.status = params[0]; c.signed_at = new Date().toISOString() }
        return { rows: [] }
      }
      if (/UPDATE contracts SET status.*activated_at/i.test(sql)) {
        const c = contracts.get(params[1])
        if (c) { c.status = params[0]; c.activated_at = new Date().toISOString() }
        return { rows: [] }
      }
      if (/UPDATE contracts SET status/i.test(sql)) {
        const c = contracts.get(params[1])
        if (c) c.status = params[0]
        return { rows: [] }
      }
      return { rows: [], rowCount: 0 }
    },
    release() {},
  }

  return { connect() { return Promise.resolve(mockClient) }, _contracts: contracts, _events: events }
}

// Tests
test('createContract: FTE happy path from offer', async () => {
  const pool = createMockPool()
  const svc = createContractService({ pool })
  const c = await svc.createContract('T1', 'OFF-1')
  assert.ok(c.id)
  assert.strictEqual(c.contract_type, 'FTE')
  assert.strictEqual(c.status, 'DRAFT')
})

test('createContract: hydrates qiwa_parity_json from offer', async () => {
  const pool = createMockPool()
  const svc = createContractService({ pool })
  const c = await svc.createContract('T1', 'OFF-1')
  const qiwa = typeof c.qiwa_parity_json === 'string' ? JSON.parse(c.qiwa_parity_json) : c.qiwa_parity_json
  assert.ok(qiwa.role)
  assert.strictEqual(qiwa.wage_base, 15000)
  assert.strictEqual(qiwa.probation_days, 90)
  assert.strictEqual(qiwa.nationality, 'SAU')
})

test('createContract: computes initial completeness %', async () => {
  const pool = createMockPool()
  const svc = createContractService({ pool })
  const c = await svc.createContract('T1', 'OFF-1')
  assert.ok(c.qiwa_field_completeness_pct > 0)
  assert.ok(c.qiwa_field_completeness_pct <= 100)
})

test('createContract: FREELANCER hydrates milestones', async () => {
  const pool = createMockPool()
  const svc = createContractService({ pool })
  const c = await svc.createContract('T1', 'OFF-FL')
  const qiwa = typeof c.qiwa_parity_json === 'string' ? JSON.parse(c.qiwa_parity_json) : c.qiwa_parity_json
  assert.ok(Array.isArray(qiwa.milestones))
  assert.strictEqual(qiwa.total_value, 5000)
})

test('createContract: AI_EXECUTABLE hydrates delivery window', async () => {
  const pool = createMockPool()
  const svc = createContractService({ pool })
  const c = await svc.createContract('T1', 'OFF-AI')
  const qiwa = typeof c.qiwa_parity_json === 'string' ? JSON.parse(c.qiwa_parity_json) : c.qiwa_parity_json
  assert.ok(qiwa.delivery_window)
  assert.ok(qiwa.model_version)
})

test('updateContract: DRAFT only (409 on others)', async () => {
  const pool = createMockPool()
  const svc = createContractService({ pool })
  const c = await svc.createContract('T1', 'OFF-1')
  pool._contracts.get(c.id).status = 'SIGNED'
  await assert.rejects(() => svc.updateContract('T1', c.id, { role: 'X' }), /DRAFT/)
})

test('updateContract: recomputes completeness', async () => {
  const pool = createMockPool()
  const svc = createContractService({ pool })
  const c = await svc.createContract('T1', 'OFF-1')
  const result = await svc.updateContract('T1', c.id, { work_location: 'Riyadh' })
  assert.ok(result.qiwa_field_completeness_pct >= c.qiwa_field_completeness_pct)
})

test('DRAFT→REVIEW: blocked when completeness < 100', async () => {
  const pool = createMockPool()
  const svc = createContractService({ pool })
  const c = await svc.createContract('T1', 'OFF-1')
  pool._contracts.get(c.id).qiwa_field_completeness_pct = 50
  await assert.rejects(() => svc.transitionStatus('T1', c.id, 'REVIEW', 'U1'), /completeness/)
})

test('DRAFT→REVIEW: succeeds at completeness = 100', async () => {
  const pool = createMockPool()
  const svc = createContractService({ pool })
  const c = await svc.createContract('T1', 'OFF-1')
  pool._contracts.get(c.id).qiwa_field_completeness_pct = 100
  const r = await svc.transitionStatus('T1', c.id, 'REVIEW', 'U1')
  assert.strictEqual(r.newStatus, 'REVIEW')
})

test('REVIEW→SIGNED: emits SIGNED event with HUMAN actor', async () => {
  const pool = createMockPool()
  const svc = createContractService({ pool })
  const c = await svc.createContract('T1', 'OFF-1')
  pool._contracts.get(c.id).qiwa_field_completeness_pct = 100
  await svc.transitionStatus('T1', c.id, 'REVIEW', 'U1')
  // DL-VER-BPS-001: SIGNED completion requires bilateral execution evidence.
  await svc.transitionStatus('T1', c.id, 'SIGNED', 'U1', { both_party_signatures: true })
  const ev = Array.from(pool._events.values()).find(e => e.event_type === 'SIGNED')
  assert.ok(ev)
  assert.strictEqual(ev.actor_type, 'HUMAN')
})

test('REVIEW→SIGNED: DL-VER-BPS-001 blocks completion without both_party_signatures', async () => {
  const pool = createMockPool()
  const svc = createContractService({ pool })
  const c = await svc.createContract('T1', 'OFF-1')
  pool._contracts.get(c.id).qiwa_field_completeness_pct = 100
  await svc.transitionStatus('T1', c.id, 'REVIEW', 'U1')
  // No bilateral-signature evidence → governed guard rejects (single authority).
  await assert.rejects(
    () => svc.transitionStatus('T1', c.id, 'SIGNED', 'U1'),
    /both_party_signatures/,
  )
  // No off-ledger SIGNED event was emitted by the alternate path.
  const ev = Array.from(pool._events.values()).find(e => e.event_type === 'SIGNED')
  assert.strictEqual(ev, undefined)
})

test('SIGNED→ACTIVATED: emits ACTIVATED event', async () => {
  const pool = createMockPool()
  const svc = createContractService({ pool })
  const c = await svc.createContract('T1', 'OFF-1')
  pool._contracts.get(c.id).qiwa_field_completeness_pct = 100
  await svc.transitionStatus('T1', c.id, 'REVIEW', 'U1')
  // DL-VER-BPS-001: SIGNED completion requires bilateral execution evidence.
  await svc.transitionStatus('T1', c.id, 'SIGNED', 'U1', { both_party_signatures: true })
  await svc.transitionStatus('T1', c.id, 'ACTIVATED', 'U1')
  const ev = Array.from(pool._events.values()).find(e => e.event_type === 'ACTIVATED')
  assert.ok(ev)
})

test('TERMINATED: requires termination_reason (422 without)', async () => {
  const pool = createMockPool()
  const svc = createContractService({ pool })
  const c = await svc.createContract('T1', 'OFF-1')
  await assert.rejects(() => svc.transitionStatus('T1', c.id, 'TERMINATED', 'U1', ''), /termination_reason/)
})

test('TERMINATED: from DRAFT allowed with reason', async () => {
  const pool = createMockPool()
  const svc = createContractService({ pool })
  const c = await svc.createContract('T1', 'OFF-1')
  const r = await svc.transitionStatus('T1', c.id, 'TERMINATED', 'U1', 'Cancelled')
  assert.strictEqual(r.newStatus, 'TERMINATED')
})

test('Invalid transition rejected', async () => {
  const pool = createMockPool()
  const svc = createContractService({ pool })
  const c = await svc.createContract('T1', 'OFF-1')
  await assert.rejects(() => svc.transitionStatus('T1', c.id, 'ACTIVATED', 'U1'), /invalid transition/)
})

test('TERMINATED is terminal — no outbound transitions', async () => {
  const pool = createMockPool()
  const svc = createContractService({ pool })
  const c = await svc.createContract('T1', 'OFF-1')
  await svc.transitionStatus('T1', c.id, 'TERMINATED', 'U1', 'Done')
  await assert.rejects(() => svc.transitionStatus('T1', c.id, 'DRAFT', 'U1'), /invalid transition/)
})

test('REVIEW→DRAFT (back-to-edit) allowed', async () => {
  const pool = createMockPool()
  const svc = createContractService({ pool })
  const c = await svc.createContract('T1', 'OFF-1')
  pool._contracts.get(c.id).qiwa_field_completeness_pct = 100
  await svc.transitionStatus('T1', c.id, 'REVIEW', 'U1')
  const r = await svc.transitionStatus('T1', c.id, 'DRAFT', 'U1')
  assert.strictEqual(r.newStatus, 'DRAFT')
})

test('getContractTimeline: returns events', async () => {
  const pool = createMockPool()
  const svc = createContractService({ pool })
  const c = await svc.createContract('T1', 'OFF-1')
  const tl = await svc.getContractTimeline('T1', c.id)
  assert.ok(tl.length >= 1)
  assert.strictEqual(tl[0].event_type, 'DRAFT_CREATED')
})

test('computeCompleteness: FTE with all fields = 100', () => {
  const svc = createContractService({ pool: createMockPool() })
  const pct = svc.computeCompleteness(
    { role: 'Eng', wage_base: 15000, probation_days: 90, notice_period_days: 30, work_location: 'RUH', nationality: 'SAU', occupation_code: 'ISCO-2512' },
    'FTE'
  )
  assert.strictEqual(pct, 100)
})

test('computeCompleteness: FTE with missing fields < 100', () => {
  const svc = createContractService({ pool: createMockPool() })
  const pct = svc.computeCompleteness({ role: 'Eng', wage_base: 15000 }, 'FTE')
  assert.ok(pct < 100)
})

test('computeCompleteness: FREELANCER vs FTE distinct field sets', () => {
  const svc = createContractService({ pool: createMockPool() })
  const ftePct = svc.computeCompleteness({ milestones: [{ name: 'M1' }] }, 'FTE')
  const flPct = svc.computeCompleteness({ milestones: [{ name: 'M1' }], total_value: 5000, escrow_terms: 'std' }, 'FREELANCER')
  assert.ok(ftePct < flPct, 'FREELANCER fields should score higher for FREELANCER type')
})

test('lifecycle config: all statuses have transitions', () => {
  for (const s of lifecycle.validStatuses) {
    assert.ok(Array.isArray(lifecycle.transitions[s]), `missing transition for: ${s}`)
  }
})

test('constructor: rejects missing pool', () => {
  assert.throws(() => createContractService({}), /pool is required/)
})
