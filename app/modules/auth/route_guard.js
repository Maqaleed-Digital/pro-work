'use strict'

/**
 * SEC-FIX-WC-01 · INVARIANT ROUTE-AUTH
 *
 * Single source of truth for the route-authorization invariant enforced by
 * app/server.js. Pure, dependency-light helpers so the invariant can be unit
 * tested deterministically without booting the HTTP server or a database.
 *
 *   isPublicApiRoute(pathname, method)  — the explicit PUBLIC allowlist.
 *                                         Anything not on it is NOT public.
 *   isSensitiveApiPath(pathname)        — governed sensitive API families that
 *                                         must fail closed (mandatory auth).
 *   tenantForPrincipal(req)             — server-derived effective tenant for
 *                                         AUTHENTICATED sensitive routes. Header
 *                                         (x-tenant-id) and query (?tenant_id)
 *                                         selectors are NEVER authoritative.
 *
 * Design note (Precondition 2, option b): tenantForPrincipal is a NEW
 * authenticated-only helper distinct from server.js resolveTenantId(). The
 * shared header-first resolveTenantId() is deliberately left untouched so the
 * general fall-through dispatch and the already-PASS business routers
 * (contracts / hiring / invitations / invoices / cohort) are unaffected.
 */

// ── PUBLIC allowlist ────────────────────────────────────────────────────────
// Exact public paths. Prefixes are used ONLY where every child is proven public.
const PUBLIC_EXACT = new Set([
  '/health',        // process liveness (non-/api, listed for completeness)
  '/api/health',    // matchRoute api.health — public probe
  '/api/ready',     // matchRoute api.ready  — public probe
])

/**
 * Positive allowlist of PUBLIC API routes. Everything else is treated as
 * non-public by callers. Method-aware: identity is public for GET only.
 * @param {string} pathname
 * @param {string} method
 * @returns {boolean}
 */
function isPublicApiRoute(pathname, method) {
  const p = String(pathname || '')
  const m = String(method || 'GET').toUpperCase()

  if (PUBLIC_EXACT.has(p)) return true

  // Public authentication endpoints (login / register / refresh / logout / me).
  // The auth router itself enforces auth on the endpoints that need it.
  if (p.startsWith('/api/auth/')) return true

  // Public work-identity reads. The identity router hard-rejects non-GET (405),
  // so the prefix is public for GET only.
  if (p.startsWith('/api/identity/')) return m === 'GET'

  // Public prospect intake — a single exact path. The sibling
  // GET /api/cohort/requests is auth-gated inside the cohort router and is NOT
  // listed here.
  if (p === '/api/cohort/request' && m === 'POST') return true

  return false
}

// ── SENSITIVE families ───────────────────────────────────────────────────────
// Governed sensitive API prefixes that must require authentication before any
// handler / tenant-resolution / permission-eval / DB work. Used by the
// defense-in-depth default-deny net in server.js: even if an explicit early
// exit is ever removed, a request under one of these prefixes fails closed
// instead of leaking.
const SENSITIVE_API_PREFIXES = [
  '/api/admin/ai/',
  '/api/admin/compliance/nitaqat/',
  '/api/admin/compliance/occupation-code/',
  '/api/admin/dashboard/',
  '/api/onboarding/wps/',
  '/api/compliance/risk/',
  '/api/evidence/',
  '/api/compliance/pdpl/',
  '/api/compliance/dashboard/',
  '/api/payments/fee-transparency/',
  // SEC-WC-02 — confirmed-exposure families added to the default-deny net.
  // No trailing slash: the family root (e.g. GET/POST /api/wos, /api/jobs,
  // /api/contracts/intent) has no sub-path, so the prefix must match the root
  // AND its children. This is defense-in-depth ONLY — it makes an anonymous
  // request under these families fail closed (401) even if a per-handler gate is
  // ever removed. It is NOT a substitute for the per-handler tenant authorization
  // in server.js (WOS membership derivation, contracts/intent auth gate, jobs
  // production-disable).
  '/api/jobs',
  '/api/wos',
  '/api/contracts',
]

/**
 * True when the path is under a governed sensitive API family.
 * @param {string} pathname
 * @returns {boolean}
 */
function isSensitiveApiPath(pathname) {
  const p = String(pathname || '')
  return SENSITIVE_API_PREFIXES.some(prefix => p.startsWith(prefix))
}

/**
 * Server-derived effective tenant for an AUTHENTICATED sensitive route.
 *
 * Only the JWT principal's tenant_id is authoritative. Spoofable selectors
 * (x-tenant-id header, ?tenant_id query) are intentionally ignored. Returns
 * null when there is no authenticated principal (caller must have already
 * enforced mandatory auth).
 *
 * @param {import('http').IncomingMessage & { _jwtPrincipal?: { tenant_id?: string } }} req
 * @returns {string|null}
 */
function tenantForPrincipal(req) {
  const t = req && req._jwtPrincipal && req._jwtPrincipal.tenant_id
  if (t && String(t).trim()) return String(t).trim()
  return null
}

/**
 * SEC-WC-02 — authorize a tenant-gated request (e.g. every /api/wos/* route).
 *
 * The ONLY authoritative tenant is the authenticated principal's membership
 * (tenantForPrincipal). A caller-supplied selector — x-tenant-id header,
 * ?tenant_id query, or any request-body tenant field — is NEVER authoritative;
 * it is at most a REQUESTED scope that must equal the member tenant.
 *
 *   no principal                      → { ok:false, status:401, code:'UNAUTHORIZED' }
 *   principal + no selector           → { ok:true,  tenant:<member> }
 *   principal + selector === member   → { ok:true,  tenant:<member> }  (requested scope allowed)
 *   principal + selector !== member   → { ok:false, status:403, code:'FORBIDDEN' }  (non-member / spoof)
 *
 * The returned tenant is what the handler MUST scope to; a cross-tenant read is
 * therefore impossible because the handler never receives a foreign tenant id.
 *
 * @param {object} req  — carries req._jwtPrincipal
 * @param {string|null|undefined} requestedSelector — raw client-supplied selector (header/query)
 * @returns {{ok:true, tenant:string} | {ok:false, status:number, code:string}}
 */
function authorizeTenantScope(req, requestedSelector) {
  const member = tenantForPrincipal(req)
  if (!member) return { ok: false, status: 401, code: 'UNAUTHORIZED' }
  const requested = requestedSelector != null ? String(requestedSelector).trim() : ''
  if (requested && requested !== member) {
    return { ok: false, status: 403, code: 'FORBIDDEN' }
  }
  return { ok: true, tenant: member }
}

module.exports = {
  isPublicApiRoute,
  isSensitiveApiPath,
  tenantForPrincipal,
  authorizeTenantScope,
  SENSITIVE_API_PREFIXES,
  PUBLIC_EXACT,
}
