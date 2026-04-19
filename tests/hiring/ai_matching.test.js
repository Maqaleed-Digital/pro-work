'use strict'

const test   = require('node:test')
const assert = require('node:assert/strict')
const { createAiMatchingService } = require('../../app/modules/hiring/ai_matching_service')
const { evaluateRankingBias }     = require('../../app/modules/hiring/bias_monitor')
const rubric = require('../../app/config/ai/matching_rubric_v1.json')

// ── Mock Pool ───────────────────────────────────────────────────────────────

function createMockPool() {
  const auditLogs = new Map()
  const applications = new Map()
  const appEvents = new Map()

  const requisition = {
    id: 'REQ-1', tenant_id: 'T1', status: 'PUBLISHED',
    occupation_code: 'ISCO-2512', salary_min: 10000, salary_max: 20000,
    requirements: JSON.stringify({ skills: ['javascript', 'react', 'nodejs'], experience_years: 3 }),
  }

  const candidates = [
    { id: 'C1', first_name: 'Ahmed', last_name: 'Al-Saud', email: 'a@t.com', nationality: 'SAU',
      skills: ['javascript', 'react', 'nodejs'], experience_years: 5, occupation_code: 'ISCO-2512',
      expected_salary: 15000, languages: ['ar', 'en'], prior_delivery_score: 80, created_at: '2026-01-01' },
    { id: 'C2', first_name: 'Maria', last_name: 'Garcia', email: 'b@t.com', nationality: 'ESP',
      skills: ['python', 'django'], experience_years: 2, occupation_code: null,
      expected_salary: 25000, languages: ['es', 'en'], prior_delivery_score: 60, created_at: '2026-01-02' },
    { id: 'C3', first_name: 'Raj', last_name: 'Kumar', email: 'c@t.com', nationality: 'IND',
      skills: ['javascript', 'angular'], experience_years: 1, occupation_code: null,
      expected_salary: null, languages: ['hi'], prior_delivery_score: null, created_at: '2026-01-03' },
  ]

  const mockClient = {
    query(sql, params) {
      if (/set_config/i.test(sql)) return { rows: [{}] }
      if (/FROM requisitions WHERE id/i.test(sql)) return { rows: [requisition] }
      if (/FROM candidates ORDER/i.test(sql)) return { rows: candidates }

      if (/INSERT INTO recommendation_audit_logs/i.test(sql)) {
        const log = { id: params[0], actor: params[1], input_signals: params[2],
          rationale: params[3], confidence_score: params[4], model_version: params[5],
          prompt_hash: params[6], output_snapshot: params[7], bias_score: params[8],
          tenant_id: params[9], immutable_hash: params[10], reviewer_decision: 'PENDING',
          reviewer_id: null, reviewed_at: null, override_reason: null }
        auditLogs.set(log.id, log)
        return { rows: [log] }
      }

      if (/FROM recommendation_audit_logs WHERE id/i.test(sql)) {
        const log = auditLogs.get(params[0])
        return { rows: log ? [log] : [] }
      }

      if (/UPDATE recommendation_audit_logs/i.test(sql)) {
        const log = auditLogs.get(params[3])
        if (log) { log.reviewer_decision = params[0]; log.reviewer_id = params[1]; log.override_reason = params[2] }
        return { rows: [], rowCount: log ? 1 : 0 }
      }

      if (/INSERT INTO applications/i.test(sql)) {
        const a = { id: params[0], tenant_id: params[1], candidate_id: params[2],
          requisition_id: params[3], status: 'APPLIED', match_score: params[4],
          match_confidence: params[5], ai_recommendation_log_id: params[6] }
        applications.set(a.id, a)
        return { rows: [a] }
      }

      if (/INSERT INTO application_events/i.test(sql)) {
        // actor_type is a literal 'AI' in the SQL, not a param — detect from SQL text
        const actorType = sql.includes("'AI'") ? 'AI' : 'HUMAN'
        appEvents.set(params[0], { id: params[0], actor_type: actorType })
        return { rows: [{}] }
      }

      return { rows: [], rowCount: 0 }
    },
    release() {},
  }

  return {
    connect() { return Promise.resolve(mockClient) },
    _auditLogs: auditLogs,
    _applications: applications,
    _appEvents: appEvents,
  }
}

// ── Unit Tests ──────────────────────────────────────────────────────────────

test('rankCandidates: returns scored list', async () => {
  const pool = createMockPool()
  const svc = createAiMatchingService({ pool })
  const result = await svc.rankCandidates('T1', 'REQ-1')
  assert.ok(result.ranked_candidates.length === 3)
  assert.ok(result.ranked_candidates[0].match_score >= result.ranked_candidates[1].match_score)
})

