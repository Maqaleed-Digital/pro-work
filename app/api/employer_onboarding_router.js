'use strict'

/**
 * S40-G5: Employer Onboarding API router.
 *
 * Routes:
 *   PATCH /api/onboarding/profile        — update tenant establishment profile
 *   POST  /api/auth/resend-verification  — stub for beta (no-op)
 *   GET   /api/onboarding/status         — onboarding progress
 */
function createEmployerOnboardingRouter(opts) {
  if (!opts || !opts.pool) throw new Error('pool is required')

  const pool = opts.pool

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

    // PATCH /api/onboarding/profile
    if (pathname === '/api/onboarding/profile' && method === 'PATCH') {
      if (!user) return fail(res, 'UNAUTHORIZED', 'authentication required', 401)
      if (!body) return fail(res, 'MISSING_BODY', 'request body required', 400)

      const { establishment_name, activity_code, region, total_employees, saudi_employees } = body

      const profile = {
        establishment_name: establishment_name || null,
        activity_code:      activity_code || null,
        region:             region || null,
        total_employees:    typeof total_employees === 'number' ? total_employees : null,
        saudi_employees:    typeof saudi_employees === 'number' ? saudi_employees : null,
        updated_at:         new Date().toISOString(),
      }

      try {
        await pool.query(
          `UPDATE tenants SET config = config || $1, updated_at = NOW() WHERE id = $2`,
          [JSON.stringify({ establishment_profile: profile }), user.tenant_id]
        )
        return ok(res, { profile, tenant_id: user.tenant_id })
      } catch (e) {
        return fail(res, 'PROFILE_UPDATE_FAILED', e.message, 500)
      }
    }

    // POST /api/auth/resend-verification (stub for beta)
    if (pathname === '/api/auth/resend-verification' && method === 'POST') {
      return ok(res, { message: 'verification email queued (beta: no-op)', sent: false })
    }

    // GET /api/onboarding/status
    if (pathname === '/api/onboarding/status' && method === 'GET') {
      if (!user) return fail(res, 'UNAUTHORIZED', 'authentication required', 401)

      try {
        const result = await pool.query(
          `SELECT config FROM tenants WHERE id = $1`,
          [user.tenant_id]
        )
        const config = result.rows[0] && result.rows[0].config ? result.rows[0].config : {}
        const profile = config.establishment_profile || {}
        const profileComplete = !!(profile.establishment_name && profile.activity_code && profile.region && profile.total_employees)

        let step = 2
        if (profileComplete) step = 4
        else step = 3

        return ok(res, {
          step,
          profileComplete,
          emailVerified: false,
          profile,
        })
      } catch (e) {
        return fail(res, 'STATUS_ERROR', e.message, 500)
      }
    }

    return fail(res, 'NOT_FOUND', 'onboarding route not found', 404)
  }

  return { handle }
}

module.exports = { createEmployerOnboardingRouter }
