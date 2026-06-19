'use strict'

const assert = require('assert')
const { createAuthService } = require('../../app/modules/auth/auth_service')

/**
 * In-memory pg Pool mock for unit tests.
 * Simulates users + sessions tables.
 */
function createMockPool() {
  const users    = new Map()
  const sessions = new Map()
  let released = false

  const mockClient = {
    query(sql, params) {
      // BEGIN / COMMIT / ROLLBACK
      if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return { rows: [], rowCount: 0 }

      // set_config (RLS tenant context)
      if (/set_config/i.test(sql)) return { rows: [{}], rowCount: 0 }

      // SELECT id FROM users WHERE email = $1 AND tenant_id = $2
      if (/SELECT id FROM users WHERE email/i.test(sql)) {
        const matches = Array.from(users.values()).filter(
          u => u.email === params[0] && u.tenant_id === params[1]
        )
        return { rows: matches, rowCount: matches.length }
      }

      // SELECT COUNT(*) FROM users WHERE tenant_id
      if (/SELECT COUNT\(\*\)/i.test(sql)) {
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

      // SELECT ... FROM users WHERE email = $1 AND tenant_id = $2 (login)
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

      // SELECT ... FROM users WHERE id
      if (/FROM users WHERE id/i.test(sql)) {
        const u = users.get(params[0])
        if (!u) return { rows: [], rowCount: 0 }
        const { password_hash, ...safe } = u
        return { rows: [safe], rowCount: 1 }
      }

      // SELECT ... FROM sessions WHERE user_id
      if (/FROM sessions WHERE user_id/i.test(sql)) {
        const matches = Array.from(sessions.values())
          .filter(s => s.user_id === params[0])
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
        return { rows: matches, rowCount: matches.length }
      }

      return { rows: [], rowCount: 0 }
    },
    release() { released = true },
  }

  return {
    connect() { released = false; return Promise.resolve(mockClient) },
    query(sql, params) { return Promise.resolve(mockClient.query(sql, params)) },
    _users: users,
    _sessions: sessions,
  }
}

async function run() {
  let passed = 0
  const secret = 'test-secret-for-auth-service-tests'
  const pool = createMockPool()
  const svc = createAuthService({ pool, secret })

  // 1. register creates user with OWNER role (first in tenant)
  {
    const user = await svc.register({
      email: 'owner@test.com', password: 'StrongPass1!', tenantId: 'T1',
    })
    assert.strictEqual(user.email, 'owner@test.com')
    assert.strictEqual(user.role, 'OWNER')
    assert.strictEqual(user.tenant_id, 'T1')
    passed++
    console.log('  ✓ first user in tenant gets OWNER role')
  }

  // 2. register second user gets VIEWER by default
  {
    const user = await svc.register({
      email: 'viewer@test.com', password: 'StrongPass2!', tenantId: 'T1',
    })
    assert.strictEqual(user.role, 'VIEWER')
    passed++
    console.log('  ✓ second user defaults to VIEWER role')
  }

  // 3. register with explicit role
  {
    const user = await svc.register({
      email: 'mgr@test.com', password: 'StrongPass3!', tenantId: 'T1', role: 'HIRING_MANAGER',
    })
    assert.strictEqual(user.role, 'HIRING_MANAGER')
    passed++
    console.log('  ✓ register respects explicit role')
  }

  // 4. register rejects duplicate email in same tenant
  {
    try {
      await svc.register({
        email: 'owner@test.com', password: 'StrongPass1!', tenantId: 'T1',
      })
      assert.fail('should throw')
    } catch (e) {
      assert.strictEqual(e.status, 409)
    }
    passed++
    console.log('  ✓ register rejects duplicate email in same tenant')
  }

  // 5. register rejects invalid role
  {
    try {
      await svc.register({
        email: 'bad@test.com', password: 'StrongPass4!', tenantId: 'T1', role: 'SUPERUSER',
      })
      assert.fail('should throw')
    } catch (e) {
      assert.strictEqual(e.status, 422)
    }
    passed++
    console.log('  ✓ register rejects invalid role')
  }

  // 6. register rejects missing fields
  {
    try {
      await svc.register({ email: 'x@test.com' })
      assert.fail('should throw')
    } catch (e) {
      assert.strictEqual(e.status, 400)
    }
    passed++
    console.log('  ✓ register rejects missing fields')
  }

  // 7. login returns token and user info
  {
    const result = await svc.login({
      email: 'owner@test.com', password: 'StrongPass1!', tenantId: 'T1',
    })
    assert.ok(result.token)
    assert.ok(result.expiresAt)
    assert.strictEqual(result.user.email, 'owner@test.com')
    assert.strictEqual(result.user.role, 'OWNER')
    passed++
    console.log('  ✓ login returns token and user info')
  }

  // 8. login rejects wrong password
  {
    try {
      await svc.login({
        email: 'owner@test.com', password: 'WrongPass!', tenantId: 'T1',
      })
      assert.fail('should throw')
    } catch (e) {
      assert.strictEqual(e.status, 401)
    }
    passed++
    console.log('  ✓ login rejects wrong password')
  }

  // 9. login rejects unknown email
  {
    try {
      await svc.login({
        email: 'nobody@test.com', password: 'StrongPass1!', tenantId: 'T1',
      })
      assert.fail('should throw')
    } catch (e) {
      assert.strictEqual(e.status, 401)
    }
    passed++
    console.log('  ✓ login rejects unknown email')
  }

  // 10. verifySession returns payload for valid token
  {
    const { token } = await svc.login({
      email: 'viewer@test.com', password: 'StrongPass2!', tenantId: 'T1',
    })
    const payload = await svc.verifySession(token)
    assert.ok(payload)
    assert.strictEqual(payload.role, 'VIEWER')
    passed++
    console.log('  ✓ verifySession returns payload for valid token')
  }

  // 11. verifySession returns null for invalid token
  {
    const result = await svc.verifySession('invalid.token.here')
    assert.strictEqual(result, null)
    passed++
    console.log('  ✓ verifySession returns null for invalid token')
  }

  // 12. refreshSession returns new token
  {
    const { token } = await svc.login({
      email: 'owner@test.com', password: 'StrongPass1!', tenantId: 'T1',
    })
    const refreshed = await svc.refreshSession(token)
    assert.ok(refreshed)
    assert.notStrictEqual(refreshed.token, token)
    passed++
    console.log('  ✓ refreshSession returns new token')
  }

  // 13. refreshSession returns null for invalid token
  {
    const result = await svc.refreshSession('bad.token.value')
    assert.strictEqual(result, null)
    passed++
    console.log('  ✓ refreshSession returns null for invalid token')
  }

  // 14. revokeAllSessions clears all sessions for user
  {
    const { token, user } = await svc.login({
      email: 'owner@test.com', password: 'StrongPass1!', tenantId: 'T1',
    })
    // Login again to create a second session
    await svc.login({
      email: 'owner@test.com', password: 'StrongPass1!', tenantId: 'T1',
    })
    const count = await svc.revokeAllSessions(user.id, user.tenant_id)
    assert.ok(count >= 2)
    passed++
    console.log('  ✓ revokeAllSessions clears all sessions for user')
  }

  // 15. getUserById returns user without password_hash
  {
    const reg = await svc.register({
      email: 'getme@test.com', password: 'StrongPass5!', tenantId: 'T2',
    })
    const user = await svc.getUserById(reg.id)
    assert.ok(user)
    assert.strictEqual(user.email, 'getme@test.com')
    assert.strictEqual(user.password_hash, undefined)
    passed++
    console.log('  ✓ getUserById returns user without password_hash')
  }

  // 16. getUserById returns null for unknown id
  {
    const user = await svc.getUserById('nonexistent-id')
    assert.strictEqual(user, null)
    passed++
    console.log('  ✓ getUserById returns null for unknown id')
  }

  // 17. login normalizes email to lowercase
  {
    await svc.register({
      email: 'UPPER@test.com', password: 'StrongPass6!', tenantId: 'T3',
    })
    const result = await svc.login({
      email: 'upper@test.com', password: 'StrongPass6!', tenantId: 'T3',
    })
    assert.ok(result.token)
    passed++
    console.log('  ✓ login normalizes email to lowercase')
  }

  // 18. constructor rejects missing pool
  {
    try {
      createAuthService({ secret: 'x' })
      assert.fail('should throw')
    } catch (e) {
      assert.ok(e.message.includes('pool'))
    }
    passed++
    console.log('  ✓ constructor rejects missing pool')
  }

  // 19. constructor rejects missing secret
  {
    try {
      createAuthService({ pool })
      assert.fail('should throw')
    } catch (e) {
      assert.ok(e.message.includes('JWT_SECRET'))
    }
    passed++
    console.log('  ✓ constructor rejects missing secret')
  }

  // 20. login creates session record
  {
    const pool2 = createMockPool()
    const svc2  = createAuthService({ pool: pool2, secret })
    await svc2.register({
      email: 'session@test.com', password: 'StrongPass7!', tenantId: 'T4',
    })
    const { user } = await svc2.login({
      email: 'session@test.com', password: 'StrongPass7!', tenantId: 'T4',
      ipAddress: '10.0.0.1', userAgent: 'TestAgent/1.0',
    })
    const sessions = await svc2.listSessions(user.id, user.tenant_id)
    assert.strictEqual(sessions.length, 1)
    assert.strictEqual(sessions[0].ip_address, '10.0.0.1')
    assert.strictEqual(sessions[0].user_agent, 'TestAgent/1.0')
    passed++
    console.log('  ✓ login creates session with ip and user-agent')
  }

  // 21. same email can register in different tenants
  {
    const pool3 = createMockPool()
    const svc3  = createAuthService({ pool: pool3, secret })
    const u1 = await svc3.register({
      email: 'multi@test.com', password: 'StrongPass8!', tenantId: 'TX',
    })
    const u2 = await svc3.register({
      email: 'multi@test.com', password: 'StrongPass9!', tenantId: 'TY',
    })
    assert.strictEqual(u1.tenant_id, 'TX')
    assert.strictEqual(u2.tenant_id, 'TY')
    assert.notStrictEqual(u1.id, u2.id)
    passed++
    console.log('  ✓ same email can register in different tenants')
  }

  // 22. login rejects suspended account
  {
    const pool4 = createMockPool()
    const svc4  = createAuthService({ pool: pool4, secret })
    const reg = await svc4.register({
      email: 'suspended@test.com', password: 'StrongPassA!', tenantId: 'T5',
    })
    // Manually suspend the user in mock
    pool4._users.get(reg.id).status = 'SUSPENDED'
    try {
      await svc4.login({
        email: 'suspended@test.com', password: 'StrongPassA!', tenantId: 'T5',
      })
      assert.fail('should throw')
    } catch (e) {
      assert.strictEqual(e.status, 403)
      assert.ok(e.message.includes('suspended'))
    }
    passed++
    console.log('  ✓ login rejects suspended account')
  }

  // 23. role field is not writable by auth service (security boundary)
  {
    // auth_service exposes no updateUser / updateRole method
    assert.strictEqual(typeof svc.updateUser, 'undefined', 'no updateUser method should exist')
    assert.strictEqual(typeof svc.updateRole, 'undefined', 'no updateRole method should exist')
    assert.strictEqual(typeof svc.setRole,    'undefined', 'no setRole method should exist')

    // register() sets role at INSERT time only — verify the INSERT SQL
    // uses a parameter for role (position $5) but auth_service has no
    // method to UPDATE the role column after creation.
    // Confirm by inspecting the source: no SQL contains "UPDATE users SET role"
    const authSource = require('fs').readFileSync(
      require('path').join(__dirname, '../../app/modules/auth/auth_service.js'), 'utf8'
    )
    assert.ok(
      !authSource.includes('UPDATE users SET role'),
      'auth_service must never contain UPDATE users SET role'
    )
    assert.ok(
      !authSource.includes('SET role ='),
      'auth_service must never contain SET role ='
    )
    // login() only reads role, never writes it
    assert.ok(
      !authSource.includes("role = $"),
      'auth_service must never parameterize role in an UPDATE'
    )
    passed++
    console.log('  ✓ role field is not writable by auth service (security boundary)')
  }

  console.log(`  auth_service: ${passed}/23 passed`)
  return passed
}

module.exports = { run }

if (require.main === module) {
  run().then(p => process.exit(p === 23 ? 0 : 1))
}
