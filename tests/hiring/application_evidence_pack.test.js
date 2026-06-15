'use strict'

const test   = require('node:test')
const assert = require('node:assert/strict')
const { createApplicationService } = require('../../app/modules/hiring/application_service')
const { createCandidateService }   = require('../../app/modules/hiring/candidate_service')

function createMockPool() {
  const candidates = new Map()
  const applications = new Map()
  const events = new Map()
  const evidencePacks = new Map()
  const requisitions = new Map()
  const offers = new Map()

  requisitions.set('REQ-PUB', { id: 'REQ-PUB', status: 'PUBLISHED', tenant_id: 'T1' })

  const mockClient = {
    query(sql, params) {
      if (/set_config/i.test(sql)) return { rows: [{}] }
      if (/FROM requisitions WHERE id/i.test(sql)) { const r = requisitions.get(params[0]); return { rows: r ? [r] : [] } }
      if (/INSERT INTO candidates/i.test(sql)) {
        const c = { id: params[0], tenant_id: params[1], first_name: params[2], last_name: params[3], email: params[4], candidate_id: params[0] }
        candidates.set(c.id, c); return { rows: [c] }
      }
      if (/INSERT INTO applications/i.test(sql)) {
        const a = { id: params[0], tenant_id: params[1], candidate_id: params[2], requisition_id: params[3], status: 'APPLIED', ai_recommendation_log_id: null }
        applications.set(a.id, a); return { rows: [a] }
      }
      if (/SELECT \* FROM application_events/i.test(sql)) {
        return { rows: Array.from(events.values()).filter(e => e.application_id === params[0]) }
      }
      if (/INSERT INTO application_events/i.test(sql)) {
        // event_type and actor_type are params, not SQL literals in emitEvent
        const ev = { id: params[0], application_id: params[2], event_type: params[3], actor_type: params[7], new_status: params[5] }
        events.set(ev.id, ev); return { rows: [ev] }
      }
      if (/FROM applications WHERE id/i.test(sql)) { const a = applications.get(params[0]); return { rows: a ? [a] : [] } }
      if (/UPDATE applications SET status.*rejection_reason/i.test(sql)) {
        const a = applications.get(params[2]); if (a) { a.status = params[0]; a.rejection_reason = params[1] }; return { rows: [] }
      }
      if (/UPDATE applications SET status/i.test(sql)) {
        const a = applications.get(params[1]); if (a) a.status = params[0]; return { rows: [] }
      }
      if (/FROM candidates WHERE id/i.test(sql)) { const c = candidates.get(params[0]); return { rows: c ? [c] : [] } }
      if (/FROM offers WHERE application_id/i.test(sql)) { return { rows: [] } }
      if (/INSERT INTO evidence_packs/i.test(sql)) {
        evidencePacks.set(params[0], { pack_id: params[0], pack_type: 'EP_WOS_RECRUIT_01', data_snapshot: params[4], immutable_hash: params[5] })
        return { rows: [{}] }
      }
      if (/FROM recommendation_audit_logs/i.test(sql)) { return { rows: [] } }
      return { rows: [], rowCount: 0 }
    },
    release() {},
  }

  return {
    connect() { return Promise.resolve(mockClient) },
    _candidates: candidates, _applications: applications, _events: events, _evidencePacks: evidencePacks,
  }
}

test('HIRED transition triggers EP-WOS-RECRUIT-01 creation', async () => {
  const pool = createMockPool()
  const candSvc = createCandidateService({ pool })
  const appSvc = createApplicationService({ pool })
  const c = await candSvc.createCandidate('T1', { first_name: 'A', last_name: 'B', email: 'ep1@t.com' })
  const app = await appSvc.createApplication('T1', c.id, 'REQ-PUB', 'DIRECT')
  await appSvc.transitionStatus('T1', app.id, 'SCREENING', 'U1')
  await appSvc.transitionStatus('T1', app.id, 'SHORTLISTED', 'U1')
  await appSvc.transitionStatus('T1', app.id, 'INTERVIEWED', 'U1')
  await appSvc.transitionStatus('T1', app.id, 'OFFERED', 'U1')
  await appSvc.transitionStatus('T1', app.id, 'HIRED', 'U1')
  // Wait for async fire-and-forget
  await new Promise(r => setTimeout(r, 100))
  assert.ok(pool._evidencePacks.size >= 1, 'evidence pack should be created on HIRED')
  const pack = Array.from(pool._evidencePacks.values())[0]
  assert.strictEqual(pack.pack_type, 'EP_WOS_RECRUIT_01')
})

test('REJECTED transition triggers EP-WOS-RECRUIT-01 creation', async () => {
  const pool = createMockPool()
  const candSvc = createCandidateService({ pool })
  const appSvc = createApplicationService({ pool })
  const c = await candSvc.createCandidate('T1', { first_name: 'A', last_name: 'B', email: 'ep2@t.com' })
  const app = await appSvc.createApplication('T1', c.id, 'REQ-PUB', 'DIRECT')
  await appSvc.transitionStatus('T1', app.id, 'REJECTED', 'U1', 'Not qualified')
  await new Promise(r => setTimeout(r, 100))
  assert.ok(pool._evidencePacks.size >= 1)
})

test('SCREENING transition does NOT trigger pack creation', async () => {
  const pool = createMockPool()
  const candSvc = createCandidateService({ pool })
  const appSvc = createApplicationService({ pool })
  const c = await candSvc.createCandidate('T1', { first_name: 'A', last_name: 'B', email: 'ep3@t.com' })
  const app = await appSvc.createApplication('T1', c.id, 'REQ-PUB', 'DIRECT')
  await appSvc.transitionStatus('T1', app.id, 'SCREENING', 'U1')
  await new Promise(r => setTimeout(r, 100))
  assert.strictEqual(pool._evidencePacks.size, 0)
})

test('pack payload contains all required entities', async () => {
  const pool = createMockPool()
  const candSvc = createCandidateService({ pool })
  const appSvc = createApplicationService({ pool })
  const c = await candSvc.createCandidate('T1', { first_name: 'A', last_name: 'B', email: 'ep4@t.com' })
  const app = await appSvc.createApplication('T1', c.id, 'REQ-PUB', 'DIRECT')
  await appSvc.transitionStatus('T1', app.id, 'REJECTED', 'U1', 'Not fit')
  await new Promise(r => setTimeout(r, 100))
  const pack = Array.from(pool._evidencePacks.values())[0]
  const snapshot = JSON.parse(pack.data_snapshot)
  assert.ok(snapshot.candidate, 'must include candidate')
  assert.ok(snapshot.requisition, 'must include requisition')
  assert.ok(snapshot.application, 'must include application')
  assert.ok(Array.isArray(snapshot.events), 'must include events')
})

test('EVIDENCE_GENERATED event appended to application_events', async () => {
  const pool = createMockPool()
  const candSvc = createCandidateService({ pool })
  const appSvc = createApplicationService({ pool })
  const c = await candSvc.createCandidate('T1', { first_name: 'A', last_name: 'B', email: 'ep5@t.com' })
  const app = await appSvc.createApplication('T1', c.id, 'REQ-PUB', 'DIRECT')
  await appSvc.transitionStatus('T1', app.id, 'REJECTED', 'U1', 'Not fit')
  await new Promise(r => setTimeout(r, 100))
  const evGen = Array.from(pool._events.values()).find(e => e.event_type === 'EVIDENCE_GENERATED')
  assert.ok(evGen, 'EVIDENCE_GENERATED event must exist')
  assert.strictEqual(evGen.actor_type, 'SYSTEM')
})
