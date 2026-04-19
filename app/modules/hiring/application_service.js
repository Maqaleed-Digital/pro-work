'use strict'

const crypto = require('crypto')
const stateMachine = require('../../config/hiring/application_state_machine.json')

const TRANSITIONS   = stateMachine.transitions
const TERMINAL      = new Set(stateMachine.terminal)
const REQUIRES_REASON = new Set(stateMachine.requiresReason)

/**
 * S43-G3: Application service — candidate pipeline.
 * @param {Object} opts
 * @param {Object} opts.pool - pg Pool
 */
function createApplicationService(opts) {
  if (!opts || !opts.pool) throw new Error('pool is required')
  const pool = opts.pool

  async function withTenant(tenantId, fn) {
    const client = await pool.connect()
    try {
      await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId])
      return await fn(client)
    } finally {
      client.release()
    }
  }

  async function emitEvent(client, tenantId, applicationId, eventType, previousStatus, newStatus, actorUserId, actorType, payload) {
    await client.query(
      `INSERT INTO application_events
       (id, tenant_id, application_id, event_type, previous_status, new_status, actor_user_id, actor_type, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [crypto.randomUUID(), tenantId, applicationId, eventType,
       previousStatus || null, newStatus || null,
       actorUserId || null, actorType || 'SYSTEM',
       JSON.stringify(payload || {})]
    )
  }

  return {
    /**
     * Create an application. Requisition must be PUBLISHED.
     */
    async createApplication(tenantId, candidateId, requisitionId, source, actorUserId) {
      if (!tenantId || !candidateId || !requisitionId) {
        throw Object.assign(new Error('tenantId, candidateId, and requisitionId are required'), { status: 400 })
      }

      return withTenant(tenantId, async (client) => {
        // Check requisition is PUBLISHED
        const req = await client.query('SELECT status FROM requisitions WHERE id = $1', [requisitionId])
        if (!req.rows[0]) throw Object.assign(new Error('requisition not found'), { status: 404 })
        if (req.rows[0].status !== 'PUBLISHED') {
          throw Object.assign(new Error('requisition must be PUBLISHED to accept applications'), { status: 409 })
        }

        try {
          const result = await client.query(
            `INSERT INTO applications
             (id, tenant_id, candidate_id, requisition_id, status, applied_at, updated_at)
             VALUES ($1, $2, $3, $4, 'APPLIED', NOW(), NOW())
             RETURNING *`,
            [crypto.randomUUID(), tenantId, candidateId, requisitionId]
          )

          const app = result.rows[0]

          // Emit STATUS_CHANGED: null → APPLIED
          await emitEvent(client, tenantId, app.id, 'STATUS_CHANGED',
            null, 'APPLIED', actorUserId, source === 'AI_MATCH' ? 'AI' : 'HUMAN',
            { source: source || 'DIRECT' })

          return app
        } catch (e) {
          if (e.code === '23505') {
            throw Object.assign(new Error('duplicate application for this candidate and requisition'), { status: 409 })
          }
          throw e
        }
      })
    },

    /**
     * Transition application status via state machine.
     */
    async transitionStatus(tenantId, applicationId, newStatus, actorUserId, reasonOrPayload) {
      if (!newStatus) throw Object.assign(new Error('newStatus is required'), { status: 400 })

      return withTenant(tenantId, async (client) => {
        const result = await client.query('SELECT * FROM applications WHERE id = $1', [applicationId])
        if (!result.rows[0]) throw Object.assign(new Error('application not found'), { status: 404 })

        const app = result.rows[0]
        const currentStatus = app.status
        const allowed = TRANSITIONS[currentStatus]

        if (!allowed || !allowed.includes(newStatus)) {
          throw Object.assign(
            new Error(`invalid transition: ${currentStatus} → ${newStatus}`),
            { status: 409 }
          )
        }

        // Rejection requires reason
        if (REQUIRES_REASON.has(newStatus)) {
          const reason = typeof reasonOrPayload === 'string' ? reasonOrPayload : (reasonOrPayload && reasonOrPayload.reason)
          if (!reason || !reason.trim()) {
            throw Object.assign(new Error('rejection_reason is required'), { status: 422 })
          }
          await client.query(
            'UPDATE applications SET status = $1, rejection_reason = $2, updated_at = NOW() WHERE id = $3',
            [newStatus, reason.trim(), applicationId]
          )
        } else {
          await client.query(
            'UPDATE applications SET status = $1, updated_at = NOW() WHERE id = $2',
            [newStatus, applicationId]
          )
        }

        // Emit STATUS_CHANGED event
        await emitEvent(client, tenantId, applicationId, 'STATUS_CHANGED',
          currentStatus, newStatus, actorUserId, 'HUMAN',
          typeof reasonOrPayload === 'object' ? reasonOrPayload : { reason: reasonOrPayload || null })

        return { applicationId, previousStatus: currentStatus, newStatus }
      })
    },

    /**
     * Attach AI recommendation to application.
     */
    async attachRecommendation(tenantId, applicationId, recommendationLogId, matchScore, matchConfidence) {
      return withTenant(tenantId, async (client) => {
        const result = await client.query(
          `UPDATE applications
           SET match_score = $1, match_confidence = $2,
               ai_recommendation_log_id = $3, updated_at = NOW()
           WHERE id = $4 RETURNING *`,
          [matchScore, matchConfidence, recommendationLogId, applicationId]
        )
        if (result.rowCount === 0) throw Object.assign(new Error('application not found'), { status: 404 })
        return result.rows[0]
      })
    },

    /**
     * List applications for a requisition.
     */
    async listApplications(tenantId, requisitionId) {
      return withTenant(tenantId, async (client) => {
        const result = await client.query(
          `SELECT a.*, c.first_name, c.last_name, c.email AS candidate_email, c.eri_score
           FROM applications a
           JOIN candidates c ON c.id = a.candidate_id
           WHERE a.requisition_id = $1
           ORDER BY a.applied_at DESC`,
          [requisitionId]
        )
        return result.rows
      })
    },

    /**
     * Get full application timeline (all events).
     */
    async getApplicationTimeline(tenantId, applicationId) {
      return withTenant(tenantId, async (client) => {
        const result = await client.query(
          `SELECT * FROM application_events
           WHERE application_id = $1
           ORDER BY created_at ASC`,
          [applicationId]
        )
        return result.rows
      })
    },
  }
}

module.exports = { createApplicationService }
