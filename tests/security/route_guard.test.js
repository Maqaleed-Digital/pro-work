'use strict'

/**
 * SEC-FIX-WC-01 · INVARIANT ROUTE-AUTH — unit tests for the classification and
 * server-derived-tenant helpers that back the dispatch invariant.
 *
 * Covers:
 *   - PUBLIC / SENSITIVE classification evidence (isPublicApiRoute / isSensitiveApiPath)
 *   - Test B: authed-A + spoofed x-tenant-id:B and/or ?tenant_id=B → effective
 *     tenant stays A (selectors never authoritative)
 *   - Foundation for Test C: every sensitive tenant derivation now flows through
 *     tenantForPrincipal, so a spoofed selector cannot redirect a read to tenant B.
 */

const assert = require('assert')
const {
  isPublicApiRoute,
  isSensitiveApiPath,
  tenantForPrincipal,
  SENSITIVE_API_PREFIXES,
} = require('../../app/modules/auth/route_guard')

function mkReq(headers, url) {
  return { headers: headers || {}, url: url || '/', _jwtPrincipal: undefined }
}

async function run() {
  let passed = 0
  const t = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`) }

  // ── PUBLIC allowlist ──────────────────────────────────────────────────────
  t('public probes are public', () => {
    assert.strictEqual(isPublicApiRoute('/api/health', 'GET'), true)
    assert.strictEqual(isPublicApiRoute('/api/ready', 'GET'), true)
    assert.strictEqual(isPublicApiRoute('/health', 'GET'), true)
  })

  t('public auth endpoints are public', () => {
    assert.strictEqual(isPublicApiRoute('/api/auth/login', 'POST'), true)
    assert.strictEqual(isPublicApiRoute('/api/auth/register', 'POST'), true)
  })

  t('identity is public for GET only', () => {
    assert.strictEqual(isPublicApiRoute('/api/identity/workers', 'GET'), true)
    assert.strictEqual(isPublicApiRoute('/api/identity/w1/eri', 'GET'), true)
    assert.strictEqual(isPublicApiRoute('/api/identity/workers', 'POST'), false)
    assert.strictEqual(isPublicApiRoute('/api/identity/workers', 'DELETE'), false)
  })

  t('cohort intake is public for exactly POST /api/cohort/request', () => {
    assert.strictEqual(isPublicApiRoute('/api/cohort/request', 'POST'), true)
    // sibling review endpoint is NOT public
    assert.strictEqual(isPublicApiRoute('/api/cohort/requests', 'GET'), false)
    assert.strictEqual(isPublicApiRoute('/api/cohort/request', 'GET'), false)
  })

  t('sensitive families are NOT public (any method)', () => {
    const sensitive = [
      '/api/admin/ai/models',
      '/api/admin/compliance/nitaqat/score',
      '/api/admin/compliance/occupation-code/lookup',
      '/api/admin/dashboard/kpi',
      '/api/onboarding/wps/pack',
      '/api/compliance/risk/screen',
      '/api/evidence/packs',
      '/api/compliance/pdpl/dsr',
      '/api/compliance/dashboard/summary',
      '/api/payments/fee-transparency/calculate',
    ]
    for (const p of sensitive) {
      assert.strictEqual(isPublicApiRoute(p, 'GET'), false, `${p} GET must not be public`)
      assert.strictEqual(isPublicApiRoute(p, 'POST'), false, `${p} POST must not be public`)
    }
  })

  t('unknown API routes are NOT public (fail closed)', () => {
    assert.strictEqual(isPublicApiRoute('/api/does-not-exist', 'GET'), false)
    assert.strictEqual(isPublicApiRoute('/api/secret/thing', 'GET'), false)
    assert.strictEqual(isPublicApiRoute('/api/evidence', 'GET'), false)
  })

  // ── SENSITIVE classification ──────────────────────────────────────────────
  t('isSensitiveApiPath matches every governed sensitive prefix', () => {
    for (const prefix of SENSITIVE_API_PREFIXES) {
      assert.strictEqual(isSensitiveApiPath(prefix + 'x'), true, `${prefix} should be sensitive`)
    }
    assert.strictEqual(isSensitiveApiPath('/api/identity/workers'), false)
    assert.strictEqual(isSensitiveApiPath('/api/health'), false)
    assert.strictEqual(isSensitiveApiPath('/api/jobs'), false)
  })

  // ── Test B: server-derived tenant — spoofed selectors are ignored ─────────
  t('B: authed-A + spoofed x-tenant-id:B → effective tenant stays A', () => {
    const req = mkReq({ 'x-tenant-id': 'tenant-B' }, '/api/evidence/packs')
    req._jwtPrincipal = { tenant_id: 'tenant-A', _rbacRole: 'ADMIN' }
    assert.strictEqual(tenantForPrincipal(req), 'tenant-A')
  })

  t('B: authed-A + spoofed ?tenant_id=B → effective tenant stays A', () => {
    const req = mkReq({}, '/api/evidence/packs?tenant_id=tenant-B')
    req._jwtPrincipal = { tenant_id: 'tenant-A', _rbacRole: 'ADMIN' }
    assert.strictEqual(tenantForPrincipal(req), 'tenant-A')
  })

  t('B: authed-A + BOTH spoofed header and query → effective tenant stays A', () => {
    const req = mkReq({ 'x-tenant-id': 'tenant-B' }, '/api/compliance/pdpl/dsr?tenant_id=tenant-B')
    req._jwtPrincipal = { tenant_id: 'tenant-A', _rbacRole: 'ADMIN' }
    assert.strictEqual(tenantForPrincipal(req), 'tenant-A')
  })

  t('C-foundation: tenant B is never returned to an authed-A principal', () => {
    // Whatever selectors an A-principal supplies, the derived tenant is A. Since
    // every sensitive evidence/pdpl read now derives its tenant from this helper,
    // an A caller cannot address tenant B's rows via spoofed selectors.
    for (const url of ['/api/evidence/packs?tenant_id=tenant-B', '/api/evidence/x']) {
      for (const hdr of [{}, { 'x-tenant-id': 'tenant-B' }]) {
        const req = mkReq(hdr, url)
        req._jwtPrincipal = { tenant_id: 'tenant-A' }
        assert.strictEqual(tenantForPrincipal(req), 'tenant-A')
        assert.notStrictEqual(tenantForPrincipal(req), 'tenant-B')
      }
    }
  })

  t('anon principal derives no tenant (null → fail closed downstream)', () => {
    const req = mkReq({ 'x-tenant-id': 'tenant-B' }, '/api/evidence/packs?tenant_id=tenant-B')
    assert.strictEqual(tenantForPrincipal(req), null)
  })

  console.log(`  route_guard: ${passed} passed`)
  return passed
}

module.exports = { run }

if (require.main === module) {
  run().then(p => process.exit(p > 0 ? 0 : 1)).catch(e => { console.error(e); process.exit(1) })
}
