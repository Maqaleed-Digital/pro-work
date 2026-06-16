'use strict'

const assert = require('assert')
const crypto = require('crypto')
const { createAuthRouter } = require('../../app/api/auth_router')
const { createAuthService } = require('../../app/modules/auth/auth_service')
const { requireAuth, requireRole } = require('../../app/modules/auth/auth_middleware')

/**
 * Mock pg Pool — same as auth_service.test.js but extended with tenants table.
 */
function createMockPool() {
  const users    = new Map()
  const sessions = new Map()
  const tenants  = new Map()
  const tosAcceptances = []

  // Transaction snapshot state (shared by pool + client). Deep-copied on BEGIN,
  // restored on ROLLBACK, discarded on COMMIT.
  const state = { snapshot: null, failNextTosInsert: false }

  function snapshot() {
    state.snapshot = {
      users:   new Map(Array.from(users.entries()).map(([k, v]) => [k, { ...v }])),
      tenants: new Map(Array.from(tenants.entries()).map(([k, v]) => [k, { ...v }])),
      tos:     tosAcceptances.map(r => ({ ...r })),
    }
  }
  function restore() {
    if (!state.snapshot) return
    users.clear();   for (const [k, v] of state.snapshot.users)   users.set(k, v)
    tenants.clear(); for (const [k, v] of state.snapshot.tenants) tenants.set(k, v)
    tosAcceptances.length = 0; for (const r of state.snapshot.tos) tosAcceptances.push(r)
    state.snapshot = null
  }

  const mockClient = {
    async query(sql, params) {
      if (/^BEGIN/i.test(sql))    { snapshot(); return { rows: [], rowCount: 0 } }
      if (/^ROLLBACK/i.test(sql)) { restore();  return { rows: [], rowCount: 0 } }
      if (/^COMMIT/i.test(sql))   { state.snapshot = null; return { rows: [], rowCount: 0 } }
      if (/set_config/i.test(sql)) return { rows: [{}], rowCount: 0 }

      // INSERT INTO tos_acceptances (WC-02)
      if (/INSERT INTO tos_acceptances/i.test(sql)) {
        if (state.failNextTosInsert) {
          state.failNextTosInsert = false
          throw Object.assign(new Error('simulated tos_acceptances insert failure'), { status: 500 })
        }
        const row = {
          user_id: params[0], tenant_id: params[1],
          tos_version: params[2], acceptance_source: params[3],
        }
        tosAcceptances.push(row)
        return { rows: [row], rowCount: 1 }
      }

      // INSERT INTO tenants
      if (/INSERT INTO tenants/i.test(sql)) {
        tenants.set(params[0], { id: params[0], name: params[1], status: 'active', config: params[2] })
        return { rows: [tenants.get(params[0])], rowCount: 1 }
      }

      // DELETE FROM tenants
      if (/DELETE FROM tenants/i.test(sql)) {
        tenants.delete(params[0])
        return { rows: [], rowCount: 1 }
      }

      // SELECT tenant_id FROM users WHERE email
      if (/SELECT tenant_id FROM users WHERE email/i.test(sql)) {
        const matches = Array.from(users.values()).filter(u => u.email === params[0])
        return { rows: matches.map(u => ({ tenant_id: u.tenant_id })), rowCount: matches.length }
      }

      // SELECT id FROM users WHERE email AND tenant_id
      if (/SELECT id FROM users WHERE email/i.test(sql)) {
        const matches = Array.from(users.values()).filter(
          u => u.email === params[0] && u.tenant_id === params[1]
        )
        return { rows: matches, rowCount: matches.length }
      }

      // SELECT COUNT
      if (/SELECT COUNT/i.test(sql)) {
        const cnt = Array.from(users.values()).filter(u => u.tenant_id === params[0]).length
        return { rows: [{ cnt: String(cnt) }], rowCount: 1 }
      }

      // INSERT INTO users
      if (/INSERT INTO users/i.test(sql)) {
        const user = {
          id: params[0], email: params[1], password_hash: params[2],
          tenant_id: params[3], role: params[4], status: 'ACTIVE',
          created_at: new Date().toISOString(), last_login_at: null,
        }
        users.set(user.id, user)
        const { password_hash, ...safe } = user
        return { rows: [safe], rowCount: 1 }
      }

      // SELECT ... password_hash FROM users (login)
      if (/SELECT.*password_hash.*FROM users/i.test(sql)) {
        const matches = Array.from(users.values()).filter(
          u => u.email === params[0] && u.tenant_id === params[1]
        )
        return { rows: matches, rowCount: matches.length }
      }

      // INSERT INTO sessions
      if (/INSERT INTO sessions/i.test(sql)) {
        const session = {
          id: params[0], user_id: params[1], token_hash: params[2],
          expires_at: params[3], created_at: new Date().toISOString(),
          ip_address: params[4], user_agent: params[5],
        }
        sessions.set(session.id, session)
        return { rows: [session], rowCount: 1 }
      }

      // UPDATE users SET last_login_at
      if (/UPDATE users SET last_login_at/i.test(sql)) {
        const u = users.get(params[0])
        if (u) u.last_login_at = new Date().toISOString()
        return { rows: [], rowCount: u ? 1 : 0 }
      }

      // DELETE FROM sessions WHERE token_hash (must be before SELECT pattern)
      if (/DELETE FROM sessions WHERE token_hash/i.test(sql)) {
        for (const [k, v] of sessions) {
          if (v.token_hash === params[0]) { sessions.delete(k); break }
        }
        return { rows: [], rowCount: 1 }
      }

      // SELECT FROM sessions WHERE token_hash
      if (/SELECT.*FROM sessions WHERE token_hash/i.test(sql)) {
        const matches = Array.from(sessions.values()).filter(s => s.token_hash === params[0])
        return { rows: matches, rowCount: matches.length }
      }

      // DELETE FROM sessions WHERE id
      if (/DELETE FROM sessions WHERE id = /i.test(sql)) {
        const had = sessions.has(params[0])
        sessions.delete(params[0])
        return { rows: had ? [{ id: params[0] }] : [], rowCount: had ? 1 : 0 }
      }

      // DELETE FROM sessions WHERE user_id
      if (/DELETE FROM sessions WHERE user_id/i.test(sql)) {
        let count = 0
        for (const [k, v] of sessions) {
          if (v.user_id === params[0]) { sessions.delete(k); count++ }
        }
        return { rows: [], rowCount: count }
      }

      // SELECT FROM users WHERE id
      if (/FROM users WHERE id/i.test(sql)) {
        const u = users.get(params[0])
        if (!u) return { rows: [], rowCount: 0 }
        const { password_hash, ...safe } = u
        return { rows: [safe], rowCount: 1 }
      }

      // SELECT FROM sessions WHERE user_id
      if (/FROM sessions WHERE user_id/i.test(sql)) {
        const matches = Array.from(sessions.values())
          .filter(s => s.user_id === params[0])
        return { rows: matches, rowCount: matches.length }
      }

      return { rows: [], rowCount: 0 }
    },
    release() {},
  }

  const pool = {
    connect() { return Promise.resolve(mockClient) },
    query(sql, params) { return Promise.resolve(mockClient.query(sql, params)) },
    _users: users,
    _sessions: sessions,
    _tenants: tenants,
    tosAcceptances,
  }
  // Injectable failure hook: setting this makes the next tos_acceptances INSERT throw.
  Object.defineProperty(pool, 'failNextTosInsert', {
    get() { return state.failNextTosInsert },
    set(v) { state.failNextTosInsert = v },
  })
  return pool
}

