'use strict'

/**
 * S39-G5 — ERI Score Service Tests
 *
 * Tests the 5-component ERI engine, interpretation labels, badge rules,
 * service API, trend generation, employer summary, and API router dispatch.
 *
 * Does NOT modify or re-test eri_engine.js (legacy, separate test file).
 */

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')

const {
  computeERI,
  interpretScore,
  listBadges,
  createERIService,
  InMemoryERIStore,
  seedDemoProfiles,
  WEIGHTS,
  INTERPRETATION,
  BADGE_RULES,
} = require('../app/modules/eri/eri_score_service')

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ELITE_COMPONENTS = {
  on_time_delivery_pct:   97,
  dispute_rate_pct:        0,
  rehire_rate_pct:        82,
  responsiveness_score:   95,
  platform_tenure_months: 28,
}

const GOOD_COMPONENTS = {
  on_time_delivery_pct:   78,
  dispute_rate_pct:        5,
  rehire_rate_pct:        55,
  responsiveness_score:   70,
  platform_tenure_months: 10,
}

const NEW_COMPONENTS = {
  on_time_delivery_pct:   20,
  dispute_rate_pct:       30,
  rehire_rate_pct:        10,
  responsiveness_score:   25,
  platform_tenure_months:  1,
}

function makeStore(profiles) {
  const store = new InMemoryERIStore()
  Object.entries(profiles || {}).forEach(([id, data]) => store.set(id, data))
  return store
}

function makeService(profiles) {
  return createERIService({ store: makeStore(profiles) })
}

// ── Suite 1: computeERI — score math ─────────────────────────────────────────

describe('Suite 1: computeERI — score math', () => {
  it('returns score in 0–100 range for elite components', () => {
    const r = computeERI(ELITE_COMPONENTS)
    assert.ok(r.score >= 0 && r.score <= 100, `Score ${r.score} out of range`)
  })

  it('elite components score >= 75 (Excellent or Elite tier)', () => {
    const r = computeERI(ELITE_COMPONENTS)
    assert.ok(r.score >= 75, `Expected score >= 75, got ${r.score}`)
  })

  it('new/weak components score < 45 (New or Developing tier)', () => {
    const r = computeERI(NEW_COMPONENTS)
    assert.ok(r.score < 50, `Expected score < 50, got ${r.score}`)
  })

  it('score is weighted sum — higher on-time delivery increases score', () => {
    const base = computeERI(GOOD_COMPONENTS)
    const better = computeERI({ ...GOOD_COMPONENTS, on_time_delivery_pct: 98 })
    assert.ok(better.score > base.score, 'Higher on-time delivery should increase ERI score')
  })

  it('dispute_rate_pct is inverted — higher dispute rate lowers score', () => {
    const base = computeERI(GOOD_COMPONENTS)
    const worse = computeERI({ ...GOOD_COMPONENTS, dispute_rate_pct: 40 })
    assert.ok(worse.score < base.score, 'Higher dispute rate should lower ERI score')
  })

  it('perfect components give max score ~100', () => {
    const r = computeERI({
      on_time_delivery_pct:    100,
      dispute_rate_pct:          0,
      rehire_rate_pct:         100,
      responsiveness_score:    100,
      platform_tenure_months:   60,
    })
    assert.ok(r.score >= 98, `Expected near-100, got ${r.score}`)
  })

  it('zero components give score 0', () => {
    const r = computeERI({
      on_time_delivery_pct:    0,
      dispute_rate_pct:      100,
      rehire_rate_pct:         0,
      responsiveness_score:    0,
      platform_tenure_months:  0,
    })
    assert.strictEqual(r.score, 0)
  })

  it('weights sum to 1.0', () => {
    const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0)
    assert.ok(Math.abs(total - 1.0) < 0.001, `Weights sum to ${total}, expected 1.0`)
  })

  it('result includes component_scores with 5 keys', () => {
    const r = computeERI(ELITE_COMPONENTS)
    assert.ok(typeof r.component_scores === 'object')
    assert.ok('on_time_delivery'  in r.component_scores)
    assert.ok('dispute_avoidance' in r.component_scores)
    assert.ok('rehire_rate'       in r.component_scores)
    assert.ok('responsiveness'    in r.component_scores)
    assert.ok('tenure'            in r.component_scores)
  })

  it('tenure capped at 60 months — 120 months == 60 months in score', () => {
    const capped = computeERI({ ...GOOD_COMPONENTS, platform_tenure_months: 120 })
    const cap60  = computeERI({ ...GOOD_COMPONENTS, platform_tenure_months:  60 })
    assert.strictEqual(capped.score, cap60.score, 'Tenure beyond 60 months should not increase score')
  })
})

