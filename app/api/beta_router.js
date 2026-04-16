'use strict'

/**
 * S39-G6 Beta Router
 *
 * Routes:
 *   GET  /admin/beta/snapshot          — enrollment counts vs limits
 *   POST /admin/beta/enroll            — enroll account
 *   DELETE /admin/beta/enroll/:id      — remove from beta
 *   GET  /admin/beta/kpi               — full KPI scorecard (RAG)
 *   POST /admin/beta/kpi/gauge         — set a KPI gauge value (from CI)
 *   POST /admin/beta/kpi/record        — record a KPI event
 *   POST /admin/beta/ceo-exit-request  — log CEO exit review request (enabled only if all GREEN)
 */

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

function createBetaRouter(opts) {
  opts = opts || {}
  const _betaSvc = opts.betaAccessService
  const _kpi     = opts.kpiTracker
  const _log     = opts.log || console.log   // CEO exit request log sink

  if (!_betaSvc) throw new Error('betaAccessService is required')
  if (!_kpi)     throw new Error('kpiTracker is required')

  const enrollIdRe   = /^\/admin\/beta\/enroll\/([^/]+)$/
  const gaugeRoute   = '/admin/beta/kpi/gauge'
  const recordRoute  = '/admin/beta/kpi/record'
  const exitRoute    = '/admin/beta/ceo-exit-request'

  return {
    handle(req, res, pathname, method, body) {
      // GET /admin/beta/snapshot
      if (pathname === '/admin/beta/snapshot' && method === 'GET') {
        return ok(res, _betaSvc.getSnapshot())
      }

      // POST /admin/beta/enroll
      if (pathname === '/admin/beta/enroll' && method === 'POST') {
        if (!body) return fail(res, 'MISSING_BODY', 'Request body required', 400)
        try {
          return ok(res, _betaSvc.enroll(body), 201)
        } catch (e) {
          const status = e.code === 'BETA_LIMIT_REACHED' ? 409
                       : e.code === 'BETA_ALREADY_ENROLLED' ? 409
                       : 422
          return fail(res, e.code || 'BETA_ERROR', e.message, status)
        }
      }

      // DELETE /admin/beta/enroll/:id
      const enrollIdMatch = pathname.match(enrollIdRe)
      if (enrollIdMatch && method === 'DELETE') {
        const removed = _betaSvc.remove(decodeURIComponent(enrollIdMatch[1]))
        if (!removed) return fail(res, 'BETA_ACCOUNT_NOT_FOUND', 'Account not in beta', 404)
        return ok(res, { removed: true })
      }

      // GET /admin/beta/kpi
      if (pathname === '/admin/beta/kpi' && method === 'GET') {
        return ok(res, _kpi.getRagScorecard())
      }

      // POST /admin/beta/kpi/gauge — set gauge directly (from CI)
      if (pathname === gaugeRoute && method === 'POST') {
        if (!body) return fail(res, 'MISSING_BODY', 'Request body required', 400)
        const { kpi_key, value } = body
        if (!kpi_key) return fail(res, 'VALIDATION_ERROR', 'kpi_key is required', 422)
        if (value === undefined || value === null) return fail(res, 'VALIDATION_ERROR', 'value is required', 422)
        try {
          _kpi.setGauge(kpi_key, value)
          return ok(res, { kpi_key, value, updated: true })
        } catch (e) {
          return fail(res, e.code || 'KPI_ERROR', e.message, 422)
        }
      }

      // POST /admin/beta/kpi/record — record a KPI event
      if (pathname === recordRoute && method === 'POST') {
        if (!body) return fail(res, 'MISSING_BODY', 'Request body required', 400)
        const { kpi_key } = body
        try {
          switch (kpi_key) {
            case 'p75_time_to_first_proposal':
              if (body.value_seconds === undefined) return fail(res, 'VALIDATION_ERROR', 'value_seconds is required', 422)
              _kpi.recordProposalTime(body.job_id || 'unknown', body.value_seconds)
              break
            case 'match_rate':
              if (body.matched === undefined) return fail(res, 'VALIDATION_ERROR', 'matched (boolean) is required', 422)
              _kpi.recordMatchResult(body.matched)
              break
            case 'payout_eta_breach_rate':
              if (body.breached === undefined) return fail(res, 'VALIDATION_ERROR', 'breached (boolean) is required', 422)
              _kpi.recordPayoutEvent(body.breached)
              break
            case 'accessibility_aa_pass_rate':
              if (body.passed === undefined) return fail(res, 'VALIDATION_ERROR', 'passed (boolean) is required', 422)
              _kpi.recordAccessibilityResult(body.passed)
              break
            default:
              return fail(res, 'KPI_UNKNOWN', `Unknown kpi_key: "${kpi_key}"`, 422)
          }
          return ok(res, { kpi_key, recorded: true })
        } catch (e) {
          return fail(res, e.code || 'KPI_ERROR', e.message, 422)
        }
      }

      // POST /admin/beta/ceo-exit-request
      if (pathname === exitRoute && method === 'POST') {
        const scorecard = _kpi.getRagScorecard()
        if (!scorecard.all_green) {
          return fail(res, 'EXIT_CRITERIA_NOT_MET',
            'All exit criteria must be GREEN before requesting CEO review. ' +
            `Current verdict: ${scorecard.verdict}`, 409)
        }
        const requested_by = (body && body.requested_by) || 'unknown'
        const entry = {
          event:        'CEO_EXIT_REVIEW_REQUESTED',
          requested_by,
          requested_at: new Date().toISOString(),
          scorecard:    scorecard.criteria,
          note:         'S39-G7 must be manually closed — this does not auto-close the gate',
        }
        _log('[BETA]', JSON.stringify(entry))
        return ok(res, entry, 201)
      }

      return fail(res, 'NOT_FOUND', 'Beta admin route not found', 404)
    },
  }
}

module.exports = { createBetaRouter }
