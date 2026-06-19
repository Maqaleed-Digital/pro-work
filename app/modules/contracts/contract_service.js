'use strict'

const crypto = require('crypto')
const { withTenant: _withTenantShared } = require('../../lib/persistence/with_tenant')
const lifecycle = require('../../config/contracts/lifecycle_v1.json')

const TRANSITIONS     = lifecycle.transitions
const TERMINAL        = new Set(lifecycle.terminal)
const REQUIRES_REASON = new Set(lifecycle.requiresReason)
const REQ_COMPLETENESS = lifecycle.requiresCompleteness
const EVENT_MAP       = lifecycle.eventTypeMap
const QIWA_FIELDS     = lifecycle.qiwaRequiredFields

function computeCompleteness(qiwaParity, contractType) {
  const required = QIWA_FIELDS[contractType] || []
  if (required.length === 0) return 100
  const filled = required.filter(f => {
    const v = qiwaParity[f]
    return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
  })
  return Math.round((filled.length / required.length) * 100)
}

function hydrateQiwaFromOffer(offerPayload, contractType, candidate, requisition) {
  const p = typeof offerPayload === 'string' ? JSON.parse(offerPayload) : offerPayload || {}
  const qiwa = {}

  if (contractType === 'FTE') {
    qiwa.role = requisition.title || null
    qiwa.wage_base = p.base_salary || null
    qiwa.probation_days = p.probation_days || 90
    qiwa.notice_period_days = p.notice_period_days || 30
    qiwa.work_location = p.work_location || null
    qiwa.nationality = candidate.nationality || null
    qiwa.occupation_code = requisition.occupation_code || null
    qiwa.working_hours = p.working_hours || '48hrs/week'
    qiwa.contract_duration = p.contract_duration || 'indefinite'
  } else if (contractType === 'FREELANCER') {
    qiwa.milestones = p.milestones || []
    qiwa.total_value = (p.milestones || []).reduce((s, m) => s + (m.amount || 0), 0) || null
    qiwa.escrow_terms = p.escrow_terms || null
  } else if (contractType === 'AI_EXECUTABLE') {
    qiwa.delivery_window = p.delivery_window || null
    qiwa.outcome_criteria = p.outcome_criteria || null
    qiwa.model_version = p.model_version || null
  }

  return qiwa
}

/**
 * S44-G1: Contract service.
 * @param {Object} opts
 * @param {Object} opts.pool - pg Pool
 */
