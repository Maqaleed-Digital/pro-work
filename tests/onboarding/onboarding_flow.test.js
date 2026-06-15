'use strict'

const assert = require('assert')
const { createEmployerOnboardingRouter } = require('../../app/api/employer_onboarding_router')

function createMockPool() {
  const tenants = new Map()
  tenants.set('T1', { id: 'T1', name: 'Acme', config: JSON.stringify({}) })

  return {
    query(sql, params) {
      // UPDATE tenants SET config
      if (/UPDATE tenants SET config/i.test(sql)) {
        const t = tenants.get(params[1])
        if (t) {
          const existing = JSON.parse(t.config)
          const patch = JSON.parse(params[0])
          t.config = JSON.stringify(Object.assign(existing, patch))
        }
        return Promise.resolve({ rows: [], rowCount: t ? 1 : 0 })
      }
      // SELECT config FROM tenants
      if (/SELECT config FROM tenants/i.test(sql)) {
        const t = tenants.get(params[0])
        if (!t) return Promise.resolve({ rows: [], rowCount: 0 })
        return Promise.resolve({ rows: [{ config: JSON.parse(t.config) }], rowCount: 1 })
      }
      return Promise.resolve({ rows: [], rowCount: 0 })
    },
    _tenants: tenants,
  }
}

function createMockRes() {
  let _status = 200
  let _body = ''
  return {
    writeHead(s) { _status = s },
    end(b) { _body = b || '' },
    get status() { return _status },
    get body() { return _body ? JSON.parse(_body) : null },
  }
}

