'use strict'

const crypto = require('crypto')
const policyV1 = require('../../config/compliance/esb_policy_v1.json')

const POLICIES = { 'ksa-labor-law-v2015': policyV1 }
const VALID_TERMINATION = new Set(['RESIGNATION', 'EMPLOYER_TERMINATION', 'EXPIRY_OF_FIXED_TERM', 'DEATH', 'DISABILITY', 'MUTUAL_AGREEMENT'])
const VALID_CONTRACT = new Set(['FTE_UNLIMITED', 'FTE_FIXED_TERM'])

/**
 * Compute ESB from inputs + policy. Pure function — no side effects.
 * Returns { breakdown, finalAmount }.
 */
function computeESB(inputs, policy) {
  const { serviceYears, totalSalary, terminationType, contractType } = inputs

  const ruleSet = contractType === 'FTE_FIXED_TERM'
    ? policy.rules.fixed_term_contract
    : policy.rules.unlimited_contract

  const first5 = Math.min(serviceYears, 5)
  const past5 = Math.max(0, serviceYears - 5)

  const first5Amount = first5 * totalSalary * ruleSet.first_5_years_multiplier
  const past5Amount = past5 * totalSalary * ruleSet.past_5_years_multiplier
  const grossAmount = first5Amount + past5Amount

  // Termination factor
  let factor = 1.0
  const adj = ruleSet.termination_adjustments[terminationType]
  if (adj) {
    if (adj.factor !== undefined) {
      factor = adj.factor
    } else if (terminationType === 'RESIGNATION') {
      if (serviceYears < 2) factor = adj.under_2_years
      else if (serviceYears < 5) factor = adj['2_to_5_years_factor']
      else if (serviceYears < 10) factor = adj['5_to_10_years_factor']
      else factor = adj.over_10_years_factor
    }
  }

  const finalAmount = Math.round(grossAmount * factor * 100) / 100

  return {
    breakdown: {
      service_years: serviceYears,
      total_salary_used: totalSalary,
      first_5_years: round2(first5),
      first_5_amount: round2(first5Amount),
      past_5_years: round2(past5),
      past_5_amount: round2(past5Amount),
      gross_amount: round2(grossAmount),
      termination_type: terminationType,
      termination_factor: factor,
      final_amount: finalAmount,
    },
    finalAmount,
  }
}

function round2(n) { return Math.round(n * 100) / 100 }

function yearsBetween(start, end) {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return round2(ms / (365.25 * 86400000))
}

