'use strict'

/**
 * S40-G2: Auth middleware — JWT verification + role enforcement.
 *
 * requireAuth(authService)    — verifies Bearer JWT, attaches req.user
 * requireRole(...roles)       — checks req.user.role ∈ allowed set
 */

/**
 * Extract Bearer token from Authorization header.
 * @param {import('http').IncomingMessage} req
 * @returns {string|null}
 */
function extractToken(req) {
  const h = req.headers && (req.headers.authorization || req.headers.Authorization)
  if (!h) return null
  const parts = String(h).trim().split(/\s+/)
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null
  return parts[1] || null
}

/**
 * Create requireAuth middleware bound to an authService instance.
 *
 * On success: sets req.user = { sub, role, tenant_id, ... }
 * On failure: sends 401 JSON and returns false
 *
 * @param {Object} authService — from createAuthService()
 * @returns {Function} (req, res) => Promise<boolean>
 */
function requireAuth(authService) {
  return async function _requireAuth(req, res) {
    const token = extractToken(req)
    if (!token) {
      _send(res, 401, 'UNAUTHORIZED', 'missing or invalid Authorization header')
      return false
    }

    const payload = await authService.verifySession(token)
    if (!payload) {
      _send(res, 401, 'UNAUTHORIZED', 'invalid or expired token')
      return false
    }

    req.user = {
      id:        payload.sub,
      role:      payload.role,
      tenant_id: payload.tenant_id,
      token:     token,
    }
    return true
  }
}

/**
 * Check req.user.role against a set of allowed roles.
 * Must be called after requireAuth has set req.user.
 *
 * @param {import('http').ServerResponse} res
 * @param {Object} user — req.user
 * @param  {...string} roles — allowed roles
 * @returns {boolean} true if allowed, false if 403 was sent
 */
function requireRole(res, user, ...roles) {
  if (!user || !user.role) {
    _send(res, 401, 'UNAUTHORIZED', 'not authenticated')
    return false
  }
  const allowed = new Set(roles)
  if (!allowed.has(user.role)) {
    _send(res, 403, 'FORBIDDEN', `role ${user.role} is not permitted for this action`)
    return false
  }
  return true
}

function _send(res, status, code, message) {
  const body = JSON.stringify({ ok: false, error: { code, message } })
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

module.exports = { requireAuth, requireRole, extractToken }