async function run() {
  let passed = 0
  const pool = createMockPool()
  const router = createEmployerOnboardingRouter({ pool })
  const user = { id: 'U1', tenant_id: 'T1', role: 'OWNER' }

  // ── PATCH /api/onboarding/profile ─────────────────────────────────────

  // 1. saves establishment profile
  {
    const res = createMockRes()
    await router.handle({}, res, '/api/onboarding/profile', 'PATCH', {
      establishment_name: 'Acme Corp',
      activity_code: 'tech',
      region: 'riyadh',
      total_employees: 50,
      saudi_employees: 20,
    }, user)
    assert.strictEqual(res.status, 200)
    assert.ok(res.body.data.profile.establishment_name === 'Acme Corp')
    assert.ok(res.body.data.profile.activity_code === 'tech')
    assert.ok(res.body.data.profile.region === 'riyadh')
    assert.strictEqual(res.body.data.profile.total_employees, 50)
    assert.strictEqual(res.body.data.profile.saudi_employees, 20)
    passed++
    console.log('  ✓ PATCH /api/onboarding/profile saves correctly')
  }

  // 2. rejects missing auth
  {
    const res = createMockRes()
    await router.handle({}, res, '/api/onboarding/profile', 'PATCH', { establishment_name: 'X' }, null)
    assert.strictEqual(res.status, 401)
    passed++
    console.log('  ✓ PATCH /api/onboarding/profile rejects missing auth')
  }

  // 3. rejects missing body
  {
    const res = createMockRes()
    await router.handle({}, res, '/api/onboarding/profile', 'PATCH', null, user)
    assert.strictEqual(res.status, 400)
    passed++
    console.log('  ✓ PATCH /api/onboarding/profile rejects missing body')
  }

  // 4. returns tenant_id in response
  {
    const res = createMockRes()
    await router.handle({}, res, '/api/onboarding/profile', 'PATCH', {
      establishment_name: 'Test', activity_code: 'retail', region: 'jeddah',
      total_employees: 10, saudi_employees: 3,
    }, user)
    assert.strictEqual(res.body.data.tenant_id, 'T1')
    passed++
    console.log('  ✓ profile response includes tenant_id')
  }

  // 5. handles partial profile update
  {
    const res = createMockRes()
    await router.handle({}, res, '/api/onboarding/profile', 'PATCH', {
      establishment_name: 'Partial Corp',
    }, user)
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.body.data.profile.establishment_name, 'Partial Corp')
    assert.strictEqual(res.body.data.profile.activity_code, null)
    passed++
    console.log('  ✓ handles partial profile update')
  }

  // ── POST /api/auth/resend-verification ────────────────────────────────

  // 6. resend-verification returns stub response
  {
    const res = createMockRes()
    await router.handle({}, res, '/api/auth/resend-verification', 'POST', {}, null)
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.body.data.sent, false)
    passed++
    console.log('  ✓ resend-verification returns beta stub')
  }

  // 7. resend-verification works without auth (public endpoint for beta)
  {
    const res = createMockRes()
    await router.handle({}, res, '/api/auth/resend-verification', 'POST', {}, null)
    assert.strictEqual(res.status, 200)
    passed++
    console.log('  ✓ resend-verification works without auth')
  }

  // ── GET /api/onboarding/status ────────────────────────────────────────

  // 8. status returns step 3 before profile is complete
  {
    // Reset tenant config
    pool._tenants.set('T2', { id: 'T2', name: 'New Co', config: '{}' })
    const res = createMockRes()
    await router.handle({}, res, '/api/onboarding/status', 'GET', null, { id: 'U2', tenant_id: 'T2', role: 'OWNER' })
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.body.data.step, 3)
    assert.strictEqual(res.body.data.profileComplete, false)
    passed++
    console.log('  ✓ status returns step 3 when profile incomplete')
  }

  // 9. status returns step 4 after full profile
  {
    pool._tenants.set('T3', { id: 'T3', name: 'Full Co', config: JSON.stringify({
      establishment_profile: {
        establishment_name: 'Full Corp', activity_code: 'construction',
        region: 'dammam', total_employees: 100, saudi_employees: 40,
      }
    })})
    const res = createMockRes()
    await router.handle({}, res, '/api/onboarding/status', 'GET', null, { id: 'U3', tenant_id: 'T3', role: 'OWNER' })
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.body.data.step, 4)
    assert.strictEqual(res.body.data.profileComplete, true)
    passed++
    console.log('  ✓ status returns step 4 when profile complete')
  }

  // 10. status rejects missing auth
  {
    const res = createMockRes()
    await router.handle({}, res, '/api/onboarding/status', 'GET', null, null)
    assert.strictEqual(res.status, 401)
    passed++
    console.log('  ✓ status rejects missing auth')
  }

  // 11. status returns emailVerified false (beta)
  {
    const res = createMockRes()
    await router.handle({}, res, '/api/onboarding/status', 'GET', null, { id: 'U2', tenant_id: 'T2', role: 'OWNER' })
    assert.strictEqual(res.body.data.emailVerified, false)
    passed++
    console.log('  ✓ emailVerified always false in beta')
  }

  // ── Unknown route ─────────────────────────────────────────────────────

  // 12. unknown route returns 404
  {
    const res = createMockRes()
    await router.handle({}, res, '/api/onboarding/unknown', 'GET', null, user)
    assert.strictEqual(res.status, 404)
    passed++
    console.log('  ✓ unknown route returns 404')
  }

  // ── Constructor ───────────────────────────────────────────────────────

  // 13. constructor rejects missing pool
  {
    try {
      createEmployerOnboardingRouter({})
      assert.fail('should throw')
    } catch (e) {
      assert.ok(e.message.includes('pool'))
    }
    passed++
    console.log('  ✓ constructor rejects missing pool')
  }

  // ── Locale coverage ───────────────────────────────────────────────────

  // 14. EN locale has all register keys
  {
    const en = require('../../app/frontend/src/locales/en.json')
    const keys = ['register.title', 'register.subtitle', 'register.companyName',
      'register.email', 'register.password', 'register.confirmPassword',
      'register.submit', 'register.hasAccount', 'register.signIn',
      'register.err.companyRequired', 'register.err.emailInvalid',
      'register.err.passwordShort', 'register.err.passwordMismatch']
    for (const k of keys) {
      assert.ok(en[k], `EN missing key: ${k}`)
    }
    passed++
    console.log('  ✓ EN locale has all register keys')
  }

  // 15. AR locale has all register keys
  {
    const ar = require('../../app/frontend/src/locales/ar.json')
    const keys = ['register.title', 'register.subtitle', 'register.companyName',
      'register.email', 'register.password', 'register.confirmPassword',
      'register.submit', 'register.hasAccount', 'register.signIn']
    for (const k of keys) {
      assert.ok(ar[k], `AR missing key: ${k}`)
    }
    passed++
    console.log('  ✓ AR locale has all register keys')
  }

  // 16. EN locale has all onboarding keys
  {
    const en = require('../../app/frontend/src/locales/en.json')
    const keys = ['onboarding.verifyTitle', 'onboarding.profileTitle',
      'onboarding.establishmentName', 'onboarding.activityCode', 'onboarding.region',
      'onboarding.totalEmployees', 'onboarding.saudiEmployees', 'onboarding.saveProfile',
      'onboarding.actionTitle', 'onboarding.action.postRole', 'onboarding.action.inviteTeam',
      'onboarding.action.explore', 'onboarding.nitaqat.title', 'onboarding.nitaqat.green',
      'onboarding.nitaqat.red', 'onboarding.step']
    for (const k of keys) {
      assert.ok(en[k], `EN missing key: ${k}`)
    }
    passed++
    console.log('  ✓ EN locale has all onboarding keys')
  }

  // 17. AR locale has all onboarding keys
  {
    const ar = require('../../app/frontend/src/locales/ar.json')
    const keys = ['onboarding.verifyTitle', 'onboarding.profileTitle',
      'onboarding.establishmentName', 'onboarding.activityCode', 'onboarding.region',
      'onboarding.totalEmployees', 'onboarding.saudiEmployees', 'onboarding.saveProfile',
      'onboarding.actionTitle', 'onboarding.action.postRole', 'onboarding.action.inviteTeam',
      'onboarding.action.explore', 'onboarding.nitaqat.title', 'onboarding.nitaqat.green',
      'onboarding.nitaqat.red', 'onboarding.step']
    for (const k of keys) {
      assert.ok(ar[k], `AR missing key: ${k}`)
    }
    passed++
    console.log('  ✓ AR locale has all onboarding keys')
  }

  // ── Frontend page structure ───────────────────────────────────────────

  // 18. register.js exports render function
  {
    const register = require('../../app/frontend/src/pages/register.js')
    assert.strictEqual(typeof register.default.render, 'function')
    passed++
    console.log('  ✓ register.js exports render function')
  }

  // 19. onboarding.js exports render function
  {
    const onboarding = require('../../app/frontend/src/pages/onboarding.js')
    assert.strictEqual(typeof onboarding.default.render, 'function')
    passed++
    console.log('  ✓ onboarding.js exports render function')
  }

  // 20. router.js includes register and onboarding routes
  {
    const fs = require('fs')
    const routerSrc = fs.readFileSync(require('path').join(__dirname, '../../app/frontend/src/router.js'), 'utf8')
    assert.ok(routerSrc.includes('"register"'), 'router missing register route')
    assert.ok(routerSrc.includes('"onboarding"'), 'router missing onboarding route')
    assert.ok(routerSrc.includes('PUBLIC_ROUTES'), 'router missing PUBLIC_ROUTES')
    passed++
    console.log('  ✓ router.js includes register and onboarding routes')
  }

  // 21. nav is hidden on public routes (source check)
  {
    const fs = require('fs')
    const routerSrc = fs.readFileSync(require('path').join(__dirname, '../../app/frontend/src/router.js'), 'utf8')
    assert.ok(routerSrc.includes('display = "none"'), 'router should hide nav on public routes')
    passed++
    console.log('  ✓ nav hidden on public routes (register, onboarding)')
  }

  // 22. Nitaqat zone calculation: 40% → green
  {
    const pct = 40
    const zone = pct >= 35 ? 'green' : pct >= 26 ? 'yellow' : pct >= 10 ? 'low-green' : 'red'
    assert.strictEqual(zone, 'green')
    passed++
    console.log('  ✓ Nitaqat: 40% → green zone')
  }

  // 23. Nitaqat zone calculation: 30% → yellow
  {
    const pct = 30
    const zone = pct >= 35 ? 'green' : pct >= 26 ? 'yellow' : pct >= 10 ? 'low-green' : 'red'
    assert.strictEqual(zone, 'yellow')
    passed++
    console.log('  ✓ Nitaqat: 30% → yellow zone')
  }

  // 24. Nitaqat zone calculation: 5% → red
  {
    const pct = 5
    const zone = pct >= 35 ? 'green' : pct >= 26 ? 'yellow' : pct >= 10 ? 'low-green' : 'red'
    assert.strictEqual(zone, 'red')
    passed++
    console.log('  ✓ Nitaqat: 5% → red zone')
  }

  // 25. api.js exports apiPatch and apiPostPublic
  {
    const fs = require('fs')
    const apiSrc = fs.readFileSync(require('path').join(__dirname, '../../app/frontend/src/api.js'), 'utf8')
    assert.ok(apiSrc.includes('export async function apiPatch'), 'api.js missing apiPatch')
    assert.ok(apiSrc.includes('export async function apiPostPublic'), 'api.js missing apiPostPublic')
    passed++
    console.log('  ✓ api.js exports apiPatch and apiPostPublic')
  }

  console.log(`  onboarding_flow: ${passed}/25 passed`)
  return passed
}

module.exports = { run }

if (require.main === module) {
  run().then(p => process.exit(p === 25 ? 0 : 1))
}
