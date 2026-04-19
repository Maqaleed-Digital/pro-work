'use strict'

const crypto = require('crypto')
const policy = require('../../config/compliance/probation_policy_v1.json')

const TRANSITIONS = policy.transitions
const TERMINAL    = new Set(policy.terminal)
const MAX_DAYS    = policy.maxTotalDays
const EXT_OPTIONS = new Set(policy.extensionOptions)
const TRIGGER_OFFSET = policy.day80TriggerOffsetDays
const EXPIRY_DAYS = policy.decisionExpiryDays

function createProbationPgService(opts) {
  if (!opts || !opts.pool) throw new Error('pool is required')
  const pool = opts.pool

  async function withTenant(tenantId, fn) {
    const client = await pool.connect()
    try {
      await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId])
      return await fn(client)
    } finally { client.release() }
  }

  async function emitEvent(client, tenantId, recordId, eventType, prevStatus, newStatus, actorUserId, actorType, payload) {
    await client.query(
      `INSERT INTO probation_events (id, tenant_id, probation_record_id, event_type, previous_status, new_status, actor_user_id, actor_type, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [crypto.randomUUID(), tenantId, recordId, eventType, prevStatus || null, newStatus || null, actorUserId || null, actorType || 'HUMAN', JSON.stringify(payload || {})]
    )
  }

  return {
    async createProbation(tenantId, contractId) {
      if (!tenantId || !contractId) throw Object.assign(new Error('tenantId and contractId required'), { status: 400 })

      return withTenant(tenantId, async (client) => {
        const cRow = await client.query('SELECT * FROM contracts WHERE id = $1', [contractId])
        if (!cRow.rows[0]) throw Object.assign(new Error('contract not found'), { status: 404 })
        const contract = cRow.rows[0]
        const qiwa = typeof contract.qiwa_parity_json === 'string' ? JSON.parse(contract.qiwa_parity_json) : contract.qiwa_parity_json
        const probDays = qiwa.probation_days || policy.defaultProbationDays

        const startDate = contract.activated_at ? new Date(contract.activated_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
        const endDate = new Date(new Date(startDate).getTime() + probDays * 86400000).toISOString().split('T')[0]

        const recordId = crypto.randomUUID()
        const result = await client.query(
          `INSERT INTO probation_records (id, tenant_id, contract_id, candidate_id, start_date, planned_end_date, status, probation_days, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, NOW(), NOW()) RETURNING *`,
          [recordId, tenantId, contractId, contract.candidate_id, startDate, endDate, probDays]
        )

        await emitEvent(client, tenantId, recordId, 'PROBATION_STARTED', null, 'ACTIVE', null, 'SYSTEM', { contract_id: contractId, probation_days: probDays })
        return result.rows[0]
      })
    },

    async getProbation(tenantId, id) {
      return withTenant(tenantId, async (client) => {
        const r = await client.query('SELECT * FROM probation_records WHERE id = $1', [id])
        return r.rows[0] || null
      })
    },

    async listProbations(tenantId, filters) {
      return withTenant(tenantId, async (client) => {
        let sql = 'SELECT * FROM probation_records'
        const params = []
        const where = []
        if (filters && filters.status) { params.push(filters.status); where.push(`status = $${params.length}`) }
        if (where.length) sql += ' WHERE ' + where.join(' AND ')
        sql += ' ORDER BY planned_end_date ASC'
        return (await client.query(sql, params)).rows
      })
    },

    async triggerDay80(tenantId, probationRecordId) {
      return withTenant(tenantId, async (client) => {
        const r = await client.query('SELECT * FROM probation_records WHERE id = $1', [probationRecordId])
        if (!r.rows[0]) throw Object.assign(new Error('probation record not found'), { status: 404 })
        const record = r.rows[0]

        // Idempotent — if already triggered, return existing
        if (record.status !== 'ACTIVE') {
          return { probationRecordId, status: record.status, idempotent: true, evidence_pack_id: record.day_80_evidence_pack_id }
        }

        // Generate evidence pack
        const packId = crypto.randomUUID()
        const tenantUuid = (() => { const h = crypto.createHash('md5').update(tenantId).digest('hex'); return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20,32) })()

        const snapshot = { probation_record: record, compiled_at: new Date().toISOString(), items: policy.evidencePackRequiredItems }
        const hash = crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex').slice(0, 32)

        await client.query(
          `INSERT INTO evidence_packs (pack_id, pack_type, tenant_id, status, actor, action, timestamp, data_snapshot, immutable_hash, policy_version, created_at)
           VALUES ($1, 'EP_WOS_RECRUIT_01', $2, 'CLOSED', $3, 'DAY_80_EVIDENCE', NOW(), $4, $5, 'v1', NOW())`,
          [packId, tenantUuid, JSON.stringify({ type: 'SYSTEM' }), JSON.stringify(snapshot), hash]
        )

        await client.query(
          'UPDATE probation_records SET status = $1, day_80_evidence_pack_id = $2, updated_at = NOW() WHERE id = $3',
          ['AWAITING_DECISION', packId, probationRecordId]
        )

        await emitEvent(client, tenantId, probationRecordId, 'DAY_80_TRIGGERED', 'ACTIVE', 'EVIDENCE_PACK_READY', null, 'SYSTEM', {})
        await emitEvent(client, tenantId, probationRecordId, 'EVIDENCE_COMPILED', 'EVIDENCE_PACK_READY', 'AWAITING_DECISION', null, 'SYSTEM', { evidence_pack_id: packId })

        return { probationRecordId, status: 'AWAITING_DECISION', evidence_pack_id: packId }
      })
    },

    async recordDecision(tenantId, probationId, decision, reason, actorUserId, extensionDays) {
      if (!['CONFIRM', 'EXTEND', 'TERMINATE'].includes(decision)) {
        throw Object.assign(new Error('decision must be CONFIRM, EXTEND, or TERMINATE'), { status: 422 })
      }
      if (!actorUserId) throw Object.assign(new Error('actorUserId is required for decisions'), { status: 400 })

      return withTenant(tenantId, async (client) => {
        const r = await client.query('SELECT * FROM probation_records WHERE id = $1', [probationId])
        if (!r.rows[0]) throw Object.assign(new Error('probation not found'), { status: 404 })
        const record = r.rows[0]

        if (record.decision) {
          throw Object.assign(new Error('decision already recorded on this probation'), { status: 409 })
        }

        if (record.status !== 'AWAITING_DECISION') {
          throw Object.assign(new Error('probation must be in AWAITING_DECISION to record decision'), { status: 409 })
        }

        let newStatus
        if (decision === 'CONFIRM') {
          newStatus = 'CONFIRMED'
          await client.query(
            'UPDATE probation_records SET status = $1, decision = $2, decision_reason = $3, decision_made_at = NOW(), decision_made_by = $4, actual_end_date = CURRENT_DATE, updated_at = NOW() WHERE id = $5',
            [newStatus, decision, reason || null, actorUserId, probationId]
          )
        } else if (decision === 'EXTEND') {
          if (!extensionDays || !EXT_OPTIONS.has(extensionDays)) {
            throw Object.assign(new Error(`extension_days must be one of: ${[...EXT_OPTIONS].join(', ')}`), { status: 422 })
          }
          const totalDays = record.probation_days + record.extension_days + extensionDays
          if (totalDays > MAX_DAYS) {
            throw Object.assign(new Error(`total probation + extension cannot exceed ${MAX_DAYS} days (would be ${totalDays})`), { status: 422 })
          }
          newStatus = 'EXTENDED'
          const newEndDate = new Date(new Date(record.planned_end_date).getTime() + extensionDays * 86400000).toISOString().split('T')[0]
          await client.query(
            'UPDATE probation_records SET status = $1, decision = $2, decision_reason = $3, decision_made_at = NOW(), decision_made_by = $4, extension_days = extension_days + $5, planned_end_date = $6, updated_at = NOW() WHERE id = $7',
            [newStatus, decision, reason || null, actorUserId, extensionDays, newEndDate, probationId]
          )
        } else if (decision === 'TERMINATE') {
          if (!reason || !reason.trim()) {
            throw Object.assign(new Error('reason is required for TERMINATE decision'), { status: 422 })
          }
          newStatus = 'TERMINATED'
          await client.query(
            'UPDATE probation_records SET status = $1, decision = $2, decision_reason = $3, decision_made_at = NOW(), decision_made_by = $4, actual_end_date = CURRENT_DATE, updated_at = NOW() WHERE id = $5',
            [newStatus, decision, reason, actorUserId, probationId]
          )
        }

        const eventType = decision === 'CONFIRM' ? 'CONFIRMED' : decision === 'EXTEND' ? 'EXTENDED' : 'TERMINATED'
        await emitEvent(client, tenantId, probationId, eventType, 'AWAITING_DECISION', newStatus, actorUserId, 'HUMAN',
          { decision, reason: reason || null, extension_days: extensionDays || null })

        return { probationId, decision, newStatus }
      })
    },

    async handleExpiredDecisions(tenantId) {
      return withTenant(tenantId, async (client) => {
        const result = await client.query(
          `SELECT * FROM probation_records WHERE status = 'AWAITING_DECISION' AND planned_end_date + $1 * INTERVAL '1 day' < NOW()`,
          [EXPIRY_DAYS]
        )
        const expired = []
        for (const record of result.rows) {
          await client.query('UPDATE probation_records SET status = $1, updated_at = NOW() WHERE id = $2', ['EXPIRED', record.id])
          await emitEvent(client, tenantId, record.id, 'EXPIRED_WITHOUT_DECISION', 'AWAITING_DECISION', 'EXPIRED', null, 'SYSTEM', {})
          expired.push(record.id)
        }
        return expired
      })
    },

    async getDueForDay80(tenantId) {
      return withTenant(tenantId, async (client) => {
        const result = await client.query(
          `SELECT * FROM probation_records WHERE status = 'ACTIVE' AND planned_end_date <= CURRENT_DATE + $1 * INTERVAL '1 day'`,
          [TRIGGER_OFFSET]
        )
        return result.rows
      })
    },

    async getProbationTimeline(tenantId, probationId) {
      return withTenant(tenantId, async (client) => {
        return (await client.query('SELECT * FROM probation_events WHERE probation_record_id = $1 ORDER BY created_at ASC', [probationId])).rows
      })
    },
  }
}

module.exports = { createProbationPgService }
