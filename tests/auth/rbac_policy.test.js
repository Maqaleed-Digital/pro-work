'use strict'

const assert = require('assert')
const { PERMISSIONS, ROLE_PERMISSIONS, hasPermission, getPermissions, getRoles } = require('../../app/modules/auth/rbac_policy')
const { requirePermission } = require('../../app/modules/auth/auth_middleware')

function createMockRes() {
  let _status = 200
  let _body = ''
  return {
    writeHead(s) { _status = s },
    end(b) { _body = b || '' },
    get status() { return _status },
    get body() { return _body ? JSON.parse(_body) : null },
  }
}

async function run() {
  let passed = 0

  // ── Role structure ─────────────────────────────────────────────────────

  // 1. Five roles defined
  {
    const roles = getRoles()
    assert.deepStrictEqual(roles.sort(), ['ADMIN', 'FINANCE_APPROVER', 'HIRING_MANAGER', 'OWNER', 'VIEWER'])
    passed++
    console.log('  ✓ five roles defined')
  }

  // 2. OWNER has ALL permissions
  {
    const all = Object.values(PERMISSIONS)
    for (const p of all) {
      assert.ok(hasPermission('OWNER', p), `OWNER missing ${p}`)
    }
    passed++
    console.log('  ✓ OWNER has all permissions')
  }

  // 3. ADMIN has all except DELETE_TENANT and MANAGE_BILLING
  {
    const all = Object.values(PERMISSIONS)
    for (const p of all) {
      if (p === PERMISSIONS.DELETE_TENANT || p === PERMISSIONS.MANAGE_BILLING) {
        assert.ok(!hasPermission('ADMIN', p), `ADMIN should not have ${p}`)
      } else {
        assert.ok(hasPermission('ADMIN', p), `ADMIN missing ${p}`)
      }
    }
    passed++
    console.log('  ✓ ADMIN has all except DELETE_TENANT and MANAGE_BILLING')
  }

  // 4. VIEWER has only VIEW_* permissions
  {
    const viewerPerms = getPermissions('VIEWER')
    for (const p of viewerPerms) {
      assert.ok(p.startsWith('VIEW_'), `VIEWER has non-VIEW permission: ${p}`)
    }
    passed++
    console.log('  ✓ VIEWER has only VIEW_* permissions')
  }

  // 5. VIEWER cannot approve AI
  {
    assert.strictEqual(hasPermission('VIEWER', PERMISSIONS.APPROVE_AI), false)
    passed++
    console.log('  ✓ VIEWER cannot APPROVE_AI')
  }

  // 6. VIEWER cannot create requisitions
  {
    assert.strictEqual(hasPermission('VIEWER', PERMISSIONS.CREATE_REQUISITION), false)
    passed++
    console.log('  ✓ VIEWER cannot CREATE_REQUISITION')
  }

  // 7. VIEWER cannot manage compliance
  {
    assert.strictEqual(hasPermission('VIEWER', PERMISSIONS.MANAGE_COMPLIANCE), false)
    passed++
    console.log('  ✓ VIEWER cannot MANAGE_COMPLIANCE')
  }

  // 8. VIEWER cannot approve payments
  {
    assert.strictEqual(hasPermission('VIEWER', PERMISSIONS.APPROVE_PAYMENTS), false)
    passed++
    console.log('  ✓ VIEWER cannot APPROVE_PAYMENTS')
  }

  // 9. VIEWER can view dashboard
  {
    assert.strictEqual(hasPermission('VIEWER', PERMISSIONS.VIEW_DASHBOARD), true)
    passed++
    console.log('  ✓ VIEWER can VIEW_DASHBOARD')
  }

  // 10. VIEWER can view evidence
  {
    assert.strictEqual(hasPermission('VIEWER', PERMISSIONS.VIEW_EVIDENCE), true)
    passed++
    console.log('  ✓ VIEWER can VIEW_EVIDENCE')
  }

  // ── HIRING_MANAGER ────────────────────────────────────────────────────

  // 11. HIRING_MANAGER can create requisitions
  {
    assert.strictEqual(hasPermission('HIRING_MANAGER', PERMISSIONS.CREATE_REQUISITION), true)
    passed++
    console.log('  ✓ HIRING_MANAGER can CREATE_REQUISITION')
  }

  // 12. HIRING_MANAGER can manage candidates
  {
    assert.strictEqual(hasPermission('HIRING_MANAGER', PERMISSIONS.MANAGE_CANDIDATES), true)
    passed++
    console.log('  ✓ HIRING_MANAGER can MANAGE_CANDIDATES')
  }

  // 13. HIRING_MANAGER can manage probation
  {
    assert.strictEqual(hasPermission('HIRING_MANAGER', PERMISSIONS.MANAGE_PROBATION), true)
    passed++
    console.log('  ✓ HIRING_MANAGER can MANAGE_PROBATION')
  }

  // 14. HIRING_MANAGER can view compliance
  {
    assert.strictEqual(hasPermission('HIRING_MANAGER', PERMISSIONS.VIEW_COMPLIANCE), true)
    passed++
    console.log('  ✓ HIRING_MANAGER can VIEW_COMPLIANCE')
  }

  // 15. HIRING_MANAGER cannot approve payments
  {
    assert.strictEqual(hasPermission('HIRING_MANAGER', PERMISSIONS.APPROVE_PAYMENTS), false)
    passed++
    console.log('  ✓ HIRING_MANAGER cannot APPROVE_PAYMENTS')
  }

  // 16. HIRING_MANAGER cannot delete tenant
  {
    assert.strictEqual(hasPermission('HIRING_MANAGER', PERMISSIONS.DELETE_TENANT), false)
    passed++
    console.log('  ✓ HIRING_MANAGER cannot DELETE_TENANT')
  }

  // 17. HIRING_MANAGER cannot manage beta
  {
    assert.strictEqual(hasPermission('HIRING_MANAGER', PERMISSIONS.MANAGE_BETA), false)
    passed++
    console.log('  ✓ HIRING_MANAGER cannot MANAGE_BETA')
  }

  // ── FINANCE_APPROVER ──────────────────────────────────────────────────

  // 18. FINANCE_APPROVER can approve payments
  {
    assert.strictEqual(hasPermission('FINANCE_APPROVER', PERMISSIONS.APPROVE_PAYMENTS), true)
    passed++
    console.log('  ✓ FINANCE_APPROVER can APPROVE_PAYMENTS')
  }

  // 19. FINANCE_APPROVER can approve ESB
  {
    assert.strictEqual(hasPermission('FINANCE_APPROVER', PERMISSIONS.APPROVE_ESB), true)
    passed++
    console.log('  ✓ FINANCE_APPROVER can APPROVE_ESB')
  }

  // 20. FINANCE_APPROVER can view evidence
  {
    assert.strictEqual(hasPermission('FINANCE_APPROVER', PERMISSIONS.VIEW_EVIDENCE), true)
    passed++
    console.log('  ✓ FINANCE_APPROVER can VIEW_EVIDENCE')
  }

  // 21. FINANCE_APPROVER cannot create requisitions
  {
    assert.strictEqual(hasPermission('FINANCE_APPROVER', PERMISSIONS.CREATE_REQUISITION), false)
    passed++
    console.log('  ✓ FINANCE_APPROVER cannot CREATE_REQUISITION')
  }

  // 22. FINANCE_APPROVER cannot manage candidates
  {
    assert.strictEqual(hasPermission('FINANCE_APPROVER', PERMISSIONS.MANAGE_CANDIDATES), false)
    passed++
    console.log('  ✓ FINANCE_APPROVER cannot MANAGE_CANDIDATES')
  }

  // 23. FINANCE_APPROVER cannot manage beta
  {
    assert.strictEqual(hasPermission('FINANCE_APPROVER', PERMISSIONS.MANAGE_BETA), false)
    passed++
    console.log('  ✓ FINANCE_APPROVER cannot MANAGE_BETA')
  }

  // ── Unknown role ──────────────────────────────────────────────────────

  // 24. Unknown role has no permissions
  {
    assert.strictEqual(hasPermission('SUPERUSER', PERMISSIONS.VIEW_DASHBOARD), false)
    assert.deepStrictEqual(getPermissions('SUPERUSER'), [])
    passed++
    console.log('  ✓ unknown role has no permissions')
  }

  // ── requirePermission middleware ───────────────────────────────────────

  // 25. requirePermission allows OWNER for any permission
  {
    const res = createMockRes()
    const ok = requirePermission(res, { role: 'OWNER' }, PERMISSIONS.DELETE_TENANT)
    assert.strictEqual(ok, true)
    passed++
    console.log('  ✓ requirePermission allows OWNER for DELETE_TENANT')
  }

  // 26. requirePermission blocks VIEWER from APPROVE_AI
  {
    const res = createMockRes()
    const ok = requirePermission(res, { role: 'VIEWER' }, PERMISSIONS.APPROVE_AI)
    assert.strictEqual(ok, false)
    assert.strictEqual(res.status, 403)
    passed++
    console.log('  ✓ requirePermission blocks VIEWER from APPROVE_AI → 403')
  }

  // 27. requirePermission blocks null user → 401
  {
    const res = createMockRes()
    const ok = requirePermission(res, null, PERMISSIONS.VIEW_DASHBOARD)
    assert.strictEqual(ok, false)
    assert.strictEqual(res.status, 401)
    passed++
    console.log('  ✓ requirePermission blocks null user → 401')
  }

  // 28. requirePermission allows HIRING_MANAGER for MANAGE_EVIDENCE
  {
    const res = createMockRes()
    const ok = requirePermission(res, { role: 'HIRING_MANAGER' }, PERMISSIONS.MANAGE_EVIDENCE)
    assert.strictEqual(ok, true)
    passed++
    console.log('  ✓ requirePermission allows HIRING_MANAGER for MANAGE_EVIDENCE')
  }

  // 29. requirePermission blocks FINANCE_APPROVER from MANAGE_SCHEDULER
  {
    const res = createMockRes()
    const ok = requirePermission(res, { role: 'FINANCE_APPROVER' }, PERMISSIONS.MANAGE_SCHEDULER)
    assert.strictEqual(ok, false)
    assert.strictEqual(res.status, 403)
    passed++
    console.log('  ✓ requirePermission blocks FINANCE_APPROVER from MANAGE_SCHEDULER → 403')
  }

  // 30. ADMIN cannot DELETE_TENANT via requirePermission
  {
    const res = createMockRes()
    const ok = requirePermission(res, { role: 'ADMIN' }, PERMISSIONS.DELETE_TENANT)
    assert.strictEqual(ok, false)
    assert.strictEqual(res.status, 403)
    passed++
    console.log('  ✓ requirePermission blocks ADMIN from DELETE_TENANT → 403')
  }

  // 31. ADMIN cannot MANAGE_BILLING via requirePermission
  {
    const res = createMockRes()
    const ok = requirePermission(res, { role: 'ADMIN' }, PERMISSIONS.MANAGE_BILLING)
    assert.strictEqual(ok, false)
    assert.strictEqual(res.status, 403)
    passed++
    console.log('  ✓ requirePermission blocks ADMIN from MANAGE_BILLING → 403')
  }

  // 32. All VIEW_* permissions present for every role
  {
    const viewPerms = Object.values(PERMISSIONS).filter(p => p.startsWith('VIEW_'))
    for (const role of getRoles()) {
      for (const vp of viewPerms) {
        assert.ok(hasPermission(role, vp), `${role} missing ${vp}`)
      }
    }
    passed++
    console.log('  ✓ all roles have all VIEW_* permissions')
  }

  // 33. Permission check is O(1) via Set — OWNER permission count matches total
  {
    const ownerPerms = getPermissions('OWNER')
    const allPerms   = Object.values(PERMISSIONS)
    assert.strictEqual(ownerPerms.length, allPerms.length)
    passed++
    console.log('  ✓ OWNER permission count matches total permission count')
  }

  // 34. HIRING_MANAGER has MANAGE_EVIDENCE
  {
    assert.strictEqual(hasPermission('HIRING_MANAGER', PERMISSIONS.MANAGE_EVIDENCE), true)
    passed++
    console.log('  ✓ HIRING_MANAGER has MANAGE_EVIDENCE')
  }

  // 35. requirePermission 403 response includes role and permission names
  {
    const res = createMockRes()
    requirePermission(res, { role: 'VIEWER' }, PERMISSIONS.MANAGE_TENANTS)
    assert.ok(res.body.error.message.includes('VIEWER'))
    assert.ok(res.body.error.message.includes('MANAGE_TENANTS'))
    passed++
    console.log('  ✓ 403 response includes role and permission names')
  }

  console.log(`  rbac_policy: ${passed}/35 passed`)
  return passed
}

module.exports = { run }

if (require.main === module) {
  run().then(p => process.exit(p === 35 ? 0 : 1))
}
