'use strict'

const test   = require('node:test')
const assert = require('node:assert/strict')
const { createOfferService } = require('../../app/modules/hiring/offer_service')

function createMockPool() {
  const offers = new Map()
  const applications = new Map()
  const appEvents = new Map()
  const requisitions = new Map()

  applications.set('APP-1', { id: 'APP-1', tenant_id: 'T1', candidate_id: 'C1', requisition_id: 'REQ-1', status: 'SHORTLISTED' })
  requisitions.set('REQ-1', { id: 'REQ-1', salary_min: '10000', salary_max: '20000', occupation_code: 'ISCO-2512' })

  const mockClient = {
    query(sql, params) {
      if (/set_config/i.test(sql)) return { rows: [{}] }

      if (/FROM applications WHERE id/i.test(sql)) {
        const a = applications.get(params[0])
        return { rows: a ? [a] : [] }
      }
      if (/FROM requisitions WHERE id/i.test(sql)) {
        const r = requisitions.get(params[0])
        return { rows: r ? [r] : [] }
      }
      if (/INSERT INTO offers/i.test(sql)) {
        const o = { id: params[0], tenant_id: params[1], application_id: params[2], candidate_id: params[3],
          requisition_id: params[4], offer_type: params[5], payload: params[6], status: 'DRAFT',
          compliance_preview_json: null, compliance_overridden: false, override_reason: null }
        offers.set(o.id, o)
        return { rows: [o] }
      }
      if (/FROM offers WHERE id/i.test(sql)) {
        const o = offers.get(params[0])
        return { rows: o ? [o] : [] }
      }
      if (/UPDATE offers SET compliance_preview_json/i.test(sql)) {
        const o = offers.get(params[1])
        if (o) o.compliance_preview_json = params[0]
        return { rows: [], rowCount: o ? 1 : 0 }
      }
      if (/UPDATE offers SET status.*compliance_overridden = TRUE/i.test(sql)) {
        const o = offers.get(params[2])
        if (o) { o.status = params[0]; o.compliance_overridden = true; o.override_reason = params[1] }
        return { rows: [] }
      }
      if (/UPDATE offers SET status/i.test(sql) && !/compliance_overridden/i.test(sql) && !/payload/i.test(sql)) {
        const o = offers.get(params[1])
        if (o) o.status = params[0]
        return { rows: [] }
      }
      if (/UPDATE offers SET payload/i.test(sql)) {
        const o = offers.get(params[1])
        if (o) o.payload = params[0]
        return { rows: [] }
      }
      if (/UPDATE applications SET status/i.test(sql)) {
        const a = applications.get(params[1])
        if (a) a.status = params[0]
        return { rows: [] }
      }
      if (/INSERT INTO application_events/i.test(sql)) {
        const actorType = sql.includes("'HUMAN'") ? 'HUMAN' : sql.includes("'AI'") ? 'AI' : 'SYSTEM'
        const eventType = sql.includes("'OFFER_SENT'") ? 'OFFER_SENT' : 'STATUS_CHANGED'
        appEvents.set(params[0], { id: params[0], event_type: eventType, actor_type: actorType })
        return { rows: [{}] }
      }
      return { rows: [], rowCount: 0 }
    },
    release() {},
  }

  return {
    connect() { return Promise.resolve(mockClient) },
    _offers: offers, _applications: applications, _appEvents: appEvents,
  }
}

test('createOffer: FTE happy path', async () => {
  const pool = createMockPool()
  const svc = createOfferService({ pool })
  const o = await svc.createOffer('T1', 'APP-1', 'FTE', { base_salary: 15000 })
  assert.ok(o.id)
  assert.strictEqual(o.offer_type, 'FTE')
  assert.strictEqual(o.status, 'DRAFT')
})

test('createOffer: FREELANCER happy path', async () => {
  const pool = createMockPool()
  const svc = createOfferService({ pool })
  const o = await svc.createOffer('T1', 'APP-1', 'FREELANCER', { milestones: [{ name: 'M1', amount: 5000 }] })
  assert.strictEqual(o.offer_type, 'FREELANCER')
})

test('createOffer: AI_EXECUTABLE happy path', async () => {
  const pool = createMockPool()
  const svc = createOfferService({ pool })
  const o = await svc.createOffer('T1', 'APP-1', 'AI_EXECUTABLE', { delivery_window: { start: '2026-05-01' } })
  assert.strictEqual(o.offer_type, 'AI_EXECUTABLE')
})

test('createOffer: FTE salary below range rejected', async () => {
  const pool = createMockPool()
  const svc = createOfferService({ pool })
  await assert.rejects(() => svc.createOffer('T1', 'APP-1', 'FTE', { base_salary: 5000 }), /below/)
})

test('createOffer: FTE salary above range rejected', async () => {
  const pool = createMockPool()
  const svc = createOfferService({ pool })
  await assert.rejects(() => svc.createOffer('T1', 'APP-1', 'FTE', { base_salary: 50000 }), /above/)
})

test('createOffer: FREELANCER zero milestones rejected', async () => {
  const pool = createMockPool()
  const svc = createOfferService({ pool })
  await assert.rejects(() => svc.createOffer('T1', 'APP-1', 'FREELANCER', { milestones: [] }), /milestone/)
})

