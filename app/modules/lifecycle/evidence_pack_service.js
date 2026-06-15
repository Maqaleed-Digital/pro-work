'use strict'

/**
 * S39-G6 Integration Wiring 3 — Evidence Pack Service
 *
 * Provides a real store for offboarding evidence packs (EP_WOS_OFFBOARD_01).
 * When offboarding_service.generateEvidencePack() is called, this service
 * persists the evidence pack record to a queryable store.
 *
 * Design: thin service, factory function. Consumed from server.js via
 * optional injection into createOffboardingService hooks.
 */

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message)
    err.name  = 'EvidencePackServiceError'
    throw err
  }
}

class InMemoryEvidencePackStore {
  constructor() {
    this._packs = new Map()  // evidence_pack_id → record
  }

  insert(record) {
    const stored = Object.assign({}, record, { stored_at: new Date().toISOString() })
    this._packs.set(record.evidence_pack_id, stored)
    return stored
  }

  get(evidencePackId) {
    return this._packs.get(evidencePackId) || null
  }

  listByOffboardingCase(offboardingCaseId) {
    return Array.from(this._packs.values())
      .filter(p => p.offboarding_case_id === offboardingCaseId)
  }

  all() {
    return Array.from(this._packs.values())
  }

  count() { return this._packs.size }
}

/**
 * createEvidencePackService({ store? })
 *
 * Methods:
 *   createPack(input)                     — store a new evidence pack record
 *   getPack(evidencePackId)               — retrieve by ID
 *   listByCase(offboardingCaseId)         — all packs for a case
 *   all()                                 — all packs
 */
function createEvidencePackService(opts) {
  opts = opts || {}
  const store = opts.store || new InMemoryEvidencePackStore()

  return {
    createPack(input) {
      assert(input.evidence_pack_id,     'evidence_pack_id is required')
      assert(input.offboarding_case_id,  'offboarding_case_id is required')
      assert(input.worker_id || input.tenant_id, 'worker_id or tenant_id required')

      return store.insert({
        evidence_pack_id:    input.evidence_pack_id,
        offboarding_case_id: input.offboarding_case_id,
        worker_id:           input.worker_id   || null,
        tenant_id:           input.tenant_id   || null,
        handover_count:      input.handover_count || 0,
        pack_type:           input.pack_type   || 'EP_WOS_OFFBOARD_01',
        status:              'GENERATED',
        generated_at:        input.generated_at || new Date().toISOString(),
        metadata:            input.metadata || {},
      })
    },

    getPack(evidencePackId) {
      const pack = store.get(evidencePackId)
      if (!pack) {
        throw Object.assign(
          new Error(`Evidence pack "${evidencePackId}" not found`),
          { code: 'EVIDENCE_PACK_NOT_FOUND' },
        )
      }
      return pack
    },

    listByCase(offboardingCaseId) {
      return store.listByOffboardingCase(offboardingCaseId)
    },

    all() { return store.all() },

    store,
  }
}

module.exports = { createEvidencePackService, InMemoryEvidencePackStore }
