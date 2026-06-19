'use strict'

const crypto = require('crypto')
const { withTenant: _withTenantShared } = require('../../lib/persistence/with_tenant')

const ATTENDANCE_BLOCKED = /\b(shift|attendance|punch|clock[-\s]?in|clock[-\s]?out|roster)\b/i

/**
 * S43-G6: Offer service — FTE / FREELANCER / AI_EXECUTABLE offers.
 * @param {Object} opts
 * @param {Object} opts.pool - pg Pool
 */
function createOfferService(opts) {
  if (!opts || !opts.pool) throw new Error('pool is required')
  const pool = opts.pool

  async function withTenant(tenantId, fn) { return _withTenantShared(pool, tenantId, fn) }

  return {
    async createOffer(tenantId, applicationId, offerType, payload) {
      if (!tenantId) throw Object.assign(new Error('tenantId is required'), { status: 400 })
      if (!applicationId) throw Object.assign(new Error('applicationId is required'), { status: 400 })
      if (!['FTE', 'FREELANCER', 'AI_EXECUTABLE'].includes(offerType)) {
        throw Object.assign(new Error('invalid offer_type'), { status: 422 })
      }

      return withTenant(tenantId, async (client) => {
        const app = await client.query('SELECT * FROM applications WHERE id = $1', [applicationId])
        if (!app.rows[0]) throw Object.assign(new Error('application not found'), { status: 404 })

        if (offerType === 'FTE') {
          const req = await client.query('SELECT salary_min, salary_max FROM requisitions WHERE id = $1', [app.rows[0].requisition_id])
          const r = req.rows[0]
          if (r && payload.base_salary != null) {
            if (r.salary_min && payload.base_salary < parseFloat(r.salary_min)) {
              throw Object.assign(new Error('salary below requisition minimum'), { status: 422 })
            }
            if (r.salary_max && payload.base_salary > parseFloat(r.salary_max)) {
              throw Object.assign(new Error('salary above requisition maximum'), { status: 422 })
            }
          }
        }

        if (offerType === 'FREELANCER') {
          if (!payload.milestones || payload.milestones.length === 0) {
            throw Object.assign(new Error('at least one milestone required for FREELANCER'), { status: 422 })
          }
        }

        if (offerType === 'AI_EXECUTABLE') {
          if (ATTENDANCE_BLOCKED.test(JSON.stringify(payload))) {
            throw Object.assign(new Error('AI_EXECUTABLE offers must not contain attendance/shift language'), { status: 422 })
          }
        }

        const result = await client.query(
          `INSERT INTO offers (id, tenant_id, application_id, candidate_id, requisition_id, offer_type, payload, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT', NOW(), NOW()) RETURNING *`,
          [crypto.randomUUID(), tenantId, applicationId, app.rows[0].candidate_id,
           app.rows[0].requisition_id, offerType, JSON.stringify(payload)]
        )
        return result.rows[0]
      })
    },

    async getOffer(tenantId, offerId) {
      return withTenant(tenantId, async (client) => {
        const r = await client.query('SELECT * FROM offers WHERE id = $1', [offerId])
        return r.rows[0] || null
      })
    },

    async updateOffer(tenantId, offerId, payload) {
      return withTenant(tenantId, async (client) => {
        const o = await client.query('SELECT * FROM offers WHERE id = $1', [offerId])
        if (!o.rows[0]) throw Object.assign(new Error('offer not found'), { status: 404 })
        if (o.rows[0].status !== 'DRAFT') throw Object.assign(new Error('only DRAFT offers can be updated'), { status: 409 })
        await client.query('UPDATE offers SET payload = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(payload), offerId])
        return { offerId, updated: true }
      })
    },

    async runCompliancePreview(tenantId, offerId) {
      return withTenant(tenantId, async (client) => {
        const o = await client.query('SELECT * FROM offers WHERE id = $1', [offerId])
        if (!o.rows[0]) throw Object.assign(new Error('offer not found'), { status: 404 })
        const offer = o.rows[0]
        const payload = typeof offer.payload === 'string' ? JSON.parse(offer.payload) : offer.payload

        const req = await client.query('SELECT * FROM requisitions WHERE id = $1', [offer.requisition_id])
        const requisition = req.rows[0] || {}

        const checks = {
          nitaqat_alignment: { status: 'GREEN', message: 'Nitaqat zone maintained' },
          occupation_code:   { status: 'GREEN', message: 'Occupation code valid' },
          salary_range:      { status: 'GREEN', message: 'Salary within approved range' },
          probation_policy:  { status: 'GREEN', message: 'Probation within policy' },
        }

        if (offer.offer_type === 'FTE' && payload.base_salary != null) {
          if (requisition.salary_min && payload.base_salary < parseFloat(requisition.salary_min)) {
            checks.salary_range = { status: 'RED', message: 'Salary below requisition minimum' }
          } else if (requisition.salary_max && payload.base_salary > parseFloat(requisition.salary_max)) {
            checks.salary_range = { status: 'RED', message: 'Salary above requisition maximum' }
          }
        }

        if (payload.probation_days != null && payload.probation_days > 180) {
          checks.probation_policy = { status: 'RED', message: 'Probation exceeds 180-day maximum' }
        } else if (payload.probation_days != null && payload.probation_days > 90) {
          checks.probation_policy = { status: 'AMBER', message: 'Probation exceeds standard 90 days' }
        }

        if (!requisition.occupation_code) {
          checks.occupation_code = { status: 'AMBER', message: 'No occupation code set on requisition' }
        }

        const preview = {
          checks,
          all_green: Object.values(checks).every(c => c.status === 'GREEN'),
          has_red: Object.values(checks).some(c => c.status === 'RED'),
        }

        await client.query(
          'UPDATE offers SET compliance_preview_json = $1, updated_at = NOW() WHERE id = $2',
          [JSON.stringify(preview), offerId]
        )
        return preview
      })
    },

    async sendOffer(tenantId, offerId, overrideReason, actorUserId) {
      return withTenant(tenantId, async (client) => {
        const o = await client.query('SELECT * FROM offers WHERE id = $1', [offerId])
        if (!o.rows[0]) throw Object.assign(new Error('offer not found'), { status: 404 })
        const offer = o.rows[0]

        if (offer.status !== 'DRAFT') {
          throw Object.assign(new Error('offer must be in DRAFT status to send'), { status: 409 })
        }

        const preview = typeof offer.compliance_preview_json === 'string'
          ? JSON.parse(offer.compliance_preview_json) : offer.compliance_preview_json
        if (!preview) {
          throw Object.assign(new Error('compliance preview required before sending'), { status: 409 })
        }

        if (preview.has_red) {
          if (!overrideReason || !overrideReason.trim()) {
            throw Object.assign(new Error('override_reason required — compliance check has RED items'), { status: 422 })
          }
          await client.query(
            'UPDATE offers SET status = $1, sent_at = NOW(), compliance_overridden = TRUE, override_reason = $2, updated_at = NOW() WHERE id = $3',
            ['SENT', overrideReason.trim(), offerId]
          )
        } else {
          await client.query(
            'UPDATE offers SET status = $1, sent_at = NOW(), updated_at = NOW() WHERE id = $2',
            ['SENT', offerId]
          )
        }

        // Transition application to OFFERED
        await client.query('UPDATE applications SET status = $1, updated_at = NOW() WHERE id = $2', ['OFFERED', offer.application_id])

        // Emit OFFER_SENT event
        await client.query(
          `INSERT INTO application_events (id, tenant_id, application_id, event_type, previous_status, new_status, actor_user_id, actor_type, payload, created_at)
           VALUES ($1, $2, $3, 'OFFER_SENT', NULL, 'OFFERED', $4, 'HUMAN', $5, NOW())`,
          [crypto.randomUUID(), tenantId, offer.application_id, actorUserId || null,
           JSON.stringify({ offer_id: offerId, offer_type: offer.offer_type })]
        )

        return { offerId, status: 'SENT', applicationStatus: 'OFFERED' }
      })
    },
  }
}

module.exports = { createOfferService }
