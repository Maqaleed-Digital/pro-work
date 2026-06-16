'use strict'

const assert = require('assert')
const crypto = require('crypto')
const { createInvitationService } = require('../../app/modules/auth/invitation_service')
const { createAuthService }       = require('../../app/modules/auth/auth_service')
const { createInvitationRouter }  = require('../../app/api/invitation_router')

function createMockPool() {
  const invitations = new Map()
  const users       = new Map()
  const sessions    = new Map()
  const tenants     = new Map()
  const tosAcceptances = []

  // Transaction snapshot state (shared by pool + client). Deep-copied on BEGIN,
  // restored on ROLLBACK, discarded on COMMIT.
  const state = { snapshot: null, failNextTosInsert: false }

  function snapshot() {
    state.snapshot = {
      users:       new Map(Array.from(users.entries()).map(([k, v]) => [k, { ...v }])),
      invitations: new Map(Array.from(invitations.entries()).map(([k, v]) => [k, { ...v }])),
      tos:         tosAcceptances.map(r => ({ ...r })),
    }
  }
  function restore() {
    if (!state.snapshot) return
    users.clear();       for (const [k, v] of state.snapshot.users)       users.set(k, v)
    invitations.clear(); for (const [k, v] of state.snapshot.invitations) invitations.set(k, v)
    tosAcceptances.length = 0; for (const r of state.snapshot.tos) tosAcceptances.push(r)
    state.snapshot = null
  }

  const mockClient = {
    async query(sql, params) {
      if (/^BEGIN/i.test(sql))    { snapshot(); return { rows: [], rowCount: 0 } }
      if (/^ROLLBACK/i.test(sql)) { restore();  return { rows: [], rowCount: 0 } }
      if (/^COMMIT/i.test(sql))   { state.snapshot = null; return { rows: [], rowCount: 0 } }
      if (/set_config/i.test(sql)) return { rows: [{}] }

      // INSERT INTO tos_acceptances (WC-02)
      if (/INSERT INTO tos_acceptances/i.test(sql)) {
        if (state.failNextTosInsert) {
          state.failNextTosInsert = false
          throw Object.assign(new Error('simulated tos_acceptances insert failure'), { status: 500 })
        }
        const row = {
          user_id: params[0], tenant_id: params[1],
          tos_version: params[2], acceptance_source: params[3],
        }
        tosAcceptances.push(row)
        return { rows: [row], rowCount: 1 }
      }

      // INSERT INTO invitations
      if (/INSERT INTO invitations/i.test(sql)) {
        const inv = {
          id: params[0], tenant_id: params[1], email: params[2], role: params[3],
          token: params[4], invited_by: params[5], status: 'PENDING',
          expires_at: params[6], created_at: new Date().toISOString(),
        }
        invitations.set(inv.id, inv)
        return { rows: [inv], rowCount: 1 }
      }

      // SELECT FROM invitations WHERE token
      if (/FROM invitations WHERE token/i.test(sql)) {
        const matches = Array.from(invitations.values()).filter(i => i.token === params[0])
        return { rows: matches, rowCount: matches.length }
      }

      // UPDATE invitations — revoke (has AND status = 'PENDING', 2 params: id + tenant_id)
      if (/UPDATE invitations SET status = 'EXPIRED'[\s\S]*AND status = 'PENDING'/i.test(sql)) {
        const inv = invitations.get(params[0])
        if (inv && inv.tenant_id === params[1] && inv.status === 'PENDING') {
          inv.status = 'EXPIRED'
          return { rows: [{ id: inv.id }], rowCount: 1 }
        }
        return { rows: [], rowCount: 0 }
      }

      // UPDATE invitations — accept (single param: id)
      if (/UPDATE invitations SET status = 'ACCEPTED'/i.test(sql)) {
        const inv = invitations.get(params[0])
        if (inv) inv.status = 'ACCEPTED'
        return { rows: [], rowCount: inv ? 1 : 0 }
      }

      // UPDATE invitations — expire (single param: id)
      if (/UPDATE invitations SET status = 'EXPIRED'.*WHERE id/i.test(sql)) {
        const inv = invitations.get(params[0])
        if (inv) inv.status = 'EXPIRED'
        return { rows: [], rowCount: inv ? 1 : 0 }
      }

      // SELECT FROM invitations WHERE tenant_id
      if (/FROM invitations WHERE tenant_id/i.test(sql)) {
        const matches = Array.from(invitations.values()).filter(i => i.tenant_id === params[0])
        return { rows: matches, rowCount: matches.length }
      }

      // ── Auth service mock queries ────────────────────────────────────
      if (/SELECT id FROM users WHERE email/i.test(sql)) {
        const m = Array.from(users.values()).filter(u => u.email === params[0] && u.tenant_id === params[1])
        return { rows: m, rowCount: m.length }
      }
      if (/SELECT COUNT/i.test(sql)) {
        const cnt = Array.from(users.values()).filter(u => u.tenant_id === params[0]).length
        return { rows: [{ cnt: String(cnt) }], rowCount: 1 }
      }
      if (/INSERT INTO users/i.test(sql)) {
        const u = { id: params[0], email: params[1], password_hash: params[2], tenant_id: params[3], role: params[4], status: 'ACTIVE', created_at: new Date().toISOString() }
        users.set(u.id, u)
        return { rows: [u], rowCount: 1 }
      }
      if (/SELECT.*password_hash.*FROM users/i.test(sql)) {
        return { rows: Array.from(users.values()).filter(u => u.email === params[0] && u.tenant_id === params[1]), rowCount: 0 }
      }
      if (/DELETE FROM sessions WHERE token_hash/i.test(sql)) {
        for (const [k, v] of sessions) { if (v.token_hash === params[0]) { sessions.delete(k); break } }
        return { rows: [], rowCount: 1 }
      }
      if (/SELECT.*FROM sessions WHERE token_hash/i.test(sql)) {
        const m = Array.from(sessions.values()).filter(s => s.token_hash === params[0])
        return { rows: m, rowCount: m.length }
      }
      if (/INSERT INTO sessions/i.test(sql)) {
        const s = { id: params[0], user_id: params[1], token_hash: params[2], expires_at: params[3] }
        sessions.set(s.id, s)
        return { rows: [s], rowCount: 1 }
      }
      if (/UPDATE users SET last_login_at/i.test(sql)) {
        return { rows: [], rowCount: 1 }
      }
      if (/FROM users WHERE id/i.test(sql)) {
        const u = users.get(params[0])
        if (!u) return { rows: [], rowCount: 0 }
        const { password_hash, ...safe } = u
        return { rows: [safe], rowCount: 1 }
      }

      return { rows: [], rowCount: 0 }
    },
    release() {},
  }

  const pool = {
    connect() { return Promise.resolve(mockClient) },
    query(sql, params) { return Promise.resolve(mockClient.query(sql, params)) },
    _invitations: invitations,
    _users: users,
    tosAcceptances,
  }
  // Injectable failure hook: setting this makes the next tos_acceptances INSERT throw.
  Object.defineProperty(pool, 'failNextTosInsert', {
    get() { return state.failNextTosInsert },
    set(v) { state.failNextTosInsert = v },
  })
  return pool
}

