'use strict'

const crypto = require('crypto')
const checklist = require('../../config/compliance/wps_checklist_v1.json')

const IBAN_PATTERN = new RegExp(checklist.ibanFormat.pattern)
const ITEMS = checklist.items
const TOTAL_WEIGHT = ITEMS.reduce((s, i) => s + i.weight, 0)

function hashIban(iban) {
  return crypto.createHash('sha256').update(iban).digest('hex')
}

function maskIban(iban) {
  return '****' + iban.slice(-4)
}

function computeReadiness(pack) {
  let score = 0
  const checks = {
    iban_captured:       !!pack.iban_hash,
    iban_verified:       !!pack.iban_verified_at,
    identity_verified:   pack.identity_status === 'VERIFIED',
    bank_confirmed:      pack.bank_confirmation_status === 'CONFIRMED',
    salary_populated:    pack.salary_amount_sar != null && pack.salary_amount_sar > 0,
    breakdown_populated: pack.salary_breakdown_json && Object.keys(
      typeof pack.salary_breakdown_json === 'string' ? JSON.parse(pack.salary_breakdown_json) : pack.salary_breakdown_json
    ).length > 0,
  }
  for (const item of ITEMS) {
    if (checks[item.id]) score += item.weight
  }
  return Math.round((score / TOTAL_WEIGHT) * 100)
}

/**
 * S44-G2: WPS Readiness Service (PostgreSQL-backed).
 */
