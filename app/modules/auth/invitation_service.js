'use strict'

const crypto = require('crypto')

const VALID_ROLES  = new Set(['OWNER', 'ADMIN', 'HIRING_MANAGER', 'FINANCE_APPROVER', 'VIEWER'])
const INVITE_TTL_H = 48

/**
 * S40-G6: Invitation service for team invites.
 *
 * @param {Object} opts
 * @param {Object} opts.pool        - pg Pool
 * @param {Object} opts.authService - from createAuthService()
 * @param {string} opts.baseUrl     - e.g. https://api.workcaptain.ai
 */
function createInvitationService(opts) {
  if (!opts || !opts.pool)        throw new Error('pool is required')
  if (!opts.authService)          throw new Error('authService is required')

  const pool        = opts.pool
  const authService = opts.authService
  const baseUrl     = opts.baseUrl || 'https://api.workcaptain.ai'

  return {
    /**
     * Create an invitation.
     * @returns {{ invitation, inviteLink }}
     */
    async createInvitation(tenantId, email, role, invitedBy) {
      if (!tenantId) throw Object.assign(new Error('tenantId is required'), { status: 400 })
      if (!email)    throw Object.assign(new Error('email is required'), { status: 400 })
      if (!role || !VALID_ROLES.has(role)) throw Object.assign(new Error(`invalid role: ${role}`), { status: 422 })

      email = email.toLowerCase().trim()
      const token     = crypto.randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + INVITE_TTL_H * 3600 * 1000)

      const result = await pool.query(
        `INSERT INTO invitations (id, tenant_id, email, role, token, invited_by, status, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, NOW())
         RETURNING id, tenant_id, email, role, status, expires_at, created_at`,
        [crypto.randomUUID(), tenantId, email, role, token, invitedBy, expiresAt]
      )

      const invitation = result.rows[0]
      const inviteLink = `${baseUrl}/admin/#accept-invite?token=${token}`

      return { invitation, inviteLink }
    },

    /**
     * Accept an invitation — creates user account with invitation role.
     * @returns {{ token, user }}
     */
    async acceptInvitation(token, password) {
      if (!token)    throw Object.assign(new Error('token is required'), { status: 400 })
      if (!password) throw Object.assign(new Error('password is required'), { status: 400 })

      // Look up invitation
      const invResult = await pool.query(
        `SELECT id, tenant_id, email, role, status, expires_at FROM invitations WHERE token = $1`,
        [token]
      )
      if (invResult.rows.length === 0) {
        throw Object.assign(new Error('invalid invitation token'), { status: 404 })
      }

      const inv = invResult.rows[0]

      if (inv.status === 'ACCEPTED') {
        throw Object.assign(new Error('invitation already accepted'), { status: 409 })
      }
      if (inv.status === 'EXPIRED') {
        throw Object.assign(new Error('invitation has been revoked'), { status: 410 })
      }
      if (new Date(inv.expires_at) < new Date()) {
        // Mark as expired
        await pool.query(`UPDATE invitations SET status = 'EXPIRED' WHERE id = $1`, [inv.id])
        throw Object.assign(new Error('invitation has expired'), { status: 410 })
      }

      // Create user account with the invitation role
      const user = await authService.register({
        email:    inv.email,
        password: password,
        tenantId: inv.tenant_id,
        role:     inv.role,
      })

      // Mark invitation as accepted
      await pool.query(`UPDATE invitations SET status = 'ACCEPTED' WHERE id = $1`, [inv.id])

      // Auto-login
      const loginResult = await authService.login({
        email:    inv.email,
        password: password,
        tenantId: inv.tenant_id,
      })

      return { token: loginResult.token, user: loginResult.user }
    },

    /**
     * List active invitations for a tenant.
     */
    async listInvitations(tenantId) {
      const result = await pool.query(
        `SELECT id, email, role, status, expires_at, created_at
         FROM invitations WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [tenantId]
      )
      return result.rows
    },

    /**
     * Revoke an invitation — sets status to EXPIRED.
     */
    async revokeInvitation(id, tenantId) {
      const result = await pool.query(
        `UPDATE invitations SET status = 'EXPIRED'
         WHERE id = $1 AND tenant_id = $2 AND status = 'PENDING'
         RETURNING id`,
        [id, tenantId]
      )
      if (result.rowCount === 0) {
        throw Object.assign(new Error('invitation not found or already resolved'), { status: 404 })
      }
      return true
    },
  }
}

module.exports = { createInvitationService }
