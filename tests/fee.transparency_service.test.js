'use strict'

/**
 * S39-G4 — Fee Transparency Service Tests
 *
 * Tests the pure fee calculation functions, payment method listing,
 * competitor comparison, policy constraints, and PSP routing matrix schema.
 *
 * No I/O beyond reading config file. No browser, no server required.
 */

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const path   = require('path')

const {
  calculateFees,
  listPaymentMethods,
  getCompetitorComparison,
  getPolicy,
  round2,
} = require('../app/modules/payments/fee_transparency_service')

const MATRIX_PATH = path.join(__dirname, '../app/config/payments/fee_transparency_policy_v1.json')
const MATRIX = JSON.parse(require('fs').readFileSync(MATRIX_PATH, 'utf8'))

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMatrix(overrides) {
  return Object.assign({}, MATRIX, overrides)
}

// ── Suite 1: Policy — 0% freelancer commission ────────────────────────────────

describe('Suite 1: Policy — 0% freelancer commission (structural)', () => {
  it('policy.freelancer_commission_pct is exactly 0', () => {
    const policy = getPolicy()
    assert.strictEqual(policy.freelancer_commission_pct, 0,
      'Freelancer commission must be structurally 0')
  })

  it('calculateFees: freelancerCommission is always 0 regardless of amount', () => {
    for (const amount of [100, 1000, 50000, 99999.99]) {
      const r = calculateFees(amount, 'bank_transfer_local', { currency: 'SAR' })
      assert.strictEqual(r.freelancerCommission, 0,
        `freelancerCommission must be 0 for amount=${amount}`)
    }
  })

  it('calculateFees: freelancerPayout equals contractAmount exactly', () => {
    const r = calculateFees(5000, 'bank_transfer_local', { currency: 'SAR' })
    assert.strictEqual(r.freelancerPayout, r.contractAmount,
      'Freelancer payout must equal the full contract amount')
  })

  it('policy object is returned by getPolicy()', () => {
    const policy = getPolicy()
    assert.ok(typeof policy === 'object' && policy !== null)
    assert.ok('freelancer_commission_pct' in policy)
    assert.ok('employer_platform_fee_pct' in policy)
  })

  it('employer_platform_fee_pct is positive (employer pays, not freelancer)', () => {
    const policy = getPolicy()
    assert.ok(policy.employer_platform_fee_pct > 0,
      'Employer platform fee must be positive')
  })
})

// ── Suite 2: calculateFees — correct math ────────────────────────────────────

describe('Suite 2: calculateFees — fee math correctness', () => {
  it('employer total cost = contract + platform fee + PSP fee', () => {
    const r = calculateFees(10000, 'bank_transfer_local', { currency: 'SAR' })
    const policy = getPolicy()
    const method = MATRIX.payment_methods.find(m => m.id === 'bank_transfer_local')

    const expectedPlatform = round2(10000 * policy.employer_platform_fee_pct / 100)
    const expectedPsp      = round2(10000 * method.psp_fee_pct / 100)
    const expectedTotal    = round2(10000 + expectedPlatform + expectedPsp)

    assert.strictEqual(r.platformFeeAmount, expectedPlatform)
    assert.strictEqual(r.pspFeeAmount, expectedPsp)
    assert.strictEqual(r.employerTotalCost, expectedTotal)
  })

  it('employer total cost > contract amount (employer pays more)', () => {
    const r = calculateFees(5000, 'bank_transfer_local', { currency: 'SAR' })
    assert.ok(r.employerTotalCost > r.contractAmount,
      'Employer pays more than contract amount due to fees')
  })

  it('freelancerPayout + freelancerCommission = contractAmount', () => {
    for (const method of MATRIX.payment_methods) {
      const currency = method.supported_currencies[0]
      const r = calculateFees(3000, method.id, { currency })
      assert.strictEqual(
        round2(r.freelancerPayout + r.freelancerCommission),
        r.contractAmount,
        `Payout + commission should equal contractAmount for method ${method.id}`,
      )
    }
  })

  it('SADAD: lower PSP fee than SWIFT', () => {
    const sadad = calculateFees(10000, 'sadad', { currency: 'SAR' })
    const swift = calculateFees(10000, 'bank_transfer_swift', { currency: 'SAR' })
    assert.ok(sadad.pspFeeAmount < swift.pspFeeAmount,
      'SADAD should have lower PSP fee than SWIFT')
  })

  it('result includes payoutEtaLabel and payoutEtaLabelAr (both non-empty)', () => {
    const r = calculateFees(2000, 'stc_pay', { currency: 'SAR' })
    assert.ok(typeof r.payoutEtaLabel === 'string' && r.payoutEtaLabel.length > 0)
    assert.ok(typeof r.payoutEtaLabelAr === 'string' && r.payoutEtaLabelAr.length > 0)
  })

  it('result.instant is true for instant methods (SADAD, STC Pay)', () => {
    const sadad  = calculateFees(1000, 'sadad',   { currency: 'SAR' })
    const stcPay = calculateFees(1000, 'stc_pay', { currency: 'SAR' })
    assert.strictEqual(sadad.instant,  true)
    assert.strictEqual(stcPay.instant, true)
  })

  it('result.instant is false for non-instant methods (bank transfer, SWIFT)', () => {
    const local = calculateFees(1000, 'bank_transfer_local', { currency: 'SAR' })
    const swift = calculateFees(1000, 'bank_transfer_swift', { currency: 'SAR' })
    assert.strictEqual(local.instant, false)
    assert.strictEqual(swift.instant, false)
  })
})

