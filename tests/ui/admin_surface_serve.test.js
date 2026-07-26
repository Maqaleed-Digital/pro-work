'use strict'

/**
 * EC-001-3 · WorkCaptain surface serving — real-dispatch integration test.
 *
 * Boots the actual app/server.js in a child process (NODE_ENV=test, no
 * DATABASE_URL, no JWT_SECRET) and drives it over HTTP, asserting the
 * two-surface contract the fix establishes:
 *
 *   /        → the LANDING entry (index.html, #landing-root)
 *   /admin   → the operational SPA entry (app.html, #app) — NOT the landing entry
 *   /assets/*→ the shared, content-hashed Vite build assets (both entries)
 *
 * Root cause it locks against (regression): before the fix /admin served the
 * landing entry whose absolute /assets/* references were unmounted (only
 * /admin/assets/* existed) → JS 404 → empty skip-link shell; and / was unrouted.
 * This proves every asset referenced by BOTH surfaces resolves (non-404), the
 * correct entry is served on each surface, and the landing never reaches for
 * /admin/assets/*.
 *
 * Requires the UI to be built (app/frontend/dist). If dist is absent (a checkout
 * where `npm run build:ui` has not run) the suite SKIPs loudly rather than
 * false-failing — the serving contract can only be exercised against a build.
 */

const assert = require('node:assert')
const http = require('node:http')
const path = require('node:path')
const fs = require('node:fs')
const { spawn } = require('node:child_process')

const PORT = Number(process.env.WC_TEST_PORT || 3529)
const HOST = '127.0.0.1'
const SERVER = path.join(__dirname, '..', '..', 'app', 'server.js')
const UI_DIST = path.join(__dirname, '..', '..', 'app', 'frontend', 'dist')

function request(method, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: HOST, port: PORT, method, path: pathname, headers: {} },
      (res) => {
        let buf = ''
        res.on('data', c => { buf += c })
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: buf }))
      }
    )
    req.on('error', reject)
    req.end()
  })
}

async function waitForHealth() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await request('GET', '/api/health')
      if (r.status === 200) return
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error('server did not become healthy')
}

/** Absolute same-origin asset URLs referenced by a served HTML document. */
function referencedAssets(html) {
  const urls = new Set()
  const re = /(?:src|href)="(\/[^"]+\.(?:js|mjs|css|svg|png|jpe?g|gif|webp|ico|woff2?|ttf))"/g
  let m
  while ((m = re.exec(html)) !== null) urls.add(m[1])
  return [...urls]
}

async function run() {
  if (!fs.existsSync(path.join(UI_DIST, 'app.html')) || !fs.existsSync(path.join(UI_DIST, 'index.html'))) {
    console.log('  ⚠ SKIP admin_surface_serve: UI dist not built (run `npm run build:ui`) — serving contract not exercised')
    return -1
  }

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

    // ── / serves the LANDING entry ───────────────────────────────────────────
    const root = await request('GET', '/')
    assert.strictEqual(root.status, 200, `GET / expected 200, got ${root.status}`)
    assert.match(root.headers['content-type'] || '', /text\/html/, 'GET / is HTML')
    assert.match(root.body, /id="landing-root"/, 'GET / serves the landing entry (#landing-root)')
    assert.doesNotMatch(root.body, /id="app"[ >]/, 'GET / must NOT be the app entry')
    passed++; console.log('  ✓ GET /        → landing entry (#landing-root)')

    // ── /admin serves the APP entry (NOT the landing) ────────────────────────
    const admin = await request('GET', '/admin')
    assert.strictEqual(admin.status, 200, `GET /admin expected 200, got ${admin.status}`)
    assert.match(admin.headers['content-type'] || '', /text\/html/, 'GET /admin is HTML')
    assert.match(admin.body, /id="app"[ >]/, 'GET /admin serves the operational SPA entry (#app)')
    assert.doesNotMatch(admin.body, /id="landing-root"/, 'REGRESSION: /admin must NOT serve the landing entry')
    passed++; console.log('  ✓ GET /admin   → app entry (#app), NOT landing')

    // ── /admin/ is consistent with /admin ────────────────────────────────────
    const adminSlash = await request('GET', '/admin/')
    assert.strictEqual(adminSlash.status, 200, `GET /admin/ expected 200, got ${adminSlash.status}`)
    assert.match(adminSlash.body, /id="app"[ >]/, 'GET /admin/ serves the app entry')
    passed++; console.log('  ✓ GET /admin/  → app entry (consistent)')

    // ── every asset referenced by the LANDING resolves; none under /admin/assets ─
    const landingAssets = referencedAssets(root.body)
    assert.ok(landingAssets.length >= 2, `landing references assets (found ${landingAssets.length})`)
    for (const u of landingAssets) {
      assert.ok(!u.startsWith('/admin/assets/'), `landing must not request ${u} (no /admin/assets/*)`)
      const a = await request('GET', u)
      assert.strictEqual(a.status, 200, `landing asset ${u} expected 200, got ${a.status}`)
      passed++; console.log(`  ✓ landing asset resolves · ${u} → 200`)
    }

    // ── every asset referenced by the APP resolves ───────────────────────────
    const appAssets = referencedAssets(admin.body)
    assert.ok(appAssets.length >= 2, `app references assets (found ${appAssets.length})`)
    for (const u of appAssets) {
      const a = await request('GET', u)
      assert.strictEqual(a.status, 200, `app asset ${u} expected 200, got ${a.status}`)
      passed++; console.log(`  ✓ app asset resolves · ${u} → 200`)
    }

    // ── negative: unknown asset 404s (not an HTML fallback) ──────────────────
    const missing = await request('GET', '/assets/does-not-exist-xyz.js')
    assert.strictEqual(missing.status, 404, 'unknown /assets/* → 404')
    passed++; console.log('  ✓ unknown /assets/* → 404 (no HTML fallback)')

    // ── negative: path traversal is contained ────────────────────────────────
    const traverse = await request('GET', '/assets/..%2f..%2fserver.js')
    assert.notStrictEqual(traverse.status, 200, 'traversal must not serve files outside dist')
    passed++; console.log(`  ✓ /assets/ traversal contained → ${traverse.status}`)

    console.log(`  admin_surface_serve: ${passed} passed`)
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
  run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
}
