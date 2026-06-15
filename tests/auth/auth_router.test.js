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

  const mockClient = {
    query(sql, params) {
      if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return { rows: [], rowCount: 0 }
      if (/set_config/i.test(sql)) return { rows: [{}], rowCount: 0 }

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

  return {
    connect() { return Promise.resolve(mockClient) },
    query(sql, params) { return Promise.resolve(mockClient.query(sql, params)) },
    _users: users,
    _sessions: sessions,
    _tenants: tenants,
  }
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
      email: 'owner@company.com', password: 'StrongPass1!', companyName: 'Acme Corp',
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
      email: 'weak@test.com', password: 'short', companyName: 'Test Co',
    })
    assert.ok(res.status >= 400)
    passed++
    console.log('  ✓ register rejects weak password')
  }

  console.log(`  auth_router: ${passed}/25 passed`)
  return passed
}

module.exports = { run }

if (require.main === module) {
  run().then(p => process.exit(p === 25 ? 0 : 1))
}
