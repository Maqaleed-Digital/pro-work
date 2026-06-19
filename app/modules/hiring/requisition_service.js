'use strict'

const crypto = require('crypto')
const { withTenant: _withTenantShared } = require('../../lib/persistence/with_tenant')
const validationConfig = require('../../config/hiring/requisition_validation.json')

const VALID_STATUSES      = new Set(validationConfig.validStatuses)
const VALID_CONTRACT_TYPES = new Set(validationConfig.validContractTypes)
const PROHIBITED_CODES    = new Set(validationConfig.prohibitedOccupationCodes)
const STATUS_TRANSITIONS  = validationConfig.statusTransitions
const SALARY_RANGES       = validationConfig.salaryRanges
const STALENESS_MS        = validationConfig.nitaqatPreviewStalenessHours * 3600 * 1000

/**
 * S43-G1: Requisition service — hiring pipeline.
 *
 * @param {Object} opts
 * @param {Object} opts.pool          - pg Pool
 * @param {Object} [opts.nitaqatEngine] - from createNitaqatPolicyEngine()
 */
function createRequisitionService(opts) {
  if (!opts || !opts.pool) throw new Error('pool is required')

  const pool          = opts.pool
  const nitaqatEngine = opts.nitaqatEngine || null

  async function withTenant(tenantId, fn) { return _withTenantShared(pool, tenantId, fn) }

  return {
    /**
     * Create a new requisition in DRAFT status.
     */
    async createRequisition(tenantId, userId, payload) {
      if (!tenantId) throw Object.assign(new Error('tenantId is required'), { status: 400 })
      if (!userId)   throw Object.assign(new Error('userId is required'), { status: 400 })
      if (!payload || !payload.title) throw Object.assign(new Error('title is required'), { status: 422 })

      const ct = payload.contract_type || 'FTE'
      if (!VALID_CONTRACT_TYPES.has(ct)) {
        throw Object.assign(new Error(`invalid contract_type: ${ct}`), { status: 422 })
      }

      // Occupation code validation
      if (payload.occupation_code && PROHIBITED_CODES.has(payload.occupation_code)) {
        throw Object.assign(new Error(`occupation code ${payload.occupation_code} is prohibited`), { status: 422 })
      }

      // Salary range validation
      const range = SALARY_RANGES[ct]
      if (range) {
        if (payload.salary_min !== undefined && payload.salary_min !== null) {
          if (payload.salary_min < range.min || payload.salary_min > range.max) {
            throw Object.assign(new Error(`salary_min must be between ${range.min} and ${range.max} ${range.currency}`), { status: 422 })
          }
        }
        if (payload.salary_max !== undefined && payload.salary_max !== null) {
          if (payload.salary_max < range.min || payload.salary_max > range.max) {
            throw Object.assign(new Error(`salary_max must be between ${range.min} and ${range.max} ${range.currency}`), { status: 422 })
          }
        }
        if (payload.salary_min && payload.salary_max && payload.salary_min > payload.salary_max) {
          throw Object.assign(new Error('salary_min cannot exceed salary_max'), { status: 422 })
        }
      }

      return withTenant(tenantId, async (client) => {
        const result = await client.query(
          `INSERT INTO requisitions
           (id, tenant_id, created_by, title, department, contract_type, occupation_code,
            target_nationality, salary_min, salary_max, description, requirements, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'DRAFT', NOW(), NOW())
           RETURNING *`,
          [
            crypto.randomUUID(), tenantId, userId,
            payload.title, payload.department || null, ct,
            payload.occupation_code || null, payload.target_nationality || null,
            payload.salary_min || null, payload.salary_max || null,
            payload.description || null, JSON.stringify(payload.requirements || {}),
          ]
        )
        return result.rows[0]
      })
    },

    /**
     * Get a single requisition.
     */
    async getRequisition(tenantId, requisitionId) {
      return withTenant(tenantId, async (client) => {
        const result = await client.query(
          'SELECT * FROM requisitions WHERE id = $1',
          [requisitionId]
        )
        return result.rows[0] || null
      })
    },

    /**
     * List requisitions for a tenant with optional status filter.
     */
    async listRequisitions(tenantId, filters) {
      return withTenant(tenantId, async (client) => {
        let sql = 'SELECT * FROM requisitions'
        const params = []
        const where = []

        if (filters && filters.status) {
          params.push(filters.status)
          where.push(`status = $${params.length}`)
        }

        if (where.length) sql += ' WHERE ' + where.join(' AND ')
        sql += ' ORDER BY created_at DESC'

        if (filters && filters.limit) {
          params.push(parseInt(filters.limit, 10))
          sql += ` LIMIT $${params.length}`
        }

        const result = await client.query(sql, params)
        return result.rows
      })
    },

    /**
     * Update a DRAFT requisition.
     */
    async updateRequisition(tenantId, requisitionId, payload) {
      return withTenant(tenantId, async (client) => {
        const req = await client.query('SELECT * FROM requisitions WHERE id = $1', [requisitionId])
        if (!req.rows[0]) throw Object.assign(new Error('requisition not found'), { status: 404 })
        if (req.rows[0].status !== 'DRAFT' && req.rows[0].status !== 'NITAQAT_PREVIEWED') {
          throw Object.assign(new Error('only DRAFT or NITAQAT_PREVIEWED requisitions can be updated'), { status: 409 })
        }

        // Re-validate if salary or contract_type changed
        const ct = payload.contract_type || req.rows[0].contract_type
        if (payload.occupation_code && PROHIBITED_CODES.has(payload.occupation_code)) {
          throw Object.assign(new Error(`occupation code ${payload.occupation_code} is prohibited`), { status: 422 })
        }

        const sets = []
        const params = []
        const updatable = ['title', 'department', 'contract_type', 'occupation_code',
          'target_nationality', 'salary_min', 'salary_max', 'description']

        for (const key of updatable) {
          if (payload[key] !== undefined) {
            params.push(payload[key])
            sets.push(`${key} = $${params.length}`)
          }
        }

        if (payload.requirements !== undefined) {
          params.push(JSON.stringify(payload.requirements))
          sets.push(`requirements = $${params.length}`)
        }

        if (sets.length === 0) return req.rows[0]

        // Reset to DRAFT if fields changed after preview
        sets.push("status = 'DRAFT'")
        sets.push('updated_at = NOW()')
        sets.push('nitaqat_preview_run_at = NULL')
        sets.push('nitaqat_preview_result = NULL')

        params.push(requisitionId)
        const sql = `UPDATE requisitions SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`
        const result = await client.query(sql, params)
        return result.rows[0]
      })
    },

    /**
     * Run Nitaqat preview for a requisition.
     * Stores result and timestamp on the row.
     */
    async runNitaqatPreview(tenantId, requisitionId, establishmentProfile) {
      return withTenant(tenantId, async (client) => {
        const req = await client.query('SELECT * FROM requisitions WHERE id = $1', [requisitionId])
        if (!req.rows[0]) throw Object.assign(new Error('requisition not found'), { status: 404 })

        const r = req.rows[0]
        if (r.status !== 'DRAFT' && r.status !== 'NITAQAT_PREVIEWED') {
          throw Object.assign(new Error('Nitaqat preview only available for DRAFT requisitions'), { status: 409 })
        }

        let previewResult = null
        if (nitaqatEngine) {
          previewResult = nitaqatEngine.calculateImpact({
            establishmentProfile: establishmentProfile || {
              saudiCount: 0, totalCount: 0,
            },
            candidateNationality: r.target_nationality || 'NON_SA',
            contractType:         r.contract_type === 'AI_EXECUTABLE' ? 'FREELANCER' : r.contract_type,
            roleCategory:         null,
            proposedSalary:       r.salary_min || 0,
          })
        } else {
          previewResult = { currentZone: 'UNKNOWN', projectedZone: 'UNKNOWN', note: 'nitaqat engine not available' }
        }

        await client.query(
          `UPDATE requisitions
           SET status = 'NITAQAT_PREVIEWED',
               nitaqat_preview_run_at = NOW(),
               nitaqat_preview_result = $1,
               updated_at = NOW()
           WHERE id = $2`,
          [JSON.stringify(previewResult), requisitionId]
        )

        return { requisitionId, previewResult, previewedAt: new Date().toISOString() }
      })
    },

    /**
     * Publish a requisition. REJECTS if Nitaqat preview not run or stale.
     */
    async publishRequisition(tenantId, requisitionId) {
      return withTenant(tenantId, async (client) => {
        const req = await client.query('SELECT * FROM requisitions WHERE id = $1', [requisitionId])
        if (!req.rows[0]) throw Object.assign(new Error('requisition not found'), { status: 404 })

        const r = req.rows[0]
        if (r.status !== 'NITAQAT_PREVIEWED') {
          throw Object.assign(new Error('requisition must have Nitaqat preview before publishing'), { status: 409 })
        }

        if (!r.nitaqat_preview_run_at) {
          throw Object.assign(new Error('Nitaqat preview has not been run'), { status: 409 })
        }

        const previewAge = Date.now() - new Date(r.nitaqat_preview_run_at).getTime()
        if (previewAge > STALENESS_MS) {
          throw Object.assign(new Error('Nitaqat preview is stale (>24h). Re-run preview before publishing.'), { status: 409 })
        }

        await client.query(
          `UPDATE requisitions
           SET status = 'PUBLISHED', published_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [requisitionId]
        )

        return { requisitionId, status: 'PUBLISHED', publishedAt: new Date().toISOString() }
      })
    },

    /**
     * Close a requisition with reason.
     */
    async closeRequisition(tenantId, requisitionId, reason) {
      return withTenant(tenantId, async (client) => {
        const req = await client.query('SELECT * FROM requisitions WHERE id = $1', [requisitionId])
        if (!req.rows[0]) throw Object.assign(new Error('requisition not found'), { status: 404 })

        if (req.rows[0].status === 'CLOSED' || req.rows[0].status === 'FILLED') {
          throw Object.assign(new Error(`requisition is already ${req.rows[0].status}`), { status: 409 })
        }

        await client.query(
          `UPDATE requisitions
           SET status = 'CLOSED', closed_reason = $1, updated_at = NOW()
           WHERE id = $2`,
          [reason || null, requisitionId]
        )

        return { requisitionId, status: 'CLOSED', reason }
      })
    },
  }
}

module.exports = { createRequisitionService }
