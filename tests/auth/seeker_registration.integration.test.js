'use strict'

const test   = require('node:test')
const assert = require('node:assert/strict')

/**
 * S45-G2: Integration test — SEEKER registration against live API.
 * Skipped automatically when DATABASE_URL is not set.
 */

const API_BASE = 'https://api.workcaptain.ai'
const DATABASE_URL = process.env.DATABASE_URL

test('S45-G2 seeker registration integration', { skip: !DATABASE_URL && 'DATABASE_URL not set — skipping integration test' }, async (t) => {
  const ts    = Date.now()
  const email = `s45g2-seeker-${ts}@test.workcaptain.ai`
  const password = 'SeekerG22026!'
  const companyName = 'Seeker G2 Test'

  let registerData
  let loginData

  await t.test('register SEEKER via POST /api/auth/register', async () => {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, companyName, personaType: 'SEEKER' }),
    })
    assert.ok(res.ok, `register should succeed, got ${res.status}`)
    const json = await res.json()
    registerData = json.data || json
    assert.ok(registerData.token, 'register response should include token')
    assert.ok(registerData.user, 'register response should include user object')
  })

  await t.test('user created with persona_type SEEKER', () => {
    assert.strictEqual(
      registerData.user.persona_type, 'SEEKER',
      'registered user persona_type should be SEEKER'
    )
  })

  await t.test('login as the registered SEEKER user', async () => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    assert.ok(res.ok, `login should succeed, got ${res.status}`)
    const loginJson = await res.json()
    loginData = loginJson.data || loginJson
    assert.ok(loginData.token, 'login response should include token')
  })

  await t.test('JWT persona_type claim equals SEEKER', () => {
    // Decode JWT payload (base64url -> JSON)
    const parts = loginData.token.split('.')
    assert.strictEqual(parts.length, 3, 'JWT should have 3 parts')
    let payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    while (payloadB64.length % 4) payloadB64 += '='
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8'))
    assert.strictEqual(payload.persona_type, 'SEEKER', 'JWT payload.persona_type should be SEEKER')
  })

  await t.test('login response includes persona_type field', () => {
    assert.ok(loginData.user, 'login response should include user object')
    assert.strictEqual(loginData.user.persona_type, 'SEEKER', 'login user.persona_type should be SEEKER')
  })

  // Evidence block
  await t.test('output evidence block', () => {
    console.log('\n=== S45-G2 SEEKER REGISTRATION EVIDENCE ===')
    console.log(`  email:        ${email}`)
    console.log(`  persona_type: ${registerData.user.persona_type}`)
    console.log(`  role:         ${registerData.user.role}`)
    console.log(`  tenant_id:    ${registerData.user.tenant_id}`)
    console.log(`  token:        ${registerData.token ? registerData.token.substring(0, 20) + '...' : 'MISSING'}`)
    console.log(`  login_persona: ${loginData.user.persona_type}`)
    console.log('=== END EVIDENCE ===\n')
    assert.ok(true)
  })
})