// ── Suite 3: calculateFees — input validation ─────────────────────────────────

describe('Suite 3: calculateFees — input validation', () => {
  it('throws INVALID_AMOUNT for non-positive amount', () => {
    assert.throws(
      () => calculateFees(0, 'bank_transfer_local', { currency: 'SAR' }),
      (e) => e.code === 'INVALID_AMOUNT',
    )
  })

  it('throws INVALID_AMOUNT for negative amount', () => {
    assert.throws(
      () => calculateFees(-500, 'bank_transfer_local', { currency: 'SAR' }),
      (e) => e.code === 'INVALID_AMOUNT',
    )
  })

  it('throws INVALID_AMOUNT for NaN', () => {
    assert.throws(
      () => calculateFees(NaN, 'bank_transfer_local', { currency: 'SAR' }),
      (e) => e.code === 'INVALID_AMOUNT',
    )
  })

  it('throws INVALID_AMOUNT for non-number', () => {
    assert.throws(
      () => calculateFees('5000', 'bank_transfer_local', { currency: 'SAR' }),
      (e) => e.code === 'INVALID_AMOUNT',
    )
  })

  it('throws INVALID_PAYMENT_METHOD for missing method', () => {
    assert.throws(
      () => calculateFees(1000, '', { currency: 'SAR' }),
      (e) => e.code === 'INVALID_PAYMENT_METHOD',
    )
  })

  it('throws UNKNOWN_PAYMENT_METHOD for unrecognised method ID', () => {
    assert.throws(
      () => calculateFees(1000, 'crypto_magic', { currency: 'SAR' }),
      (e) => e.code === 'UNKNOWN_PAYMENT_METHOD',
    )
  })

  it('throws UNSUPPORTED_CURRENCY when currency not supported by method', () => {
    // SADAD only supports SAR
    assert.throws(
      () => calculateFees(1000, 'sadad', { currency: 'EUR' }),
      (e) => e.code === 'UNSUPPORTED_CURRENCY',
    )
  })

  it('matrix override is used when provided — does not fall through to file', () => {
    const fakeMatrix = {
      policy: { freelancer_commission_pct: 0, employer_platform_fee_pct: 10 },
      payment_methods: [{
        id: 'test_method',
        psp_fee_pct: 1,
        payout_eta_label: '1 day', payout_eta_label_ar: 'يوم',
        payout_eta_days_min: 1, payout_eta_days_max: 1,
        instant: false,
        supported_currencies: ['SAR'],
        label: 'Test', label_ar: 'اختبار',
      }],
    }
    const r = calculateFees(1000, 'test_method', { currency: 'SAR', matrix: fakeMatrix })
    assert.strictEqual(r.platformFeeAmount, 100)   // 10% of 1000
    assert.strictEqual(r.pspFeeAmount, 10)          // 1% of 1000
    assert.strictEqual(r.employerTotalCost, 1110)
  })
})