/**
 * Mock HTTP response that captures status + body.
 */
function createMockRes() {
  let _status = 200
  let _body = ''
  let _headers = {}
  return {
    writeHead(s, h) { _status = s; Object.assign(_headers, h || {}) },
    end(b) { _body = b || '' },
    get status() { return _status },
    get body()   { return _body ? JSON.parse(_body) : null },
    get headers() { return _headers },
  }
}

function createMockReq(method, path, headers, socket) {
  return {
    method,
    url: path,
    headers: headers || {},
    socket: socket || { remoteAddress: '127.0.0.1' },
  }
}

async function run() {
  let passed = 0
  const secret = 'test-jwt-secret-for-router-tests!'
  const pool = createMockPool()
  const authService = createAuthService({ pool, secret })
  const router = createAuthRouter({ authService, pool })

  // ── Register ───────────────────────────────────────────────────────────

  // 1. register creates tenant + owner user
  let ownerToken
  {
    const req = createMockReq('POST', '/api/auth/register', { 'content-type': 'application/json' })
    const res = createMockRes()
    await router.handle(req, res, '/api/auth/register', 'POST', {
      email: 'owner@company.com', password: 'StrongPass1!', companyName: 'Acme Corp', tosAccepted: true,
    })
    assert.strictEqual(res.status, 201)
    assert.ok(res.body.ok)
    assert.ok(res.body.data.token)
    assert.strictEqual(res.body.data.user.role, 'OWNER')
    assert.strictEqual(res.body.data.tenant.name, 'Acme Corp')
    ownerToken = res.body.data.token
    passed++
    console.log('  ✓ register creates tenant + owner user')
  }

  // 2. register rejects missing companyName
  {
    const res = createMockRes()
    await router.handle(createMockReq('POST', '/api/auth/register'), res, '/api/auth/register', 'POST', {
      email: 'x@y.com', password: 'StrongPass2!',
    })
    assert.strictEqual(res.status, 422)
    assert.ok(res.body.error.message.includes('companyName'))
    passed++
    console.log('  ✓ register rejects missing companyName')
  }

  // 3. register rejects missing email
  {
    const res = createMockRes()
    await router.handle(createMockReq('POST', '/api/auth/register'), res, '/api/auth/register', 'POST', {
      password: 'StrongPass3!', companyName: 'Test',
    })
    assert.strictEqual(res.status, 422)
    passed++
    console.log('  ✓ register rejects missing email')
  }

  // 4. register rejects missing password
  {
    const res = createMockRes()
    await router.handle(createMockReq('POST', '/api/auth/register'), res, '/api/auth/register', 'POST', {
      email: 'x@y.com', companyName: 'Test',
    })
    assert.strictEqual(res.status, 422)
    passed++
    console.log('  ✓ register rejects missing password')
  }

  // 5. register rejects missing body
  {
    const res = createMockRes()
    await router.handle(createMockReq('POST', '/api/auth/register'), res, '/api/auth/register', 'POST', null)
    assert.strictEqual(res.status, 400)
    passed++
    console.log('  ✓ register rejects missing body')
  }

  // ── Login ──────────────────────────────────────────────────────────────

  // 6. login returns valid JWT
  {
    const res = createMockRes()
    await router.handle(createMockReq('POST', '/api/auth/login'), res, '/api/auth/login', 'POST', {
      email: 'owner@company.com', password: 'StrongPass1!',
    })
    assert.strictEqual(res.status, 200)
    assert.ok(res.body.data.token)
    assert.strictEqual(res.body.data.user.email, 'owner@company.com')
    passed++
    console.log('  ✓ login returns valid JWT')
  }

  // 7. login rejects wrong password → 401
  {
    const res = createMockRes()
    await router.handle(createMockReq('POST', '/api/auth/login'), res, '/api/auth/login', 'POST', {
      email: 'owner@company.com', password: 'WrongPass!',
    })
    assert.strictEqual(res.status, 401)
    passed++
    console.log('  ✓ invalid password returns 401')
  }

  // 8. login rejects unknown email → 401
  {
    const res = createMockRes()
    await router.handle(createMockReq('POST', '/api/auth/login'), res, '/api/auth/login', 'POST', {
      email: 'nobody@company.com', password: 'StrongPass1!',
    })
    assert.strictEqual(res.status, 401)
    passed++
    console.log('  ✓ unknown email returns 401')
  }

  // 9. login rejects missing body
  {
    const res = createMockRes()
    await router.handle(createMockReq('POST', '/api/auth/login'), res, '/api/auth/login', 'POST', null)
    assert.strictEqual(res.status, 400)
    passed++
    console.log('  ✓ login rejects missing body')
  }

  // 10. login rejects missing email
  {
    const res = createMockRes()
    await router.handle(createMockReq('POST', '/api/auth/login'), res, '/api/auth/login', 'POST', {
      password: 'StrongPass1!',
    })
    assert.strictEqual(res.status, 422)
    passed++
    console.log('  ✓ login rejects missing email')
  }

  // ── /me ────────────────────────────────────────────────────────────────

  // 11. /me returns correct user with valid token
  {
    const req = createMockReq('GET', '/api/auth/me', { authorization: `Bearer ${ownerToken}` })
    const res = createMockRes()
    await router.handle(req, res, '/api/auth/me', 'GET', null)
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.body.data.email, 'owner@company.com')
    assert.strictEqual(res.body.data.role, 'OWNER')
    passed++
    console.log('  ✓ /me returns correct user')
  }

  // 12. /me rejects missing auth header
  {
    const req = createMockReq('GET', '/api/auth/me', {})
    const res = createMockRes()
    await router.handle(req, res, '/api/auth/me', 'GET', null)
    assert.strictEqual(res.status, 401)
    passed++
    console.log('  ✓ /me rejects missing auth header')
  }

  // 13. /me rejects invalid token
  {
    const req = createMockReq('GET', '/api/auth/me', { authorization: 'Bearer invalid.token.here' })
    const res = createMockRes()
    await router.handle(req, res, '/api/auth/me', 'GET', null)
    assert.strictEqual(res.status, 401)
    passed++
    console.log('  ✓ /me rejects invalid token')
  }

  // ── Logout ─────────────────────────────────────────────────────────────

  // 14. logout revokes session
  {
    // Login first to get a fresh token
    const loginRes = createMockRes()
    await router.handle(createMockReq('POST', '/api/auth/login'), loginRes, '/api/auth/login', 'POST', {
      email: 'owner@company.com', password: 'StrongPass1!',
    })
    const token = loginRes.body.data.token

    // Logout
    const req = createMockReq('POST', '/api/auth/logout', { authorization: `Bearer ${token}` })
    const res = createMockRes()
    await router.handle(req, res, '/api/auth/logout', 'POST', null)
    assert.strictEqual(res.status, 200)

    // Verify token no longer valid on /me
    const meReq = createMockReq('GET', '/api/auth/me', { authorization: `Bearer ${token}` })
    const meRes = createMockRes()
    await router.handle(meReq, meRes, '/api/auth/me', 'GET', null)
    assert.strictEqual(meRes.status, 401)
    passed++
    console.log('  ✓ logout revokes session')
  }

  // 15. logout rejects missing auth
  {
    const res = createMockRes()
    await router.handle(createMockReq('POST', '/api/auth/logout', {}), res, '/api/auth/logout', 'POST', null)
    assert.strictEqual(res.status, 401)
    passed++
    console.log('  ✓ logout rejects missing auth')
  }

  // ── Refresh ────────────────────────────────────────────────────────────

  // 16. refresh returns new token
  {
    const loginRes = createMockRes()
    await router.handle(createMockReq('POST', '/api/auth/login'), loginRes, '/api/auth/login', 'POST', {
      email: 'owner@company.com', password: 'StrongPass1!',
    })
    const oldToken = loginRes.body.data.token

    const req = createMockReq('POST', '/api/auth/refresh', { authorization: `Bearer ${oldToken}` })
    const res = createMockRes()
    await router.handle(req, res, '/api/auth/refresh', 'POST', null)
    assert.strictEqual(res.status, 200)
    assert.ok(res.body.data.token)
    assert.notStrictEqual(res.body.data.token, oldToken)
    passed++
    console.log('  ✓ refresh returns new token')
  }

  // 17. refresh rejects missing auth
  {
    const res = createMockRes()
    await router.handle(createMockReq('POST', '/api/auth/refresh', {}), res, '/api/auth/refresh', 'POST', null)
    assert.strictEqual(res.status, 401)
    passed++
    console.log('  ✓ refresh rejects missing auth')
  }

  // ── Middleware ──────────────────────────────────────────────────────────

  // 18. requireAuth attaches req.user on valid token
  {
    const loginRes = createMockRes()
    await router.handle(createMockReq('POST', '/api/auth/login'), loginRes, '/api/auth/login', 'POST', {
      email: 'owner@company.com', password: 'StrongPass1!',
    })
    const token = loginRes.body.data.token

    const mw = requireAuth(authService)
    const req = createMockReq('GET', '/api/admin/stats', { authorization: `Bearer ${token}` })
    const res = createMockRes()
    const ok = await mw(req, res)
    assert.strictEqual(ok, true)
    assert.ok(req.user)
    assert.strictEqual(req.user.role, 'OWNER')
    passed++
    console.log('  ✓ requireAuth attaches req.user on valid token')
  }

  // 19. requireAuth rejects expired/invalid token
  {
    const mw = requireAuth(authService)
    const req = createMockReq('GET', '/api/admin/stats', { authorization: 'Bearer bad.token.data' })
    const res = createMockRes()
    const ok = await mw(req, res)
    assert.strictEqual(ok, false)
    assert.strictEqual(res.status, 401)
    passed++
    console.log('  ✓ requireAuth rejects invalid token')
  }

  // 20. requireRole allows matching role
  {
    const res = createMockRes()
    const user = { id: '1', role: 'OWNER', tenant_id: 'T1' }
    const ok = requireRole(res, user, 'OWNER', 'ADMIN')
    assert.strictEqual(ok, true)
    passed++
    console.log('  ✓ requireRole allows matching role')
  }

  // 21. requireRole rejects non-matching role
  {
    const res = createMockRes()
    const user = { id: '1', role: 'VIEWER', tenant_id: 'T1' }
    const ok = requireRole(res, user, 'OWNER', 'ADMIN')
    assert.strictEqual(ok, false)
    assert.strictEqual(res.status, 403)
    passed++
    console.log('  ✓ requireRole rejects VIEWER from OWNER/ADMIN route')
  }

  // 22. requireRole rejects null user
  {
    const res = createMockRes()
    const ok = requireRole(res, null, 'ADMIN')
    assert.strictEqual(ok, false)
    assert.strictEqual(res.status, 401)
    passed++
    console.log('  ✓ requireRole rejects null user')
  }

  // 23. unknown auth route returns 404
  {
    const res = createMockRes()
    await router.handle(createMockReq('GET', '/api/auth/unknown'), res, '/api/auth/unknown', 'GET', null)
    assert.strictEqual(res.status, 404)
    passed++
    console.log('  ✓ unknown auth route returns 404')
  }

  // 24. login without tenantId resolves tenant from email
  {
    const res = createMockRes()
    await router.handle(createMockReq('POST', '/api/auth/login'), res, '/api/auth/login', 'POST', {
      email: 'owner@company.com', password: 'StrongPass1!',
      // no tenantId — should be looked up from users table
    })
    assert.strictEqual(res.status, 200)
    assert.ok(res.body.data.token)
    passed++
    console.log('  ✓ login without tenantId resolves tenant from email')
  }

  // 25. register with weak password rejects
  {
    const res = createMockRes()
    await router.handle(createMockReq('POST', '/api/auth/register'), res, '/api/auth/register', 'POST', {
      email: 'weak@test.com', password: 'short', companyName: 'Test Co', tosAccepted: true,
    })
    assert.ok(res.status >= 400)
    passed++
    console.log('  ✓ register rejects weak password')
  }

  // ── WC-02: ToS acceptance gate ───────────────────────────────────────────

  // 26. register WITHOUT tosAccepted → 422 and NO user/tenant created
  {
    const usersBefore   = pool._users.size
    const tenantsBefore = pool._tenants.size
    const res = createMockRes()
    await router.handle(createMockReq('POST', '/api/auth/register'), res, '/api/auth/register', 'POST', {
      email: 'no-tos@company.com', password: 'StrongPass9!', companyName: 'NoTos Inc',
    })
    assert.strictEqual(res.status, 422)
    assert.ok(res.body.error.message.includes('Terms of Service'))
    assert.strictEqual(pool._users.size, usersBefore, 'no user should be created')
    assert.strictEqual(pool._tenants.size, tenantsBefore, 'no tenant should be created')
    passed++
    console.log('  ✓ register without tosAccepted → 422, no user/tenant created')
  }

  // 27. register with tosAccepted:true → 201 and records tos_acceptances row
  {
    const res = createMockRes()
    await router.handle(createMockReq('POST', '/api/auth/register'), res, '/api/auth/register', 'POST', {
      email: 'tos-ok@company.com', password: 'StrongPass8!', companyName: 'Tos Co', tosAccepted: true,
    })
    assert.strictEqual(res.status, 201)
    const row = pool.tosAcceptances.find(r => r.acceptance_source === 'auth_register' && r.user_id === res.body.data.user.id)
    assert.ok(row, 'tos_acceptances row should exist for the new user')
    assert.strictEqual(row.tos_version, '2026-06-16.v1')
    assert.strictEqual(row.acceptance_source, 'auth_register')
    passed++
    console.log('  ✓ register with tosAccepted:true → 201, records tos_acceptances row')
  }

  // 28. tos_acceptances insert failure rolls back — no orphaned user/tenant
  {
    const usersBefore   = pool._users.size
    const tenantsBefore = pool._tenants.size
    pool.failNextTosInsert = true
    const res = createMockRes()
    await router.handle(createMockReq('POST', '/api/auth/register'), res, '/api/auth/register', 'POST', {
      email: 'rollback@company.com', password: 'StrongPass7!', companyName: 'Rollback Inc', tosAccepted: true,
    })
    // Errors (non-2xx) because the tos insert threw inside the transaction
    assert.ok(res.status >= 400, 'register should fail when tos insert throws')
    // The whole transaction rolled back — no orphaned user or tenant
    const orphanUser = Array.from(pool._users.values()).find(u => u.email === 'rollback@company.com')
    assert.ok(!orphanUser, 'no orphaned user should remain after rollback')
    assert.strictEqual(pool._users.size, usersBefore, 'user map should be unchanged after rollback')
    assert.strictEqual(pool._tenants.size, tenantsBefore, 'tenant map should be unchanged after rollback')
    passed++
    console.log('  ✓ tos_acceptances insert failure rolls back — no orphaned user/tenant')
  }

  console.log(`  auth_router: ${passed}/28 passed`)
  return passed
}

module.exports = { run }

if (require.main === module) {
  run().then(p => process.exit(p === 28 ? 0 : 1))
}