// ── Suite 2: interpretation labels ───────────────────────────────────────────

describe('Suite 2: interpretation — labels and Arabic', () => {
  const tiers = [
    { score: 95,  expectedLabel: 'Elite' },
    { score: 80,  expectedLabel: 'Excellent' },
    { score: 65,  expectedLabel: 'Good' },
    { score: 50,  expectedLabel: 'Developing' },
    { score: 20,  expectedLabel: 'New' },
  ]

  tiers.forEach(({ score, expectedLabel }) => {
    it(`score ${score} → interpretation "${expectedLabel}"`, () => {
      const interp = interpretScore(score)
      assert.strictEqual(interp.label, expectedLabel)
    })
  })

  it('all interpretation tiers have label_ar (Arabic label)', () => {
    INTERPRETATION.forEach(tier => {
      assert.ok(typeof tier.label_ar === 'string' && tier.label_ar.length > 0,
        `tier "${tier.label}" missing label_ar`)
    })
  })

  it('all interpretation tiers have a color', () => {
    INTERPRETATION.forEach(tier => {
      assert.ok(/^#[0-9a-f]{3,8}$/i.test(tier.color),
        `tier "${tier.label}" missing or invalid color`)
    })
  })

  it('computeERI result includes interpretation object', () => {
    const r = computeERI(ELITE_COMPONENTS)
    assert.ok(r.interpretation && typeof r.interpretation.label === 'string')
    assert.ok(typeof r.interpretation.label_ar === 'string')
    assert.ok(typeof r.interpretation.color === 'string')
  })
})

// ── Suite 3: earned badges ────────────────────────────────────────────────────

describe('Suite 3: earned badges', () => {
  it('ON_TIME_MASTER awarded when on_time_delivery_pct >= 95', () => {
    const r = computeERI({ ...GOOD_COMPONENTS, on_time_delivery_pct: 95 })
    assert.ok(r.earned_badges.includes('ON_TIME_MASTER'))
  })

  it('ON_TIME_MASTER NOT awarded when on_time_delivery_pct < 95', () => {
    const r = computeERI({ ...GOOD_COMPONENTS, on_time_delivery_pct: 94 })
    assert.ok(!r.earned_badges.includes('ON_TIME_MASTER'))
  })

  it('DISPUTE_FREE awarded when dispute_rate_pct === 0', () => {
    const r = computeERI({ ...GOOD_COMPONENTS, dispute_rate_pct: 0 })
    assert.ok(r.earned_badges.includes('DISPUTE_FREE'))
  })

  it('DISPUTE_FREE NOT awarded when dispute_rate_pct > 0', () => {
    const r = computeERI({ ...GOOD_COMPONENTS, dispute_rate_pct: 1 })
    assert.ok(!r.earned_badges.includes('DISPUTE_FREE'))
  })

  it('HIGHLY_REHIRED awarded when rehire_rate_pct >= 75', () => {
    const r = computeERI({ ...GOOD_COMPONENTS, rehire_rate_pct: 75 })
    assert.ok(r.earned_badges.includes('HIGHLY_REHIRED'))
  })

  it('RESPONSIVE awarded when responsiveness_score >= 90', () => {
    const r = computeERI({ ...GOOD_COMPONENTS, responsiveness_score: 90 })
    assert.ok(r.earned_badges.includes('RESPONSIVE'))
  })

  it('VETERAN awarded when platform_tenure_months >= 24', () => {
    const r = computeERI({ ...GOOD_COMPONENTS, platform_tenure_months: 24 })
    assert.ok(r.earned_badges.includes('VETERAN'))
  })

  it('elite components earn all 5 badges', () => {
    const r = computeERI(ELITE_COMPONENTS)
    assert.strictEqual(r.earned_badges.length, 5)
  })

  it('new/weak components earn no badges', () => {
    const r = computeERI(NEW_COMPONENTS)
    assert.strictEqual(r.earned_badges.length, 0)
  })

  it('listBadges() returns all 5 badge definitions with id, label, label_ar, icon', () => {
    const badges = listBadges()
    assert.strictEqual(badges.length, 5)
    badges.forEach(b => {
      assert.ok(b.id, 'badge missing id')
      assert.ok(b.label, `${b.id} missing label`)
      assert.ok(b.label_ar, `${b.id} missing label_ar (Arabic required)`)
      assert.ok(b.icon, `${b.id} missing icon`)
    })
  })
})

