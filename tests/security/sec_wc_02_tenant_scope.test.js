'use strict'

/**
 * SEC-WC-02 · WOS tenant-scope authorization + central default-deny — unit tests.
 *
 * These prove the authed half of the WOS invariant deterministically (no DB /
 * HTTP server needed), the same way route_guard.test.js proves SEC-FIX-WC-01
 * Tests B/C. An authed principal is a synthetic { _jwtPrincipal:{ tenant_id } }.
 *
 *   Test 2 (same-tenant positive)   — authed-A, no selector      → tenant A
 *   Test 4 (requested-scope match)  — authed-A, selector A       → tenant A
 *   Test 3 (cross-tenant negative)  — authed-A, selector B       → 403 (no tenant)
 *   Test 4 (spoof)                  — authed-A, header/query B    → 403
 *   anonymous                       — no principal               → 401
 *   Test 7 (central default-deny)   — /api/jobs,/api/wos,/api/contracts sensitive
 */

const assert = require('assert')
const {
  isSensitiveApiPath,
  isPublicApiRoute,
  tenantForPrincipal,
  authorizeTenantScope,
  SENSITIVE_API_PREFIXES,
} = require('../../app/modules/auth/route_guard')

function authedA() { return { _jwtPrincipal: { tenant_id: 'tenant-A' } } }

async function run() {
  let passed = 0
  const t = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`) }

  // ── Test 2 — same-tenant positive: authed-A, no selector → tenant A ─────────
  t('same-tenant: authed-A, no selector → ok, tenant A', () => {
    const r = authorizeTenantScope(authedA(), undefined)
    assert.deepStrictEqual(r, { ok: true, tenant: 'tenant-A' })
  })

  // ── Test 4 — requested scope equals membership → allowed ───────────────────
  t('requested-scope match: authed-A, selector A → ok, tenant A', () => {
    const r = authorizeTenantScope(authedA(), 'tenant-A')
    assert.deepStrictEqual(r, { ok: true, tenant: 'tenant-A' })
  })

  // ── Test 3 — cross-tenant negative: authed-A, selector B → 403 ─────────────
  t('cross-tenant: authed-A, selector B → 403, no tenant returned', () => {
    const r = authorizeTenantScope(authedA(), 'tenant-B')
    assert.strictEqual(r.ok, false)
    assert.strictEqual(r.status, 403)
    assert.strictEqual(r.code, 'FORBIDDEN')
    assert.ok(!('tenant' in r), 'must not leak a tenant on denial')
  })

  // ── Test 4 — spoof via whitespace / casing still denied ────────────────────
  t('spoof: authed-A, selector "  tenant-B " (padded) → 403', () => {
    const r = authorizeTenantScope(authedA(), '  tenant-B ')
    assert.strictEqual(r.ok, false)
    assert.strictEqual(r.status, 403)
  })

  // ── anonymous — no principal → 401 ─────────────────────────────────────────
  t('anonymous: no principal → 401', () => {
    const r = authorizeTenantScope({}, 'tenant-B')
    assert.strictEqual(r.ok, false)
    assert.strictEqual(r.status, 401)
    assert.strictEqual(r.code, 'UNAUTHORIZED')
  })

  t('anonymous: no principal, no selector → 401 (never defaults to a tenant)', () => {
    const r = authorizeTenantScope({}, undefined)
    assert.strictEqual(r.ok, false)
    assert.strictEqual(r.status, 401)
  })

  // ── tenantForPrincipal never honours a selector (belt for the above) ───────
  t('tenantForPrincipal ignores selectors entirely', () => {
    const req = { _jwtPrincipal: { tenant_id: 'tenant-A' }, headers: { 'x-tenant-id': 'tenant-B' }, url: '/api/wos/workers?tenant_id=tenant-B' }
    assert.strictEqual(tenantForPrincipal(req), 'tenant-A')
  })

  // ── Test 7 — central default-deny: the three families are sensitive ────────
  t('central default-deny: /api/jobs,/api/wos,/api/contracts are sensitive', () => {
    for (const p of ['/api/jobs', '/api/jobs/x', '/api/wos', '/api/wos/workers', '/api/wos/evidence-events',
                     '/api/contracts', '/api/contracts/intent', '/api/contracts/intent/abc']) {
      assert.strictEqual(isSensitiveApiPath(p), true, `${p} must be sensitive`)
    }
    for (const p of ['/api/jobs', '/api/wos', '/api/contracts']) {
      assert.ok(SENSITIVE_API_PREFIXES.includes(p), `${p} present in SENSITIVE_API_PREFIXES`)
    }
  })

  t('central default-deny: new families are NOT on the public allowlist', () => {
    for (const [p, m] of [['/api/jobs', 'GET'], ['/api/wos/workers', 'GET'], ['/api/contracts/intent', 'POST']]) {
      assert.strictEqual(isPublicApiRoute(p, m), false, `${m} ${p} must not be public`)
    }
  })

  console.log(`  sec_wc_02_tenant_scope: ${passed} passed`)
  return passed
}

module.exports = { run }

if (require.main === module) {
  run().then(p => process.exit(p > 0 ? 0 : 1)).catch(e => { console.error(e); process.exit(1) })
}
