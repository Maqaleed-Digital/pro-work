'use strict'

const { hasPermission, PERMISSIONS } = require('../modules/auth/rbac_policy')

/**
 * S43-G1: Requisition API router.
 *
 * All routes require JWT auth + HIRING_MANAGER (or higher) permission.
 */
function createRequisitionRouter(opts) {
  if (!opts || !opts.requisitionService) throw new Error('requisitionService is required')

  const svc = opts.requisitionService

  function ok(res, data, status) {
    const body = JSON.stringify({ ok: true, data })
    res.writeHead(status || 200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(body)
  }

  function fail(res, code, message, status) {
    const body = JSON.stringify({ ok: false, error: { code, message } })
    res.writeHead(status || 400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(body)
  }

  async function handle(req, res, pathname, method, body, user) {
    // Auth gate
    if (!user) return fail(res, 'UNAUTHORIZED', 'authentication required', 401)
    if (!hasPermission(user.role, PERMISSIONS.CREATE_REQUISITION) &&
        !hasPermission(user.role, PERMISSIONS.VIEW_WORKERS)) {
      return fail(res, 'FORBIDDEN', `role ${user.role} cannot access requisitions`, 403)
    }

    // POST /api/hiring/requisitions — create
    if (pathname === '/api/hiring/requisitions' && method === 'POST') {
      if (!hasPermission(user.role, PERMISSIONS.CREATE_REQUISITION)) {
        return fail(res, 'FORBIDDEN', 'CREATE_REQUISITION permission required', 403)
      }
      if (!body) return fail(res, 'MISSING_BODY', 'request body required', 400)
      try {
        const result = await svc.createRequisition(user.tenant_id, user.id, body)
        return ok(res, result, 201)
      } catch (e) {
        return fail(res, 'REQUISITION_ERROR', e.message, e.status || 400)
      }
    }

    // GET /api/hiring/requisitions — list
    if (pathname === '/api/hiring/requisitions' && method === 'GET') {
      try {
        const url = new URL(req.url, 'http://localhost')
        const filters = {
          status: url.searchParams.get('status') || undefined,
          limit:  url.searchParams.get('limit') || undefined,
        }
        const result = await svc.listRequisitions(user.tenant_id, filters)
        return ok(res, { requisitions: result })
      } catch (e) {
        return fail(res, 'REQUISITION_ERROR', e.message, e.status || 500)
      }
    }

    // Match /:id routes
    const idMatch = pathname.match(/^\/api\/hiring\/requisitions\/([^/]+)$/)
    const previewMatch = pathname.match(/^\/api\/hiring\/requisitions\/([^/]+)\/nitaqat-preview$/)
    const publishMatch = pathname.match(/^\/api\/hiring\/requisitions\/([^/]+)\/publish$/)
    const closeMatch   = pathname.match(/^\/api\/hiring\/requisitions\/([^/]+)\/close$/)
    const rankMatch    = pathname.match(/^\/api\/hiring\/requisitions\/([^/]+)\/rank-candidates$/)
    const reviewMatch  = pathname.match(/^\/api\/hiring\/recommendations\/([^/]+)\/review$/)
    const appsMatch    = pathname.match(/^\/api\/hiring\/requisitions\/([^/]+)\/applications$/)
    const appStatusMatch = pathname.match(/^\/api\/hiring\/applications\/([^/]+)\/status$/)
    const appTimelineMatch = pathname.match(/^\/api\/hiring\/applications\/([^/]+)\/timeline$/)
    const recDetailMatch = pathname.match(/^\/api\/hiring\/recommendations\/([^/]+)$/)

    // GET /api/hiring/requisitions/:id
    if (idMatch && method === 'GET') {
      try {
        const result = await svc.getRequisition(user.tenant_id, idMatch[1])
        if (!result) return fail(res, 'NOT_FOUND', 'requisition not found', 404)
        return ok(res, result)
      } catch (e) {
        return fail(res, 'REQUISITION_ERROR', e.message, e.status || 500)
      }
    }

    // PATCH /api/hiring/requisitions/:id
    if (idMatch && method === 'PATCH') {
      if (!hasPermission(user.role, PERMISSIONS.CREATE_REQUISITION)) {
        return fail(res, 'FORBIDDEN', 'CREATE_REQUISITION permission required', 403)
      }
      if (!body) return fail(res, 'MISSING_BODY', 'request body required', 400)
      try {
        const result = await svc.updateRequisition(user.tenant_id, idMatch[1], body)
        return ok(res, result)
      } catch (e) {
        return fail(res, 'REQUISITION_ERROR', e.message, e.status || 400)
      }
    }

    // POST /api/hiring/requisitions/:id/nitaqat-preview
    if (previewMatch && method === 'POST') {
      try {
        const profile = body && body.establishmentProfile ? body.establishmentProfile : undefined
        const result = await svc.runNitaqatPreview(user.tenant_id, previewMatch[1], profile)
        return ok(res, result)
      } catch (e) {
        return fail(res, 'NITAQAT_PREVIEW_ERROR', e.message, e.status || 400)
      }
    }

    // POST /api/hiring/requisitions/:id/publish
    if (publishMatch && method === 'POST') {
      if (!hasPermission(user.role, PERMISSIONS.CREATE_REQUISITION)) {
        return fail(res, 'FORBIDDEN', 'CREATE_REQUISITION permission required', 403)
      }
      try {
        const result = await svc.publishRequisition(user.tenant_id, publishMatch[1])
        return ok(res, result)
      } catch (e) {
        return fail(res, 'PUBLISH_ERROR', e.message, e.status || 400)
      }
    }

    // POST /api/hiring/requisitions/:id/close
    if (closeMatch && method === 'POST') {
      try {
        const reason = body && body.reason ? body.reason : null
        const result = await svc.closeRequisition(user.tenant_id, closeMatch[1], reason)
        return ok(res, result)
      } catch (e) {
        return fail(res, 'CLOSE_ERROR', e.message, e.status || 400)
      }
    }

    // POST /api/hiring/requisitions/:id/rank-candidates
    if (rankMatch && method === 'POST') {
      if (!hasPermission(user.role, PERMISSIONS.CREATE_REQUISITION)) {
        return fail(res, 'FORBIDDEN', 'HIRING_MANAGER permission required', 403)
      }
      if (!opts.aiMatchingService) return fail(res, 'SERVICE_UNAVAILABLE', 'AI matching not configured', 503)
      try {
        const result = await opts.aiMatchingService.rankCandidates(user.tenant_id, rankMatch[1], body || {})
        return ok(res, result)
      } catch (e) {
        return fail(res, 'MATCHING_ERROR', e.message, e.status || 400)
      }
    }

    // POST /api/hiring/recommendations/:logId/review
    if (reviewMatch && method === 'POST') {
      if (!hasPermission(user.role, PERMISSIONS.CREATE_REQUISITION)) {
        return fail(res, 'FORBIDDEN', 'HIRING_MANAGER permission required', 403)
      }
      if (!opts.aiMatchingService) return fail(res, 'SERVICE_UNAVAILABLE', 'AI matching not configured', 503)
      if (!body) return fail(res, 'MISSING_BODY', 'request body required', 400)
      try {
        const result = await opts.aiMatchingService.reviewRecommendation(
          user.tenant_id, reviewMatch[1], body.decision, user.id, body.override_reason
        )
        return ok(res, result)
      } catch (e) {
        return fail(res, 'REVIEW_ERROR', e.message, e.status || 400)
      }
    }

    // GET /api/hiring/requisitions/:id/applications — list pipeline
    if (appsMatch && method === 'GET') {
      if (!opts.applicationService) return fail(res, 'SERVICE_UNAVAILABLE', 'application service not configured', 503)
      try {
        const result = await opts.applicationService.listApplications(user.tenant_id, appsMatch[1])
        return ok(res, { applications: result })
      } catch (e) {
        return fail(res, 'APPLICATION_ERROR', e.message, e.status || 500)
      }
    }

    // PATCH /api/hiring/applications/:id/status — transition
    if (appStatusMatch && method === 'PATCH') {
      if (!opts.applicationService) return fail(res, 'SERVICE_UNAVAILABLE', 'application service not configured', 503)
      if (!body) return fail(res, 'MISSING_BODY', 'request body required', 400)
      try {
        const result = await opts.applicationService.transitionStatus(
          user.tenant_id, appStatusMatch[1], body.status, user.id, body.reason || body
        )
        return ok(res, result)
      } catch (e) {
        return fail(res, 'TRANSITION_ERROR', e.message, e.status || 400)
      }
    }

    // GET /api/hiring/applications/:id/timeline
    if (appTimelineMatch && method === 'GET') {
      if (!opts.applicationService) return fail(res, 'SERVICE_UNAVAILABLE', 'application service not configured', 503)
      try {
        const result = await opts.applicationService.getApplicationTimeline(user.tenant_id, appTimelineMatch[1])
        return ok(res, { events: result })
      } catch (e) {
        return fail(res, 'TIMELINE_ERROR', e.message, e.status || 500)
      }
    }

    // GET /api/hiring/recommendations/:logId — detail
    if (recDetailMatch && method === 'GET') {
      try {
        const client = await opts.requisitionService._pool_ref.connect()
        try {
          await client.query("SELECT set_config('app.current_tenant_id', $1, false)", [user.tenant_id])
          const crypto = require('crypto')
          const tenantUuid = (() => {
            const h = crypto.createHash('md5').update(user.tenant_id).digest('hex')
            return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20,32)
          })()
          await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantUuid])
          const result = await client.query('SELECT * FROM recommendation_audit_logs WHERE id = $1', [recDetailMatch[1]])
          if (!result.rows[0]) return fail(res, 'NOT_FOUND', 'recommendation not found', 404)
          const log = result.rows[0]
          return ok(res, {
            id: log.id,
            action_type: log.action_type,
            input_signals: log.input_signals,
            rationale: log.rationale,
            confidence_score: log.confidence_score,
            bias_score: log.bias_score,
            model_version: log.model_version,
            reviewer_decision: log.reviewer_decision,
            output_snapshot: log.output_snapshot,
          })
        } finally { client.release() }
      } catch (e) {
        return fail(res, 'RECOMMENDATION_ERROR', e.message, e.status || 500)
      }
    }

    return fail(res, 'NOT_FOUND', 'requisition route not found', 404)
  }

  return { handle }
}

module.exports = { createRequisitionRouter }