function createMockRes() {
  let _status = 200, _body = ''
  return {
    writeHead(s) { _status = s },
    end(b) { _body = b || '' },
    get status() { return _status },
    get body() { return _body ? JSON.parse(_body) : null },
  }
}

async function run() {
  let passed = 0
  const secret = 'test-jwt-secret-for-invitation-tests'
  const pool = createMockPool()
  const authService = createAuthService({ pool, secret })
  const svc = createInvitationService({ pool, authService, baseUrl: 'https://test.workcaptain.ai' })
  const router = createInvitationRouter({ invitationService: svc })

  // Pre-populate T1 with an existing owner so invitation role is respected (not overridden to OWNER)
  await authService.register({ email: 'existing-owner@t1.com', password: 'StrongOwner1!', tenantId: 'T1' })

  // ── createInvitation ──────────────────────────────────────────────────

  // 1. creates invitation with valid token
  let inviteToken
  {
    const result = await svc.createInvitation('T1', 'new@test.com', 'VIEWER', 'user-owner-1')
    assert.ok(result.invitation.id)
    assert.strictEqual(result.invitation.email, 'new@test.com')
    assert.strictEqual(result.invitation.role, 'VIEWER')
    assert.strictEqual(result.invitation.status, 'PENDING')
    assert.ok(result.inviteLink.includes('accept-invite?token='))
    inviteToken = result.inviteLink.split('token=')[1]
    passed++
    console.log('  ✓ createInvitation generates valid token')
  }

  // 2. invitation token is 64-char hex
  {
    assert.strictEqual(inviteToken.length, 64)
    assert.ok(/^[0-9a-f]+$/.test(inviteToken))
    passed++
    console.log('  ✓ token is 64-char hex')
  }

  // 3. invite link includes base URL
  {
    const result = await svc.createInvitation('T1', 'another@test.com', 'ADMIN', 'user-owner-1')
    assert.ok(result.inviteLink.startsWith('https://test.workcaptain.ai'))
    passed++
    console.log('  ✓ invite link includes base URL')
  }

  // 4. rejects invalid role
  {
    try {
      await svc.createInvitation('T1', 'bad@test.com', 'SUPERUSER', 'user-owner-1')
      assert.fail('should throw')
    } catch (e) {
      assert.strictEqual(e.status, 422)
    }
    passed++
    console.log('  ✓ rejects invalid role')
  }

  // 5. rejects missing email
  {
    try {
      await svc.createInvitation('T1', '', 'VIEWER', 'user-owner-1')
      assert.fail('should throw')
    } catch (e) {
      assert.strictEqual(e.status, 400)
    }
    passed++
    console.log('  ✓ rejects missing email')
  }

  // 6. normalizes email to lowercase
  {
    const result = await svc.createInvitation('T1', 'UPPER@TEST.COM', 'VIEWER', 'user-owner-1')
    assert.strictEqual(result.invitation.email, 'upper@test.com')
    passed++
    console.log('  ✓ normalizes email to lowercase')
  }

  // ── acceptInvitation ──────────────────────────────────────────────────

  // 7. accept creates user with correct role
  {
    const result = await svc.acceptInvitation(inviteToken, 'StrongPass1!')
    assert.ok(result.token)
    assert.strictEqual(result.user.role, 'VIEWER')
    // WC-02: service persists a tos_acceptances row on accept
    const tosRow = pool.tosAcceptances.find(r => r.acceptance_source === 'invitation_accept' && r.user_id === result.user.id)
    assert.ok(tosRow, 'tos_acceptances row should exist for accepted invite')
    assert.strictEqual(tosRow.tos_version, '2026-06-16.v1')
    passed++
    console.log('  ✓ accept creates user with correct role + records tos_acceptances')
  }

  // 8. already accepted token is rejected
  {
    try {
      await svc.acceptInvitation(inviteToken, 'StrongPass2!')
      assert.fail('should throw')
    } catch (e) {
      assert.strictEqual(e.status, 409)
    }
    passed++
    console.log('  ✓ already accepted token is rejected (409)')
  }

  // 9. invalid token is rejected
  {
    try {
      await svc.acceptInvitation('nonexistent-token-here', 'StrongPass3!')
      assert.fail('should throw')
    } catch (e) {
      assert.strictEqual(e.status, 404)
    }
    passed++
    console.log('  ✓ invalid token is rejected (404)')
  }

  // 10. rejects missing password
  {
    try {
      await svc.acceptInvitation('some-token', '')
      assert.fail('should throw')
    } catch (e) {
      assert.strictEqual(e.status, 400)
    }
    passed++
    console.log('  ✓ rejects missing password')
  }

  // 11. expired invitation is rejected
  {
    const result = await svc.createInvitation('T1', 'expired@test.com', 'VIEWER', 'user-owner-1')
    const token = result.inviteLink.split('token=')[1]
    // Manually set expires_at to past
    for (const inv of pool._invitations.values()) {
      if (inv.token === token) inv.expires_at = new Date('2020-01-01').toISOString()
    }
    try {
      await svc.acceptInvitation(token, 'StrongPass4!')
      assert.fail('should throw')
    } catch (e) {
      assert.strictEqual(e.status, 410)
    }
    passed++
    console.log('  ✓ expired invitation is rejected (410)')
  }

  // ── listInvitations ───────────────────────────────────────────────────

  // 12. list returns all invitations for tenant
  {
    const list = await svc.listInvitations('T1')
    assert.ok(list.length >= 3)
    passed++
    console.log('  ✓ listInvitations returns all for tenant')
  }

  // 13. list returns empty for unknown tenant
  {
    const list = await svc.listInvitations('UNKNOWN')
    assert.strictEqual(list.length, 0)
    passed++
    console.log('  ✓ listInvitations returns empty for unknown tenant')
  }

  // ── revokeInvitation ──────────────────────────────────────────────────

  // 14. revoke sets status EXPIRED
  {
    const result = await svc.createInvitation('T2', 'revokeme@test.com', 'ADMIN', 'user-owner-2')
    await svc.revokeInvitation(result.invitation.id, 'T2')
    const inv = pool._invitations.get(result.invitation.id)
    assert.strictEqual(inv.status, 'EXPIRED')
    passed++
    console.log('  ✓ revoke sets status EXPIRED')
  }

  // 15. revoke non-existent returns 404
  {
    try {
      await svc.revokeInvitation('nonexistent-id', 'T2')
      assert.fail('should throw')
    } catch (e) {
      assert.strictEqual(e.status, 404)
    }
    passed++
    console.log('  ✓ revoke non-existent returns 404')
  }

  // ── Router tests ──────────────────────────────────────────────────────

  const ownerUser = { id: 'U1', tenant_id: 'T1', role: 'OWNER' }
  const viewerUser = { id: 'U2', tenant_id: 'T1', role: 'VIEWER' }

  // 16. POST /api/invitations — OWNER can create
  {
    const res = createMockRes()
    await router.handle({}, res, '/api/invitations', 'POST', { email: 'router@test.com', role: 'VIEWER' }, ownerUser)
    assert.strictEqual(res.status, 201)
    assert.ok(res.body.data.inviteLink)
    passed++
    console.log('  ✓ POST /api/invitations — OWNER can create')
  }

  // 17. POST /api/invitations — VIEWER cannot create (RBAC)
  {
    const res = createMockRes()
    await router.handle({}, res, '/api/invitations', 'POST', { email: 'x@test.com', role: 'VIEWER' }, viewerUser)
    assert.strictEqual(res.status, 403)
    passed++
    console.log('  ✓ VIEWER cannot create invitations (RBAC 403)')
  }

  // 18. GET /api/invitations — OWNER can list
  {
    const res = createMockRes()
    await router.handle({}, res, '/api/invitations', 'GET', null, ownerUser)
    assert.strictEqual(res.status, 200)
    assert.ok(Array.isArray(res.body.data.invitations))
    passed++
    console.log('  ✓ GET /api/invitations — OWNER can list')
  }

  // 19. POST /api/invitations/accept — public (no auth)
  {
    const createRes = createMockRes()
    await router.handle({}, createRes, '/api/invitations', 'POST', { email: 'accept-via-router@test.com', role: 'HIRING_MANAGER' }, ownerUser)
    const link = createRes.body.data.inviteLink
    const acceptToken = link.split('token=')[1]

    const res = createMockRes()
    await router.handle({}, res, '/api/invitations/accept', 'POST', { token: acceptToken, password: 'StrongPass5!', tosAccepted: true }, null)
    assert.strictEqual(res.status, 201)
    assert.ok(res.body.data.token)
    assert.strictEqual(res.body.data.user.role, 'HIRING_MANAGER')
    // WC-02: tos_acceptances row recorded via invitation_accept path
    const tosRow = pool.tosAcceptances.find(r => r.acceptance_source === 'invitation_accept' && r.user_id === res.body.data.user.id)
    assert.ok(tosRow, 'tos_acceptances row should exist via router accept')
    assert.strictEqual(tosRow.acceptance_source, 'invitation_accept')
    passed++
    console.log('  ✓ POST /api/invitations/accept — public, creates user + records tos')
  }

  // 20. POST /api/invitations — rejects missing auth
  {
    const res = createMockRes()
    await router.handle({}, res, '/api/invitations', 'POST', { email: 'x@test.com', role: 'VIEWER' }, null)
    assert.strictEqual(res.status, 401)
    passed++
    console.log('  ✓ POST /api/invitations rejects missing auth')
  }

  // 21. constructor rejects missing pool
  {
    try { createInvitationService({}); assert.fail() } catch (e) { assert.ok(e.message.includes('pool')) }
    passed++
    console.log('  ✓ constructor rejects missing pool')
  }

  // 22. constructor rejects missing authService
  {
    try { createInvitationService({ pool }); assert.fail() } catch (e) { assert.ok(e.message.includes('authService')) }
    passed++
    console.log('  ✓ constructor rejects missing authService')
  }

  // 23. EN locale has all invite keys
  {
    const en = require('../../app/frontend/src/locales/en.json')
    const keys = ['invite.title', 'invite.email', 'invite.role', 'invite.send',
      'invite.pendingTitle', 'invite.revoke', 'invite.accept.title',
      'invite.accept.password', 'invite.accept.submit', 'invite.accept.noToken']
    for (const k of keys) assert.ok(en[k], `EN missing: ${k}`)
    passed++
    console.log('  ✓ EN locale has all invite keys')
  }

  // 24. AR locale has all invite keys
  {
    const ar = require('../../app/frontend/src/locales/ar.json')
    const keys = ['invite.title', 'invite.email', 'invite.role', 'invite.send',
      'invite.pendingTitle', 'invite.revoke', 'invite.accept.title',
      'invite.accept.password', 'invite.accept.submit', 'invite.accept.noToken']
    for (const k of keys) assert.ok(ar[k], `AR missing: ${k}`)
    passed++
    console.log('  ✓ AR locale has all invite keys')
  }

  // 25. router exports render for invite.js and accept_invite.js
  {
    const invite = require('../../app/frontend/src/pages/invite.js')
    const accept = require('../../app/frontend/src/pages/accept_invite.js')
    assert.strictEqual(typeof invite.default.render, 'function')
    assert.strictEqual(typeof accept.default.render, 'function')
    passed++
    console.log('  ✓ invite.js and accept_invite.js export render')
  }

  // 26. WC-02: POST /api/invitations/accept WITHOUT tosAccepted → 422 (clean primary-path proof)
  {
    const createRes = createMockRes()
    await router.handle({}, createRes, '/api/invitations', 'POST', { email: 'no-tos-accept@test.com', role: 'VIEWER' }, ownerUser)
    const noTosToken = createRes.body.data.inviteLink.split('token=')[1]

    const usersBefore = pool._users.size
    const tosBefore   = pool.tosAcceptances.length

    const res = createMockRes()
    await router.handle({}, res, '/api/invitations/accept', 'POST', { token: noTosToken, password: 'StrongPass6!' }, null)
    // (a) HTTP 422
    assert.strictEqual(res.status, 422)
    assert.ok(res.body.error.message.includes('Terms of Service'))
    // (b) no user created
    assert.strictEqual(pool._users.size, usersBefore, 'no user should be created on 422')
    assert.ok(!Array.from(pool._users.values()).find(u => u.email === 'no-tos-accept@test.com'), 'no user row for rejected email')
    // (c) invitation NOT marked ACCEPTED
    const invRow = Array.from(pool._invitations.values()).find(i => i.token === noTosToken)
    assert.strictEqual(invRow.status, 'PENDING', 'invitation must remain PENDING on 422')
    // (d) no tos_acceptances row
    assert.strictEqual(pool.tosAcceptances.length, tosBefore, 'no tos_acceptances row on 422')
    passed++
    console.log('  ✓ POST /api/invitations/accept without tosAccepted → 422 (no side effects)')
  }

  // 27. tos_acceptances insert failure rolls back — no orphaned user, invitation not ACCEPTED
  {
    const createRes = createMockRes()
    await router.handle({}, createRes, '/api/invitations', 'POST', { email: 'rollback-invite@test.com', role: 'VIEWER' }, ownerUser)
    const rbToken = createRes.body.data.inviteLink.split('token=')[1]

    const usersBefore = pool._users.size
    pool.failNextTosInsert = true
    let threw = false
    try {
      await svc.acceptInvitation(rbToken, 'StrongPass7!')
    } catch (e) {
      threw = true
    }
    assert.ok(threw, 'acceptInvitation should throw when tos insert fails')
    // The whole transaction rolled back — no orphaned user
    const orphanUser = Array.from(pool._users.values()).find(u => u.email === 'rollback-invite@test.com')
    assert.ok(!orphanUser, 'no orphaned user should remain after rollback')
    assert.strictEqual(pool._users.size, usersBefore, 'user map unchanged after rollback')
    // Invitation NOT left ACCEPTED
    const invRow = Array.from(pool._invitations.values()).find(i => i.token === rbToken)
    assert.strictEqual(invRow.status, 'PENDING', 'invitation must NOT be left ACCEPTED after rollback')
    passed++
    console.log('  ✓ tos_acceptances insert failure rolls back — no orphaned user, invitation not ACCEPTED')
  }

  console.log(`  invitation_service: ${passed}/27 passed`)
  return passed
}

module.exports = { run }

if (require.main === module) {
  run().then(p => process.exit(p === 27 ? 0 : 1))
}
