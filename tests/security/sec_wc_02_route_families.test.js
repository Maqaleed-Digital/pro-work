'use strict'

/**
 * SEC-WC-02 · route-family dispatch integration.
 *
 * Boots the REAL app/server.js in child processes under three configurations and
 * drives it over HTTP:
 *   CFG_ANON  (NODE_ENV=test, no DB/JWT)         — anonymous half of every family.
 *   CFG_PROD  (NODE_ENV=production, no DB/JWT)    — jobs demo-disable (404 all methods).
 *   CFG_DBURL (NODE_ENV=test, DATABASE_URL set)   — contracts/intent fails closed WITH the
 *                                                   db-backed router mounted (config independence).
 *
 * Covers: Test 1 (anonymous negatives per family+method), Test 5 (contracts with &
 * without DATABASE_URL), Test 6 (jobs production disable), plus the /wos/evidence-events
 * non-/api UI and no-data-leak assertions.
 */

const assert = require('assert')
const http = require('node:http')
const path = require('node:path')
const os = require('node:os')
const fs = require('node:fs')
const { spawn } = require('node:child_process')

const HOST = '127.0.0.1'
const SERVER = path.join(__dirname, '..', '..', 'app', 'server.js')

// Production config validation requires these to be present (they are NOT secrets
// under test — dummy values are sufficient to boot in NODE_ENV=production).
const PROD_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-wc-02-prod-'))
const PROD_ENV = {
  NODE_ENV: 'production',
  PORT: '3519',
  PUBLIC_BASE_URL: 'https://sec-wc-02.test',
  CORS_ALLOWED_ORIGINS: 'https://sec-wc-02.test',
  ADMIN_API_TOKEN: 'sec-wc-02-prod-admin-token',
  PROWORK_DATA_DIR: PROD_DATA_DIR,
  DATABASE_URL: '',
  JWT_SECRET: 'sec-wc-02-prod-test',
}

function request(port, method, pathname, { headers, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body === undefined ? null : (typeof body === 'string' ? body : JSON.stringify(body))
    const req = http.request(
      { host: HOST, port, method, path: pathname,
        headers: Object.assign({ 'content-type': 'application/json' }, headers || {}) },
      (res) => {
        let buf = ''
        res.on('data', c => { buf += c })
        res.on('end', () => { let p = null; try { p = buf ? JSON.parse(buf) : null } catch { p = buf } resolve({ status: res.statusCode, body: p }) })
      }
    )
    req.on('error', reject)
    if (data !== null) req.write(data)
    req.end()
  })
}

function waitForHealth(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tick = () => { request(port, 'GET', '/api/health').then(r => (r.status === 200 ? resolve() : retry())).catch(retry) }
    const retry = () => { if (Date.now() > deadline) return reject(new Error('server did not become healthy in time')); setTimeout(tick, 250) }
    tick()
  })
}

