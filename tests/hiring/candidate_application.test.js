'use strict'

const test   = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const { createCandidateService }    = require('../../app/modules/hiring/candidate_service')
const { createApplicationService }  = require('../../app/modules/hiring/application_service')
const stateMachine = require('../../app/config/hiring/application_state_machine.json')

// ── Mock Pool ───────────────────────────────────────────────────────────────

function createMockPool() {
  const candidates   = new Map()
  const applications = new Map()
  const events       = new Map() // id → event
  const requisitions = new Map()

  // Seed a PUBLISHED requisition for testing
  requisitions.set('REQ-PUB', { id: 'REQ-PUB', status: 'PUBLISHED', tenant_id: 'T1' })
  requisitions.set('REQ-DRAFT', { id: 'REQ-DRAFT', status: 'DRAFT', tenant_id: 'T1' })

  const mockClient = {
    query(sql, params) {
      if (/set_config/i.test(sql)) return { rows: [{}] }

      // INSERT INTO candidates
      if (/INSERT INTO candidates/i.test(sql)) {
        // Check unique constraint (tenant_id + email)
        for (const c of candidates.values()) {
          if (c.tenant_id === params[1] && c.email === params[4]) {
            const e = new Error('duplicate'); e.code = '23505'; throw e
          }
        }
        const c = {
          id: params[0], tenant_id: params[1], first_name: params[2], last_name: params[3],
          email: params[4], nationality: params[5], phone: params[6], linkedin_url: params[7],
          source: params[8], eri_score: null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }
        candidates.set(c.id, c)
        return { rows: [c], rowCount: 1 }
      }

      // SELECT * FROM candidates WHERE id
      if (/FROM candidates WHERE id/i.test(sql)) {
        const c = candidates.get(params[0])
        return { rows: c ? [c] : [], rowCount: c ? 1 : 0 }
      }

      // SELECT * FROM candidates (list)
      if (/FROM candidates/i.test(sql) && !/WHERE id/i.test(sql)) {
        return { rows: Array.from(candidates.values()), rowCount: candidates.size }
      }

      // UPDATE candidates SET eri_score
      if (/UPDATE candidates SET eri_score/i.test(sql)) {
        const c = candidates.get(params[1])
        if (c) { c.eri_score = params[0]; c.updated_at = new Date().toISOString() }
        return { rows: c ? [c] : [], rowCount: c ? 1 : 0 }
      }

      // SELECT status FROM requisitions
      if (/FROM requisitions WHERE id/i.test(sql)) {
        const r = requisitions.get(params[0])
        return { rows: r ? [r] : [], rowCount: r ? 1 : 0 }
      }

      // INSERT INTO applications
      if (/INSERT INTO applications/i.test(sql)) {
        for (const a of applications.values()) {
          if (a.tenant_id === params[1] && a.candidate_id === params[2] && a.requisition_id === params[3]) {
            const e = new Error('duplicate'); e.code = '23505'; throw e
          }
        }
        const a = {
          id: params[0], tenant_id: params[1], candidate_id: params[2], requisition_id: params[3],
          status: 'APPLIED', rejection_reason: null, match_score: null, match_confidence: null,
          ai_recommendation_log_id: null,
          applied_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }
        applications.set(a.id, a)
        return { rows: [a], rowCount: 1 }
      }

      // SELECT * FROM applications WHERE id
      if (/FROM applications WHERE id/i.test(sql)) {
        const a = applications.get(params[0])
        return { rows: a ? [a] : [], rowCount: a ? 1 : 0 }
      }

      // UPDATE applications SET match_score (attachRecommendation — 4 params)
      if (/UPDATE applications[\s\S]*match_score/i.test(sql)) {
        const a = applications.get(params[3])
        if (a) {
          a.match_score = params[0]; a.match_confidence = params[1]
          a.ai_recommendation_log_id = params[2]; a.updated_at = new Date().toISOString()
        }
        return { rows: a ? [a] : [], rowCount: a ? 1 : 0 }
      }

      // UPDATE applications SET status ... rejection_reason (3 params)
      if (/UPDATE applications SET status.*rejection_reason/i.test(sql)) {
        const a = applications.get(params[2])
        if (a) { a.status = params[0]; a.rejection_reason = params[1]; a.updated_at = new Date().toISOString() }
        return { rows: [], rowCount: a ? 1 : 0 }
      }

      // UPDATE applications SET status (2 params)
      if (/UPDATE applications SET status/i.test(sql) && !/rejection_reason/i.test(sql) && !/match_score/i.test(sql)) {
        const a = applications.get(params[1])
        if (a) { a.status = params[0]; a.updated_at = new Date().toISOString() }
        return { rows: [], rowCount: a ? 1 : 0 }
      }

      // SELECT * FROM application_events WHERE application_id (must be before INSERT match)
      if (/SELECT \* FROM application_events/i.test(sql)) {
        const matching = Array.from(events.values()).filter(e => e.application_id === params[0])
        return { rows: matching, rowCount: matching.length }
      }

      // INSERT INTO application_events
      if (/INSERT INTO application_events/i.test(sql)) {
        const ev = {
          id: params[0], tenant_id: params[1], application_id: params[2],
          event_type: params[3], previous_status: params[4], new_status: params[5],
          actor_user_id: params[6], actor_type: params[7], payload: params[8],
          created_at: new Date().toISOString(),
        }
        events.set(ev.id, ev)
        return { rows: [ev], rowCount: 1 }
      }

      // SELECT ... FROM applications a JOIN candidates
      if (sql.includes('JOIN candidates') || /FROM applications\s+\w+\s+JOIN candidates/i.test(sql) || /FROM applications.*JOIN candidates/i.test(sql)) {
        const matching = Array.from(applications.values()).filter(a => a.requisition_id === params[0])
        return { rows: matching, rowCount: matching.length }
      }

      return { rows: [], rowCount: 0 }
    },
    release() {},
  }

  return {
    connect() { return Promise.resolve(mockClient) },
    _candidates: candidates,
    _applications: applications,
    _events: events,
    _requisitions: requisitions,
  }
}

