'use strict'

const { hasPermission, PERMISSIONS } = require('../modules/auth/rbac_policy')

function createContractRouter(opts) {
  if (!opts || !opts.contractService) throw new Error('contractService is required')
  const svc = opts.contractService

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
      return fail(res, 'FORBIDDEN', 'MANAGE_HIRING permission required', 403)
    }

    // POST /api/contracts
    if (pathname === '/api/contracts' && method === 'POST') {
      if (!body) return fail(res, 'MISSING_BODY', 'request body required', 400)
      try {
        const result = await svc.createContract(user.tenant_id, body.offer_id, body.template_type)
        return ok(res, result, 201)
      } catch (e) { return fail(res, 'CONTRACT_ERROR', e.message, e.status || 400) }
    }

    // GET /api/contracts
    if (pathname === '/api/contracts' && method === 'GET') {
      try {
        const url = new URL(req.url, 'http://localhost')
        const filters = { status: url.searchParams.get('status') || undefined }
        const result = await svc.listContracts(user.tenant_id, filters)
        return ok(res, { contracts: result })
      } catch (e) { return fail(res, 'CONTRACT_ERROR', e.message, e.status || 500) }
    }

    const idMatch        = pathname.match(/^\/api\/contracts\/([^/]+)$/)
    const transitionMatch = pathname.match(/^\/api\/contracts\/([^/]+)\/transition$/)
    const timelineMatch  = pathname.match(/^\/api\/contracts\/([^/]+)\/timeline$/)
    const qiwaMatch      = pathname.match(/^\/api\/contracts\/([^/]+)\/qiwa-preview$/)

    // GET /api/contracts/:id
    if (idMatch && method === 'GET') {
      try {
        const result = await svc.getContract(user.tenant_id, idMatch[1])
        if (!result) return fail(res, 'NOT_FOUND', 'contract not found', 404)
        return ok(res, result)
      } catch (e) { return fail(res, 'CONTRACT_ERROR', e.message, e.status || 500) }
    }

    // PATCH /api/contracts/:id
    if (idMatch && method === 'PATCH') {
      if (!body) return fail(res, 'MISSING_BODY', 'request body required', 400)
      try {
        const result = await svc.updateContract(user.tenant_id, idMatch[1], body)
        return ok(res, result)
      } catch (e) { return fail(res, 'CONTRACT_ERROR', e.message, e.status || 400) }
    }

    // POST /api/contracts/:id/transition
    if (transitionMatch && method === 'POST') {
      if (!body) return fail(res, 'MISSING_BODY', 'request body required', 400)
      try {
        const result = await svc.transitionStatus(
          user.tenant_id, transitionMatch[1], body.new_status, user.id, body.reason || body
        )
        return ok(res, result)
      } catch (e) { return fail(res, 'TRANSITION_ERROR', e.message, e.status || 400) }
    }

    // GET /api/contracts/:id/timeline
    if (timelineMatch && method === 'GET') {
      try {
        const result = await svc.getContractTimeline(user.tenant_id, timelineMatch[1])
        return ok(res, { events: result })
      } catch (e) { return fail(res, 'TIMELINE_ERROR', e.message, e.status || 500) }
    }

    // GET /api/contracts/:id/qiwa-preview
    if (qiwaMatch && method === 'GET') {
      try {
        const contract = await svc.getContract(user.tenant_id, qiwaMatch[1])
        if (!contract) return fail(res, 'NOT_FOUND', 'contract not found', 404)
        return ok(res, {
          qiwa_parity_json: contract.qiwa_parity_json,
          qiwa_field_completeness_pct: contract.qiwa_field_completeness_pct,
          contract_type: contract.contract_type,
        })
      } catch (e) { return fail(res, 'CONTRACT_ERROR', e.message, e.status || 500) }
    }

    return fail(res, 'NOT_FOUND', 'contract route not found', 404)
  }

  return { handle }
}

module.exports = { createContractRouter }
