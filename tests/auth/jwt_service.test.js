'use strict'

const assert = require('assert')
const { createJwtService } = require('../../app/modules/auth/jwt_service')

async function run() {
  let passed = 0
  const secret = 'test-secret-for-unit-tests-only-32ch'
  const svc = createJwtService({ secret })

  // 1. issue returns token, expiresAt, jti
  {
    const result = svc.issue('user-1', 'ADMIN', 'tenant-1')
    assert.ok(result.token, 'should have token')
    assert.ok(result.expiresAt instanceof Date, 'should have expiresAt Date')
    assert.ok(result.jti, 'should have jti')
    passed++
    console.log('  ✓ issue returns token, expiresAt, jti')
  }

  // 2. token has 3 parts
  {
    const { token } = svc.issue('user-1', 'ADMIN', 'tenant-1')
    assert.strictEqual(token.split('.').length, 3)
    passed++
    console.log('  ✓ token has 3 dot-separated parts')
  }

  // 3. verify returns payload for valid token
  {
    const { token } = svc.issue('user-2', 'VIEWER', 'tenant-2')
    const payload = svc.verify(token)
    assert.ok(payload)
    assert.strictEqual(payload.sub, 'user-2')
    assert.strictEqual(payload.role, 'VIEWER')
    assert.strictEqual(payload.tenant_id, 'tenant-2')
    passed++
    console.log('  ✓ verify returns correct payload')
  }

  // 4. verify returns null for tampered token
  {
    const { token } = svc.issue('user-3', 'ADMIN', 'tenant-3')
    const tampered = token.slice(0, -2) + 'XX'
    const result = svc.verify(tampered)
    assert.strictEqual(result, null)
    passed++
    console.log('  ✓ verify rejects tampered token')
  }

  // 5. verify returns null for wrong secret
  {
    const { token } = svc.issue('user-4', 'ADMIN', 'tenant-4')
    const other = createJwtService({ secret: 'different-secret-not-matching!!' })
    assert.strictEqual(other.verify(token), null)
    passed++
    console.log('  ✓ verify rejects token signed with different secret')
  }

  // 6. verify returns null for expired token
  {
    const shortLived = createJwtService({ secret, ttl: -1 })
    const { token } = shortLived.issue('user-5', 'ADMIN', 'tenant-5')
    const result = svc.verify(token)
    assert.strictEqual(result, null)
    passed++
    console.log('  ✓ verify rejects expired token')
  }

  // 7. verify returns null for null/empty input
  {
    assert.strictEqual(svc.verify(null), null)
    assert.strictEqual(svc.verify(''), null)
    assert.strictEqual(svc.verify('not.a.jwt'), null)
    passed++
    console.log('  ✓ verify returns null for null/empty/malformed input')
  }

  // 8. refresh returns new token with same claims
  {
    const { token } = svc.issue('user-6', 'OWNER', 'tenant-6')
    const refreshed = svc.refresh(token)
    assert.ok(refreshed)
    assert.notStrictEqual(refreshed.token, token)
    const payload = svc.verify(refreshed.token)
    assert.strictEqual(payload.sub, 'user-6')
    assert.strictEqual(payload.role, 'OWNER')
    assert.strictEqual(payload.tenant_id, 'tenant-6')
    passed++
    console.log('  ✓ refresh returns new token with same claims')
  }

  // 9. refresh returns null for expired token
  {
    const shortLived = createJwtService({ secret, ttl: -1 })
    const { token } = shortLived.issue('user-7', 'ADMIN', 'tenant-7')
    assert.strictEqual(svc.refresh(token), null)
    passed++
    console.log('  ✓ refresh returns null for expired token')
  }

  // 10. hashToken produces consistent hex digest
  {
    const { token } = svc.issue('user-8', 'ADMIN', 'tenant-8')
    const h1 = svc.hashToken(token)
    const h2 = svc.hashToken(token)
    assert.strictEqual(h1, h2)
    assert.strictEqual(h1.length, 64) // SHA-256 hex
    passed++
    console.log('  ✓ hashToken produces consistent 64-char hex')
  }

  // 11. constructor rejects missing secret
  {
    try {
      createJwtService({})
      assert.fail('should throw')
    } catch (e) {
      assert.ok(e.message.includes('JWT_SECRET'))
    }
    passed++
    console.log('  ✓ constructor rejects missing secret')
  }

  // 12. each token has unique jti
  {
    const r1 = svc.issue('user-9', 'ADMIN', 'tenant-9')
    const r2 = svc.issue('user-9', 'ADMIN', 'tenant-9')
    assert.notStrictEqual(r1.jti, r2.jti)
    passed++
    console.log('  ✓ each token has unique jti')
  }

  // 13. payload contains iat
  {
    const { token } = svc.issue('user-10', 'VIEWER', 'tenant-10')
    const payload = svc.verify(token)
    assert.ok(payload.iat > 0)
    passed++
    console.log('  ✓ payload contains iat timestamp')
  }

  console.log(`  jwt_service: ${passed}/13 passed`)
  return passed
}

module.exports = { run }

if (require.main === module) {
  run().then(p => process.exit(p === 13 ? 0 : 1))
}