// ── Candidate tests ─────────────────────────────────────────────────────────

test('createCandidate: happy path', async () => {
  const pool = createMockPool()
  const svc = createCandidateService({ pool })
  const c = await svc.createCandidate('T1', {
    first_name: 'Ahmed', last_name: 'Ali', email: 'ahmed@test.com', nationality: 'SAU',
  })
  assert.ok(c.id)
  assert.strictEqual(c.first_name, 'Ahmed')
  assert.strictEqual(c.email, 'ahmed@test.com')
})

test('createCandidate: rejects duplicate email per tenant', async () => {
  const pool = createMockPool()
  const svc = createCandidateService({ pool })
  await svc.createCandidate('T1', { first_name: 'A', last_name: 'B', email: 'dup@test.com' })
  await assert.rejects(
    () => svc.createCandidate('T1', { first_name: 'C', last_name: 'D', email: 'dup@test.com' }),
    /already exists/
  )
})

test('createCandidate: rejects missing fields', async () => {
  const pool = createMockPool()
  const svc = createCandidateService({ pool })
  await assert.rejects(
    () => svc.createCandidate('T1', { first_name: 'A' }),
    /required/
  )
})

test('getCandidate: returns null for non-existent', async () => {
  const pool = createMockPool()
  const svc = createCandidateService({ pool })
  const c = await svc.getCandidate('T1', 'nonexistent')
  assert.strictEqual(c, null)
})

test('updateCandidateEri: updates score', async () => {
  const pool = createMockPool()
  const svc = createCandidateService({ pool })
  const c = await svc.createCandidate('T1', { first_name: 'A', last_name: 'B', email: 'eri@test.com' })
  const updated = await svc.updateCandidateEri('T1', c.id, 85.5)
  assert.strictEqual(updated.eri_score, 85.5)
})

test('constructor: rejects missing pool', () => {
  assert.throws(() => createCandidateService({}), /pool is required/)
})

// ── Application tests ───────────────────────────────────────────────────────

test('createApplication: happy path with PUBLISHED requisition', async () => {
  const pool = createMockPool()
  const candSvc = createCandidateService({ pool })
  const appSvc = createApplicationService({ pool })
  const c = await candSvc.createCandidate('T1', { first_name: 'A', last_name: 'B', email: 'app1@test.com' })
  const app = await appSvc.createApplication('T1', c.id, 'REQ-PUB', 'DIRECT', 'U1')
  assert.ok(app.id)
  assert.strictEqual(app.status, 'APPLIED')
})

test('createApplication: emits STATUS_CHANGED APPLIED event', async () => {
  const pool = createMockPool()
  const candSvc = createCandidateService({ pool })
  const appSvc = createApplicationService({ pool })
  const c = await candSvc.createCandidate('T1', { first_name: 'A', last_name: 'B', email: 'ev1@test.com' })
  const app = await appSvc.createApplication('T1', c.id, 'REQ-PUB', 'DIRECT', 'U1')
  const timeline = await appSvc.getApplicationTimeline('T1', app.id)
  assert.ok(timeline.length >= 1)
  assert.strictEqual(timeline[0].event_type, 'STATUS_CHANGED')
  assert.strictEqual(timeline[0].new_status, 'APPLIED')
})