// ── Suite 4: listPaymentMethods ───────────────────────────────────────────────

describe('Suite 4: listPaymentMethods', () => {
  it('returns all methods when no currency filter', () => {
    const methods = listPaymentMethods()
    assert.ok(Array.isArray(methods))
    assert.ok(methods.length >= 5, 'Expected at least 5 payment methods')
  })

  it('all methods have required fields', () => {
    const methods = listPaymentMethods()
    for (const m of methods) {
      assert.ok(m.id, `method missing id`)
      assert.ok(m.label, `${m.id} missing label`)
      assert.ok(m.label_ar, `${m.id} missing label_ar (Arabic label required)`)
      assert.ok(m.payout_eta_label, `${m.id} missing payout_eta_label`)
      assert.ok(m.payout_eta_label_ar, `${m.id} missing payout_eta_label_ar (Arabic required)`)
      assert.ok(typeof m.psp_fee_pct === 'number', `${m.id} psp_fee_pct must be number`)
      assert.ok(typeof m.freelancer_deduction_pct === 'number', `${m.id} must have freelancer_deduction_pct`)
      assert.ok(Array.isArray(m.supported_currencies), `${m.id} missing supported_currencies`)
    }
  })

  it('freelancer_deduction_pct is 0 on ALL payment methods', () => {
    const methods = listPaymentMethods()
    for (const m of methods) {
      assert.strictEqual(m.freelancer_deduction_pct, 0,
        `${m.id}: freelancer_deduction_pct must be 0 — structural policy`)
    }
  })

  it('SAR currency filter returns methods that include SAR', () => {
    const methods = listPaymentMethods('SAR')
    assert.ok(methods.length >= 3)
    for (const m of methods) {
      assert.ok(m.supported_currencies.includes('SAR'), `${m.id} should support SAR`)
    }
  })

  it('EUR filter excludes SADAD and STC Pay (KSA-only)', () => {
    const methods = listPaymentMethods('EUR')
    const ids = methods.map(m => m.id)
    assert.ok(!ids.includes('sadad'), 'SADAD should not support EUR')
    assert.ok(!ids.includes('stc_pay'), 'STC Pay should not support EUR')
  })

  it('all methods have notes and notes_ar (Arabic notes required)', () => {
    const methods = listPaymentMethods()
    for (const m of methods) {
      assert.ok(m.notes,    `${m.id} missing notes`)
      assert.ok(m.notes_ar, `${m.id} missing notes_ar (Arabic notes required for RTL)`)
    }
  })
})

// ── Suite 5: PSP routing matrix schema validation ────────────────────────────

