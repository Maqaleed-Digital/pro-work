'use strict'

const crypto = require('crypto')
const { hasPermission, PERMISSIONS } = require('../modules/auth/rbac_policy')

/**
 * Day 3 (D-3, 2026-05-13): Cohort access request router.
 *
 * Authority:
 *   - Sponsor brief §2 (cohort registration / "Request access" flow):
 *     "Submission stored for sponsor review and manual invitation
 *     issuance (no auto-approval)."
 *   - WC Controlled-Launch Memo V1.1 (Sponsor B1(b) inline binding):
 *     cohort ~25–30; no marketing-as-launched copy; no cohort expansion
 *     mechanics (self-invite, viral loops).
 *
 * Boundary (PROPOSAL §11.A4 NO PHANTOM FEATURES): this is a real
 * endpoint that stores submissions and exposes them to sponsor review.
 * NOT a stub. NOT auto-approval. NOT account creation.
 *
 * Storage: in-memory Map keyed by request id. Persistence is a known
 * gap for post-D15+41 follow-up — the in-memory store is acceptable
 * for the controlled-beta window because:
 *   - Volume: ~25–30 cohort target = trivial
 *   - Loss tolerance: any submission lost is re-submittable by user
 *   - Sponsor reviews requests via GET /api/cohort/requests during ops
 *
 * Routes:
 *   POST /api/cohort/request   — PUBLIC (no auth). Stores submission;
 *                                 returns request id + ETA message.
 *                                 No account created. No tenant created.
 *   GET  /api/cohort/requests  — auth, MANAGE_PRINCIPALS (sponsor / owner /
 *                                 admin only). List pending requests for
 *                                 manual review + invitation issuance.
 *   POST /api/cohort/requests/:id/mark-reviewed
 *                              — auth, MANAGE_PRINCIPALS. Marks request
 *                                 as reviewed (sponsor downstream issues
 *                                 invitation via existing
 *                                 /api/invitations endpoint).
 *
 * Validation policy:
 *   - CR number: format-only (10-digit numeric). NO Wathq validation
 *     (TODO marker per PROPOSAL §8.2). Stored as-given; format reject
 *     is the only check.
 *   - Email: standard regex (server-side; UI also checks).
 *   - Phone: format-only (KSA pattern allowed; international tolerated).
 *   - primaryUseCase: must be one of {'saudisation', 'payroll', 'both'}.
 *   - teamSize: integer 1..1,000,000.
 *   - locale: 'en' | 'ar' (default 'en').
 *
 * Stricter-interpretation rule (PROPOSAL §11.A2): unknown fields are
 * dropped silently; the endpoint never echoes back arbitrary input.
 *
 * @param {object} opts
 * @param {object} [opts.store]  — optional store override (testing)
 * @param {Function} [opts.log]  — optional logger
 */

const ALLOWED_USE_CASES = new Set(['saudisation', 'payroll', 'both'])
const CR_NUMBER_RE = /^[0-9]{10}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[\d\s+\-().]{7,20}$/

function createCohortStore() {
  return new Map()
}