test('createApplication: rejects if requisition not PUBLISHED', async () => {
  const pool = createMockPool()
  const candSvc = createCandidateService({ pool })
  const appSvc = createApplicationService({ pool })
  const c = await candSvc.createCandidate('T1', { first_name: 'A', last_name: 'B', email: 'draft@test.com' })
  await assert.rejects(
    () => appSvc.createApplication('T1', c.id, 'REQ-DRAFT', 'DIRECT', 'U1'),
    /must be PUBLISHED/
  )
})

test('createApplication: rejects duplicate', async () => {
  const pool = createMockPool()
  const candSvc = createCandidateService({ pool })
  const appSvc = createApplicationService({ pool })
  const c = await candSvc.createCandidate('T1', { first_name: 'A', last_name: 'B', email: 'dup-app@test.com' })
  await appSvc.createApplication('T1', c.id, 'REQ-PUB', 'DIRECT', 'U1')
  await assert.rejects(
    () => appSvc.createApplication('T1', c.id, 'REQ-PUB', 'DIRECT', 'U1'),
    /duplicate/
  )
})

// Status transitions
test('transitionStatus: APPLIED → SCREENING', async () => {
  const pool = createMockPool()
  const candSvc = createCandidateService({ pool })
  const appSvc = createApplicationService({ pool })
  const c = await candSvc.createCandidate('T1', { first_name: 'A', last_name: 'B', email: 'tr1@test.com' })
  const app = await appSvc.createApplication('T1', c.id, 'REQ-PUB', 'DIRECT', 'U1')
  const r = await appSvc.transitionStatus('T1', app.id, 'SCREENING', 'U1')
  assert.strictEqual(r.previousStatus, 'APPLIED')
  assert.strictEqual(r.newStatus, 'SCREENING')
})

test('transitionStatus: full pipeline APPLIED → HIRED', async () => {
  const pool = createMockPool()
  const candSvc = createCandidateService({ pool })
  const appSvc = createApplicationService({ pool })
  const c = await candSvc.createCandidate('T1', { first_name: 'A', last_name: 'B', email: 'full@test.com' })
  const app = await appSvc.createApplication('T1', c.id, 'REQ-PUB', 'DIRECT', 'U1')
  await appSvc.transitionStatus('T1', app.id, 'SCREENING', 'U1')
  await appSvc.transitionStatus('T1', app.id, 'SHORTLISTED', 'U1')
  await appSvc.transitionStatus('T1', app.id, 'INTERVIEWED', 'U1')
  await appSvc.transitionStatus('T1', app.id, 'OFFERED', 'U1')
  const r = await appSvc.transitionStatus('T1', app.id, 'HIRED', 'U1')
  assert.strictEqual(r.newStatus, 'HIRED')
})

test('transitionStatus: invalid APPLIED → OFFERED rejected', async () => {
  const pool = createMockPool()
  const candSvc = createCandidateService({ pool })
  const appSvc = createApplicationService({ pool })
  const c = await candSvc.createCandidate('T1', { first_name: 'A', last_name: 'B', email: 'inv1@test.com' })
  const app = await appSvc.createApplication('T1', c.id, 'REQ-PUB', 'DIRECT', 'U1')
  await assert.rejects(
    () => appSvc.transitionStatus('T1', app.id, 'OFFERED', 'U1'),
    /invalid transition/
  )
})

test('transitionStatus: invalid HIRED → anything rejected (terminal)', async () => {
  const pool = createMockPool()
  const candSvc = createCandidateService({ pool })
  const appSvc = createApplicationService({ pool })
  const c = await candSvc.createCandidate('T1', { first_name: 'A', last_name: 'B', email: 'term@test.com' })
  const app = await appSvc.createApplication('T1', c.id, 'REQ-PUB', 'DIRECT', 'U1')
  await appSvc.transitionStatus('T1', app.id, 'SCREENING', 'U1')
  await appSvc.transitionStatus('T1', app.id, 'SHORTLISTED', 'U1')
  await appSvc.transitionStatus('T1', app.id, 'INTERVIEWED', 'U1')
  await appSvc.transitionStatus('T1', app.id, 'OFFERED', 'U1')
  await appSvc.transitionStatus('T1', app.id, 'HIRED', 'U1')
  await assert.rejects(
    () => appSvc.transitionStatus('T1', app.id, 'SCREENING', 'U1'),
    /invalid transition/
  )
})

test('transitionStatus: REJECTED without reason blocked', async () => {
  const pool = createMockPool()
  const candSvc = createCandidateService({ pool })
  const appSvc = createApplicationService({ pool })
  const c = await candSvc.createCandidate('T1', { first_name: 'A', last_name: 'B', email: 'rej1@test.com' })
  const app = await appSvc.createApplication('T1', c.id, 'REQ-PUB', 'DIRECT', 'U1')
  await assert.rejects(
    () => appSvc.transitionStatus('T1', app.id, 'REJECTED', 'U1', ''),
    /rejection_reason is required/
  )
})