describe('Suite 5: PSP routing matrix schema', () => {
  it('matrix file exists at app/config/payments/fee_transparency_policy_v1.json', () => {
    const fs = require('fs')
    assert.ok(fs.existsSync(MATRIX_PATH), 'fee_transparency_policy_v1.json must exist')
  })

  it('matrix has version, policy, payment_methods, competitor_comparison', () => {
    assert.ok(MATRIX.version, 'matrix missing version')
    assert.ok(MATRIX.policy, 'matrix missing policy')
    assert.ok(Array.isArray(MATRIX.payment_methods), 'matrix missing payment_methods array')
    assert.ok(MATRIX.competitor_comparison, 'matrix missing competitor_comparison')
  })

  it('includes SADAD (KSA payment network)', () => {
    const ids = MATRIX.payment_methods.map(m => m.id)
    assert.ok(ids.includes('sadad'), 'Matrix must include SADAD payment method')
  })

  it('includes STC Pay', () => {
    const ids = MATRIX.payment_methods.map(m => m.id)
    assert.ok(ids.includes('stc_pay'), 'Matrix must include STC Pay')
  })

  it('includes international SWIFT method', () => {
    const ids = MATRIX.payment_methods.map(m => m.id)
    assert.ok(ids.includes('bank_transfer_swift'), 'Matrix must include SWIFT method')
  })

  it('competitor_comparison includes WorkCaptain with 0% fee', () => {
    const wc = MATRIX.competitor_comparison.workcaptain
    assert.ok(wc, 'competitor_comparison must include workcaptain')
    assert.strictEqual(wc.freelancer_fee_pct, 0,
      'WorkCaptain competitor entry must show 0% fee')
  })

  it('competitor_comparison includes Upwork, Fiverr entries', () => {
    assert.ok(MATRIX.competitor_comparison.upwork, 'Missing upwork competitor entry')
    assert.ok(MATRIX.competitor_comparison.fiverr, 'Missing fiverr competitor entry')
  })

  it('upwork/fiverr freelancer fees are > 0 (demonstrating advantage)', () => {
    const upwork = MATRIX.competitor_comparison.upwork
    const fiverr = MATRIX.competitor_comparison.fiverr
    assert.ok(
      (upwork.freelancer_fee_pct_range && upwork.freelancer_fee_pct_range[0] > 0) ||
      (upwork.freelancer_fee_pct && upwork.freelancer_fee_pct > 0),
      'Upwork must have positive freelancer fees',
    )
    assert.ok(fiverr.freelancer_fee_pct > 0, 'Fiverr must have positive freelancer fees')
  })
})

// ── Suite 6: Competitor comparison — "what changes, when" positioning ─────────

describe('Suite 6: competitor comparison — fee volatility positioning', () => {
  it('getCompetitorComparison returns object', () => {
    const comp = getCompetitorComparison()
    assert.ok(typeof comp === 'object' && comp !== null)
  })

  it('WorkCaptain entry has fee_volatility: ZERO', () => {
    const comp = getCompetitorComparison()
    assert.ok(comp.workcaptain.fee_volatility.includes('ZERO'),
      'WorkCaptain must document ZERO fee volatility')
  })

  it('Upwork entry has fee_volatility indicating HIGH', () => {
    const comp = getCompetitorComparison()
    assert.ok(comp.upwork.fee_volatility.includes('HIGH'),
      'Upwork must document HIGH fee volatility')
  })

  it('each competitor entry has a fee_note explaining context', () => {
    const comp = getCompetitorComparison()
    for (const [name, entry] of Object.entries(comp)) {
      if (name.startsWith('_')) continue
      const note = entry.freelancer_fee_note
      assert.ok(typeof note === 'string' && note.length > 0,
        `${name} competitor entry missing freelancer_fee_note`)
    }
  })

  it('matrix _comment on WorkCaptain volatility explains structural nature', () => {
    const comp = getCompetitorComparison()
    const wc = comp.workcaptain
    assert.ok(
      wc.freelancer_fee_note.toLowerCase().includes('structural') ||
      wc.fee_volatility.toLowerCase().includes('hardcoded'),
      'WorkCaptain volatility note must explain structural/hardcoded policy',
    )
  })
})

// ── Suite 7: API router — fee transparency endpoints ─────────────────────────

