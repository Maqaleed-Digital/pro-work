'use strict'

const crypto = require('crypto')
const { withTenant: _withTenantShared } = require('../../lib/persistence/with_tenant')
const checklist = require('../../config/compliance/offboarding_checklist_v1.json')

const ITEMS = checklist.items
const REQUIRED_ITEMS = ITEMS.filter(i => i.required)

function createOffboardingPgService(opts) {
  if (!opts || !opts.pool) throw new Error('pool is required')
  const pool = opts.pool

  async function withTenant(tenantId, fn) { return _withTenantShared(pool, tenantId, fn) }

  async function emitEvent(client, tenantId, offId, eventType, prevStatus, newStatus, actorUserId, actorType, payload) {
    await client.query(
      `INSERT INTO offboarding_events (id, tenant_id, offboarding_id, event_type, previous_status, new_status, actor_user_id, actor_type, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [crypto.randomUUID(), tenantId, offId, eventType, prevStatus || null, newStatus || null, actorUserId || null, actorType || 'HUMAN', JSON.stringify(payload || {})]
    )
  }

  function allRequiredComplete(state) {
    for (const item of REQUIRED_ITEMS) {
      const s = state[item.key]
      if (!s || (s.status !== 'COMPLETE' && s.status !== 'N/A')) return false
    }
    return true
  }

  function allApprovalsRecorded(approvals) {
    return approvals.hr && approvals.finance && approvals.manager
  }

  return {
    async initiate(tenantId, contractId, reasonType, reasonText, noticeServedFrom, actorUserId) {
      if (!reasonText || !reasonText.trim()) throw Object.assign(new Error('reason_text is required'), { status: 422 })

      return withTenant(tenantId, async (client) => {
        const cRow = await client.query('SELECT * FROM contracts WHERE id = $1', [contractId])
        if (!cRow.rows[0]) throw Object.assign(new Error('contract not found'), { status: 404 })
        const contract = cRow.rows[0]
        const qiwa = typeof contract.qiwa_parity_json === 'string' ? JSON.parse(contract.qiwa_parity_json) : contract.qiwa_parity_json

        const noticeDays = qiwa.notice_period_days || 30
        const servedFrom = noticeServedFrom || new Date().toISOString().split('T')[0]
        const servedUntil = new Date(new Date(servedFrom).getTime() + noticeDays * 86400000).toISOString().split('T')[0]
        const lastDay = servedUntil

        // Load linked entities
        const wpsRow = await client.query('SELECT id FROM wps_readiness_packs WHERE contract_id = $1 LIMIT 1', [contractId])
        const probRow = await client.query('SELECT id FROM probation_records WHERE contract_id = $1 LIMIT 1', [contractId])
        const esbRow = await client.query('SELECT id FROM esb_calculations WHERE contract_id = $1 AND status = $2 LIMIT 1', [contractId, 'FINALIZED'])

        const initState = {}
        ITEMS.forEach(i => { initState[i.key] = { status: 'PENDING', completedBy: null, completedAt: null } })

        const offId = crypto.randomUUID()
        const result = await client.query(
          `INSERT INTO offboardings (id, tenant_id, contract_id, candidate_id,
            wps_readiness_pack_id, probation_record_id, esb_calculation_id,
            status, reason_type, reason_text, notice_period_days,
            notice_served_from, notice_served_until, last_working_day,
            checklist_state_json, approvals_json, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'INITIATED',$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW()) RETURNING *`,
          [offId, tenantId, contractId, contract.candidate_id,
           wpsRow.rows[0]?.id || null, probRow.rows[0]?.id || null, esbRow.rows[0]?.id || null,
           reasonType, reasonText.trim(), noticeDays,
           servedFrom, servedUntil, lastDay,
           JSON.stringify(initState), JSON.stringify({})]
        )

        await emitEvent(client, tenantId, offId, 'OFFBOARDING_INITIATED', null, 'INITIATED', actorUserId, 'HUMAN',
          { contract_id: contractId, reason_type: reasonType })
        return result.rows[0]
      })
    },

    async completeChecklistItem(tenantId, offboardingId, itemKey, completedBy, na) {
      const itemDef = ITEMS.find(i => i.key === itemKey)
      if (!itemDef) throw Object.assign(new Error(`unknown checklist item: ${itemKey}`), { status: 422 })
      if (na && !itemDef.n_a_allowed) throw Object.assign(new Error(`item ${itemKey} does not allow N/A`), { status: 422 })

      return withTenant(tenantId, async (client) => {
        const r = await client.query('SELECT * FROM offboardings WHERE id = $1', [offboardingId])
        if (!r.rows[0]) throw Object.assign(new Error('offboarding not found'), { status: 404 })
        const off = r.rows[0]
        if (off.status === 'FINALIZED' || off.status === 'CANCELLED') {
          throw Object.assign(new Error('offboarding is already ' + off.status), { status: 409 })
        }

        const state = typeof off.checklist_state_json === 'string' ? JSON.parse(off.checklist_state_json) : off.checklist_state_json

        // Check prerequisite
        if (itemDef.prerequisite) {
          const prereq = state[itemDef.prerequisite]
          if (!prereq || prereq.status === 'PENDING') {
            throw Object.assign(new Error(`prerequisite ${itemDef.prerequisite} must be completed first`), { status: 409 })
          }
        }

        state[itemKey] = { status: na ? 'N/A' : 'COMPLETE', completedBy, completedAt: new Date().toISOString() }

        // Determine new status based on phase completion
        let newStatus = off.status
        const handoverItems = ITEMS.filter(i => i.phase === 'HANDOVER')
        const settlementItems = ITEMS.filter(i => i.phase === 'SETTLEMENT')
        const handoverDone = handoverItems.every(i => !i.required || ['COMPLETE', 'N/A'].includes((state[i.key] || {}).status))
        const settlementDone = settlementItems.every(i => !i.required || ['COMPLETE', 'N/A'].includes((state[i.key] || {}).status))

        if (handoverDone && !settlementDone && (off.status === 'INITIATED' || off.status === 'HANDOVER')) {
          newStatus = 'SETTLEMENT_PENDING'
        } else if (handoverDone && settlementDone && off.status !== 'APPROVALS_PENDING' && off.status !== 'READY_TO_FINALIZE') {
          newStatus = 'APPROVALS_PENDING'
        }

        await client.query('UPDATE offboardings SET checklist_state_json = $1, status = $2, updated_at = NOW() WHERE id = $3',
          [JSON.stringify(state), newStatus, offboardingId])

        await emitEvent(client, tenantId, offboardingId, 'CHECKLIST_ITEM_COMPLETED', off.status, newStatus, completedBy, 'HUMAN',
          { item_key: itemKey, na })
        return { offboardingId, itemKey, newStatus }
      })
    },

    async linkEsbCalculation(tenantId, offboardingId, esbCalculationId) {
      return withTenant(tenantId, async (client) => {
        const esbRow = await client.query('SELECT status FROM esb_calculations WHERE id = $1', [esbCalculationId])
        if (!esbRow.rows[0] || esbRow.rows[0].status !== 'FINALIZED') {
          throw Object.assign(new Error('ESB calculation must be FINALIZED before linking'), { status: 409 })
        }
        await client.query('UPDATE offboardings SET esb_calculation_id = $1, updated_at = NOW() WHERE id = $2', [esbCalculationId, offboardingId])
        await emitEvent(client, tenantId, offboardingId, 'ESB_LINKED', null, null, null, 'HUMAN', { esb_calculation_id: esbCalculationId })
        return { offboardingId, esb_linked: true }
      })
    },

    async recordApproval(tenantId, offboardingId, approvalType, approverUserId) {
      if (!['hr', 'finance', 'manager'].includes(approvalType)) {
        throw Object.assign(new Error('approvalType must be hr, finance, or manager'), { status: 422 })
      }

      return withTenant(tenantId, async (client) => {
        const r = await client.query('SELECT * FROM offboardings WHERE id = $1', [offboardingId])
        if (!r.rows[0]) throw Object.assign(new Error('offboarding not found'), { status: 404 })
        const off = r.rows[0]

        const approvals = typeof off.approvals_json === 'string' ? JSON.parse(off.approvals_json) : off.approvals_json
        approvals[approvalType] = { userId: approverUserId, at: new Date().toISOString() }

        let newStatus = off.status
        if (allApprovalsRecorded(approvals) && allRequiredComplete(
          typeof off.checklist_state_json === 'string' ? JSON.parse(off.checklist_state_json) : off.checklist_state_json
        )) {
          newStatus = 'READY_TO_FINALIZE'
        }

        await client.query('UPDATE offboardings SET approvals_json = $1, status = $2, updated_at = NOW() WHERE id = $3',
          [JSON.stringify(approvals), newStatus, offboardingId])

        await emitEvent(client, tenantId, offboardingId, 'APPROVAL_RECORDED', off.status, newStatus, approverUserId, 'HUMAN',
          { approval_type: approvalType })

        if (newStatus === 'READY_TO_FINALIZE' && off.status !== 'READY_TO_FINALIZE') {
          await emitEvent(client, tenantId, offboardingId, 'READY_FLAGGED', off.status, 'READY_TO_FINALIZE', null, 'SYSTEM', {})
        }

        return { offboardingId, approvalType, newStatus }
      })
    },

    async finalize(tenantId, offboardingId, actorUserId) {
      return withTenant(tenantId, async (client) => {
        const r = await client.query('SELECT * FROM offboardings WHERE id = $1', [offboardingId])
        if (!r.rows[0]) throw Object.assign(new Error('offboarding not found'), { status: 404 })
        const off = r.rows[0]

        if (off.status !== 'READY_TO_FINALIZE') {
          throw Object.assign(new Error('offboarding must be READY_TO_FINALIZE to finalize'), { status: 409 })
        }

        // Collect all snapshots for EP-WOS-OFFBOARD-01
        const contractRow = await client.query('SELECT * FROM contracts WHERE id = $1', [off.contract_id])
        const wpsRow = off.wps_readiness_pack_id
          ? await client.query('SELECT * FROM wps_readiness_packs WHERE id = $1', [off.wps_readiness_pack_id]) : { rows: [] }
        const probRow = off.probation_record_id
          ? await client.query('SELECT * FROM probation_records WHERE id = $1', [off.probation_record_id]) : { rows: [] }
        const esbRow = off.esb_calculation_id
          ? await client.query('SELECT * FROM esb_calculations WHERE id = $1', [off.esb_calculation_id]) : { rows: [] }
        const eventsRow = await client.query('SELECT * FROM offboarding_events WHERE offboarding_id = $1 ORDER BY created_at ASC', [offboardingId])

        const snapshot = {
          contract: contractRow.rows[0] || null,
          wps_readiness: wpsRow.rows[0] || null,
          probation: probRow.rows[0] || null,
          esb_calculation: esbRow.rows[0] || null,
          offboarding: off,
          events: eventsRow.rows,
        }

        const packId = crypto.randomUUID()
        const snapshotJson = JSON.stringify(snapshot)
        const hash = crypto.createHash('sha256').update(snapshotJson).digest('hex').slice(0, 32)
        const tenantUuid = (() => { const h = crypto.createHash('md5').update(tenantId).digest('hex'); return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20,32) })()

        await client.query(
          `INSERT INTO evidence_packs (pack_id, pack_type, tenant_id, status, actor, action, timestamp, data_snapshot, immutable_hash, policy_version, created_at)
           VALUES ($1, 'EP_WOS_OFFBOARD_01', $2, 'CLOSED', $3, 'OFFBOARDING_FINALIZED', NOW(), $4, $5, 'v1', NOW())`,
          [packId, tenantUuid, JSON.stringify({ user_id: actorUserId, type: 'HUMAN' }), snapshotJson, hash]
        )

        // Update offboarding
        await client.query(
          'UPDATE offboardings SET status = $1, evidence_pack_id = $2, finalized_at = NOW(), finalized_by = $3, updated_at = NOW() WHERE id = $4',
          ['FINALIZED', packId, actorUserId || null, offboardingId]
        )

        // Terminate the contract
        await client.query(
          'UPDATE contracts SET status = $1, terminated_at = NOW(), termination_reason = $2, updated_at = NOW() WHERE id = $3',
          ['TERMINATED', off.reason_text, off.contract_id]
        )

        await emitEvent(client, tenantId, offboardingId, 'FINALIZED', 'READY_TO_FINALIZE', 'FINALIZED', actorUserId, 'HUMAN', { evidence_pack_id: packId })
        await emitEvent(client, tenantId, offboardingId, 'EVIDENCE_PACK_GENERATED', null, null, null, 'SYSTEM', { evidence_pack_id: packId, pack_hash: hash })

        return { offboardingId, status: 'FINALIZED', evidence_pack_id: packId, pack_hash: hash }
      })
    },

    async cancel(tenantId, offboardingId, reason, actorUserId) {
      if (!reason || !reason.trim()) throw Object.assign(new Error('cancel reason required'), { status: 422 })

      return withTenant(tenantId, async (client) => {
        const r = await client.query('SELECT * FROM offboardings WHERE id = $1', [offboardingId])
        if (!r.rows[0]) throw Object.assign(new Error('offboarding not found'), { status: 404 })
        if (r.rows[0].status === 'FINALIZED') throw Object.assign(new Error('cannot cancel finalized offboarding'), { status: 409 })

        await client.query('UPDATE offboardings SET status = $1, cancelled_reason = $2, updated_at = NOW() WHERE id = $3',
          ['CANCELLED', reason.trim(), offboardingId])
        await emitEvent(client, tenantId, offboardingId, 'CANCELLED', r.rows[0].status, 'CANCELLED', actorUserId, 'HUMAN', { reason })
        return { offboardingId, status: 'CANCELLED' }
      })
    },

    async getOffboarding(tenantId, id) {
      return withTenant(tenantId, async (client) => {
        const r = await client.query('SELECT * FROM offboardings WHERE id = $1', [id])
        return r.rows[0] || null
      })
    },

    async listOffboardings(tenantId, filters) {
      return withTenant(tenantId, async (client) => {
        let sql = 'SELECT * FROM offboardings'
        const params = []
        if (filters && filters.status) { params.push(filters.status); sql += ` WHERE status = $${params.length}` }
        sql += ' ORDER BY created_at DESC'
        return (await client.query(sql, params)).rows
      })
    },

    async getTimeline(tenantId, offboardingId) {
      return withTenant(tenantId, async (client) => {
        return (await client.query('SELECT * FROM offboarding_events WHERE offboarding_id = $1 ORDER BY created_at ASC', [offboardingId])).rows
      })
    },
  }
}

module.exports = { createOffboardingPgService }
