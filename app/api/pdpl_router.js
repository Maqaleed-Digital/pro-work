'use strict'

/**
 * S39-G6 Integration Wiring 4 — PDPL Router with Real Event Bus
 *
 * KSA PDPL / UAE PDPL Law 45/2021 DSR (Data Subject Request) API.
 * Hooks are wired to the real event bus (createEventPublisher) from the
 * start — no stub hooks. This is the production-ready integration.
 *
 * Routes:
 *   POST /api/compliance/pdpl/dsr              — submit DSR
 *   GET  /api/compliance/pdpl/dsr              — list DSRs
 *   GET  /api/compliance/pdpl/dsr/:id          — get DSR by ID
 *   POST /api/compliance/pdpl/dsr/:id/process  — process DSR
 *   GET  /api/compliance/pdpl/dsr/sla-alerts   — SLA alert list
 *   GET  /api/compliance/pdpl/coverage         — policy coverage info
 *
 * Event bus: uses shared InMemoryEventStore + createEventPublisher.
 */

const crypto = require('crypto')
const { createEventPublisher, InMemoryEventStore } = require('../modules/event_bus/index')

// ── Shared event store (one per router instance) ──────────────────────────────

function createPdplStore() {
  return {
    dsrs:   new Map(),   // dsr_id → dsr record
    events: new InMemoryEventStore(),
  }
}

// ── In-memory DSR helpers ─────────────────────────────────────────────────────

const DSR_TYPES   = new Set(['ACCESS', 'RECTIFICATION', 'ERASURE', 'PORTABILITY', 'OBJECTION', 'RESTRICTION'])
const TERMINAL    = new Set(['COMPLETED', 'REJECTED'])
const SLA_DAYS    = 30
const ALERT_DAYS  = 25

function daysSince(isoDate) {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000)
}

function computeSla(dsr) {
  const d = daysSince(dsr.submitted_at)
  return {
    days_elapsed:  d,
    sla_alert:     d >= ALERT_DAYS && !TERMINAL.has(dsr.status),
    sla_breached:  d >= SLA_DAYS   && !TERMINAL.has(dsr.status),
  }
}

// ── Response helpers ──────────────────────────────────────────────────────────