function createWpsReadinessPgService(opts) {
  if (!opts || !opts.pool) throw new Error('pool is required')
  const pool = opts.pool

  async function withTenant(tenantId, fn) {
    const client = await pool.connect()
    try {
      await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId])
      return await fn(client)
    } finally { client.release() }
  }

  async function emitEvent(client, tenantId, packId, eventType, actorUserId, actorType, payload) {
    await client.query(
      `INSERT INTO wps_readiness_events (id, tenant_id, wps_readiness_pack_id, event_type, actor_user_id, actor_type, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [crypto.randomUUID(), tenantId, packId, eventType, actorUserId || null, actorType || 'HUMAN', JSON.stringify(payload || {})]
    )
  }

  async function updateReadiness(client, packId, pack) {
    const pct = computeReadiness(pack)
    await client.query('UPDATE wps_readiness_packs SET readiness_score_pct = $1, updated_at = NOW() WHERE id = $2', [pct, packId])
    return pct
  }

  return {
    async createPack(tenantId, contractId) {
      if (!tenantId || !contractId) throw Object.assign(new Error('tenantId and contractId required'), { status: 400 })

      return withTenant(tenantId, async (client) => {
        const cRow = await client.query('SELECT * FROM contracts WHERE id = $1', [contractId])
        if (!cRow.rows[0]) throw Object.assign(new Error('contract not found'), { status: 404 })
        const contract = cRow.rows[0]
        const qiwa = typeof contract.qiwa_parity_json === 'string' ? JSON.parse(contract.qiwa_parity_json) : contract.qiwa_parity_json

        const salaryAmount = qiwa.wage_base || 0
        const breakdown = { base: qiwa.wage_base || 0, housing: qiwa.housing || 0, transport: qiwa.transport || 0 }

        const packId = crypto.randomUUID()
        const result = await client.query(
          `INSERT INTO wps_readiness_packs (id, tenant_id, contract_id, candidate_id, status, salary_amount_sar, salary_breakdown_json, readiness_score_pct, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'NOT_STARTED', $5, $6, 0, NOW(), NOW()) RETURNING *`,
          [packId, tenantId, contractId, contract.candidate_id, salaryAmount, JSON.stringify(breakdown)]
        )

        const pack = result.rows[0]
        const pct = computeReadiness(pack)
        if (pct > 0) {
          await client.query('UPDATE wps_readiness_packs SET readiness_score_pct = $1, status = $2, updated_at = NOW() WHERE id = $3',
            [pct, 'IN_PROGRESS', packId])
          pack.readiness_score_pct = pct
          pack.status = 'IN_PROGRESS'
        }

        await emitEvent(client, tenantId, packId, 'PACK_CREATED', null, 'SYSTEM', { contract_id: contractId })
        return pack
      })
    },

    async captureIban(tenantId, packId, iban, actorUserId) {
      if (!iban || !IBAN_PATTERN.test(iban)) {
        throw Object.assign(new Error('invalid IBAN format — must match SA + 22 digits'), { status: 422 })
      }

      return withTenant(tenantId, async (client) => {
        const masked = maskIban(iban)
        const hashed = hashIban(iban)
        await client.query(
          'UPDATE wps_readiness_packs SET iban_masked = $1, iban_hash = $2, status = $3, updated_at = NOW() WHERE id = $4',
          [masked, hashed, 'IN_PROGRESS', packId]
        )

        const pack = (await client.query('SELECT * FROM wps_readiness_packs WHERE id = $1', [packId])).rows[0]
        const pct = await updateReadiness(client, packId, pack)
        await emitEvent(client, tenantId, packId, 'IBAN_CAPTURED', actorUserId, 'HUMAN', { iban_masked: masked })
        return { packId, iban_masked: masked, readiness_score_pct: pct }
      })
    },

    async verifyIban(tenantId, packId, actorUserId) {
      return withTenant(tenantId, async (client) => {
        const pack = (await client.query('SELECT * FROM wps_readiness_packs WHERE id = $1', [packId])).rows[0]
        if (!pack) throw Object.assign(new Error('pack not found'), { status: 404 })
        if (!pack.iban_hash) throw Object.assign(new Error('IBAN must be captured before verification'), { status: 409 })

        await client.query('UPDATE wps_readiness_packs SET iban_verified_at = NOW(), updated_at = NOW() WHERE id = $1', [packId])
        pack.iban_verified_at = new Date().toISOString()
        const pct = await updateReadiness(client, packId, pack)
        await emitEvent(client, tenantId, packId, 'IBAN_VERIFIED', actorUserId, 'HUMAN', {})
        return { packId, readiness_score_pct: pct }
      })
    },

    async verifyIdentity(tenantId, packId, evidenceRef, actorUserId) {
      return withTenant(tenantId, async (client) => {
        await client.query(
          'UPDATE wps_readiness_packs SET identity_status = $1, identity_verified_at = NOW(), updated_at = NOW() WHERE id = $2',
          ['VERIFIED', packId]
        )
        const pack = (await client.query('SELECT * FROM wps_readiness_packs WHERE id = $1', [packId])).rows[0]
        const pct = await updateReadiness(client, packId, pack)
        await emitEvent(client, tenantId, packId, 'IDENTITY_VERIFIED', actorUserId, 'HUMAN', { evidence_ref: evidenceRef })
        return { packId, readiness_score_pct: pct }
      })
    },

    async confirmBank(tenantId, packId, actorUserId, confirmationRef) {
      return withTenant(tenantId, async (client) => {
        await client.query(
          'UPDATE wps_readiness_packs SET bank_confirmation_status = $1, bank_confirmation_at = NOW(), updated_at = NOW() WHERE id = $2',
          ['CONFIRMED', packId]
        )
        const pack = (await client.query('SELECT * FROM wps_readiness_packs WHERE id = $1', [packId])).rows[0]
        const pct = await updateReadiness(client, packId, pack)
        await emitEvent(client, tenantId, packId, 'BANK_CONFIRMED', actorUserId, 'HUMAN', { confirmation_ref: confirmationRef })
        return { packId, readiness_score_pct: pct }
      })
    },

    async markReady(tenantId, packId, actorUserId) {
      return withTenant(tenantId, async (client) => {
        const pack = (await client.query('SELECT * FROM wps_readiness_packs WHERE id = $1', [packId])).rows[0]
        if (!pack) throw Object.assign(new Error('pack not found'), { status: 404 })
        if (pack.readiness_score_pct < 100) {
          throw Object.assign(new Error(`readiness must be 100% to mark ready (current: ${pack.readiness_score_pct}%)`), { status: 422 })
        }

        await client.query('UPDATE wps_readiness_packs SET status = $1, updated_at = NOW() WHERE id = $2', ['READY', packId])
        await emitEvent(client, tenantId, packId, 'MARKED_READY', actorUserId, 'HUMAN', {})
        return { packId, status: 'READY' }
      })
    },

    async generateArtifact(tenantId, packId) {
      return withTenant(tenantId, async (client) => {
        const pack = (await client.query('SELECT * FROM wps_readiness_packs WHERE id = $1', [packId])).rows[0]
        if (!pack) throw Object.assign(new Error('pack not found'), { status: 404 })

        const artifactRef = 'WPS-ART-' + crypto.randomUUID().slice(0, 8)
        await client.query(
          'UPDATE wps_readiness_packs SET last_artifact_generated_at = NOW(), updated_at = NOW() WHERE id = $1', [packId]
        )
        await emitEvent(client, tenantId, packId, 'ARTIFACT_GENERATED', null, 'SYSTEM', { artifact_ref: artifactRef })
        return { packId, artifact_ref: artifactRef }
      })
    },

    async getPack(tenantId, packId) {
      return withTenant(tenantId, async (client) => {
        const r = await client.query('SELECT * FROM wps_readiness_packs WHERE id = $1', [packId])
        return r.rows[0] || null
      })
    },

    async listPacks(tenantId) {
      return withTenant(tenantId, async (client) => {
        const r = await client.query('SELECT * FROM wps_readiness_packs ORDER BY created_at DESC')
        return r.rows
      })
    },

    async getPackTimeline(tenantId, packId) {
      return withTenant(tenantId, async (client) => {
        const r = await client.query(
          'SELECT * FROM wps_readiness_events WHERE wps_readiness_pack_id = $1 ORDER BY created_at ASC', [packId]
        )
        return r.rows
      })
    },

    // Exported for testing
    computeReadiness, hashIban, maskIban,
  }
}

module.exports = { createWpsReadinessPgService }