test('rankCandidates: every candidate has a recommendation_audit_log_id', async () => {
  const pool = createMockPool()
  const svc = createAiMatchingService({ pool })
  const result = await svc.rankCandidates('T1', 'REQ-1')
  for (const c of result.ranked_candidates) {
    assert.ok(c.recommendation_audit_log_id, `candidate ${c.candidate_id} missing log id`)
  }
})

test('rankCandidates: every candidate has audit log row written', async () => {
  const pool = createMockPool()
  const svc = createAiMatchingService({ pool })
  await svc.rankCandidates('T1', 'REQ-1')
  assert.strictEqual(pool._auditLogs.size, 3, 'should have 3 audit log rows (one per candidate)')
})

test('rankCandidates: no silent filtering — all 3 candidates logged', async () => {
  const pool = createMockPool()
  const svc = createAiMatchingService({ pool })
  const result = await svc.rankCandidates('T1', 'REQ-1')
  assert.strictEqual(result.total_candidates, 3)
  assert.strictEqual(result.ranked_candidates.length, 3)
})

test('rankCandidates: low-scoring candidates marked not recommended but still present', async () => {
  const pool = createMockPool()
  const svc = createAiMatchingService({ pool })
  const result = await svc.rankCandidates('T1', 'REQ-1')
  const notRec = result.ranked_candidates.filter(c => !c.recommended)
  // Some candidates may be below threshold
  for (const c of notRec) {
    assert.ok(c.recommendation_audit_log_id, 'not-recommended must still have audit log')
  }
})

test('rankCandidates: bias_score computed per candidate', async () => {
  const pool = createMockPool()
  const svc = createAiMatchingService({ pool })
  const result = await svc.rankCandidates('T1', 'REQ-1')
  for (const c of result.ranked_candidates) {
    assert.ok(typeof c.bias_score === 'number')
    assert.ok(c.bias_score >= 0 && c.bias_score <= 1)
  }
})

test('rankCandidates: model_version and rubric_version captured', async () => {
  const pool = createMockPool()
  const svc = createAiMatchingService({ pool })
  const result = await svc.rankCandidates('T1', 'REQ-1')
  assert.strictEqual(result.model_version, rubric.modelVersion)
  assert.strictEqual(result.rubric_version, rubric.version)
})

test('rankCandidates: audit log rows have model_version and prompt_hash', async () => {
  const pool = createMockPool()
  const svc = createAiMatchingService({ pool })
  await svc.rankCandidates('T1', 'REQ-1')
  for (const log of pool._auditLogs.values()) {
    assert.strictEqual(log.model_version, rubric.modelVersion)
    assert.strictEqual(log.prompt_hash, rubric.promptVersion)
  }
})

test('rankCandidates: reviewer_decision is PENDING for all logs', async () => {
  const pool = createMockPool()
  const svc = createAiMatchingService({ pool })
  await svc.rankCandidates('T1', 'REQ-1')
  for (const log of pool._auditLogs.values()) {
    assert.strictEqual(log.reviewer_decision, 'PENDING')
  }
})

test('rankCandidates: rationale includes top signals and concerns', async () => {
  const pool = createMockPool()
  const svc = createAiMatchingService({ pool })
  const result = await svc.rankCandidates('T1', 'REQ-1')
  for (const c of result.ranked_candidates) {
    assert.ok(c.rationale.top_contributing_signals.length > 0)
    assert.ok(c.rationale.signal_weights)
    assert.ok(Array.isArray(c.rationale.concerns))
  }
})

test('rankCandidates: bias_report included with disparate_impact', async () => {
  const pool = createMockPool()
  const svc = createAiMatchingService({ pool })
  const result = await svc.rankCandidates('T1', 'REQ-1')
  assert.ok(result.bias_report)
  assert.strictEqual(result.bias_report.total_candidates, 3)
  assert.ok(typeof result.bias_report.flagged === 'boolean')
})

test('reviewRecommendation: APPROVED creates application with log_id', async () => {
  const pool = createMockPool()
  const svc = createAiMatchingService({ pool })
  const ranked = await svc.rankCandidates('T1', 'REQ-1')
  const topLogId = ranked.ranked_candidates[0].recommendation_audit_log_id

  const result = await svc.reviewRecommendation('T1', topLogId, 'ACCEPTED', 'USER-1')
  assert.strictEqual(result.decision, 'ACCEPTED')
  assert.ok(result.application_id, 'should create an application')
})