function createContractService(opts) {
  if (!opts || !opts.pool) throw new Error('pool is required')
  const pool = opts.pool

  async function withTenant(tenantId, fn) { return _withTenantShared(pool, tenantId, fn) }

  async function emitEvent(client, tenantId, contractId, eventType, prevStatus, newStatus, actorUserId, actorType, payload) {
    await client.query(
      `INSERT INTO contract_events (id, tenant_id, contract_id, event_type, previous_status, new_status, actor_user_id, actor_type, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [crypto.randomUUID(), tenantId, contractId, eventType,
       prevStatus || null, newStatus || null, actorUserId || null, actorType || 'HUMAN',
       JSON.stringify(payload || {})]
    )
  }

  return {
    async createContract(tenantId, offerId, templateType) {
      if (!tenantId) throw Object.assign(new Error('tenantId is required'), { status: 400 })
      if (!offerId) throw Object.assign(new Error('offerId is required'), { status: 400 })

      return withTenant(tenantId, async (client) => {
        const offerRow = await client.query('SELECT * FROM offers WHERE id = $1', [offerId])
        if (!offerRow.rows[0]) throw Object.assign(new Error('offer not found'), { status: 404 })
        const offer = offerRow.rows[0]

        const appRow = await client.query('SELECT * FROM applications WHERE id = $1', [offer.application_id])
        const candRow = await client.query('SELECT * FROM candidates WHERE id = $1', [offer.candidate_id])
        const reqRow = await client.query('SELECT * FROM requisitions WHERE id = $1', [offer.requisition_id])

        const app = appRow.rows[0] || {}
        const candidate = candRow.rows[0] || {}
        const requisition = reqRow.rows[0] || {}
        const contractType = offer.offer_type
        const offerPayload = typeof offer.payload === 'string' ? JSON.parse(offer.payload) : offer.payload

        const qiwa = hydrateQiwaFromOffer(offerPayload, contractType, candidate, requisition)
        const completeness = computeCompleteness(qiwa, contractType)

        const tplType = lifecycle.templateTypeMap[contractType] || 'FTE_STANDARD_KSA'
        const contractId = crypto.randomUUID()

        const result = await client.query(
          `INSERT INTO contracts
           (id, tenant_id, application_id, offer_id, candidate_id, requisition_id,
            contract_type, status, qiwa_parity_json, qiwa_field_completeness_pct,
            template_version, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT', $8, $9, $10, NOW(), NOW())
           RETURNING *`,
          [contractId, tenantId, offer.application_id, offerId, offer.candidate_id,
           offer.requisition_id, contractType, JSON.stringify(qiwa), completeness, 'v1']
        )

        await emitEvent(client, tenantId, contractId, 'DRAFT_CREATED', null, 'DRAFT', null, 'SYSTEM',
          { offer_id: offerId, template_type: tplType })

        return result.rows[0]
      })
    },

    async getContract(tenantId, contractId) {
      return withTenant(tenantId, async (client) => {
        const r = await client.query('SELECT * FROM contracts WHERE id = $1', [contractId])
        return r.rows[0] || null
      })
    },

    async listContracts(tenantId, filters) {
      return withTenant(tenantId, async (client) => {
        let sql = 'SELECT * FROM contracts'
        const params = []
        if (filters && filters.status) {
          params.push(filters.status)
          sql += ` WHERE status = $${params.length}`
        }
        sql += ' ORDER BY created_at DESC'
        const r = await client.query(sql, params)
        return r.rows
      })
    },

    async updateContract(tenantId, contractId, patch) {
      return withTenant(tenantId, async (client) => {
        const c = await client.query('SELECT * FROM contracts WHERE id = $1', [contractId])
        if (!c.rows[0]) throw Object.assign(new Error('contract not found'), { status: 404 })
        if (c.rows[0].status !== 'DRAFT') {
          throw Object.assign(new Error('only DRAFT contracts can be updated'), { status: 409 })
        }

        const existing = typeof c.rows[0].qiwa_parity_json === 'string'
          ? JSON.parse(c.rows[0].qiwa_parity_json) : c.rows[0].qiwa_parity_json
        const merged = Object.assign({}, existing, patch)
        const completeness = computeCompleteness(merged, c.rows[0].contract_type)

        await client.query(
          'UPDATE contracts SET qiwa_parity_json = $1, qiwa_field_completeness_pct = $2, updated_at = NOW() WHERE id = $3',
          [JSON.stringify(merged), completeness, contractId]
        )
        return { contractId, qiwa_field_completeness_pct: completeness, updated: true }
      })
    },

    async transitionStatus(tenantId, contractId, newStatus, actorUserId, reasonOrPayload) {
      if (!newStatus) throw Object.assign(new Error('newStatus is required'), { status: 400 })

      return withTenant(tenantId, async (client) => {
        const c = await client.query('SELECT * FROM contracts WHERE id = $1', [contractId])
        if (!c.rows[0]) throw Object.assign(new Error('contract not found'), { status: 404 })

        const contract = c.rows[0]
        const currentStatus = contract.status
        const allowed = TRANSITIONS[currentStatus]

        if (!allowed || !allowed.includes(newStatus)) {
          throw Object.assign(new Error(`invalid transition: ${currentStatus} → ${newStatus}`), { status: 409 })
        }

        // Completeness gate
        const reqPct = REQ_COMPLETENESS[newStatus]
        if (reqPct && contract.qiwa_field_completeness_pct < reqPct) {
          throw Object.assign(new Error(`qiwa_field_completeness must be >= ${reqPct}% for ${newStatus} (current: ${contract.qiwa_field_completeness_pct}%)`), { status: 422 })
        }

        // Termination requires reason
        if (REQUIRES_REASON.has(newStatus)) {
          const reason = typeof reasonOrPayload === 'string' ? reasonOrPayload : (reasonOrPayload && reasonOrPayload.reason)
          if (!reason || !reason.trim()) {
            throw Object.assign(new Error('termination_reason is required'), { status: 422 })
          }
          await client.query(
            'UPDATE contracts SET status = $1, terminated_at = NOW(), termination_reason = $2, updated_at = NOW() WHERE id = $3',
            [newStatus, reason.trim(), contractId]
          )
        } else if (newStatus === 'SIGNED') {
          await client.query('UPDATE contracts SET status = $1, signed_at = NOW(), updated_at = NOW() WHERE id = $2', [newStatus, contractId])
        } else if (newStatus === 'ACTIVATED') {
          await client.query('UPDATE contracts SET status = $1, activated_at = NOW(), updated_at = NOW() WHERE id = $2', [newStatus, contractId])
        } else {
          await client.query('UPDATE contracts SET status = $1, updated_at = NOW() WHERE id = $2', [newStatus, contractId])
        }

        const eventType = EVENT_MAP[newStatus] || 'STATUS_CHANGED'
        await emitEvent(client, tenantId, contractId, eventType, currentStatus, newStatus, actorUserId, 'HUMAN',
          typeof reasonOrPayload === 'object' ? reasonOrPayload : { reason: reasonOrPayload || null })

        return { contractId, previousStatus: currentStatus, newStatus }
      })
    },

    async getContractTimeline(tenantId, contractId) {
      return withTenant(tenantId, async (client) => {
        const r = await client.query(
          'SELECT * FROM contract_events WHERE contract_id = $1 ORDER BY created_at ASC', [contractId]
        )
        return r.rows
      })
    },

    // Exported for testing
    computeCompleteness,
    hydrateQiwaFromOffer,
  }
}

module.exports = { createContractService }
