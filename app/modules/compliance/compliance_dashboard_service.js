'use strict'

/**
 * S39-G6 Integration Wiring 2 — Compliance Dashboard Service
 *
 * Wires the Nitaqat engine (recruiting/compliance_preview.js) into the
 * compliance dashboard so Nitaqat scores compute from real data instead
 * of returning insufficient_data fallback.
 *
 * S36-G3 Nitaqat store → S37-G6 compliance screen.
 */

const { previewNitaqatImpact, validateOccupationMatch } = require('../recruiting/compliance_preview')

class InMemoryNitaqatStore {
  constructor() {
    this._snapshots = new Map()  // candidateId → latest snapshot
  }

  save(candidateId, snapshot) {
    this._snapshots.set(candidateId, Object.assign({}, snapshot, { saved_at: new Date().toISOString() }))
    return this._snapshots.get(candidateId)
  }

  get(candidateId) {
    return this._snapshots.get(candidateId) || null
  }

  all() {
    return Array.from(this._snapshots.entries()).map(([id, s]) => ({ candidate_id: id, ...s }))
  }
}

/**
 * createComplianceDashboardService({ store? })
 *
 * Methods:
 *   computeNitaqatScore(input)   — compute + persist a Nitaqat score
 *   getNitaqatScore(candidateId) — retrieve latest persisted score
 *   listNitaqatScores()          — all stored scores
 *   validateOccupation(input)    — occupation match validation
 *   getDashboardSummary()        — aggregate compliance stats
 */
function createComplianceDashboardService(opts) {
  opts = opts || {}
  const store = opts.store || new InMemoryNitaqatStore()

  return {
    /**
     * computeNitaqatScore({ candidateId, candidate, requisition, employerProfile?, overrideInput? })
     *
     * Runs previewNitaqatImpact and persists the result.
     * Returns { candidateId, nitaqat, saved_at }.
     */
    computeNitaqatScore(input) {
      if (!input || !input.candidateId) {
        throw Object.assign(new Error('candidateId is required'), { code: 'NITAQAT_VALIDATION' })
      }
      if (!input.candidate) {
        throw Object.assign(new Error('candidate is required'), { code: 'NITAQAT_VALIDATION' })
      }
      if (!input.requisition) {
        throw Object.assign(new Error('requisition is required'), { code: 'NITAQAT_VALIDATION' })
      }

      const nitaqat = previewNitaqatImpact({
        candidate:       input.candidate,
        requisition:     input.requisition,
        employerProfile: input.employerProfile || null,
        overrideInput:   input.overrideInput   || null,
      })

      const saved = store.save(input.candidateId, { nitaqat, requisition_id: input.requisition.requisition_id || null })

      return { candidateId: input.candidateId, nitaqat, saved_at: saved.saved_at }
    },

    /**
     * getNitaqatScore(candidateId)
     *
     * Returns the latest persisted Nitaqat score. Throws NITAQAT_NOT_FOUND
     * if not yet computed (no more insufficient_data fallback — real data only).
     */
    getNitaqatScore(candidateId) {
      const snap = store.get(candidateId)
      if (!snap) {
        throw Object.assign(
          new Error(`No Nitaqat score computed for candidate "${candidateId}". Call computeNitaqatScore first.`),
          { code: 'NITAQAT_NOT_FOUND' },
        )
      }
      return { candidateId, ...snap }
    },

    /**
     * listNitaqatScores() — all persisted scores
     */
    listNitaqatScores() {
      return store.all()
    },

    /**
     * validateOccupation({ candidate, requisition, policyRules? })
     */
    validateOccupation(input) {
      if (!input || !input.candidate || !input.requisition) {
        throw Object.assign(new Error('candidate and requisition required'), { code: 'OCCUPATION_VALIDATION' })
      }
      return validateOccupationMatch({
        candidate:   input.candidate,
        requisition: input.requisition,
        policyRules: input.policyRules || null,
      })
    },

    /**
     * getDashboardSummary() — aggregate compliance stats
     */
    getDashboardSummary() {
      const all = store.all()
      const positive = all.filter(s => s.nitaqat && s.nitaqat.movement_band === 'POSITIVE').length
      const neutral  = all.filter(s => s.nitaqat && s.nitaqat.movement_band === 'NEUTRAL').length
      const negative = all.filter(s => s.nitaqat && s.nitaqat.movement_band === 'NEGATIVE').length
      return {
        total_scored: all.length,
        positive_band: positive,
        neutral_band:  neutral,
        negative_band: negative,
        positive_rate: all.length > 0 ? Math.round((positive / all.length) * 100) : null,
        data_source: 'nitaqat_engine',  // not insufficient_data
      }
    },

    store,
  }
}

module.exports = { createComplianceDashboardService, InMemoryNitaqatStore }
