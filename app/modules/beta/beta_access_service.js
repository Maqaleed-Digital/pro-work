'use strict'

/**
 * S39-G6 Beta Access Service
 *
 * Enforces hard limits at the service layer (not just UI):
 *   - Employers:  max 50
 *   - Freelancers: max 200
 *   - FTE workers: max 10
 *
 * Limits are checked on every registration attempt and raise
 * BETA_LIMIT_REACHED with the account type and current/max counts.
 */

const BETA_LIMITS = {
  employer:   50,
  freelancer: 200,
  fte:        10,
}

const VALID_TYPES = new Set(Object.keys(BETA_LIMITS))

class InMemoryBetaStore {
  constructor() {
    this._accounts = new Map()  // account_id → { account_id, account_type, enrolled_at, tenant_id }
  }

  insert(record) {
    const stored = Object.assign({}, record)
    this._accounts.set(record.account_id, stored)
    return stored
  }

  get(accountId) {
    return this._accounts.get(accountId) || null
  }

  remove(accountId) {
    return this._accounts.delete(accountId)
  }

  countByType(accountType) {
    let n = 0
    for (const r of this._accounts.values()) {
      if (r.account_type === accountType) n++
    }
    return n
  }

  all() {
    return Array.from(this._accounts.values())
  }

  snapshot() {
    const counts = {}
    for (const t of VALID_TYPES) counts[t] = 0
    for (const r of this._accounts.values()) {
      if (counts[r.account_type] !== undefined) counts[r.account_type]++
    }
    return counts
  }
}

/**
 * createBetaAccessService({ store? })
 *
 * Methods:
 *   enroll({ account_id, account_type, tenant_id? })
 *     → { account_id, account_type, enrolled_at, tenant_id } | throws BETA_LIMIT_REACHED
 *
 *   remove(accountId)
 *     → boolean
 *
 *   isEnrolled(accountId)
 *     → boolean
 *
 *   getAccount(accountId)
 *     → record | null
 *
 *   getSnapshot()
 *     → { employer: n, freelancer: n, fte: n, limits: { employer, freelancer, fte } }
 *
 *   getLimits()
 *     → { employer, freelancer, fte }
 */
function createBetaAccessService(opts) {
  opts = opts || {}
  const store = opts.store || new InMemoryBetaStore()

  return {
    enroll(input) {
      if (!input || !input.account_id) {
        const err = new Error('account_id is required')
        err.code = 'BETA_VALIDATION'
        throw err
      }
      if (!input.account_type || !VALID_TYPES.has(input.account_type)) {
        const err = new Error(`account_type must be one of: ${[...VALID_TYPES].join(', ')}`)
        err.code = 'BETA_VALIDATION'
        throw err
      }
      if (store.get(input.account_id)) {
        const err = new Error(`Account "${input.account_id}" is already enrolled in beta`)
        err.code = 'BETA_ALREADY_ENROLLED'
        throw err
      }

      const current = store.countByType(input.account_type)
      const max     = BETA_LIMITS[input.account_type]
      if (current >= max) {
        const err = new Error(
          `Beta limit reached for ${input.account_type}: ${current}/${max} accounts enrolled`
        )
        err.code         = 'BETA_LIMIT_REACHED'
        err.account_type = input.account_type
        err.current      = current
        err.max          = max
        throw err
      }

      return store.insert({
        account_id:   input.account_id,
        account_type: input.account_type,
        tenant_id:    input.tenant_id || 'default',
        enrolled_at:  new Date().toISOString(),
      })
    },

    remove(accountId) {
      return store.remove(accountId)
    },

    isEnrolled(accountId) {
      return store.get(accountId) !== null
    },

    getAccount(accountId) {
      return store.get(accountId)
    },

    getSnapshot() {
      const counts = store.snapshot()
      return {
        employer:   counts.employer,
        freelancer: counts.freelancer,
        fte:        counts.fte,
        limits:     Object.assign({}, BETA_LIMITS),
      }
    },

    getLimits() {
      return Object.assign({}, BETA_LIMITS)
    },

    store,
  }
}

module.exports = { createBetaAccessService, InMemoryBetaStore, BETA_LIMITS }