test('createOffer: AI_EXECUTABLE attendance language rejected', async () => {
  const pool = createMockPool()
  const svc = createOfferService({ pool })
  await assert.rejects(() => svc.createOffer('T1', 'APP-1', 'AI_EXECUTABLE', { schedule: 'shift rotation' }), /attendance/)
})

test('runCompliancePreview: returns 4 checks', async () => {
  const pool = createMockPool()
  const svc = createOfferService({ pool })
  const o = await svc.createOffer('T1', 'APP-1', 'FTE', { base_salary: 15000 })
  const preview = await svc.runCompliancePreview('T1', o.id)
  assert.ok(preview.checks.nitaqat_alignment)
  assert.ok(preview.checks.occupation_code)
  assert.ok(preview.checks.salary_range)
  assert.ok(preview.checks.probation_policy)
})

test('runCompliancePreview: salary out of range = RED', async () => {
  const pool = createMockPool()
  const svc = createOfferService({ pool })
  const o = await svc.createOffer('T1', 'APP-1', 'FREELANCER', { milestones: [{ name: 'M1', amount: 5000 }], base_salary: 50000 })
  // Manually set offer type to FTE for salary check
  pool._offers.get(o.id).offer_type = 'FTE'
  pool._offers.get(o.id).payload = JSON.stringify({ base_salary: 50000 })
  const preview = await svc.runCompliancePreview('T1', o.id)
  assert.strictEqual(preview.checks.salary_range.status, 'RED')
  assert.strictEqual(preview.has_red, true)
})

test('sendOffer: blocked when RED without override', async () => {
  const pool = createMockPool()
  const svc = createOfferService({ pool })
  const o = await svc.createOffer('T1', 'APP-1', 'FTE', { base_salary: 15000 })
  pool._offers.get(o.id).compliance_preview_json = JSON.stringify({ checks: {}, has_red: true, all_green: false })
  await assert.rejects(() => svc.sendOffer('T1', o.id, '', 'U1'), /override_reason required/)
})

test('sendOffer: succeeds with override_reason on RED', async () => {
  const pool = createMockPool()
  const svc = createOfferService({ pool })
  const o = await svc.createOffer('T1', 'APP-1', 'FTE', { base_salary: 15000 })
  pool._offers.get(o.id).compliance_preview_json = JSON.stringify({ checks: {}, has_red: true, all_green: false })
  const result = await svc.sendOffer('T1', o.id, 'Approved by director', 'U1')
  assert.strictEqual(result.status, 'SENT')
  assert.strictEqual(pool._offers.get(o.id).compliance_overridden, true)
})

test('sendOffer: succeeds when all GREEN', async () => {
  const pool = createMockPool()
  const svc = createOfferService({ pool })
  const o = await svc.createOffer('T1', 'APP-1', 'FTE', { base_salary: 15000 })
  pool._offers.get(o.id).compliance_preview_json = JSON.stringify({ checks: {}, has_red: false, all_green: true })
  const result = await svc.sendOffer('T1', o.id, null, 'U1')
  assert.strictEqual(result.status, 'SENT')
})

test('sendOffer: transitions application to OFFERED', async () => {
  const pool = createMockPool()
  const svc = createOfferService({ pool })
  const o = await svc.createOffer('T1', 'APP-1', 'FTE', { base_salary: 15000 })
  pool._offers.get(o.id).compliance_preview_json = JSON.stringify({ checks: {}, has_red: false, all_green: true })
  await svc.sendOffer('T1', o.id, null, 'U1')
  assert.strictEqual(pool._applications.get('APP-1').status, 'OFFERED')
})

test('sendOffer: emits OFFER_SENT event with HUMAN actor', async () => {
  const pool = createMockPool()
  const svc = createOfferService({ pool })
  const o = await svc.createOffer('T1', 'APP-1', 'FTE', { base_salary: 15000 })
  pool._offers.get(o.id).compliance_preview_json = JSON.stringify({ checks: {}, has_red: false, all_green: true })
  await svc.sendOffer('T1', o.id, null, 'U1')
  const ev = Array.from(pool._appEvents.values()).find(e => e.event_type === 'OFFER_SENT')
  assert.ok(ev)
  assert.strictEqual(ev.actor_type, 'HUMAN')
})

test('sendOffer: requires compliance preview', async () => {
  const pool = createMockPool()
  const svc = createOfferService({ pool })
  const o = await svc.createOffer('T1', 'APP-1', 'FTE', { base_salary: 15000 })
  await assert.rejects(() => svc.sendOffer('T1', o.id, null, 'U1'), /compliance preview required/)
})

test('sendOffer: rejects non-DRAFT', async () => {
  const pool = createMockPool()
  const svc = createOfferService({ pool })
  const o = await svc.createOffer('T1', 'APP-1', 'FTE', { base_salary: 15000 })
  pool._offers.get(o.id).status = 'SENT'
  await assert.rejects(() => svc.sendOffer('T1', o.id, null, 'U1'), /DRAFT/)
})

test('updateOffer: rejects non-DRAFT', async () => {
  const pool = createMockPool()
  const svc = createOfferService({ pool })
  const o = await svc.createOffer('T1', 'APP-1', 'FTE', { base_salary: 15000 })
  pool._offers.get(o.id).status = 'SENT'
  await assert.rejects(() => svc.updateOffer('T1', o.id, { base_salary: 16000 }), /DRAFT/)
})

test('constructor: rejects missing pool', () => {
  assert.throws(() => createOfferService({}), /pool is required/)
})
