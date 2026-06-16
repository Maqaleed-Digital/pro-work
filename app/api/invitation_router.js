'use strict'

const { hasPermission, PERMISSIONS } = require('../modules/auth/rbac_policy')

/**
 * S40-G6: Invitation API router.
 *
 * Routes:
 *   POST   /api/invitations         — create invitation (OWNER/ADMIN)
 *   GET    /api/invitations         — list invitations (OWNER/ADMIN)
 *   DELETE /api/invitations/:id     — revoke invitation (OWNER/ADMIN)
 *   POST   /api/invitations/accept  — accept invitation (public)
 */
function createInvitationRouter(opts) {
  if (!opts || !opts.invitationService) throw new Error('invitationService is required')

  const invitationService = opts.invitationService

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

  async function handle(req, res, pathname, method, body, user) {

    // POST /api/invitations/accept — public (no auth required)
    if (pathname === '/api/invitations/accept' && method === 'POST') {
      if (!body) return fail(res, 'MISSING_BODY', 'request body required', 400)
      const { token, password } = body
      if (!token)    return fail(res, 'VALIDATION_ERROR', 'token is required', 422)
      if (!password) return fail(res, 'VALIDATION_ERROR', 'password is required', 422)

      // WC-02: ToS acceptance gate
      const tosAccepted = body.tosAccepted === true || body.tosAccepted === 'true'
      if (!tosAccepted) return fail(res, 'VALIDATION_ERROR', 'Terms of Service acceptance is required', 422)

      try {
        const result = await invitationService.acceptInvitation(token, password)
        return ok(res, result, 201)
      } catch (e) {
        return fail(res, 'INVITATION_ERROR', e.message, e.status || 400)
      }
    }

    // All remaining routes require auth + MANAGE_PRINCIPALS permission
    if (!user) return fail(res, 'UNAUTHORIZED', 'authentication required', 401)
    if (!hasPermission(user.role, PERMISSIONS.MANAGE_PRINCIPALS)) {
      return fail(res, 'FORBIDDEN', `role ${user.role} cannot manage invitations`, 403)
    }

    // POST /api/invitations — create
    if (pathname === '/api/invitations' && method === 'POST') {
      if (!body) return fail(res, 'MISSING_BODY', 'request body required', 400)
      const { email, role } = body
      if (!email) return fail(res, 'VALIDATION_ERROR', 'email is required', 422)
      if (!role)  return fail(res, 'VALIDATION_ERROR', 'role is required', 422)

      try {
        const result = await invitationService.createInvitation(user.tenant_id, email, role, user.id)
        return ok(res, result, 201)
      } catch (e) {
        return fail(res, 'INVITATION_ERROR', e.message, e.status || 400)
      }
    }

    // GET /api/invitations — list
    if (pathname === '/api/invitations' && method === 'GET') {
      const invitations = await invitationService.listInvitations(user.tenant_id)
      return ok(res, { invitations })
    }

    // DELETE /api/invitations/:id — revoke
    const deleteMatch = pathname.match(/^\/api\/invitations\/([^/]+)$/)
    if (deleteMatch && method === 'DELETE') {
      try {
        await invitationService.revokeInvitation(deleteMatch[1], user.tenant_id)
        return ok(res, { message: 'invitation revoked' })
      } catch (e) {
        return fail(res, 'INVITATION_ERROR', e.message, e.status || 400)
      }
    }

    return fail(res, 'NOT_FOUND', 'invitation route not found', 404)
  }

  return { handle }
}

module.exports = { createInvitationRouter }