function ok(res, data) {
  const body = JSON.stringify({ ok: true, data })
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

function fail(res, code, message, status) {
  const body = JSON.stringify({ ok: false, error: { code, message } })
  res.writeHead(status || 400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

// ── Router factory ────────────────────────────────────────────────────────────

function createPdplRouter(opts) {
  opts = opts || {}

  const _store     = opts.store     || createPdplStore()
  const _publisher = opts.publisher || createEventPublisher({ eventStore: _store.events })

  // Helper: publish PDPL event with standard envelope
  async function emit(eventType, aggregateId, tenantId, payload) {
    await _publisher.publish({
      event_id:       crypto.randomUUID(),
      event_type:     eventType,
      event_version:  '1.0',
      occurred_at:    new Date().toISOString(),
      tenant_id:      tenantId || 'default',
      aggregate_type: 'DSR',
      aggregate_id:   aggregateId,
      actor:          { actor_type: 'SYSTEM', actor_id: 'pdpl-router' },
      correlation_id: crypto.randomUUID(),
      causation_id:   crypto.randomUUID(),
      source: { service: 'compliance', module: 'pdpl_router', environment: process.env.NODE_ENV || 'development' },
      trust_level:    'HIGH',
      requires_approval: false,
      payload,
      metadata: {},
    })
  }

  return {
    async handle(req, res, pathname, method, tenantId, body) {
      tenantId = tenantId || 'default'

      // POST /api/compliance/pdpl/dsr — submit DSR
      if (pathname === '/api/compliance/pdpl/dsr' && method === 'POST') {
        if (!body) return fail(res, 'MISSING_BODY', 'Request body required', 400)
        const { dsr_type, subject_id, description } = body
        if (!dsr_type || !DSR_TYPES.has(dsr_type)) {
          return fail(res, 'VALIDATION_ERROR', `dsr_type must be one of: ${[...DSR_TYPES].join(', ')}`, 422)
        }
        if (!subject_id) return fail(res, 'VALIDATION_ERROR', 'subject_id is required', 422)

        const dsr = {
          dsr_id:       'dsr-' + crypto.randomUUID().slice(0, 8),
          dsr_type,
          subject_id,
          tenant_id:    tenantId,
          description:  description || '',
          status:       'PENDING',
          submitted_at: new Date().toISOString(),
          processed_at: null,
          processed_by: null,
        }
        _store.dsrs.set(dsr.dsr_id, dsr)

        try {
          await emit('DSR_SUBMITTED', dsr.dsr_id, tenantId, {
            dsr_id: dsr.dsr_id, dsr_type, subject_id, tenant_id: tenantId,
          })
        } catch (e) {
          // event bus publish failure is logged but non-fatal for API response
          console.error('PDPL event bus error (DSR_SUBMITTED):', e.message)
        }

        return ok(res, dsr)
      }

      // GET /api/compliance/pdpl/dsr/sla-alerts (must be before /:id)
      if (pathname === '/api/compliance/pdpl/dsr/sla-alerts' && method === 'GET') {
        const alerts = Array.from(_store.dsrs.values())
          .map(dsr => ({ ...dsr, ...computeSla(dsr) }))
          .filter(d => d.sla_alert || d.sla_breached)
        return ok(res, alerts)
      }

      // GET /api/compliance/pdpl/dsr — list all
      if (pathname === '/api/compliance/pdpl/dsr' && method === 'GET') {
        const all = Array.from(_store.dsrs.values())
          .map(dsr => ({ ...dsr, ...computeSla(dsr) }))
        return ok(res, all)
      }

      // GET /api/compliance/pdpl/dsr/:id
      const dsrIdMatch = pathname.match(/^\/api\/compliance\/pdpl\/dsr\/([^/]+)$/)
      if (dsrIdMatch && method === 'GET') {
        const dsr = _store.dsrs.get(dsrIdMatch[1])
        if (!dsr) return fail(res, 'DSR_NOT_FOUND', 'DSR not found', 404)
        return ok(res, { ...dsr, ...computeSla(dsr) })
      }

      // POST /api/compliance/pdpl/dsr/:id/process
      const processMatch = pathname.match(/^\/api\/compliance\/pdpl\/dsr\/([^/]+)\/process$/)
      if (processMatch && method === 'POST') {
        const dsr = _store.dsrs.get(processMatch[1])
        if (!dsr) return fail(res, 'DSR_NOT_FOUND', 'DSR not found', 404)
        if (TERMINAL.has(dsr.status)) {
          return fail(res, 'DSR_TERMINAL', `DSR is in terminal state: ${dsr.status}`, 409)
        }

        const outcome = (body && body.outcome) || 'COMPLETED'
        if (!TERMINAL.has(outcome)) {
          return fail(res, 'VALIDATION_ERROR', `outcome must be one of: ${[...TERMINAL].join(', ')}`, 422)
        }

        const updated = Object.assign(dsr, {
          status:       outcome,
          processed_at: new Date().toISOString(),
          processed_by: (body && body.processed_by) || 'system',
        })

        try {
          await emit('DSR_PROCESSED', dsr.dsr_id, tenantId, {
            dsr_id: dsr.dsr_id, status: outcome, processed_by: updated.processed_by,
          })
        } catch (e) {
          console.error('PDPL event bus error (DSR_PROCESSED):', e.message)
        }

        return ok(res, { ...updated, ...computeSla(updated) })
      }

      // GET /api/compliance/pdpl/coverage
      if (pathname === '/api/compliance/pdpl/coverage' && method === 'GET') {
        return ok(res, {
          jurisdictions: ['KSA PDPL (Personal Data Protection Law)', 'UAE PDPL Law 45/2021'],
          dsr_types_supported: [...DSR_TYPES],
          sla_days: SLA_DAYS,
          alert_days: ALERT_DAYS,
          event_bus: 'wired',   // real event bus — not a stub
        })
      }

      return fail(res, 'NOT_FOUND', 'PDPL route not found', 404)
    },

    // Expose for testing
    _store,
    _publisher,
  }
}

module.exports = { createPdplRouter }
