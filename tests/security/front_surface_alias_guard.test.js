'use strict'

/**
 * WC-GC-001 / UI-2 — Front-A surface-access guard must survive route ALIASES.
 *
 * The defect this exists to close:
 *
 *   nav-model.js walls Front A (customer) from internal-only surfaces via
 *   INTERNAL_ONLY_ROUTES, and router.navigate enforces it with canAccessRoute —
 *   "direct URL blocked, not merely hidden".
 *
 *   But router.js binds the SAME page module to two keys:
 *
 *       "beta-dashboard":   betaDashboard,
 *       "beta":             betaDashboard,   // nav-model guard references "beta"
 *
 *   INTERNAL_ONLY_ROUTES listed only "beta". Front A was therefore walled from
 *   #beta and NOT from #beta-dashboard — the same internal GTM scorecard surface,
 *   which carries an executing action (POST /admin/beta/ceo-exit-request).
 *   The wall was bypassable by typing the other key.
 *
 * The assertion below is deliberately an INVARIANT over the whole route table,
 * not a single-case check: any page module reachable under more than one route
 * key must return the same Front-A verdict for every one of its keys. That keeps
 * the guard armed against the next alias, not just this one.
 *
 * The forbidden state is genuinely attemptable (aliases exist in ROUTES today),
 * so this is an armed guard, not a vacuous assertion. A positive control is
 * included so the suite cannot pass by walling everything.
 */

const test   = require('node:test')
const assert = require('node:assert')
const fs     = require('node:fs')
const path   = require('node:path')

const ROOT        = path.join(__dirname, '..', '..')
const ROUTER_PATH = path.join(ROOT, 'app', 'frontend', 'src', 'router.js')
const MODEL_PATH  = path.join(ROOT, 'app', 'frontend', 'src', 'components', 'nav-model.js')

/** Parse the ROUTES table into { routeKey -> pageModuleIdentifier }. */
function parseRouteTable(src) {
  const open = src.indexOf('const ROUTES = {')
  assert.ok(open !== -1, 'router.js must declare a ROUTES table')
  const block = src.slice(open).split('\n}')[0]
  const pairs = [...block.matchAll(/^\s*"([^"]+)":\s*([A-Za-z0-9_$]+)/gm)]
  assert.ok(pairs.length > 0, 'ROUTES table must contain at least one route')
  return pairs.map(m => ({ key: m[1], mod: m[2] }))
}

const routerSrc = fs.readFileSync(ROUTER_PATH, 'utf8')
const routes    = parseRouteTable(routerSrc)

test('router ROUTES table parses to a non-empty key -> page-module mapping', () => {
  assert.ok(routes.length >= 10,
    `expected a populated route table, parsed ${routes.length}`)
})

test('nav-model exposes the surface-access guard used by router.navigate', async () => {
  const model = await import(MODEL_PATH)
  assert.equal(typeof model.canAccessRoute, 'function', 'canAccessRoute must be exported')
  assert.ok(Array.isArray(model.INTERNAL_ONLY_ROUTES), 'INTERNAL_ONLY_ROUTES must be exported')
  assert.ok(model.INTERNAL_ONLY_ROUTES.length > 0, 'the internal-only guard set must not be empty')
})

test('router.navigate actually calls the guard (control is wired, not merely declared)', () => {
  assert.match(routerSrc, /canAccessRoute\(\s*front\s*,\s*requested\s*\)/,
    'router.navigate must consult canAccessRoute — a declared-but-uncalled guard is vacuous')
})

test('ALIAS INVARIANT: one page module must not be both walled and reachable on Front A', async () => {
  const { canAccessRoute } = await import(MODEL_PATH)

  const byModule = new Map()
  for (const { key, mod } of routes) {
    if (!byModule.has(mod)) byModule.set(mod, [])
    byModule.get(mod).push(key)
  }

  const aliased = [...byModule.entries()].filter(([, keys]) => keys.length > 1)

  // The invariant is only meaningful if aliases exist; if none do, say so loudly
  // rather than passing silently having evaluated nothing.
  assert.ok(aliased.length > 0,
    'no aliased route keys found — this guard would be vacuous; re-check the ROUTES parser')

  const bypasses = []
  for (const [mod, keys] of aliased) {
    const verdicts = keys.map(k => ({ key: k, frontA: canAccessRoute('A', k) }))
    const distinct = new Set(verdicts.map(v => v.frontA))
    if (distinct.size > 1) bypasses.push({ mod, verdicts })
  }

  assert.deepEqual(bypasses, [],
    'a page module is reachable on Front A under one key and walled under another — ' +
    'the internal-only wall is bypassable via the alias: ' + JSON.stringify(bypasses))
})

test('both keys for the internal beta/GTM surface are walled from Front A', async () => {
  const { canAccessRoute } = await import(MODEL_PATH)
  const betaKeys = routes.filter(r => r.mod === 'betaDashboard').map(r => r.key)

  assert.ok(betaKeys.length >= 2,
    `expected the beta surface to be aliased (it is what this guard protects), got ${JSON.stringify(betaKeys)}`)

  for (const key of betaKeys) {
    assert.equal(canAccessRoute('A', key), false,
      `Front A (customer) must not reach internal surface "${key}"`)
    assert.equal(canAccessRoute('B', key), true,
      `Front B (internal console) must still reach "${key}"`)
  }
})

test('POSITIVE CONTROL: a genuine customer surface stays reachable on Front A', async () => {
  const { canAccessRoute } = await import(MODEL_PATH)
  // fee-transparency is the classified-customer surface (UI-6). If walling the
  // beta alias also walled this, the fix would be over-broad and this fails.
  assert.equal(canAccessRoute('A', 'fee-transparency'), true,
    'fee-transparency is a customer surface and must remain reachable on Front A')
  assert.equal(canAccessRoute('A', 'dashboard'), true,
    'the default route must remain reachable on Front A')
})
