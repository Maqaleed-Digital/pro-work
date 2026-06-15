'use strict'

/**
 * Beta Access Service Tests — S39-G6 Part 2
 *
 * Tests service-level limit enforcement:
 *   - max 50 employers
 *   - max 200 freelancers
 *   - max 10 FTE
 */

const { describe, it, before } = require('node:test')
const assert = require('node:assert/strict')
const { createBetaAccessService, InMemoryBetaStore, BETA_LIMITS } = require('../app/modules/beta/beta_access_service')

describe('Beta limits — constants', () => {
  it('employer limit is 50', () => { assert.equal(BETA_LIMITS.employer, 50) })
  it('freelancer limit is 200', () => { assert.equal(BETA_LIMITS.freelancer, 200) })
  it('fte limit is 10', () => { assert.equal(BETA_LIMITS.fte, 10) })
})

describe('Beta enrollment — basic operations', () => {
  let svc

  before(() => {
    svc = createBetaAccessService()
  })

  it('enroll an employer successfully', () => {
    const rec = svc.enroll({ account_id: 'emp-001', account_type: 'employer', tenant_id: 'tenant-1' })
    assert.equal(rec.account_id, 'emp-001')
    assert.equal(rec.account_type, 'employer')
    assert.ok(rec.enrolled_at)
  })

  it('isEnrolled returns true for enrolled account', () => {
    assert.equal(svc.isEnrolled('emp-001'), true)
  })

  it('isEnrolled returns false for unknown account', () => {
    assert.equal(svc.isEnrolled('unknown-id'), false)
  })

  it('getAccount returns record', () => {
    const rec = svc.getAccount('emp-001')
    assert.equal(rec.account_id, 'emp-001')
  })

  it('remove unenrolls account', () => {
    svc.enroll({ account_id: 'emp-temp', account_type: 'employer' })
    const removed = svc.remove('emp-temp')
    assert.equal(removed, true)
    assert.equal(svc.isEnrolled('emp-temp'), false)
  })

  it('remove returns false for unknown account', () => {
    assert.equal(svc.remove('no-such-account'), false)
  })

  it('getSnapshot includes counts and limits', () => {
    const snap = svc.getSnapshot()
    assert.ok(typeof snap.employer === 'number')
    assert.ok(typeof snap.freelancer === 'number')
    assert.ok(typeof snap.fte === 'number')
    assert.deepEqual(snap.limits, BETA_LIMITS)
  })
})

describe('Beta enrollment — validation', () => {
  let svc

  before(() => { svc = createBetaAccessService() })

  it('throws BETA_VALIDATION when account_id missing', () => {
    assert.throws(
      () => svc.enroll({ account_type: 'employer' }),
      (e) => e.code === 'BETA_VALIDATION'
    )
  })

  it('throws BETA_VALIDATION for invalid account_type', () => {
    assert.throws(
      () => svc.enroll({ account_id: 'x', account_type: 'UNKNOWN_TYPE' }),
      (e) => e.code === 'BETA_VALIDATION'
    )
  })

  it('throws BETA_ALREADY_ENROLLED on duplicate enroll', () => {
    svc.enroll({ account_id: 'dup-001', account_type: 'freelancer' })
    assert.throws(
      () => svc.enroll({ account_id: 'dup-001', account_type: 'freelancer' }),
      (e) => e.code === 'BETA_ALREADY_ENROLLED'
    )
  })
})

describe('Beta enrollment — FTE limit enforcement (10 max)', () => {
  let svc

  before(() => {
    svc = createBetaAccessService()
    // Enroll 10 FTE
    for (let i = 1; i <= 10; i++) {
      svc.enroll({ account_id: `fte-${i}`, account_type: 'fte' })
    }
  })

  it('10 FTE enrolled successfully', () => {
    const snap = svc.getSnapshot()
    assert.equal(snap.fte, 10)
  })

  it('11th FTE throws BETA_LIMIT_REACHED', () => {
    assert.throws(
      () => svc.enroll({ account_id: 'fte-11', account_type: 'fte' }),
      (e) => {
        assert.equal(e.code, 'BETA_LIMIT_REACHED')
        assert.equal(e.account_type, 'fte')
        assert.equal(e.current, 10)
        assert.equal(e.max, 10)
        return true
      }
    )
  })

  it('other account types not affected by FTE limit', () => {
    const rec = svc.enroll({ account_id: 'emp-after-fte', account_type: 'employer' })
    assert.equal(rec.account_type, 'employer')
  })

  it('removing an FTE allows re-enrollment', () => {
    svc.remove('fte-10')
    const rec = svc.enroll({ account_id: 'fte-new', account_type: 'fte' })
    assert.equal(rec.account_type, 'fte')
  })
})

describe('Beta enrollment — employer limit enforcement (50 max)', () => {
  let svc

  before(() => {
    svc = createBetaAccessService()
    for (let i = 1; i <= 50; i++) {
      svc.enroll({ account_id: `emp-limit-${i}`, account_type: 'employer' })
    }
  })

  it('50 employers enrolled', () => {
    assert.equal(svc.getSnapshot().employer, 50)
  })

  it('51st employer throws BETA_LIMIT_REACHED', () => {
    assert.throws(
      () => svc.enroll({ account_id: 'emp-51', account_type: 'employer' }),
      (e) => e.code === 'BETA_LIMIT_REACHED' && e.max === 50
    )
  })
})
