'use strict'

const crypto = require('crypto')
const { createJwtService } = require('./jwt_service')
const passwordService       = require('./password_service')

const VALID_ROLES    = new Set(['OWNER', 'ADMIN', 'HIRING_MANAGER', 'FINANCE_APPROVER', 'VIEWER'])
const VALID_STATUSES = new Set(['ACTIVE', 'INVITED', 'SUSPENDED'])

/**
 * Create the auth service.
 * @param {Object} opts
 * @param {Object} opts.pool     - pg Pool instance
 * @param {string} opts.secret   - JWT secret
 * @param {number} [opts.ttl]    - JWT TTL in seconds
 */
function createAuthService(opts) {
  if (!opts || !opts.pool)   throw new Error('pool is required')
  if (!opts.secret)          throw new Error('JWT_SECRET is required')

  const pool = opts.pool
  const jwt  = createJwtService({ secret: opts.secret, ttl: opts.ttl })

  // ── Tenant context helper ───────────────────────────────────────────────
  async function withTenant(client, tenantId, fn) {
    await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId])
    return fn(client)
  }

  return {
    jwt,

    /**
     * Register a new user. The first user in a tenant gets OWNER role.
     */
    async register({ email, password, tenantId, role, client: extClient }) {
      if (!email || !password || !tenantId) {
        throw Object.assign(new Error('email, password, and tenantId are required'), { status: 400 })
      }
      email = email.toLowerCase().trim()
      if (role && !VALID_ROLES.has(role)) {
        throw Object.assign(new Error(`invalid role: ${role}`), { status: 422 })
      }

      const passwordHash = await passwordService.hash(password)
      // When an external client is passed, the caller owns the transaction
      // (no BEGIN/COMMIT/ROLLBACK/release here). Backward-compatible: callers
      // that pass no client get their own transaction.
      const client = extClient || await pool.connect()
      const ownTx  = !extClient
      try {
        if (ownTx) await client.query('BEGIN')
        await withTenant(client, tenantId, async (c) => {
          // Check for duplicate email within tenant
          const dup = await c.query(
            'SELECT id FROM users WHERE email = $1 AND tenant_id = $2',
            [email, tenantId]
          )
          if (dup.rows.length > 0) {
            throw Object.assign(new Error('email already registered in this tenant'), { status: 409 })
          }
        })

        // Determine role: first user in tenant becomes OWNER
        const countResult = await client.query(
          'SELECT COUNT(*) AS cnt FROM users WHERE tenant_id = $1',
          [tenantId]
        )
        const assignedRole = (parseInt(countResult.rows[0].cnt) === 0) ? 'OWNER' : (role || 'VIEWER')

        const result = await client.query(
          `INSERT INTO users (id, email, password_hash, tenant_id, role, status, created_at)
           VALUES ($1, $2, $3, $4, $5, 'ACTIVE', NOW())
           RETURNING id, email, tenant_id, role, status, created_at`,
          [crypto.randomUUID(), email, passwordHash, tenantId, assignedRole]
        )
        if (ownTx) await client.query('COMMIT')
        return result.rows[0]
      } catch (err) {
        if (ownTx) await client.query('ROLLBACK')
        throw err
      } finally {
        if (ownTx) client.release()
      }
    },

    /**
     * Authenticate a user by email+password. Returns JWT + user info.
     */
    async login({ email, password, tenantId, ipAddress, userAgent }) {
      if (!email || !password || !tenantId) {
        throw Object.assign(new Error('email, password, and tenantId are required'), { status: 400 })
      }
      email = email.toLowerCase().trim()

      const client = await pool.connect()
      try {
        // Set tenant context for RLS
        await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId])

        const result = await client.query(
          'SELECT id, email, password_hash, tenant_id, role, status FROM users WHERE email = $1 AND tenant_id = $2',
          [email, tenantId]
        )
        const user = result.rows[0]
        if (!user) {
          throw Object.assign(new Error('invalid credentials'), { status: 401 })
        }
        if (user.status === 'SUSPENDED') {
          throw Object.assign(new Error('account suspended'), { status: 403 })
        }

        const valid = await passwordService.verify(password, user.password_hash)
        if (!valid) {
          throw Object.assign(new Error('invalid credentials'), { status: 401 })
        }

        // Issue JWT
        const { token, expiresAt, jti } = jwt.issue(user.id, user.role, user.tenant_id)
        const tokenHash = jwt.hashToken(token)

        // Create session
        await client.query(
          `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, ip_address, user_agent)
           VALUES ($1, $2, $3, $4, NOW(), $5, $6)`,
          [crypto.randomUUID(), user.id, tokenHash, expiresAt, ipAddress || null, userAgent || null]
        )

        // Update last_login_at
        await client.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id])

        return {
          token,
          expiresAt,
          user: { id: user.id, email: user.email, role: user.role, tenant_id: user.tenant_id },
        }
      } finally {
        client.release()
      }
    },

    /**
     * Verify a JWT and check session is still valid.
     */
    async verifySession(token) {
      const payload = jwt.verify(token)
      if (!payload) return null

      const tokenHash = jwt.hashToken(token)
      const client = await pool.connect()
      try {
        // Set tenant context for RLS
        if (payload.tenant_id) {
          await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [payload.tenant_id])
        }
        const result = await client.query(
          'SELECT id, user_id, expires_at FROM sessions WHERE token_hash = $1',
          [tokenHash]
        )
        if (result.rows.length === 0) return null

        const session = result.rows[0]
        if (new Date(session.expires_at) < new Date()) return null

        return payload
      } finally {
        client.release()
      }
    },

    /**
     * Refresh a token — revokes old session, creates new one.
     */
    async refreshSession(token, ipAddress, userAgent) {
      const payload = jwt.verify(token)
      if (!payload) return null

      const client = await pool.connect()
      try {
        if (payload.tenant_id) {
          await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [payload.tenant_id])
        }

        const oldHash = jwt.hashToken(token)
        await client.query('DELETE FROM sessions WHERE token_hash = $1', [oldHash])

        const { token: newToken, expiresAt } = jwt.issue(payload.sub, payload.role, payload.tenant_id)
        const newHash = jwt.hashToken(newToken)

        await client.query(
          `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, ip_address, user_agent)
           VALUES ($1, $2, $3, $4, NOW(), $5, $6)`,
          [crypto.randomUUID(), payload.sub, newHash, expiresAt, ipAddress || null, userAgent || null]
        )

        return { token: newToken, expiresAt }
      } finally {
        client.release()
      }
    },

    /**
     * Revoke a session by session ID.
     */
    async revokeSession(sessionId) {
      const result = await pool.query(
        'DELETE FROM sessions WHERE id = $1 RETURNING id',
        [sessionId]
      )
      return result.rowCount > 0
    },

    /**
     * Revoke all sessions for a user (e.g. password change, account suspension).
     */
    async revokeAllSessions(userId) {
      const result = await pool.query(
        'DELETE FROM sessions WHERE user_id = $1',
        [userId]
      )
      return result.rowCount
    },

    /**
     * Get user by ID (excludes password_hash).
     */
    async getUserById(userId) {
      const result = await pool.query(
        'SELECT id, email, tenant_id, role, status, created_at, last_login_at FROM users WHERE id = $1',
        [userId]
      )
      return result.rows[0] || null
    },

    /**
     * List active sessions for a user.
     */
    async listSessions(userId) {
      const result = await pool.query(
        'SELECT id, created_at, expires_at, ip_address, user_agent FROM sessions WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      )
      return result.rows
    },
  }
}

module.exports = { createAuthService }
