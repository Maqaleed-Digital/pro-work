'use strict'

/**
 * SEC-WC-02 · dead-router architectural guard.
 *
 * app/api/wos_router.js must remain UNMOUNTED until it independently satisfies the
 * WOS auth + tenant-isolation controls. This test fails if server.js ever starts
 * requiring/mounting it, forcing an auth review before it can be wired in.
 */

const assert = require('assert')
const fs = require('fs')
const path = require('node:path')

async function run() {
  let passed = 0
  const t = (name, fn) => { fn(); passed++; console.log(`  ✓ ${name}`) }

  const serverSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'server.js'), 'utf8')

  t('server.js does NOT require app/api/wos_router', () => {
    assert.ok(!/require\([^)]*wos_router[^)]*\)/.test(serverSrc),
      'server.js must not require ./api/wos_router — it is unmounted pending an auth review (SEC-WC-02)')
  })

  t('server.js does NOT reference createWosRouter', () => {
    assert.ok(!/createWosRouter/.test(serverSrc),
      'server.js must not construct the dead WOS router')
  })

  t('wos_router.js carries the SEC-WC-02 do-not-mount warning', () => {
    const routerSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'api', 'wos_router.js'), 'utf8')
    assert.ok(/SEC-WC-02/.test(routerSrc) && /DO NOT MOUNT/i.test(routerSrc),
      'wos_router.js must retain the SEC-WC-02 do-not-mount warning')
  })

  console.log(`  sec_wc_02_dead_router: ${passed} passed`)
  return passed
}

module.exports = { run }

if (require.main === module) {
  run().then(p => process.exit(p > 0 ? 0 : 1)).catch(e => { console.error(e); process.exit(1) })
}