function createCohortRouter(opts = {}) {
  const store = opts.store || createCohortStore()
  const log = opts.log || console.log

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

  function validate(body) {
    if (!body || typeof body !== 'object') return 'request body required'

    const orgName = String(body.orgName || '').trim()
    if (!orgName) return 'orgName is required'
    if (orgName.length > 200) return 'orgName too long'

    const crNumber = String(body.crNumber || '').trim()
    if (!crNumber) return 'crNumber is required'
    if (!CR_NUMBER_RE.test(crNumber)) return 'crNumber must be 10 digits (format-only; Wathq verification post-beta)'

    const contactName = String(body.contactName || '').trim()
    if (!contactName) return 'contactName is required'
    if (contactName.length > 200) return 'contactName too long'

    const email = String(body.email || '').trim().toLowerCase()
    if (!email) return 'email is required'
    if (!EMAIL_RE.test(email)) return 'email format invalid'

    const phone = String(body.phone || '').trim()
    if (!phone) return 'phone is required'
    if (!PHONE_RE.test(phone)) return 'phone format invalid'

    const primaryUseCase = String(body.primaryUseCase || '').trim().toLowerCase()
    if (!ALLOWED_USE_CASES.has(primaryUseCase)) return 'primaryUseCase must be one of: saudisation, payroll, both'

    const teamSize = Number(body.teamSize)
    if (!Number.isInteger(teamSize) || teamSize < 1 || teamSize > 1000000) return 'teamSize must be an integer 1..1,000,000'

    const locale = body.locale === 'ar' ? 'ar' : 'en'

    return { orgName, crNumber, contactName, email, phone, primaryUseCase, teamSize, locale }
  }

  async function handle(req, res, pathname, method, body, user) {

    // ── POST /api/cohort/request — public intake ───────────────────────
    if (pathname === '/api/cohort/request' && method === 'POST') {
      const validated = validate(body)
      if (typeof validated === 'string') return fail(res, 'VALIDATION_ERROR', validated, 422)

      // Stricter rule: rate-limit on email — one pending request per email.
      // Searching is O(n) but n is tiny (~25–30 cohort target).
      for (const r of store.values()) {
        if (r.email === validated.email && r.status === 'pending') {
          return fail(res, 'DUPLICATE_REQUEST', 'A request from this email is already pending review.', 409)
        }
      }

      const id = crypto.randomBytes(12).toString('hex')
      const now = new Date().toISOString()
      const record = {
        id,
        ...validated,
        status: 'pending',
        createdAt: now,
        reviewedAt: null,
        reviewedBy: null,
      }
      store.set(id, record)
      log(`[cohort] request stored id=${id} email=${validated.email} org=${validated.orgName}`)

      // Response does NOT include the stored email/phone — only the id and a
      // bilingual ETA message. Avoids accidental enumeration / echo.
      return ok(res, {
        requestId: id,
        message: 'Request received. Our team will review and respond within 5 business days.',
        messageAr: 'تم استلام الطلب. سيراجع فريقنا طلبك ويعود إليك خلال 5 أيام عمل.',
      }, 201)
    }

    // ── GET /api/cohort/requests — sponsor review (auth) ───────────────
    if (pathname === '/api/cohort/requests' && method === 'GET') {
      if (!user) return fail(res, 'UNAUTHORIZED', 'authentication required', 401)
      if (!hasPermission(user.role, PERMISSIONS.MANAGE_PRINCIPALS)) {
        return fail(res, 'FORBIDDEN', `role ${user.role} cannot review cohort requests`, 403)
      }
      const requests = Array.from(store.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return ok(res, { requests, count: requests.length })
    }

    // ── POST /api/cohort/requests/:id/mark-reviewed — sponsor mark ────
    const markMatch = pathname.match(/^\/api\/cohort\/requests\/([a-f0-9]{24})\/mark-reviewed$/)
    if (markMatch && method === 'POST') {
      if (!user) return fail(res, 'UNAUTHORIZED', 'authentication required', 401)
      if (!hasPermission(user.role, PERMISSIONS.MANAGE_PRINCIPALS)) {
        return fail(res, 'FORBIDDEN', `role ${user.role} cannot review cohort requests`, 403)
      }
      const id = markMatch[1]
      const r = store.get(id)
      if (!r) return fail(res, 'NOT_FOUND', 'request not found', 404)
      r.status = 'reviewed'
      r.reviewedAt = new Date().toISOString()
      r.reviewedBy = user.id || 'unknown'
      store.set(id, r)
      return ok(res, { id, status: r.status, reviewedAt: r.reviewedAt })
    }

    return fail(res, 'NOT_FOUND', 'cohort route not found', 404)
  }

  return { handle, store }
}

module.exports = { createCohortRouter, createCohortStore }
