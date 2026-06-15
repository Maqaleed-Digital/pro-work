'use strict'

/**
 * S39-G5 — Work Identity / ERI API Router
 *
 * Routes:
 *   GET /api/identity/eri/badges               — all badge definitions
 *   GET /api/identity/workers                  — list workers with ERI profiles
 *   GET /api/identity/:workerId/eri            — full ERI score + components
 *   GET /api/identity/:workerId/eri/trend      — 6-month trend
 *   GET /api/identity/:workerId/profile        — full work identity profile
 *   GET /api/identity/:workerId/employer-summary — compact employer card
 */

const {
  createERIService,
  InMemoryERIStore,
  seedDemoProfiles,
  listBadges,
} = require('../modules/eri/eri_score_service')

// ── Boot: shared store + service seeded with demo profiles ────────────────────

const _store = new InMemoryERIStore()
seedDemoProfiles(_store)
const _svc = createERIService({ store: _store })

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

/**
 * createIdentityEriRouter(opts?)
 *
 * opts.svc  — inject a custom service (for testing)
 */
function createIdentityEriRouter(opts) {
  opts = opts || {}
  const svc = opts.svc || _svc

  return {
    handle(req, res, pathname, method) {
      if (method !== 'GET') {
        return fail(res, 'METHOD_NOT_ALLOWED', 'Only GET is supported on identity routes', 405)
      }

      // GET /api/identity/eri/badges
      if (pathname === '/api/identity/eri/badges') {
        return ok(res, listBadges())
      }

      // GET /api/identity/workers
      if (pathname === '/api/identity/workers') {
        const all = svc.store.all()
        return ok(res, all.map(p => ({
          worker_id:    p.worker_id,
          display_name: p.display_name || p.worker_id,
        })))
      }

      // GET /api/identity/:workerId/eri
      const eriMatch = pathname.match(/^\/api\/identity\/([^/]+)\/eri$/)
      if (eriMatch) {
        const workerId = decodeURIComponent(eriMatch[1])
        try {
          return ok(res, svc.getScore(workerId))
        } catch (e) {
          const status = e.code === 'ERI_PROFILE_NOT_FOUND' ? 404 : 500
          return fail(res, e.code || 'ERI_ERROR', e.message, status)
        }
      }

      // GET /api/identity/:workerId/eri/trend
      const trendMatch = pathname.match(/^\/api\/identity\/([^/]+)\/eri\/trend$/)
      if (trendMatch) {
        const workerId = decodeURIComponent(trendMatch[1])
        try {
          return ok(res, svc.getTrend(workerId))
        } catch (e) {
          const status = e.code === 'ERI_PROFILE_NOT_FOUND' ? 404 : 500
          return fail(res, e.code || 'ERI_ERROR', e.message, status)
        }
      }

      // GET /api/identity/:workerId/profile
      const profileMatch = pathname.match(/^\/api\/identity\/([^/]+)\/profile$/)
      if (profileMatch) {
        const workerId = decodeURIComponent(profileMatch[1])
        try {
          return ok(res, svc.getProfile(workerId))
        } catch (e) {
          const status = e.code === 'ERI_PROFILE_NOT_FOUND' ? 404 : 500
          return fail(res, e.code || 'ERI_ERROR', e.message, status)
        }
      }

      // GET /api/identity/:workerId/employer-summary
      const summaryMatch = pathname.match(/^\/api\/identity\/([^/]+)\/employer-summary$/)
      if (summaryMatch) {
        const workerId = decodeURIComponent(summaryMatch[1])
        try {
          return ok(res, svc.getEmployerSummary(workerId))
        } catch (e) {
          const status = e.code === 'ERI_PROFILE_NOT_FOUND' ? 404 : 500
          return fail(res, e.code || 'ERI_ERROR', e.message, status)
        }
      }

      return fail(res, 'NOT_FOUND', 'Identity route not found', 404)
    },
  }
}

module.exports = { createIdentityEriRouter }
