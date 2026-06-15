'use strict'

/**
 * S39-G6 Integration Wiring 1 — Audit Log Service
 *
 * Thin append-only audit log used by talent marketplace (matching_engine)
 * to record RECOMMENDATION entries when FTE→FREELANCER ranking decisions
 * are made.
 *
 * Factory function pattern. Store is injected — never a singleton.
 */

class InMemoryAuditStore {
  constructor() {
    this._entries = []
  }

  append(entry) {
    const stamped = Object.assign({}, entry, {
      audit_id:   entry.audit_id   || ('aud-' + Math.random().toString(36).slice(2)),
      logged_at:  entry.logged_at  || new Date().toISOString(),
    })
    this._entries.push(stamped)
    return stamped
  }

  list(filter) {
    if (!filter) return this._entries.slice()
    return this._entries.filter(e => {
      if (filter.action    && e.action    !== filter.action)    return false
      if (filter.entity_id && e.entity_id !== filter.entity_id) return false
      if (filter.actor_id  && e.actor_id  !== filter.actor_id)  return false
      return true
    })
  }

  count() { return this._entries.length }
}

/**
 * createAuditLogService({ store })
 *
 * Returns:
 *   log(action, entity_type, entity_id, actor_id, payload?) — append entry
 *   list(filter?)    — query entries
 *   count(filter?)   — count entries
 */
function createAuditLogService(opts) {
  opts = opts || {}
  const store = opts.store || new InMemoryAuditStore()

  return {
    log(action, entity_type, entity_id, actor_id, payload) {
      if (!action || !entity_type || !entity_id) {
        throw Object.assign(new Error('action, entity_type, entity_id are required'), { code: 'AUDIT_VALIDATION' })
      }
      return store.append({
        action,
        entity_type,
        entity_id,
        actor_id: actor_id || 'system',
        payload:  payload  || {},
      })
    },

    list(filter)  { return store.list(filter)  },
    count(filter) { return store.list(filter).length },

    store,
  }
}

module.exports = { createAuditLogService, InMemoryAuditStore }