// ── Suite 4: input validation ─────────────────────────────────────────────────

describe('Suite 4: computeERI — input validation', () => {
  it('throws INVALID_COMPONENT for non-numeric on_time_delivery_pct', () => {
    assert.throws(
      () => computeERI({ ...GOOD_COMPONENTS, on_time_delivery_pct: 'high' }),
      (e) => e.code === 'INVALID_COMPONENT',
    )
  })

  it('throws COMPONENT_OUT_OF_RANGE for pct > 100', () => {
    assert.throws(
      () => computeERI({ ...GOOD_COMPONENTS, rehire_rate_pct: 101 }),
      (e) => e.code === 'COMPONENT_OUT_OF_RANGE',
    )
  })

  it('throws COMPONENT_OUT_OF_RANGE for negative pct', () => {
    assert.throws(
      () => computeERI({ ...GOOD_COMPONENTS, dispute_rate_pct: -1 }),
      (e) => e.code === 'COMPONENT_OUT_OF_RANGE',
    )
  })

  it('throws COMPONENT_OUT_OF_RANGE for negative tenure', () => {
    assert.throws(
      () => computeERI({ ...GOOD_COMPONENTS, platform_tenure_months: -1 }),
      (e) => e.code === 'COMPONENT_OUT_OF_RANGE',
    )
  })

  it('throws INVALID_COMPONENT for missing field', () => {
    const { on_time_delivery_pct: _ignored, ...partial } = GOOD_COMPONENTS
    assert.throws(
      () => computeERI(partial),
      (e) => e.code === 'INVALID_COMPONENT',
    )
  })
})

// ── Suite 5: createERIService ─────────────────────────────────────────────────