async function withServer(env, port, fn) {
  const child = spawn(process.execPath, [SERVER], {
    env: Object.assign({}, process.env, { APP_PORT: String(port), APP_HOST: HOST }, env),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let serverErr = ''
  child.stderr.on('data', d => { serverErr += d })
  try {
    await waitForHealth(port)
    return await fn()
  } catch (e) {
    if (serverErr) console.error('--- server stderr ---\n' + serverErr)
    throw e
  } finally {
    child.kill('SIGKILL')
  }
}

const assertDenied = (r, code, ctx) => {
  assert.strictEqual(r.status, code, `${ctx}: expected ${code}, got ${r.status} ${JSON.stringify(r.body)}`)
  assert.ok(!(r.body && Object.prototype.hasOwnProperty.call(r.body, 'data')), `${ctx}: must not return a data payload`)
}

async function run() {
  let passed = 0

  // ══ CFG_ANON — anonymous negatives (Test 1) + contracts DB-absent (Test 5a) ══
  await withServer({ NODE_ENV: 'test', DATABASE_URL: '', JWT_SECRET: '' }, 3518, async () => {
    const WOS = [
      ['GET', '/api/wos/workers'], ['POST', '/api/wos/workers'],
      ['GET', '/api/wos/workers/w1'], ['GET', '/api/wos/workers/w1/audit'],
      ['PATCH', '/api/wos/workers/w1'], ['POST', '/api/wos/workers/w1/activate'],
      ['GET', '/api/wos/evidence-events'], ['POST', '/api/wos/evidence-events'],
    ]
    for (const [m, p] of WOS) { assertDenied(await request(3518, m, p, { body: m === 'GET' ? undefined : {} }), 401, `anon WOS ${m} ${p}`); passed++; console.log(`  ✓ anon 401 · ${m} ${p}`) }
    // R4/A6 — the non-/api evidence viewer UI must also fail closed
    assertDenied(await request(3518, 'GET', '/wos/evidence-events'), 401, 'anon WOS UI /wos/evidence-events'); passed++; console.log('  ✓ anon 401 · GET /wos/evidence-events (UI)')

    const CI = [['GET', '/api/contracts/intent'], ['POST', '/api/contracts/intent'], ['GET', '/api/contracts/intent/x'], ['GET', '/api/contracts/intent/x/audit']]
    for (const [m, p] of CI) { assertDenied(await request(3518, m, p, { body: m === 'GET' ? undefined : {} }), 401, `anon CI(no-DB) ${m} ${p}`); passed++; console.log(`  ✓ anon 401 (DB absent) · ${m} ${p}`) }

    // Jobs in NON-production: enabled but auth-gated → 401 (NOT 404, proving it is mounted)
    for (const [m, p] of [['GET', '/api/jobs'], ['POST', '/api/jobs'], ['GET', '/api/jobs/j1']]) {
      const r = await request(3518, m, p, { body: m === 'GET' ? undefined : {} })
      assertDenied(r, 401, `non-prod jobs ${m} ${p}`)
      passed++; console.log(`  ✓ non-prod jobs auth-gated 401 · ${m} ${p}`)
    }
  })

  // ══ CFG_PROD — jobs demo-disable: every route+method → 404 (Test 6) ══════════
  await withServer(PROD_ENV, 3519, async () => {
    const JOBS = [['GET', '/api/jobs'], ['POST', '/api/jobs'], ['GET', '/api/jobs/j1'], ['DELETE', '/api/jobs/j1'], ['POST', '/api/jobs/j1/close'], ['GET', '/api/jobs/j1/proposals']]
    for (const [m, p] of JOBS) { assertDenied(await request(3519, m, p, { body: m === 'GET' || m === 'DELETE' ? undefined : {} }), 404, `prod jobs ${m} ${p}`); passed++; console.log(`  ✓ prod jobs 404 · ${m} ${p}`) }
    // In production, WOS + contracts/intent still fail closed anonymously
    assertDenied(await request(3519, 'GET', '/api/wos/workers'), 401, 'prod anon WOS'); passed++; console.log('  ✓ prod anon 401 · GET /api/wos/workers')
    assertDenied(await request(3519, 'POST', '/api/contracts/intent', { body: {} }), 401, 'prod anon CI'); passed++; console.log('  ✓ prod anon 401 · POST /api/contracts/intent')
  })

  // ══ CFG_DBURL — contracts/intent fails closed WITH db-backed router (Test 5b) ═
  // Dummy non-connecting DSN: the intent gate returns 401 before any DB query, so
  // the pool is never used. Proves protection is independent of DATABASE_URL.
  await withServer({ NODE_ENV: 'test', DATABASE_URL: 'postgres://u:p@127.0.0.1:1/db', JWT_SECRET: 'sec-wc-02-db-test' }, 3520, async () => {
    for (const [m, p] of [['GET', '/api/contracts/intent'], ['POST', '/api/contracts/intent'], ['GET', '/api/contracts/intent/x']]) {
      assertDenied(await request(3520, m, p, { body: m === 'GET' ? undefined : {} }), 401, `anon CI(DB present) ${m} ${p}`); passed++; console.log(`  ✓ anon 401 (DB present) · ${m} ${p}`)
    }
  })

  console.log(`  sec_wc_02_route_families: ${passed} passed`)
  return passed
}

module.exports = { run }

if (require.main === module) {
  run().then(p => process.exit(p > 0 ? 0 : 1)).catch(e => { console.error(e); process.exit(1) })
}
