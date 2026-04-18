'use strict'

const crypto = require('crypto')

/**
 * S40-G2: Auth API router.
 *
 * Routes:
 *   POST /api/auth/register  — create tenant + owner user
 *   POST /api/auth/login     — authenticate, return JWT
 *   POST /api/auth/logout    — revoke session
 *   POST /api/auth/refresh   — refresh token
 *   GET  /api/auth/me        — current user info
 *
 * @param {Object} opts
 * @param {Object} opts.authService  — from createAuthService()
 * @param {Object} opts.pool         — pg Pool (for tenant creation)
 */
function createAuthRouter(opts) {
  if (!opts || !opts.authService) throw new Error('authService is required')
  if (!opts.pool) throw new Error('pool is required')

  const authService = opts.authService
  const pool        = opts.pool

  function ok(res, data, status) {
    const body = JSON.stringify({ ok: true, data })
    res.writeHead(status || 200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(body)
  }

  function fail(res, code, message, status) {
    const body = JSON.stringify({ ok: false, error: { code, message } })
    res.writeHead(status || 400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(body)
  }

  function extractToken(req) {
    const h = req.headers && (req.headers.authorization || req.headers.Authorization)
    if (!h) return null
    const parts = String(h).trim().split(/\s+/)
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null
    return parts[1] || null
  }

  async function handle(req, res, pathname, method, body) {

    // ── POST /api/auth/register ─────────────────────────────────────────
    if (pathname === '/api/auth/register' && method === 'POST') {
      if (!body) return fail(res, 'MISSING_BODY', 'request body required', 400)

      const { email, password, companyName, role } = body
      if (!email)       return fail(res, 'VALIDATION_ERROR', 'email is required', 422)
      if (!password)    return fail(res, 'VALIDATION_ERROR', 'password is required', 422)
      if (!companyName) return fail(res, 'VALIDATION_ERROR', 'companyName is required', 422)

      // Create tenant atomically with first user
      const tenantId = 'tn-' + crypto.randomUUID().slice(0, 8)
      try {
        // Insert tenant
        await pool.query(
          `INSERT INTO tenants (id, name, status, config, created_at)
           VALUES ($1, $2, 'active', $3, NOW())`,
          [tenantId, companyName, JSON.stringify({ establishment_profile: {} })]
        )

        // Register owner user
        const user = await authService.register({
          email, password, tenantId, role: role || undefined,
        })

        // Issue JWT immediately (auto-login after registration)
        const loginResult = await authService.login({
          email, password, tenantId,
          ipAddress: req.socket && req.socket.remoteAddress,
          userAgent: req.headers && req.headers['user-agent'],
        })

        return ok(res, {
          token:  loginResult.token,
          user:   loginResult.user,
          tenant: { id: tenantId, name: companyName },
        }, 201)
      } catch (e) {
        // Clean up tenant on failure
        await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]).catch(() => {})
        if (e.status === 409) return fail(res, 'CONFLICT', e.message, 409)
        if (e.status === 422) return fail(res, 'VALIDATION_ERROR', e.message, 422)
        if (e.status)         return fail(res, 'AUTH_ERROR', e.message, e.status)
        return fail(res, 'INTERNAL_ERROR', 'registration failed', 500)
      }
    }

    // ── POST /api/auth/login ────────────────────────────────────────────
    if (pathname === '/api/auth/login' && method === 'POST') {
      if (!body) return fail(res, 'MISSING_BODY', 'request body required', 400)

      const { email, password, tenantId } = body
      if (!email)    return fail(res, 'VALIDATION_ERROR', 'email is required', 422)
      if (!password) return fail(res, 'VALIDATION_ERROR', 'password is required', 422)

      // If tenantId not provided, look up user's tenant by email
      let resolvedTenantId = tenantId
      if (!resolvedTenantId) {
        const lookup = await pool.query(
          'SELECT tenant_id FROM users WHERE email = $1 LIMIT 1',
          [email.toLowerCase().trim()]
        )
        if (lookup.rows.length === 0) {
          return fail(res, 'UNAUTHORIZED', 'invalid credentials', 401)
        }
        resolvedTenantId = lookup.rows[0].tenant_id
      }

      try {
        const result = await authService.login({
          email, password, tenantId: resolvedTenantId,
          ipAddress: req.socket && req.socket.remoteAddress,
          userAgent: req.headers && req.headers['user-agent'],
        })
        return ok(res, result)
      } catch (e) {
        if (e.status === 401) return fail(res, 'UNAUTHORIZED', 'invalid credentials', 401)
        if (e.status === 403) return fail(res, 'FORBIDDEN', e.message, 403)
        return fail(res, 'AUTH_ERROR', 'login failed', 500)
      }
    }

    // ── POST /api/auth/logout ───────────────────────────────────────────
    if (pathname === '/api/auth/logout' && method === 'POST') {
      const token = extractToken(req)
      if (!token) return fail(res, 'UNAUTHORIZED', 'missing Authorization header', 401)

      const payload = authService.jwt.verify(token)
      if (!payload) return fail(res, 'UNAUTHORIZED', 'invalid or expired token', 401)

      const tokenHash = authService.jwt.hashToken(token)
      // Delete session by token hash
      await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash])

      return ok(res, { message: 'logged out' })
    }

    // ── POST /api/auth/refresh ──────────────────────────────────────────
    if (pathname === '/api/auth/refresh' && method === 'POST') {
      const token = extractToken(req)
      if (!token) return fail(res, 'UNAUTHORIZED', 'missing Authorization header', 401)

      try {
        const result = await authService.refreshSession(
          token,
          req.socket && req.socket.remoteAddress,
          req.headers && req.headers['user-agent'],
        )
        if (!result) return fail(res, 'UNAUTHORIZED', 'invalid or expired token', 401)
        return ok(res, result)
      } catch (e) {
        return fail(res, 'AUTH_ERROR', 'refresh failed', 500)
      }
    }

    // ── GET /api/auth/me ────────────────────────────────────────────────
    if (pathname === '/api/auth/me' && method === 'GET') {
      const token = extractToken(req)
      if (!token) return fail(res, 'UNAUTHORIZED', 'missing Authorization header', 401)

      const payload = await authService.verifySession(token)
      if (!payload) return fail(res, 'UNAUTHORIZED', 'invalid or expired token', 401)

      const user = await authService.getUserById(payload.sub)
      if (!user) return fail(res, 'NOT_FOUND', 'user not found', 404)

      return ok(res, {
        id:           user.id,
        email:        user.email,
        role:         user.role,
        tenant_id:    user.tenant_id,
        status:       user.status,
        last_login_at: user.last_login_at,
      })
    }

    return fail(res, 'NOT_FOUND', 'auth route not found', 404)
  }

  return { handle }
}

module.exports = { createAuthRouter }