function createEsbService(opts) {
  if (!opts || !opts.pool) throw new Error('pool is required')
  const pool = opts.pool

  async function withTenant(tenantId, fn) {
    const client = await pool.connect()
    try {
      await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [tenantId])
      return await fn(client)
    } finally { client.release() }
  }

  async function emitEvent(client, tenantId, calcId, eventType, actorUserId, actorType, payload) {
    await client.query(
      `INSERT INTO esb_calculation_events (id, tenant_id, esb_calculation_id, event_type, actor_user_id, actor_type, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [crypto.randomUUID(), tenantId, calcId, eventType, actorUserId || null, actorType || 'HUMAN', JSON.stringify(payload || {})]
    )
  }

  return {
    async draftCalculation(tenantId, contractId, terminationType, serviceEndDate, policyVersion, actorUserId) {
      if (!VALID_TERMINATION.has(terminationType)) throw Object.assign(new Error('invalid termination_type'), { status: 422 })

      return withTenant(tenantId, async (client) => {
        const cRow = await client.query('SELECT * FROM contracts WHERE id = $1', [contractId])
        if (!cRow.rows[0]) throw Object.assign(new Error('contract not found'), { status: 404 })
        const contract = cRow.rows[0]

        if (!['FTE'].includes(contract.contract_type)) {
          throw Object.assign(new Error('ESB is only applicable to FTE contracts (not FREELANCER or AI_EXECUTABLE)'), { status: 422 })
        }

        const qiwa = typeof contract.qiwa_parity_json === 'string' ? JSON.parse(contract.qiwa_parity_json) : contract.qiwa_parity_json
        const contractSubType = qiwa.contract_duration === 'fixed_term' ? 'FTE_FIXED_TERM' : 'FTE_UNLIMITED'

        const pv = policyVersion || 'ksa-labor-law-v2015'
        const policy = POLICIES[pv]
        if (!policy) throw Object.assign(new Error(`policy version ${pv} not found`), { status: 422 })

        const startDate = contract.activated_at ? new Date(contract.activated_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
        const endDate = serviceEndDate || new Date().toISOString().split('T')[0]
        const serviceYears = yearsBetween(startDate, endDate)
        const basicSalary = qiwa.wage_base || 0
        const totalSalary = basicSalary + (qiwa.housing || 0) + (qiwa.transport || 0)

        const inputs = { serviceYears, totalSalary, basicSalary, terminationType, contractType: contractSubType, startDate, endDate }
        const { breakdown, finalAmount } = computeESB(inputs, policy)

        const calcId = crypto.randomUUID()
        const result = await client.query(
          `INSERT INTO esb_calculations
           (id, tenant_id, contract_id, candidate_id, policy_version, service_start_date, service_end_date,
            service_years, basic_salary_sar, total_salary_sar, termination_type, contract_type,
            calculation_inputs_json, calculation_breakdown_json, final_amount_sar, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'DRAFT', NOW(), NOW()) RETURNING *`,
          [calcId, tenantId, contractId, contract.candidate_id, pv, startDate, endDate,
           serviceYears, basicSalary, totalSalary, terminationType, contractSubType,
           JSON.stringify(inputs), JSON.stringify(breakdown), finalAmount]
        )

        await emitEvent(client, tenantId, calcId, 'CALCULATION_DRAFTED', actorUserId, 'HUMAN', { inputs, breakdown, final_amount_sar: finalAmount })
        return result.rows[0]
      })
    },

    async recalculate(tenantId, calculationId, patch, actorUserId) {
      return withTenant(tenantId, async (client) => {
        const r = await client.query('SELECT * FROM esb_calculations WHERE id = $1', [calculationId])
        if (!r.rows[0]) throw Object.assign(new Error('calculation not found'), { status: 404 })
        if (r.rows[0].status !== 'DRAFT') throw Object.assign(new Error('only DRAFT calculations can be recalculated'), { status: 409 })

        const calc = r.rows[0]
        const prevInputs = typeof calc.calculation_inputs_json === 'string' ? JSON.parse(calc.calculation_inputs_json) : calc.calculation_inputs_json
        const newInputs = Object.assign({}, prevInputs, patch)

        if (patch.terminationType) newInputs.terminationType = patch.terminationType
        if (patch.serviceEndDate) {
          newInputs.endDate = patch.serviceEndDate
          newInputs.serviceYears = yearsBetween(newInputs.startDate, newInputs.endDate)
        }

        const pv = calc.policy_version
        const policy = POLICIES[pv]
        const { breakdown, finalAmount } = computeESB(newInputs, policy)

        const prevAmount = parseFloat(calc.final_amount_sar)

        await client.query(
          `UPDATE esb_calculations SET calculation_inputs_json = $1, calculation_breakdown_json = $2,
           final_amount_sar = $3, termination_type = $4, service_years = $5, updated_at = NOW() WHERE id = $6`,
          [JSON.stringify(newInputs), JSON.stringify(breakdown), finalAmount, newInputs.terminationType, newInputs.serviceYears, calculationId]
        )

        await emitEvent(client, tenantId, calculationId, 'RECALCULATED', actorUserId, 'HUMAN',
          { previous_amount: prevAmount, new_amount: finalAmount, patch })

        return { calculationId, previous_amount: prevAmount, new_amount: finalAmount, breakdown }
      })
    },

    async finalize(tenantId, calculationId, actorUserId) {
      return withTenant(tenantId, async (client) => {
        const r = await client.query('SELECT * FROM esb_calculations WHERE id = $1', [calculationId])
        if (!r.rows[0]) throw Object.assign(new Error('calculation not found'), { status: 404 })
        if (r.rows[0].status !== 'DRAFT') throw Object.assign(new Error('only DRAFT calculations can be finalized'), { status: 409 })

        await client.query(
          'UPDATE esb_calculations SET status = $1, finalized_at = NOW(), finalized_by = $2, updated_at = NOW() WHERE id = $3',
          ['FINALIZED', actorUserId || null, calculationId]
        )

        await emitEvent(client, tenantId, calculationId, 'FINALIZED', actorUserId, 'HUMAN',
          { final_amount_sar: parseFloat(r.rows[0].final_amount_sar) })

        return { calculationId, status: 'FINALIZED', final_amount_sar: parseFloat(r.rows[0].final_amount_sar) }
      })
    },

    async getCalculation(tenantId, id) {
      return withTenant(tenantId, async (client) => {
        const r = await client.query('SELECT * FROM esb_calculations WHERE id = $1', [id])
        return r.rows[0] || null
      })
    },

    async listCalculationsByContract(tenantId, contractId) {
      return withTenant(tenantId, async (client) => {
        return (await client.query('SELECT * FROM esb_calculations WHERE contract_id = $1 ORDER BY created_at DESC', [contractId])).rows
      })
    },

    async getTimeline(tenantId, id) {
      return withTenant(tenantId, async (client) => {
        return (await client.query('SELECT * FROM esb_calculation_events WHERE esb_calculation_id = $1 ORDER BY created_at ASC', [id])).rows
      })
    },

    // Exported for testing reproducibility
    computeESB, yearsBetween,
  }
}

module.exports = { createEsbService }
