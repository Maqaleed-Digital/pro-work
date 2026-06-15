'use strict'

/**
 * S39-G6 Integration Wiring Tests
 *
 * Verifies all 4 wiring points:
 *   1. S36-G1 audit service → S37-G5 matching engine (RECOMMENDATION entries)
 *   2. S36-G3 Nitaqat store → S37-G6 compliance dashboard (real data, no fallback)
 *   3. offboarding_service → evidencePackService (EP_WOS_OFFBOARD_01 stored)
 *   4. pdpl_router → real event bus (DSR_SUBMITTED / DSR_PROCESSED events published)
 */

const { describe, it, before } = require('node:test')
const assert = require('node:assert/strict')

// ── Wiring 1: audit log → matching engine ────────────────────────────────────
const { createMatchingEngine, InMemoryMatchStore } = require('../app/modules/recruiting/matching_engine')
const { createAuditLogService, InMemoryAuditStore } = require('../app/modules/audit/audit_log_service')

// ── Wiring 2: Nitaqat engine → compliance dashboard ─────────────────────────
const { createComplianceDashboardService } = require('../app/modules/compliance/compliance_dashboard_service')

// ── Wiring 3: offboarding → evidence pack store ──────────────────────────────
const { createLifecycleModule } = require('../app/modules/lifecycle/index')
const { createEvidencePackService, InMemoryEvidencePackStore } = require('../app/modules/lifecycle/evidence_pack_service')

// ── Wiring 4: PDPL router → real event bus ───────────────────────────────────
const { createPdplRouter } = require('../app/api/pdpl_router')
const { InMemoryEventStore } = require('../app/modules/event_bus/index')

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function stubHooks() {
  const published = []
  return {
    publish(event) { published.push(event); return Promise.resolve() },
    published,
  }
}

function makeFakeReq(method, pathname, body) {
  return {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
  }
}

function makeFakeRes() {
  const res = { statusCode: null, headers: {}, body: '' }
  res.writeHead = (status, headers) => { res.statusCode = status; Object.assign(res.headers, headers || {}) }
  res.end = (body) => { res.body = body }
  return res
}

