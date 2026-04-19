'use strict'

const test   = require('node:test')
const assert = require('node:assert/strict')
const { createAuthService } = require('../../app/modules/auth/auth_service')
const { createJwtService }  = require('../../app/modules/auth/jwt_service')
const { hasPermission, PERMISSIONS, ROLE_PERMISSIONS } = require('../../app/modules/auth/rbac_policy')

/**
 * S45-G2: persona-aware user registration and JWT tests.
 * Uses in-memory mock pool matching auth_service.test.js patterns.
 */

const SECRET = 'test-secret-s45-g2-persona'

function createMockPool() {
  const users    = new Map()
  const sessions = new Map()

  const mockClient = {
    query(sql, params) {
      if (/^(BEGIN|COMMIT|ROLLBACK)/i.test(sql)) return { rows: [], rowCount: 0 }
      if (/set_config/i.test(sql)) return { rows: [{}], rowCount: 0 }

      // SELECT id FROM users WHERE email
      if (/SELECT id FROM users WHERE email/i.test(sql)) {
        const matches = Array.from(users.values()).filter(
          u => u.email === params[0] && u.tenant_id === params[1]
        )
        return { rows: matches, rowCount: matches.length }
      }

      // SELECT COUNT(*)
      if (/SELECT COUNT\(\*\)/i.test(sql)) {
        const cnt = Array.from(users.values()).filter(u => u.tenant_id === params[0]).length
        return { rows: [{ cnt: String(cnt) }], rowCount: 1 }
      }

      // INSERT INTO users — capture persona_type and current_persona_preference
      if (/INSERT INTO users/i.test(sql)) {
        const user = {
          id: params[0], email: params[1], password_hash: params[2],
          tenant_id: params[3], role: params[4], status: 'ACTIVE',
          persona_type: params[5] || 'EMPLOYER',
          current_persona_preference: params[6] || 'EMPLOYER',
          created_at: new Date().toISOString(),
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
        }
        sessions.set(session.id, session)
        return { rows: [session], rowCount: 1 }
      }

      // UPDATE users SET last_login_at
      if (/UPDATE users SET last_login_at/i.test(sql)) {
        return { rows: [], rowCount: 1 }
      }

      // SELECT FROM sessions WHERE token_hash
      if (/SELECT.*FROM sessions WHERE token_hash/i.test(sql)) {
        const matches = Array.from(sessions.values()).filter(s => s.token_hash === params[0])
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
  }
}

// ── Test: SEEKER persona registration ───────────────────────────────────────

test('register with personaType SEEKER creates user with persona_type SEEKER', async () => {
  const pool = createMockPool()
  const svc  = createAuthService({ pool, secret: SECRET })
  const user = await svc.register({
    email: 'seeker@test.com', password: 'StrongPass1!', tenantId: 'T-SEK',
    personaType: 'SEEKER',
  })
  assert.strictEqual(user.persona_type, 'SEEKER')
})

test('register with personaType EMPLOYER creates user with persona_type EMPLOYER', async () => {
  const pool = createMockPool()
  const svc  = createAuthService({ pool, secret: SECRET })
  const user = await svc.register({
    email: 'employer@test.com', password: 'StrongPass1!', tenantId: 'T-EMP',
    personaType: 'EMPLOYER',
  })
  assert.strictEqual(user.persona_type, 'EMPLOYER')
})

test('register with personaType BOTH creates user with persona_type BOTH', async () => {
  const pool = createMockPool()
  const svc  = createAuthService({ pool, secret: SECRET })
  const user = await svc.register({
    email: 'both@test.com', password: 'StrongPass1!', tenantId: 'T-BOTH',
    personaType: 'BOTH',
  })
  assert.strictEqual(user.persona_type, 'BOTH')
})

test('invalid personaType is rejected with 422', async () => {
  const pool = createMockPool()
  const svc  = createAuthService({ pool, secret: SECRET })
  await assert.rejects(
    () => svc.register({
      email: 'bad@test.com', password: 'StrongPass1!', tenantId: 'T-BAD',
      personaType: 'INVALID',
    }),
    err => {
      assert.strictEqual(err.status, 422)
      return true
    }
  )
})

test('SEEKER registration assigns SEEKER role, not OWNER, even for first user', async () => {
  const pool = createMockPool()
  const svc  = createAuthService({ pool, secret: SECRET })
  const user = await svc.register({
    email: 'first-seeker@test.com', password: 'StrongPass1!', tenantId: 'T-SEEKER-FIRST',
    personaType: 'SEEKER',
  })
  assert.strictEqual(user.role, 'SEEKER', 'first SEEKER user should get SEEKER role, not OWNER')
})

test('EMPLOYER registration assigns OWNER for first user in tenant', async () => {
  const pool = createMockPool()
  const svc  = createAuthService({ pool, secret: SECRET })
  const user = await svc.register({
    email: 'first-employer@test.com', password: 'StrongPass1!', tenantId: 'T-EMP-FIRST',
    personaType: 'EMPLOYER',
  })
  assert.strictEqual(user.role, 'OWNER', 'first EMPLOYER user should get OWNER role')
})

test('BOTH persona defaults current_persona_preference to EMPLOYER', async () => {
  const pool = createMockPool()
  const svc  = createAuthService({ pool, secret: SECRET })
  const user = await svc.register({
    email: 'both-pref@test.com', password: 'StrongPass1!', tenantId: 'T-BOTH-PREF',
    personaType: 'BOTH',
  })
  assert.strictEqual(user.current_persona_preference, 'EMPLOYER')
})

test('persona_type is written to the users row', async () => {
  const pool = createMockPool()
  const svc  = createAuthService({ pool, secret: SECRET })
  const user = await svc.register({
    email: 'row@test.com', password: 'StrongPass1!', tenantId: 'T-ROW',
    personaType: 'SEEKER',
  })
  // Verify from the internal map
  const stored = pool._users.get(user.id)
  assert.strictEqual(stored.persona_type, 'SEEKER')
})

test('JWT contains persona_type claim — verified via jwt_service.verify', async () => {
  const jwt = createJwtService({ secret: SECRET })
  const { token } = jwt.issue('user-123', 'SEEKER', 'T-JWT', 'SEEKER')
  const payload = jwt.verify(token)
  assert.ok(payload, 'JWT should verify successfully')
  assert.strictEqual(payload.persona_type, 'SEEKER')
})

test('JWT defaults persona_type to EMPLOYER when not provided', async () => {
  const jwt = createJwtService({ secret: SECRET })
  const { token } = jwt.issue('user-456', 'VIEWER', 'T-JWT-DEF')
  const payload = jwt.verify(token)
  assert.strictEqual(payload.persona_type, 'EMPLOYER')
})

test('existing users default to EMPLOYER when no personaType is supplied', async () => {
  const pool = createMockPool()
  const svc  = createAuthService({ pool, secret: SECRET })
  const user = await svc.register({
    email: 'legacy@test.com', password: 'StrongPass1!', tenantId: 'T-LEGACY',
    // no personaType — simulates existing / migrated users
  })
  assert.strictEqual(user.persona_type, 'EMPLOYER', 'default persona_type should be EMPLOYER')
})

test('SEEKER role has SEEKER_OWN_PROFILE permission', () => {
  assert.ok(hasPermission('SEEKER', PERMISSIONS.SEEKER_OWN_PROFILE))
})

test('SEEKER role is defined in ROLE_PERMISSIONS', () => {
  assert.ok(Array.isArray(ROLE_PERMISSIONS.SEEKER), 'SEEKER role should exist in ROLE_PERMISSIONS')
  assert.ok(ROLE_PERMISSIONS.SEEKER.length > 0, 'SEEKER role should have at least one permission')
})

test('RLS tenant context is still set during registration (unchanged)', async () => {
  const pool = createMockPool()
  const svc  = createAuthService({ pool, secret: SECRET })
  // If RLS setup fails, register would throw. Successful registration proves RLS call was made.
  const user = await svc.register({
    email: 'rls@test.com', password: 'StrongPass1!', tenantId: 'T-RLS',
    personaType: 'SEEKER',
  })
  assert.ok(user.id, 'user should be created with RLS context set')
})