test('reviewRecommendation: APPROVED application has AI actor_type event', async () => {
  const pool = createMockPool()
  const svc = createAiMatchingService({ pool })
  const ranked = await svc.rankCandidates('T1', 'REQ-1')
  const topLogId = ranked.ranked_candidates[0].recommendation_audit_log_id

  await svc.reviewRecommendation('T1', topLogId, 'ACCEPTED', 'USER-1')
  // Check that the application event has actor_type = AI
  const aiEvents = Array.from(pool._appEvents.values()).filter(e => e.actor_type === 'AI')
  assert.ok(aiEvents.length >= 1, 'should have AI actor_type event')
})

test('reviewRecommendation: REJECTED updates log only, no application', async () => {
  const pool = createMockPool()
  const svc = createAiMatchingService({ pool })
  const ranked = await svc.rankCandidates('T1', 'REQ-1')
  const logId = ranked.ranked_candidates[1].recommendation_audit_log_id

  const result = await svc.reviewRecommendation('T1', logId, 'REJECTED', 'USER-1', 'Not a fit')
  assert.strictEqual(result.decision, 'REJECTED')
  assert.ok(!result.application_id)
})

test('reviewRecommendation: REJECTED without reason blocked', async () => {
  const pool = createMockPool()
  const svc = createAiMatchingService({ pool })
  const ranked = await svc.rankCandidates('T1', 'REQ-1')
  const logId = ranked.ranked_candidates[2].recommendation_audit_log_id

  await assert.rejects(
    () => svc.reviewRecommendation('T1', logId, 'REJECTED', 'USER-1', ''),
    /override_reason required/
  )
})

test('reviewRecommendation: already reviewed rejected (409)', async () => {
  const pool = createMockPool()
  const svc = createAiMatchingService({ pool })
  const ranked = await svc.rankCandidates('T1', 'REQ-1')
  const logId = ranked.ranked_candidates[0].recommendation_audit_log_id

  await svc.reviewRecommendation('T1', logId, 'ACCEPTED', 'USER-1')
  await assert.rejects(
    () => svc.reviewRecommendation('T1', logId, 'ACCEPTED', 'USER-2'),
    /already reviewed/
  )
})

test('reviewRecommendation: invalid decision rejected', async () => {
  await assert.rejects(
    () => createAiMatchingService({ pool: createMockPool() }).reviewRecommendation('T1', 'x', 'MAYBE', 'U1'),
    /must be ACCEPTED or REJECTED/
  )
})

test('constructor: rejects missing pool', () => {
  assert.throws(() => createAiMatchingService({}), /pool is required/)
})

// ── Bias monitor tests ──────────────────────────────────────────────────────

test('evaluateRankingBias: computes disparate impact ratios', () => {
  const ranked = [
    { match_score: 80, recommended: true, metadata: { nationality: 'SAU' } },
    { match_score: 75, recommended: true, metadata: { nationality: 'SAU' } },
    { match_score: 30, recommended: false, metadata: { nationality: 'IND' } },
  ]
  const pool = { nationality: { SAU: 2, IND: 1 } }
  const result = evaluateRankingBias(ranked, pool)
  assert.ok(result.disparate_impact.nationality)
})

test('evaluateRankingBias: flags ratio below 0.8', () => {
  const ranked = [
    { match_score: 80, recommended: true, metadata: { nationality: 'SAU' } },
    { match_score: 75, recommended: true, metadata: { nationality: 'SAU' } },
    { match_score: 30, recommended: false, metadata: { nationality: 'IND' } },
    { match_score: 25, recommended: false, metadata: { nationality: 'IND' } },
  ]
  const pool = { nationality: { SAU: 2, IND: 2 } }
  const result = evaluateRankingBias(ranked, pool)
  assert.strictEqual(result.flagged, true)
  assert.ok(result.flags.length > 0)
  assert.ok(result.flags[0].ratio < 0.8)
})

test('rubric config: version is v1', () => {
  assert.strictEqual(rubric.version, 'v1')
})

test('rubric config: all signal weights sum to ~1.0', () => {
  const sum = Object.values(rubric.signalWeights).reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(sum - 1.0) < 0.01, `weights sum to ${sum}, expected ~1.0`)
})

test('rubric config: bias dimensions are monitoring-only', () => {
  // Verify no bias dimension appears in signal weights
  for (const dim of rubric.biasMonitoredDimensions) {
    assert.ok(!rubric.signalWeights[dim], `${dim} must NOT be a scoring signal`)
  }
})