describe('Suite 7: fee_transparency_router — unit-level route dispatch', () => {
  const { createFeeTransparencyRouter } = require('../app/api/fee_transparency_router')

  function makeRes() {
    const res = { _status: null, _body: null, _headers: {} }
    res.writeHead = (status, headers) => { res._status = status; Object.assign(res._headers, headers || {}) }
    res.end = (body) => { res._body = body }
    return res
  }

  function makeReq(url) {
    return { url: url || '/', headers: {} }
  }

  it('GET /api/payments/fee-transparency/policy → 200 with policy', () => {
    const router = createFeeTransparencyRouter()
    const res = makeRes()
    router.handle(makeReq('/api/payments/fee-transparency/policy'), res,
      '/api/payments/fee-transparency/policy', 'GET', null)
    assert.strictEqual(res._status, 200)
    const data = JSON.parse(res._body)
    assert.ok(data.ok)
    assert.strictEqual(data.data.freelancer_commission_pct, 0)
  })

  it('GET /api/payments/fee-transparency/methods → 200 array', () => {
    const router = createFeeTransparencyRouter()
    const res = makeRes()
    router.handle(makeReq('/api/payments/fee-transparency/methods'), res,
      '/api/payments/fee-transparency/methods', 'GET', null)
    assert.strictEqual(res._status, 200)
    const data = JSON.parse(res._body)
    assert.ok(data.ok)
    assert.ok(Array.isArray(data.data))
    assert.ok(data.data.length >= 5)
  })

  it('GET /api/payments/fee-transparency/competitor-comparison → 200', () => {
    const router = createFeeTransparencyRouter()
    const res = makeRes()
    router.handle(makeReq('/api/payments/fee-transparency/competitor-comparison'), res,
      '/api/payments/fee-transparency/competitor-comparison', 'GET', null)
    assert.strictEqual(res._status, 200)
    const data = JSON.parse(res._body)
    assert.ok(data.ok)
    assert.ok(data.data.workcaptain)
  })

  it('POST /api/payments/fee-transparency/calculate → 200 with fee breakdown', () => {
    const router = createFeeTransparencyRouter()
    const res = makeRes()
    router.handle(makeReq('/api/payments/fee-transparency/calculate'), res,
      '/api/payments/fee-transparency/calculate', 'POST',
      { contract_amount: 5000, payment_method_id: 'bank_transfer_local', currency: 'SAR' })
    assert.strictEqual(res._status, 200)
    const data = JSON.parse(res._body)
    assert.ok(data.ok)
    assert.strictEqual(data.data.freelancerCommission, 0)
    assert.strictEqual(data.data.freelancerPayout, 5000)
    assert.ok(data.data.employerTotalCost > 5000)
  })

  it('POST calculate with missing body → 400', () => {
    const router = createFeeTransparencyRouter()
    const res = makeRes()
    router.handle(makeReq('/api/payments/fee-transparency/calculate'), res,
      '/api/payments/fee-transparency/calculate', 'POST', null)
    assert.strictEqual(res._status, 400)
    const data = JSON.parse(res._body)
    assert.strictEqual(data.ok, false)
  })

  it('POST calculate with negative amount → 422', () => {
    const router = createFeeTransparencyRouter()
    const res = makeRes()
    router.handle(makeReq('/api/payments/fee-transparency/calculate'), res,
      '/api/payments/fee-transparency/calculate', 'POST',
      { contract_amount: -100, payment_method_id: 'bank_transfer_local' })
    assert.strictEqual(res._status, 422)
    const data = JSON.parse(res._body)
    assert.strictEqual(data.ok, false)
  })

  it('POST calculate with unknown payment method → 422', () => {
    const router = createFeeTransparencyRouter()
    const res = makeRes()
    router.handle(makeReq('/api/payments/fee-transparency/calculate'), res,
      '/api/payments/fee-transparency/calculate', 'POST',
      { contract_amount: 1000, payment_method_id: 'nonexistent_method' })
    assert.strictEqual(res._status, 422)
    const data = JSON.parse(res._body)
    assert.strictEqual(data.ok, false)
    assert.strictEqual(data.error.code, 'UNKNOWN_PAYMENT_METHOD')
  })

  it('unknown route → 404', () => {
    const router = createFeeTransparencyRouter()
    const res = makeRes()
    router.handle(makeReq('/api/payments/fee-transparency/invalid'), res,
      '/api/payments/fee-transparency/invalid', 'GET', null)
    assert.strictEqual(res._status, 404)
  })
})

// ── Suite 8: round2 utility ───────────────────────────────────────────────────

describe('Suite 8: round2 — two decimal rounding', () => {
  it('round2(1.125) → 1.13 (rounds 5 up for unambiguous value)', () => {
    // 1.125 * 100 = 112.5 exactly → Math.round(112.5) = 113 → 1.13
    assert.strictEqual(round2(1.125), 1.13)
  })

  it('round2(2.333) → 2.33', () => {
    assert.strictEqual(round2(2.333), 2.33)
  })

  it('round2(100) → 100', () => {
    assert.strictEqual(round2(100), 100)
  })

  it('round2(0) → 0', () => {
    assert.strictEqual(round2(0), 0)
  })
})