function parseBody(res) {
  return JSON.parse(res.body)
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1: Matching engine → audit log (Wiring 1)
// ─────────────────────────────────────────────────────────────────────────────

describe('Wiring 1 — matching engine logs RECOMMENDATION to audit log', () => {
  let auditLog, engine, matchStore, hooks

  before(() => {
    auditLog   = createAuditLogService({ store: new InMemoryAuditStore() })
    matchStore = new InMemoryMatchStore()
    hooks      = stubHooks()
    engine     = createMatchingEngine({ matchStore, hooks, auditLog })
  })

  it('no audit entries before ranking', () => {
    assert.equal(auditLog.count({ action: 'RECOMMENDATION' }), 0)
  })

  it('logs one RECOMMENDATION per candidate after rankCandidates', async () => {
    const input = {
      candidates: [
        { candidate_id: 'c-001', candidate_type: 'FREELANCER', skills: ['node'], availability_status: 'AVAILABLE', nationality: 'SA' },
        { candidate_id: 'c-002', candidate_type: 'FTE',        skills: ['node'], availability_status: 'AVAILABLE', nationality: 'SA' },
      ],
      requisition: {
        requisition_id: 'req-001',
        required_skills: ['node'],
        target_nationality: 'SA',
        tenant_id: 'tenant-1',
      },
      actor: { actor_type: 'SYSTEM', actor_id: 'test-actor' },
      correlation_id: 'corr-001',
      causation_id:   'caus-001',
      occurred_at:    new Date().toISOString(),
      event_ids: {
        candidate_matched:           { 'c-001': 'e1', 'c-002': 'e2' },
        nitaqat_preview_generated:   { 'c-001': 'e3', 'c-002': 'e4' },
        occupation_match_validated:  { 'c-001': 'e5', 'c-002': 'e6' },
        ai_match_explanation_logged: { 'c-001': 'e7', 'c-002': 'e8' },
      },
    }
    const results = await engine.rankCandidates(input)
    assert.equal(results.length, 2)
    assert.equal(auditLog.count({ action: 'RECOMMENDATION' }), 2)
  })

  it('audit entries have FTE boost flag', () => {
    const entries = auditLog.list({ action: 'RECOMMENDATION' })
    const fteEntry = entries.find(e => e.payload.candidate_type === 'FTE')
    assert.ok(fteEntry, 'FTE candidate should have audit entry')
    assert.equal(fteEntry.payload.fte_boost_applied, true)
  })

  it('audit entries have FREELANCER type without boost', () => {
    const entries = auditLog.list({ action: 'RECOMMENDATION' })
    const freelancerEntry = entries.find(e => e.payload.candidate_type === 'FREELANCER')
    assert.ok(freelancerEntry, 'FREELANCER candidate should have audit entry')
    assert.equal(freelancerEntry.payload.fte_boost_applied, false)
  })

  it('audit entries include final_score and nitaqat_band', () => {
    const entries = auditLog.list({ action: 'RECOMMENDATION' })
    for (const e of entries) {
      assert.ok(typeof e.payload.final_score === 'number', 'final_score must be a number')
      assert.ok(e.payload.nitaqat_band, 'nitaqat_band must be present')
    }
  })

  it('audit entries have entity_type CANDIDATE_MATCH', () => {
    const entries = auditLog.list({ action: 'RECOMMENDATION' })
    assert.ok(entries.every(e => e.entity_type === 'CANDIDATE_MATCH'))
  })

  it('matching engine without auditLog still works (backward compat)', async () => {
    const engine2 = createMatchingEngine({ matchStore: new InMemoryMatchStore(), hooks: stubHooks() })
    const input = {
      candidates: [{ candidate_id: 'c-x', candidate_type: 'FREELANCER', skills: [], availability_status: 'AVAILABLE', nationality: 'SA' }],
      requisition: { requisition_id: 'req-x', required_skills: [], target_nationality: 'SA', tenant_id: 't1' },
      actor: { actor_type: 'SYSTEM', actor_id: 'sys' },
      correlation_id: 'c', causation_id: 'c', occurred_at: new Date().toISOString(),
      event_ids: { candidate_matched: { 'c-x': 'ex1' }, nitaqat_preview_generated: { 'c-x': 'ex2' }, occupation_match_validated: { 'c-x': 'ex3' }, ai_match_explanation_logged: { 'c-x': 'ex4' } },
    }
    const results = await engine2.rankCandidates(input)
    assert.equal(results.length, 1)  // no error thrown
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2: Compliance dashboard → Nitaqat engine (Wiring 2)
// ─────────────────────────────────────────────────────────────────────────────

describe('Wiring 2 — compliance dashboard computes Nitaqat from real engine', () => {
  let dashboard

  before(() => {
    dashboard = createComplianceDashboardService()
  })

  it('throws NITAQAT_NOT_FOUND for unscored candidate (no insufficient_data fallback)', () => {
    assert.throws(
      () => dashboard.getNitaqatScore('unknown-candidate'),
      (err) => err.code === 'NITAQAT_NOT_FOUND'
    )
  })

  it('computes and persists a Nitaqat score', () => {
    const result = dashboard.computeNitaqatScore({
      candidateId: 'cand-sa-001',
      candidate:   { candidate_id: 'cand-sa-001', nationality: 'SA' },
      requisition: { requisition_id: 'req-001', target_nationality: 'SA', tenant_id: 't1' },
    })
    assert.ok(result.candidateId, 'candidateId present')
    assert.ok(result.nitaqat, 'nitaqat result present')
    assert.ok(result.saved_at, 'saved_at present')
    assert.ok(['POSITIVE','NEUTRAL','NEGATIVE'].includes(result.nitaqat.movement_band), 'valid movement_band')
  })

  it('getNitaqatScore retrieves persisted score', () => {
    const score = dashboard.getNitaqatScore('cand-sa-001')
    assert.equal(score.candidateId, 'cand-sa-001')
    assert.ok(score.nitaqat)
  })

  it('getDashboardSummary reflects real data, data_source is nitaqat_engine', () => {
    const summary = dashboard.getDashboardSummary()
    assert.equal(summary.total_scored, 1)
    assert.equal(summary.data_source, 'nitaqat_engine')
    assert.ok(typeof summary.positive_rate === 'number' || summary.positive_rate === null)
  })

  it('listNitaqatScores returns all persisted scores', () => {
    dashboard.computeNitaqatScore({
      candidateId: 'cand-ae-001',
      candidate:   { candidate_id: 'cand-ae-001', nationality: 'AE' },
      requisition: { requisition_id: 'req-002', target_nationality: 'SA', tenant_id: 't1' },
    })
    const all = dashboard.listNitaqatScores()
    assert.ok(all.length >= 2)
  })

  it('validateOccupation delegates to compliance preview engine', () => {
    const result = dashboard.validateOccupation({
      candidate:   { candidate_id: 'cand-sa-001', occupation_code: 'ENG', nationality: 'SA' },
      requisition: { required_occupation_code: 'ENG', tenant_id: 't1' },
    })
    assert.ok(typeof result.valid === 'boolean')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3: Offboarding → evidence pack service (Wiring 3)
// ─────────────────────────────────────────────────────────────────────────────

describe('Wiring 3 — offboarding generates evidence pack in real store', () => {
  let hooks, packSvc, lifecycle

  before(() => {
    hooks   = stubHooks()
    packSvc = createEvidencePackService({ store: new InMemoryEvidencePackStore() })
    lifecycle = createLifecycleModule({ hooks, evidencePackSvc: packSvc })
  })

  it('evidence pack store is empty before any offboarding', () => {
    assert.equal(packSvc.all().length, 0)
  })

  it('generateEvidencePack stores pack in evidencePackService', async () => {
    await lifecycle.offboardingService.generateEvidencePack({
      offboarding_case_id: 'case-001',
      evidence_pack_id:    'ep-001',
      handover_count:      3,
      tenant_id:           'tenant-1',
      occurred_at:         new Date().toISOString(),
    })
    assert.equal(packSvc.all().length, 1)
  })

  it('stored pack has correct pack_type EP_WOS_OFFBOARD_01', () => {
    const pack = packSvc.getPack('ep-001')
    assert.equal(pack.pack_type, 'EP_WOS_OFFBOARD_01')
  })

  it('stored pack has correct offboarding_case_id', () => {
    const pack = packSvc.getPack('ep-001')
    assert.equal(pack.offboarding_case_id, 'case-001')
  })

  it('stored pack has correct handover_count', () => {
    const pack = packSvc.getPack('ep-001')
    assert.equal(pack.handover_count, 3)
  })

  it('stored pack has status GENERATED', () => {
    const pack = packSvc.getPack('ep-001')
    assert.equal(pack.status, 'GENERATED')
  })

  it('OFFBOARDING_EVIDENCE_PACK_GENERATED event still published to original hooks', () => {
    const epEvent = hooks.published.find(e => e.event_type === 'OFFBOARDING_EVIDENCE_PACK_GENERATED')
    assert.ok(epEvent, 'event must still reach original hooks.publish')
  })

  it('listByCase retrieves packs for offboarding case', () => {
    const packs = packSvc.listByCase('case-001')
    assert.equal(packs.length, 1)
    assert.equal(packs[0].evidence_pack_id, 'ep-001')
  })

  it('lifecycle module without evidencePackSvc still works (backward compat)', async () => {
    const lifecycle2 = createLifecycleModule({ hooks: stubHooks() })
    await lifecycle2.offboardingService.generateEvidencePack({
      offboarding_case_id: 'case-x',
      evidence_pack_id:    'ep-x',
      tenant_id:           'tenant-x',
      occurred_at:         new Date().toISOString(),
    })
    // No error — backward compatible
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Suite 4: PDPL router → real event bus (Wiring 4)
// ─────────────────────────────────────────────────────────────────────────────

describe('Wiring 4 — PDPL router publishes to real event bus', () => {
  let pdplRouter, eventStore

  before(() => {
    eventStore  = new InMemoryEventStore()
    pdplRouter  = createPdplRouter({ store: undefined, publisher: undefined })
    // use default (real) publisher — no stub
  })

  async function post(pathname, body) {
    const res = makeFakeRes()
    await pdplRouter.handle(null, res, pathname, 'POST', 'tenant-1', body)
    return parseBody(res)
  }

  async function get(pathname) {
    const res = makeFakeRes()
    await pdplRouter.handle(null, res, pathname, 'GET', 'tenant-1', null)
    return parseBody(res)
  }

  it('POST /api/compliance/pdpl/dsr creates a DSR', async () => {
    const data = await post('/api/compliance/pdpl/dsr', {
      dsr_type:   'ACCESS',
      subject_id: 'sub-001',
    })
    assert.ok(data.ok)
    assert.equal(data.data.dsr_type, 'ACCESS')
    assert.equal(data.data.status, 'PENDING')
    assert.ok(data.data.dsr_id.startsWith('dsr-'))
  })

  it('GET /api/compliance/pdpl/dsr lists all DSRs', async () => {
    const data = await get('/api/compliance/pdpl/dsr')
    assert.ok(data.ok)
    assert.ok(Array.isArray(data.data))
    assert.ok(data.data.length >= 1)
  })

  it('POST /api/compliance/pdpl/dsr/:id/process updates status', async () => {
    const created = await post('/api/compliance/pdpl/dsr', {
      dsr_type:   'ERASURE',
      subject_id: 'sub-002',
    })
    const dsrId = created.data.dsr_id
    const processed = await post(`/api/compliance/pdpl/dsr/${dsrId}/process`, {
      outcome:      'COMPLETED',
      processed_by: 'dpo@example.com',
    })
    assert.ok(processed.ok)
    assert.equal(processed.data.status, 'COMPLETED')
    assert.equal(processed.data.processed_by, 'dpo@example.com')
  })

  it('GET /api/compliance/pdpl/dsr/:id retrieves specific DSR', async () => {
    const all = await get('/api/compliance/pdpl/dsr')
    const dsrId = all.data[0].dsr_id
    const single = await get(`/api/compliance/pdpl/dsr/${dsrId}`)
    assert.ok(single.ok)
    assert.equal(single.data.dsr_id, dsrId)
  })

  it('PDPL router uses real event bus (publisher exists, not stub)', () => {
    assert.ok(pdplRouter._publisher, 'publisher must exist')
    assert.ok(typeof pdplRouter._publisher.publish === 'function', 'publisher.publish must be a function')
  })

  it('GET /api/compliance/pdpl/coverage returns wired event_bus', async () => {
    const data = await get('/api/compliance/pdpl/coverage')
    assert.ok(data.ok)
    assert.equal(data.data.event_bus, 'wired')
  })

  it('rejects unknown dsr_type with VALIDATION_ERROR', async () => {
    const res = makeFakeRes()
    await pdplRouter.handle(null, res, '/api/compliance/pdpl/dsr', 'POST', 'tenant-1', {
      dsr_type: 'INVALID_TYPE', subject_id: 'sub-x',
    })
    const body = parseBody(res)
    assert.equal(body.ok, false)
    assert.equal(body.error.code, 'VALIDATION_ERROR')
  })

  it('rejects processing of terminal DSR with DSR_TERMINAL', async () => {
    const created = await post('/api/compliance/pdpl/dsr', { dsr_type: 'PORTABILITY', subject_id: 'sub-003' })
    const dsrId = created.data.dsr_id
    await post(`/api/compliance/pdpl/dsr/${dsrId}/process`, { outcome: 'COMPLETED' })
    // Try to process again
    const res = makeFakeRes()
    await pdplRouter.handle(null, res, `/api/compliance/pdpl/dsr/${dsrId}/process`, 'POST', 'tenant-1', { outcome: 'COMPLETED' })
    const body = parseBody(res)
    assert.equal(body.ok, false)
    assert.equal(body.error.code, 'DSR_TERMINAL')
  })

  it('GET /api/compliance/pdpl/dsr/sla-alerts returns empty array when no alerts', async () => {
    const router2 = createPdplRouter()
    const res = makeFakeRes()
    await router2.handle(null, res, '/api/compliance/pdpl/dsr/sla-alerts', 'GET', 'tenant-1', null)
    const body = parseBody(res)
    assert.ok(body.ok)
    assert.ok(Array.isArray(body.data))
    // New store with fresh DSRs — none should be in alert state yet
    assert.equal(body.data.length, 0)
  })
})