test('transitionStatus: REJECTED with reason succeeds', async () => {
  const pool = createMockPool()
  const candSvc = createCandidateService({ pool })
  const appSvc = createApplicationService({ pool })
  const c = await candSvc.createCandidate('T1', { first_name: 'A', last_name: 'B', email: 'rej2@test.com' })
  const app = await appSvc.createApplication('T1', c.id, 'REQ-PUB', 'DIRECT', 'U1')
  const r = await appSvc.transitionStatus('T1', app.id, 'REJECTED', 'U1', 'Not qualified')
  assert.strictEqual(r.newStatus, 'REJECTED')
})

test('transitionStatus: emits event with actor metadata', async () => {
  const pool = createMockPool()
  const candSvc = createCandidateService({ pool })
  const appSvc = createApplicationService({ pool })
  const c = await candSvc.createCandidate('T1', { first_name: 'A', last_name: 'B', email: 'actor@test.com' })
  const app = await appSvc.createApplication('T1', c.id, 'REQ-PUB', 'DIRECT', 'U1')
  await appSvc.transitionStatus('T1', app.id, 'SCREENING', 'USER-42')
  const timeline = await appSvc.getApplicationTimeline('T1', app.id)
  const screeningEvent = timeline.find(e => e.new_status === 'SCREENING')
  assert.ok(screeningEvent)
  assert.strictEqual(screeningEvent.actor_user_id, 'USER-42')
  assert.strictEqual(screeningEvent.actor_type, 'HUMAN')
})

test('attachRecommendation: wires FK correctly', async () => {
  const pool = createMockPool()
  const candSvc = createCandidateService({ pool })
  const appSvc = createApplicationService({ pool })
  const c = await candSvc.createCandidate('T1', { first_name: 'A', last_name: 'B', email: 'rec@test.com' })
  const app = await appSvc.createApplication('T1', c.id, 'REQ-PUB', 'AI_MATCH', 'U1')
  const updated = await appSvc.attachRecommendation('T1', app.id, 'LOG-123', 92.5, 87.3)
  assert.strictEqual(updated.match_score, 92.5)
  assert.strictEqual(updated.match_confidence, 87.3)
  assert.strictEqual(updated.ai_recommendation_log_id, 'LOG-123')
})

test('listApplications: returns all for requisition', async () => {
  const pool = createMockPool()
  const candSvc = createCandidateService({ pool })
  const appSvc = createApplicationService({ pool })
  await candSvc.createCandidate('T1', { first_name: 'A', last_name: 'B', email: 'list1@test.com' })
  await candSvc.createCandidate('T1', { first_name: 'C', last_name: 'D', email: 'list2@test.com' })
  const c1 = pool._candidates.values().next().value
  await appSvc.createApplication('T1', c1.id, 'REQ-PUB', 'DIRECT', 'U1')
  const list = await appSvc.listApplications('T1', 'REQ-PUB')
  assert.ok(list.length >= 1)
})

test('getApplicationTimeline: returns events in order', async () => {
  const pool = createMockPool()
  const candSvc = createCandidateService({ pool })
  const appSvc = createApplicationService({ pool })
  const c = await candSvc.createCandidate('T1', { first_name: 'A', last_name: 'B', email: 'tl@test.com' })
  const app = await appSvc.createApplication('T1', c.id, 'REQ-PUB', 'DIRECT', 'U1')
  await appSvc.transitionStatus('T1', app.id, 'SCREENING', 'U1')
  await appSvc.transitionStatus('T1', app.id, 'SHORTLISTED', 'U1')
  const timeline = await appSvc.getApplicationTimeline('T1', app.id)
  assert.ok(timeline.length >= 3) // APPLIED + SCREENING + SHORTLISTED
})

// Config tests
test('state machine: all statuses have transitions defined', () => {
  for (const s of stateMachine.validStatuses) {
    assert.ok(Array.isArray(stateMachine.transitions[s]), `missing transition for: ${s}`)
  }
})

test('state machine: terminal statuses have empty transitions', () => {
  for (const s of stateMachine.terminal) {
    assert.deepStrictEqual(stateMachine.transitions[s], [])
  }
})

test('state machine: REJECTED requires reason', () => {
  assert.ok(stateMachine.requiresReason.includes('REJECTED'))
})

test('constructor: application service rejects missing pool', () => {
  assert.throws(() => createApplicationService({}), /pool is required/)
})
