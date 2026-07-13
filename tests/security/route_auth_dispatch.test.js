'use strict'

/**
 * SEC-FIX-WC-01 · INVARIANT ROUTE-AUTH — real-dispatch integration test.
 *
 * Boots the actual app/server.js in a child process (NODE_ENV=test, no
 * DATABASE_URL, no JWT_SECRET) and drives it over HTTP. Because there is no
 * auth service in this configuration, NO request can carry a valid principal —
 * which is exactly the anonymous case Test A needs.
 *
 *   Test A  — every governed-sensitive family rejects anonymous requests with
 *             401 and the handler is NOT invoked (no data payload leaks).
 *   Regress — every classified PUBLIC route remains reachable unauthenticated,
 *             and unknown /api routes fail closed (404, no data).
 *
 * Tests B and C (server-derived tenant / cross-tenant isolation) are proven
 * deterministically in tests/security/route_guard.test.js — an authed principal
 * is required to exercise them and that needs the DB-backed auth service, which
 * is V1/runtime and out of this lane. The dispatch wiring that consumes those
 * helpers is exercised here for the anonymous half of the invariant.
 */

const assert = require('assert')
const http = require('node:http')
const path = require('node:path')
const { spawn } = require('node:child_process')

const PORT = Number(process.env.WC_TEST_PORT || 3517)
const HOST = '127.0.0.1'
const SERVER = path.join(__dirname, '..', '..', 'app', 'server.js')

function request(method, pathname, { headers, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : (typeof body === 'string' ? body : JSON.stringify(body))
    const req = http.request(
      { host: HOST, port: PORT, method, path: pathname,
        headers: Object.assign({ 'content-type': 'application/json' }, headers || {}) },
      (res) => {
        let buf = ''
        res.on('data', c => { buf += c })
        res.on('end', () => {
          let parsed = null
          try { parsed = buf ? JSON.parse(buf) : null } catch { parsed = buf }
          resolve({ status: res.statusCode, body: parsed })
        })
      }
    )
    req.on('error', reject)
    if (data !== null) req.write(data)
    req.end()
  })
}

function waitForHealth(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tick = () => {
      request('GET', '/api/health')
        .then(r => (r.status === 200 ? resolve() : retry()))
        .catch(retry)
    }
    const retry = () => {
      if (Date.now() > deadline) return reject(new Error('server did not become healthy in time'))
      setTimeout(tick, 250)
    }
    tick()
  })
}

// Every governed-sensitive family: [method, path]. Includes reads and writes.
const SENSITIVE = [
  ['GET',  '/api/admin/ai/models'],
  ['POST', '/api/admin/ai/models'],
  ['GET',  '/api/admin/compliance/nitaqat/status'],
  ['POST', '/api/admin/compliance/nitaqat/compute'],
  ['GET',  '/api/admin/compliance/occupation-code/lookup'],
  ['GET',  '/api/admin/dashboard/kpi'],
  ['GET',  '/api/onboarding/wps/pack'],
  ['POST', '/api/onboarding/wps/pack'],
  ['GET',  '/api/compliance/risk/screen'],
  ['GET',  '/api/evidence/packs'],
  ['POST', '/api/evidence/generate'],
  ['GET',  '/api/compliance/pdpl/dsr'],
  ['POST', '/api/compliance/pdpl/dsr'],
  ['GET',  '/api/compliance/dashboard/summary'],
  ['POST', '/api/compliance/dashboard/nitaqat/compute'],
  ['GET',  '/api/payments/fee-transparency/calculate'],
  ['POST', '/api/payments/fee-transparency/calculate'],
  ['GET',  '/admin/beta'],
  ['POST', '/admin/beta'],
]

async function run() {
  let passed = 0
  const child = spawn(process.execPath, [SERVER], {
    env: Object.assign({}, process.env, {
      NODE_ENV: 'test',
      APP_PORT: String(PORT),
      APP_HOST: HOST,
      DATABASE_URL: '',
      JWT_SECRET: '',
    }),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let serverErr = ''
  child.stderr.on('data', d => { serverErr += d })

  try {
    await waitForHealth()

    // ── Test A: anonymous → 401, handler NOT invoked (no data payload) ───────
    for (const [method, p] of SENSITIVE) {
      const r = await request(method, p, { body: method === 'POST' ? {} : undefined })
      assert.strictEqual(r.status, 401, `A: ${method} ${p} expected 401, got ${r.status} ${JSON.stringify(r.body)}`)
      assert.ok(r.body && r.body.ok === false, `A: ${method} ${p} expected error envelope`)
      assert.ok(!(r.body && Object.prototype.hasOwnProperty.call(r.body, 'data')),
        `A: ${method} ${p} must not return a data payload (handler was invoked!)`)
      passed++
      console.log(`  ✓ A anon 401 · ${method} ${p}`)
    }

    // ── Regression: classified PUBLIC routes reachable unauthenticated ───────
    {
      const h = await request('GET', '/api/health')
      assert.strictEqual(h.status, 200, 'public /api/health reachable')
      assert.ok(h.body && h.body.data && h.body.data.status === 'healthy')
      passed++; console.log('  ✓ public reachable · GET /api/health → 200')
    }
    {
      const rr = await request('GET', '/api/ready')
      assert.notStrictEqual(rr.status, 401, 'public /api/ready not auth-blocked')
      assert.notStrictEqual(rr.status, 404, 'public /api/ready is a real route')
      passed++; console.log(`  ✓ public reachable · GET /api/ready → ${rr.status}`)
    }
    {
      const id = await request('GET', '/api/identity/workers')
      assert.notStrictEqual(id.status, 401, 'public identity read not auth-blocked')
      passed++; console.log(`  ✓ public reachable · GET /api/identity/workers → ${id.status}`)
    }
    {
      const co = await request('POST', '/api/cohort/request', {
        body: { email: `sec-test-${Date.now()}@example.com`, orgName: 'SecTest', fullName: 'Sec Test', teamSize: '1-10' },
      })
      assert.notStrictEqual(co.status, 401, 'public cohort intake not auth-blocked')
      passed++; console.log(`  ✓ public reachable · POST /api/cohort/request → ${co.status}`)
    }

    // ── Regression: unknown / sensitive-without-trailing-slash fail closed ───
    {
      const u = await request('GET', '/api/does-not-exist-xyz')
      assert.strictEqual(u.status, 404, 'unknown /api GET fails closed (404)')
      assert.ok(!(u.body && Object.prototype.hasOwnProperty.call(u.body, 'data')), 'unknown route leaks no data')
      passed++; console.log('  ✓ unknown fails closed · GET /api/does-not-exist-xyz → 404')
    }
    {
      // '/api/evidence' (no trailing slash) is not matched by the sensitive
      // prefix and is not a known route → fail closed with no data.
      const e = await request('GET', '/api/evidence')
      assert.strictEqual(e.status, 404, '/api/evidence (no slash) fails closed')
      passed++; console.log('  ✓ unknown fails closed · GET /api/evidence → 404')
    }

    console.log(`  route_auth_dispatch: ${passed} passed`)
    return passed
  } catch (e) {
    if (serverErr) console.error('--- server stderr ---\n' + serverErr)
    throw e
  } finally {
    child.kill('SIGKILL')
  }
}

module.exports = { run }

if (require.main === module) {
  run().then(p => process.exit(p > 0 ? 0 : 1)).catch(e => { console.error(e); process.exit(1) })
}
