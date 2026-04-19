'use strict'

/**
 * S44-G6: SDP Program Service.
 *
 * NON-EMPLOYMENT CONSTRAINT (Gold BRD §A5 + RT-1 §7.6):
 * This service does NOT accept, store, or process shift data, attendance data,
 * clock-in/clock-out records, hourly schedules, or roster assignments.
 * SDP programs use delivery windows and outcome criteria exclusively.
 * This is a structural constraint, not a feature gap.
 */

const crypto = require('crypto')
const templates = require('../../config/programs/sdp_pod_templates_v1.json')

const TEMPLATE_MAP = {}
templates.forEach(t => { TEMPLATE_MAP[t.template_type] = t })

const TRANSITIONS = {
  DRAFT:      ['APPROVED', 'CANCELLED'],
  APPROVED:   ['ACTIVE', 'CANCELLED'],
  ACTIVE:     ['WOUND_DOWN', 'CANCELLED'],
  WOUND_DOWN: ['CLOSED'],
  CLOSED:     [],
  CANCELLED:  [],
}
const TERMINAL = new Set(['CLOSED', 'CANCELLED'])
const MAX_DURATION_DAYS = 730 // 2 years

function createSdpProgramService(opts) {
  if (!opts || !opts.pool) throw new Error('pool is required')
  const pool = opts.pool

  async function withTenant(tenantId, fn) {
    const client = await pool.connect()
    try {
      await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId])
      return await fn(client)
    } finally { client.release() }
  }

  async function emitEvent(client, tenantId, programId, eventType, actorUserId, actorType, payload) {
    await client.query(
      `INSERT INTO sdp_program_events (id, tenant_id, program_id, event_type, actor_user_id, actor_type, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [crypto.randomUUID(), tenantId, programId, eventType, actorUserId || null, actorType || 'HUMAN', JSON.stringify(payload || {})]
    )
  }

  return {
    async draftProgram(tenantId, payload, actorUserId) {
      if (!payload.name_en) throw Object.assign(new Error('name_en is required'), { status: 422 })
      if (!payload.name_ar) throw Object.assign(new Error('name_ar is required'), { status: 422 })
      if (!payload.start_date || !payload.end_date) throw Object.assign(new Error('start_date and end_date are required'), { status: 422 })
      if (new Date(payload.end_date) <= new Date(payload.start_date)) {
        throw Object.assign(new Error('end_date must be after start_date'), { status: 422 })
      }
      const durationDays = (new Date(payload.end_date) - new Date(payload.start_date)) / 86400000
      if (durationDays > MAX_DURATION_DAYS) {
        throw Object.assign(new Error(`program duration cannot exceed ${MAX_DURATION_DAYS} days`), { status: 422 })
      }

      // Reject shift/attendance fields
      if (payload.shift || payload.attendance || payload.clock_in || payload.roster) {
        throw Object.assign(new Error('shift/attendance/clock-in/roster fields are not permitted (Gold BRD §A5)'), { status: 422 })
      }

      return withTenant(tenantId, async (client) => {
        const id = crypto.randomUUID()
        const result = await client.query(
          `INSERT INTO sdp_programs (id, tenant_id, name_en, name_ar, program_type, start_date, end_date,
            capacity_roles, budget_envelope_sar, compliance_flags_json, status, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'DRAFT',NOW(),NOW()) RETURNING *`,
          [id, tenantId, payload.name_en, payload.name_ar, payload.program_type || 'OTHER',
           payload.start_date, payload.end_date, payload.capacity_roles || 0,
           payload.budget_envelope_sar || 0, JSON.stringify(payload.compliance_flags || {})]
        )
        await emitEvent(client, tenantId, id, 'PROGRAM_DRAFTED', actorUserId, 'HUMAN', { program_type: payload.program_type })
        return result.rows[0]
      })
    },

    async approveProgram(tenantId, programId, actorUserId) {
      return withTenant(tenantId, async (client) => {
        const r = await client.query('SELECT * FROM sdp_programs WHERE id = $1', [programId])
        if (!r.rows[0]) throw Object.assign(new Error('program not found'), { status: 404 })
        if (r.rows[0].status !== 'DRAFT') throw Object.assign(new Error('only DRAFT programs can be approved'), { status: 409 })
        await client.query('UPDATE sdp_programs SET status=$1, approved_at=NOW(), approved_by=$2, updated_at=NOW() WHERE id=$3', ['APPROVED', actorUserId || null, programId])
        await emitEvent(client, tenantId, programId, 'PROGRAM_APPROVED', actorUserId, 'HUMAN', {})
        return { programId, status: 'APPROVED' }
      })
    },

    async activateProgram(tenantId, programId, actorUserId) {
      return withTenant(tenantId, async (client) => {
        const r = await client.query('SELECT * FROM sdp_programs WHERE id = $1', [programId])
        if (!r.rows[0]) throw Object.assign(new Error('program not found'), { status: 404 })
        if (r.rows[0].status !== 'APPROVED') throw Object.assign(new Error('only APPROVED programs can be activated'), { status: 409 })
        await client.query('UPDATE sdp_programs SET status=$1, activated_at=NOW(), activated_by=$2, updated_at=NOW() WHERE id=$3', ['ACTIVE', actorUserId || null, programId])
        await emitEvent(client, tenantId, programId, 'PROGRAM_ACTIVATED', actorUserId, 'HUMAN', {})
        return { programId, status: 'ACTIVE' }
      })
    },

    async windDownProgram(tenantId, programId, actorUserId) {
      return withTenant(tenantId, async (client) => {
        const r = await client.query('SELECT * FROM sdp_programs WHERE id = $1', [programId])
        if (!r.rows[0]) throw Object.assign(new Error('program not found'), { status: 404 })
        if (r.rows[0].status !== 'ACTIVE') throw Object.assign(new Error('only ACTIVE programs can be wound down'), { status: 409 })
        await client.query('UPDATE sdp_programs SET status=$1, wound_down_at=NOW(), updated_at=NOW() WHERE id=$2', ['WOUND_DOWN', programId])
        await emitEvent(client, tenantId, programId, 'PROGRAM_WOUND_DOWN', actorUserId, 'HUMAN', {})
        return { programId, status: 'WOUND_DOWN' }
      })
    },

    async closeProgram(tenantId, programId, actorUserId) {
      return withTenant(tenantId, async (client) => {
        const r = await client.query('SELECT * FROM sdp_programs WHERE id = $1', [programId])
        if (!r.rows[0]) throw Object.assign(new Error('program not found'), { status: 404 })
        if (r.rows[0].status !== 'WOUND_DOWN') throw Object.assign(new Error('only WOUND_DOWN programs can be closed'), { status: 409 })
        await client.query('UPDATE sdp_programs SET status=$1, closed_at=NOW(), closed_by=$2, updated_at=NOW() WHERE id=$3', ['CLOSED', actorUserId || null, programId])
        await emitEvent(client, tenantId, programId, 'PROGRAM_CLOSED', actorUserId, 'HUMAN', {})
        return { programId, status: 'CLOSED' }
      })
    },

    async cancelProgram(tenantId, programId, reason, actorUserId) {
      if (!reason) throw Object.assign(new Error('cancellation reason required'), { status: 422 })
      return withTenant(tenantId, async (client) => {
        const r = await client.query('SELECT * FROM sdp_programs WHERE id = $1', [programId])
        if (!r.rows[0]) throw Object.assign(new Error('program not found'), { status: 404 })
        if (TERMINAL.has(r.rows[0].status)) throw Object.assign(new Error('cannot cancel terminal program'), { status: 409 })
        await client.query('UPDATE sdp_programs SET status=$1, cancellation_reason=$2, updated_at=NOW() WHERE id=$3', ['CANCELLED', reason, programId])
        await emitEvent(client, tenantId, programId, 'PROGRAM_CANCELLED', actorUserId, 'HUMAN', { reason })
        return { programId, status: 'CANCELLED' }
      })
    },

    async getProgram(tenantId, programId) {
      return withTenant(tenantId, async (client) => {
        const r = await client.query('SELECT * FROM sdp_programs WHERE id = $1', [programId])
        return r.rows[0] || null
      })
    },

    async listPrograms(tenantId, filters) {
      return withTenant(tenantId, async (client) => {
        let sql = 'SELECT * FROM sdp_programs'
        const params = []
        if (filters && filters.status) { params.push(filters.status); sql += ` WHERE status = $${params.length}` }
        sql += ' ORDER BY start_date ASC'
        return (await client.query(sql, params)).rows
      })
    },

    async instantiatePod(tenantId, programId, templateType, overrides, actorUserId) {
      const tpl = TEMPLATE_MAP[templateType]
      if (!tpl && templateType !== 'CUSTOM') throw Object.assign(new Error(`unknown template: ${templateType}`), { status: 422 })

      return withTenant(tenantId, async (client) => {
        const prog = await client.query('SELECT * FROM sdp_programs WHERE id = $1', [programId])
        if (!prog.rows[0]) throw Object.assign(new Error('program not found'), { status: 404 })

        const ov = overrides || {}
        const criteria = ov.outcome_criteria || (tpl ? tpl.default_outcome_criteria : [])
        if (!criteria || criteria.length === 0) {
          throw Object.assign(new Error('outcome_criteria required (non-empty array)'), { status: 422 })
        }

        const capacity = ov.capacity_roles || (tpl ? tpl.default_roles.reduce((s, r) => s + r.count, 0) : 0)
        const name = ov.name || (tpl ? `${tpl.template_type} Pod` : 'Custom Pod')
        const dwStart = ov.delivery_window_start || prog.rows[0].start_date
        const dwEnd = ov.delivery_window_end || prog.rows[0].end_date

        if (!dwStart || !dwEnd) throw Object.assign(new Error('delivery window dates required'), { status: 422 })

        const podId = crypto.randomUUID()
        const result = await client.query(
          `INSERT INTO sdp_pods (id, tenant_id, program_id, template_type, template_version, name,
            capacity_roles, delivery_window_start, delivery_window_end, outcome_criteria_json, status, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PLANNED',NOW(),NOW()) RETURNING *`,
          [podId, tenantId, programId, templateType, tpl ? tpl.version : 'custom',
           name, capacity, dwStart, dwEnd, JSON.stringify(criteria)]
        )

        await emitEvent(client, tenantId, programId, 'POD_INSTANTIATED', actorUserId, 'HUMAN',
          { pod_id: podId, template_type: templateType })
        return result.rows[0]
      })
    },

    async listPods(tenantId, programId) {
      return withTenant(tenantId, async (client) => {
        return (await client.query('SELECT * FROM sdp_pods WHERE program_id = $1 ORDER BY created_at ASC', [programId])).rows
      })
    },

    async completePod(tenantId, podId, actorUserId) {
      return withTenant(tenantId, async (client) => {
        const r = await client.query('SELECT * FROM sdp_pods WHERE id = $1', [podId])
        if (!r.rows[0]) throw Object.assign(new Error('pod not found'), { status: 404 })
        if (!['PLANNED', 'ACTIVE'].includes(r.rows[0].status)) throw Object.assign(new Error('pod cannot be completed from ' + r.rows[0].status), { status: 409 })
        await client.query('UPDATE sdp_pods SET status=$1, updated_at=NOW() WHERE id=$2', ['COMPLETED', podId])
        await emitEvent(client, tenantId, r.rows[0].program_id, 'POD_COMPLETED', actorUserId, 'HUMAN', { pod_id: podId })
        return { podId, status: 'COMPLETED' }
      })
    },

    async getProgramTimeline(tenantId, programId) {
      return withTenant(tenantId, async (client) => {
        return (await client.query('SELECT * FROM sdp_program_events WHERE program_id = $1 ORDER BY created_at ASC', [programId])).rows
      })
    },
  }
}

module.exports = { createSdpProgramService }