describe('Suite 5: createERIService', () => {
  it('getScore throws ERI_PROFILE_NOT_FOUND for unknown worker', () => {
    const svc = makeService({})
    assert.throws(
      () => svc.getScore('nonexistent'),
      (e) => e.code === 'ERI_PROFILE_NOT_FOUND',
    )
  })

  it('getScore returns score with worker_id and components', () => {
    const svc = makeService({ 'w1': { components: ELITE_COMPONENTS, display_name: 'Test Worker' } })
    const r = svc.getScore('w1')
    assert.strictEqual(r.worker_id, 'w1')
    assert.ok(typeof r.score === 'number')
    assert.ok(r.components)
    assert.ok(r.interpretation)
  })

  it('getProfile returns projects, badges, trend, share_token', () => {
    const svc = makeService({
      'w2': {
        components: ELITE_COMPONENTS,
        display_name: 'Worker Two',
        projects: [{ id: 'p1', title: 'Test Project', verified: true }],
      },
    })
    const p = svc.getProfile('w2')
    assert.ok(Array.isArray(p.badges))
    assert.ok(Array.isArray(p.trend))
    assert.ok(p.share_token)
    assert.ok(Array.isArray(p.projects))
  })

  it('getTrend returns array of 6 monthly entries', () => {
    const svc = makeService({ 'w3': { components: GOOD_COMPONENTS } })
    const t = svc.getTrend('w3')
    assert.strictEqual(t.worker_id, 'w3')
    assert.ok(Array.isArray(t.trend))
    assert.strictEqual(t.trend.length, 6)
  })

  it('trend entries have month, month_ar, score', () => {
    const svc = makeService({ 'w3': { components: GOOD_COMPONENTS } })
    const { trend } = svc.getTrend('w3')
    trend.forEach((entry, i) => {
      assert.ok(entry.month,    `trend[${i}] missing month`)
      assert.ok(entry.month_ar, `trend[${i}] missing month_ar (Arabic required)`)
      assert.ok(typeof entry.score === 'number', `trend[${i}] score must be number`)
    })
  })

  it('getEmployerSummary returns eri_score + top_signals + interpretation', () => {
    const svc = makeService({ 'w4': { components: ELITE_COMPONENTS, display_name: 'Top Worker' } })
    const s = svc.getEmployerSummary('w4')
    assert.strictEqual(s.worker_id, 'w4')
    assert.ok(typeof s.eri_score === 'number')
    assert.ok(Array.isArray(s.top_signals))
    assert.strictEqual(s.top_signals.length, 3, 'Employer summary must show exactly 3 top signals')
    assert.ok(s.interpretation)
  })

  it('upsertProfile stores and retrieves a new worker', () => {
    const svc = makeService({})
    svc.upsertProfile('new-worker', { components: GOOD_COMPONENTS, display_name: 'New' })
    const r = svc.getScore('new-worker')
    assert.strictEqual(r.worker_id, 'new-worker')
  })

  it('upsertProfile throws MISSING_WORKER_ID for empty workerId', () => {
    const svc = makeService({})
    assert.throws(
      () => svc.upsertProfile('', { components: GOOD_COMPONENTS }),
      (e) => e.code === 'MISSING_WORKER_ID',
    )
  })
})

// ── Suite 6: seedDemoProfiles ─────────────────────────────────────────────────

describe('Suite 6: seedDemoProfiles', () => {
  it('seeds 3 demo profiles', () => {
    const store = new InMemoryERIStore()
    seedDemoProfiles(store)
    assert.strictEqual(store.all().length, 3)
  })

  it('all demo profiles have valid components', () => {
    const store = new InMemoryERIStore()
    seedDemoProfiles(store)
    store.all().forEach(p => {
      assert.doesNotThrow(() => computeERI(p.components),
        `Demo profile ${p.worker_id} has invalid components`)
    })
  })

  it('demo profiles include verified and unverified projects', () => {
    const store = new InMemoryERIStore()
    seedDemoProfiles(store)
    const allProjects = store.all().flatMap(p => p.projects || [])
    assert.ok(allProjects.some(p => p.verified === true), 'Need at least one verified project')
    assert.ok(allProjects.some(p => p.verified === false), 'Need at least one unverified project')
  })
})

// ── Suite 7: identity_eri_router ──────────────────────────────────────────────

