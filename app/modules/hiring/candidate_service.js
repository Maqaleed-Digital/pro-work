'use strict'

const crypto = require('crypto')
const { withTenant: _withTenantShared } = require('../../lib/persistence/with_tenant')

/**
 * S43-G3: Candidate service.
 * @param {Object} opts
 * @param {Object} opts.pool - pg Pool
 */
function createCandidateService(opts) {
  if (!opts || !opts.pool) throw new Error('pool is required')
  const pool = opts.pool

  async function withTenant(tenantId, fn) { return _withTenantShared(pool, tenantId, fn) }

  return {
    async createCandidate(tenantId, payload) {
      if (!tenantId) throw Object.assign(new Error('tenantId is required'), { status: 400 })
      if (!payload || !payload.first_name || !payload.last_name || !payload.email) {
        throw Object.assign(new Error('first_name, last_name, and email are required'), { status: 422 })
      }

      return withTenant(tenantId, async (client) => {
        try {
          const result = await client.query(
            `INSERT INTO candidates (id, tenant_id, first_name, last_name, email, nationality, phone, linkedin_url, source, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
             RETURNING *`,
            [
              crypto.randomUUID(), tenantId,
              payload.first_name, payload.last_name,
              payload.email.toLowerCase().trim(),
              payload.nationality || null,
              payload.phone || null,
              payload.linkedin_url || null,
              payload.source || 'DIRECT',
            ]
          )
          return result.rows[0]
        } catch (e) {
          if (e.code === '23505') {
            throw Object.assign(new Error('candidate email already exists in this tenant'), { status: 409 })
          }
          throw e
        }
      })
    },

    async getCandidate(tenantId, candidateId) {
      return withTenant(tenantId, async (client) => {
        const result = await client.query('SELECT * FROM candidates WHERE id = $1', [candidateId])
        return result.rows[0] || null
      })
    },

    async listCandidates(tenantId, filters) {
      return withTenant(tenantId, async (client) => {
        let sql = 'SELECT * FROM candidates'
        const params = []
        if (filters && filters.source) {
          params.push(filters.source)
          sql += ` WHERE source = $${params.length}`
        }
        sql += ' ORDER BY created_at DESC'
        if (filters && filters.limit) {
          params.push(parseInt(filters.limit, 10))
          sql += ` LIMIT $${params.length}`
        }
        const result = await client.query(sql, params)
        return result.rows
      })
    },

    async updateCandidateEri(tenantId, candidateId, score) {
      return withTenant(tenantId, async (client) => {
        const result = await client.query(
          'UPDATE candidates SET eri_score = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
          [score, candidateId]
        )
        if (result.rowCount === 0) throw Object.assign(new Error('candidate not found'), { status: 404 })
        return result.rows[0]
      })
    },
  }
}

module.exports = { createCandidateService }
