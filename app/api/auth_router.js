'use strict'

const crypto = require('crypto')
const { recordTosAcceptance } = require('../modules/auth/tos')
// WO-WC-SEC-01: shared tenant-context helper for FORCE-RLS-scoped writes.
const { withTenant: _withTenantShared } = require('../lib/persistence/with_tenant')

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

      // WC-02: ToS acceptance gate — no tenant/user is created without it
      const tosAccepted = body.tosAccepted === true || body.tosAccepted === 'true'
      if (!tosAccepted) return fail(res, 'VALIDATION_ERROR', 'Terms of Service acceptance is required', 422)

      // Create tenant + user + ToS atomically in ONE transaction
      const tenantId = 'tn-' + crypto.randomUUID().slice(0, 8)
      let user
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(
          `INSERT INTO tenants (id, name, status, config, created_at)
           VALUES ($1, $2, 'active', $3, NOW())`,
          [tenantId, companyName, JSON.stringify({ establishment_profile: {} })]
        )
        user = await authService.register({ email, password, tenantId, role: role || undefined, client })
        await recordTosAcceptance(client, { userId: user.id, tenantId, source: 'auth_register' })
        await client.query('COMMIT')
        client.release()
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {})
        client.release()
        console.error('[auth/register] error:', e.message, 'status:', e.status)
        if (e.status === 409) return fail(res, 'CONFLICT', e.message, 409)
        if (e.status === 422) return fail(res, 'VALIDATION_ERROR', e.message, 422)
        if (e.status)         return fail(res, 'AUTH_ERROR', e.message, e.status)
        return fail(res, 'INTERNAL_ERROR', 'registration failed', 500)
      }

      // login AFTER commit (account is durable; session creation is separate)
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
    }

    // ── POST /api/auth/login ────────────────────────────────────────────
    if (pathname === '/api/auth/login' && method === 'POST') {
      if (!body) return fail(res, 'MISSING_BODY', 'request body required', 400)

      const { email, password, tenantId } = body
      if (!email)    return fail(res, 'VALIDATION_ERROR', 'email is required', 422)
      if (!password) return fail(res, 'VALIDATION_ERROR', 'password is required', 422)

      // If tenantId not provided, look up user's tenant by email via the bounded SECURITY DEFINER
      // function (replaces the bare cross-tenant `SELECT ... FROM users`, which only worked under
      // owner-bypass and would return zero rows once `users` is FORCE RLS).
      let resolvedTenantId = tenantId
      if (!resolvedTenantId) {
        let lookup
        try {
          lookup = await pool.query(
            'SELECT id, tenant_id, password_hash, role, status FROM wc_login_lookup($1)',
            [email.toLowerCase().trim()]
          )
        } catch (e) {
          // WO-WC-SEC-01 (GO-4): a DB fault on the pre-auth lookup must NEVER crash the process.
          // The GO-4 outage was an uncaught 42501 here that unhandled-rejected and took the app
          // down. Degrade to 500; the process stays alive.
          console.error('[auth/login] pre-auth lookup failed:', e && e.message)
          return fail(res, 'INTERNAL_ERROR', 'login temporarily unavailable', 500)
        }
        if (lookup.rows.length === 0) {
          return fail(res, 'UNAUTHORIZED', 'invalid credentials', 401)
        }
        // KNOWN FOLLOW-UP: email is UNIQUE per (email, tenant_id), so this may return multiple rows
        // across tenants. We preserve today's single-tenant behavior by adopting the first row's
        // tenant; proper multi-tenant resolution (verify password against each row) is a follow-up.
        resolvedTenantId = lookup.rows[0].tenant_id
      }

      try {
        const result = await authService.login({
          email, password, tenantId: resolvedTenantId,
          ipAddress: req.socket && req.socket.remoteAddress,
          userAgent: req.headers && req.headers['user-agent'],
        })
        // Add company name from tenants table
        const tenantRow = await pool.query('SELECT name FROM tenants WHERE id = $1', [resolvedTenantId])
        const companyName = tenantRow.rows[0] ? tenantRow.rows[0].name : null
        result.user.companyName = companyName
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
      // WO-WC-SEC-01: the bearer token has been verified to a payload that carries tenant_id, so the
      // session DELETE is now tenant-scoped through the shared helper. Under FORCE RLS on `sessions`
      // the prior bare pool.query would affect ZERO rows (logout would silently fail to revoke).
      if (!payload.tenant_id) return fail(res, 'UNAUTHORIZED', 'invalid or expired token', 401)
      await _withTenantShared(pool, payload.tenant_id, (client) =>
        client.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]))

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

      // WO-WC-SEC-01: thread the verified JWT's tenant_id so the FORCE-RLS users read is tenant-scoped.
      const user = await authService.getUserById(payload.sub, payload.tenant_id)
      if (!user) return fail(res, 'NOT_FOUND', 'user not found', 404)

      // Add company name from tenants table
      const tenantRow = await pool.query('SELECT name FROM tenants WHERE id = $1', [user.tenant_id])
      const companyName = tenantRow.rows[0] ? tenantRow.rows[0].name : null

      return ok(res, {
        id:           user.id,
        email:        user.email,
        role:         user.role,
        tenant_id:    user.tenant_id,
        status:       user.status,
        last_login_at: user.last_login_at,
        companyName,
      })
    }

    return fail(res, 'NOT_FOUND', 'auth route not found', 404)
  }

  return { handle }
}

module.exports = { createAuthRouter }