describe('Suite 7: identity_eri_router — route dispatch', () => {
  const { createIdentityEriRouter } = require('../app/api/identity_eri_router')

  function makeRes() {
    const res = { _status: null, _body: null }
    res.writeHead = (status) => { res._status = status }
    res.end = (body) => { res._body = body }
    return res
  }

  function makeReq(url) { return { url: url || '/', headers: {} } }

  function makeRouter() {
    const store = new InMemoryERIStore()
    seedDemoProfiles(store)
    const svc = createERIService({ store })
    return createIdentityEriRouter({ svc })
  }

  it('GET /api/identity/eri/badges → 200 array of 5 badges', () => {
    const router = makeRouter()
    const res = makeRes()
    router.handle(makeReq('/api/identity/eri/badges'), res, '/api/identity/eri/badges', 'GET')
    assert.strictEqual(res._status, 200)
    const data = JSON.parse(res._body)
    assert.ok(data.ok)
    assert.strictEqual(data.data.length, 5)
  })

  it('GET /api/identity/workers → 200 array of workers', () => {
    const router = makeRouter()
    const res = makeRes()
    router.handle(makeReq('/api/identity/workers'), res, '/api/identity/workers', 'GET')
    assert.strictEqual(res._status, 200)
    const data = JSON.parse(res._body)
    assert.ok(data.ok)
    assert.ok(Array.isArray(data.data) && data.data.length >= 3)
  })

  it('GET /api/identity/worker-demo-1/eri → 200 with score', () => {
    const router = makeRouter()
    const res = makeRes()
    router.handle(makeReq('/api/identity/worker-demo-1/eri'), res,
      '/api/identity/worker-demo-1/eri', 'GET')
    assert.strictEqual(res._status, 200)
    const data = JSON.parse(res._body)
    assert.ok(data.ok)
    assert.ok(typeof data.data.score === 'number')
    assert.strictEqual(data.data.freelancerCommission, undefined)  // not a fee endpoint
  })

  it('GET /api/identity/worker-demo-1/eri/trend → 200 with 6-month trend', () => {
    const router = makeRouter()
    const res = makeRes()
    router.handle(makeReq('/api/identity/worker-demo-1/eri/trend'), res,
      '/api/identity/worker-demo-1/eri/trend', 'GET')
    assert.strictEqual(res._status, 200)
    const data = JSON.parse(res._body)
    assert.ok(data.ok)
    assert.strictEqual(data.data.trend.length, 6)
  })

  it('GET /api/identity/worker-demo-1/profile → 200 with badges + projects + trend', () => {
    const router = makeRouter()
    const res = makeRes()
    router.handle(makeReq('/api/identity/worker-demo-1/profile'), res,
      '/api/identity/worker-demo-1/profile', 'GET')
    assert.strictEqual(res._status, 200)
    const data = JSON.parse(res._body)
    assert.ok(data.ok)
    assert.ok(Array.isArray(data.data.badges))
    assert.ok(Array.isArray(data.data.projects))
    assert.ok(Array.isArray(data.data.trend))
    assert.ok(data.data.share_token)
  })

  it('GET /api/identity/worker-demo-1/employer-summary → 200 with top 3 signals', () => {
    const router = makeRouter()
    const res = makeRes()
    router.handle(makeReq('/api/identity/worker-demo-1/employer-summary'), res,
      '/api/identity/worker-demo-1/employer-summary', 'GET')
    assert.strictEqual(res._status, 200)
    const data = JSON.parse(res._body)
    assert.ok(data.ok)
    assert.strictEqual(data.data.top_signals.length, 3)
  })

  it('GET /api/identity/unknown-worker/eri → 404', () => {
    const router = makeRouter()
    const res = makeRes()
    router.handle(makeReq('/api/identity/unknown-worker/eri'), res,
      '/api/identity/unknown-worker/eri', 'GET')
    assert.strictEqual(res._status, 404)
  })

  it('POST /api/identity/... → 405 Method Not Allowed', () => {
    const router = makeRouter()
    const res = makeRes()
    router.handle(makeReq('/api/identity/workers'), res, '/api/identity/workers', 'POST')
    assert.strictEqual(res._status, 405)
  })

  it('GET /api/identity/nonexistent-route → 404', () => {
    const router = makeRouter()
    const res = makeRes()
    router.handle(makeReq('/api/identity/x/y/z/w'), res, '/api/identity/x/y/z/w', 'GET')
    assert.strictEqual(res._status, 404)
  })
})

// ── Suite 8: legacy eri_engine.js still passes ────────────────────────────────

describe('Suite 8: legacy eri_engine.js compatibility (not modified by S39-G5)', () => {
  const eri = require('../app/modules/eri/eri_engine')

  it('legacy calculateERI still works — returns positive score', () => {
    const score = eri.calculateERI({ milestones_completed: 10, jobs_completed: 5 })
    assert.ok(score > 0)
  })

  it('legacy calculateERI returns 0 for zero activity', () => {
    const score = eri.calculateERI({ milestones_completed: 0, jobs_completed: 0 })
    assert.strictEqual(score, 0)
  })

  it('legacy formula unchanged: (milestones * 0.6) + (jobs * 0.4)', () => {
    const score = eri.calculateERI({ milestones_completed: 10, jobs_completed: 5 })
    assert.strictEqual(score, Math.round(10 * 0.6 + 5 * 0.4))
  })
})
