'use strict'

const { hasPermission, PERMISSIONS } = require('../modules/auth/rbac_policy')

function createOfferRouter(opts) {
  if (!opts || !opts.offerService) throw new Error('offerService is required')
  const svc = opts.offerService

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
    if (!user) return fail(res, 'UNAUTHORIZED', 'authentication required', 401)
    if (!hasPermission(user.role, PERMISSIONS.CREATE_REQUISITION)) {
      return fail(res, 'FORBIDDEN', 'HIRING_MANAGER permission required', 403)
    }

    // POST /api/hiring/offers
    if (pathname === '/api/hiring/offers' && method === 'POST') {
      if (!body) return fail(res, 'MISSING_BODY', 'request body required', 400)
      try {
        const result = await svc.createOffer(user.tenant_id, body.application_id, body.offer_type, body.payload || body)
        return ok(res, result, 201)
      } catch (e) { return fail(res, 'OFFER_ERROR', e.message, e.status || 400) }
    }

    const idMatch = pathname.match(/^\/api\/hiring\/offers\/([^/]+)$/)
    const previewMatch = pathname.match(/^\/api\/hiring\/offers\/([^/]+)\/compliance-preview$/)
    const sendMatch = pathname.match(/^\/api\/hiring\/offers\/([^/]+)\/send$/)

    // GET /api/hiring/offers/:id
    if (idMatch && method === 'GET') {
      try {
        const result = await svc.getOffer(user.tenant_id, idMatch[1])
        if (!result) return fail(res, 'NOT_FOUND', 'offer not found', 404)
        return ok(res, result)
      } catch (e) { return fail(res, 'OFFER_ERROR', e.message, e.status || 500) }
    }

    // PATCH /api/hiring/offers/:id
    if (idMatch && method === 'PATCH') {
      if (!body) return fail(res, 'MISSING_BODY', 'request body required', 400)
      try {
        const result = await svc.updateOffer(user.tenant_id, idMatch[1], body)
        return ok(res, result)
      } catch (e) { return fail(res, 'OFFER_ERROR', e.message, e.status || 400) }
    }

    // POST /api/hiring/offers/:id/compliance-preview
    if (previewMatch && method === 'POST') {
      try {
        const result = await svc.runCompliancePreview(user.tenant_id, previewMatch[1])
        return ok(res, result)
      } catch (e) { return fail(res, 'COMPLIANCE_ERROR', e.message, e.status || 400) }
    }

    // POST /api/hiring/offers/:id/send
    if (sendMatch && method === 'POST') {
      try {
        const result = await svc.sendOffer(user.tenant_id, sendMatch[1], body && body.override_reason, user.id)
        return ok(res, result)
      } catch (e) { return fail(res, 'SEND_ERROR', e.message, e.status || 400) }
    }

    return fail(res, 'NOT_FOUND', 'offer route not found', 404)
  }

  return { handle }
}

module.exports = { createOfferRouter }
