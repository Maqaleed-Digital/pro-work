'use strict'

const test   = require('node:test')
const assert = require('node:assert/strict')
const fs     = require('fs')
const path   = require('path')

/**
 * S45-G2: Source-analysis tests for persona-aware layout switching.
 * Verifies main.js, nav.js, and seeker_home.js contain expected patterns.
 */

const mainSrc = fs.readFileSync(
  path.join(__dirname, '../../app/frontend/src/main.js'), 'utf8'
)
const navSrc = fs.readFileSync(
  path.join(__dirname, '../../app/frontend/src/components/nav.js'), 'utf8'
)
const routerSrc = fs.readFileSync(
  path.join(__dirname, '../../app/frontend/src/router.js'), 'utf8'
)

// ── main.js persona routing ────────────────────────────────────────────────

test('main.js reads persona_type or pw_persona from localStorage', () => {
  assert.ok(
    mainSrc.includes('pw_persona') || mainSrc.includes('persona_type'),
    'main.js should read persona from localStorage'
  )
})

test('main.js has seeker-home redirect logic', () => {
  assert.ok(
    mainSrc.includes('seeker-home'),
    'main.js should redirect SEEKER persona to seeker-home'
  )
})

test('main.js handles SEEKER string for redirect condition', () => {
  assert.ok(
    mainSrc.includes('SEEKER'),
    'main.js should check for SEEKER persona string'
  )
})

// ── nav.js persona-aware rendering ─────────────────────────────────────────

test('nav.js handles SEEKER persona differently from EMPLOYER', () => {
  assert.ok(
    navSrc.includes('SEEKER'),
    'nav.js should reference SEEKER persona for conditional nav'
  )
})

test('nav.js reads pw_persona from localStorage', () => {
  assert.ok(
    navSrc.includes('pw_persona'),
    'nav.js should read pw_persona from localStorage'
  )
})

test('nav.js has persona toggle for BOTH users', () => {
  assert.ok(
    navSrc.includes('BOTH'),
    'nav.js should handle BOTH persona with toggle'
  )
})

test('nav.js renders seeker nav items (Home, Applications, Profile, Earnings)', () => {
  const hasHome = navSrc.includes('seekerNav.home') || navSrc.includes('Home')
  const hasApps = navSrc.includes('seekerNav.applications') || navSrc.includes('Applications')
  assert.ok(hasHome, 'nav.js should have seeker Home nav item')
  assert.ok(hasApps, 'nav.js should have seeker Applications nav item')
})

// ── router.js seeker-home route ────────────────────────────────────────────

test('router.js has seeker-home route registered', () => {
  assert.ok(
    routerSrc.includes('seeker-home'),
    'router.js should have seeker-home route'
  )
})

// ── seeker_home.js stub existence ──────────────────────────────────────────

test('seeker_home.js stub page exists', () => {
  const seekerHomePath = path.join(__dirname, '../../app/frontend/src/pages/seeker_home.js')
  assert.ok(
    fs.existsSync(seekerHomePath),
    'seeker_home.js should exist as a stub page'
  )
  const src = fs.readFileSync(seekerHomePath, 'utf8')
  assert.ok(src.includes('seekerHome.welcome'), 'seeker_home.js should use seekerHome.welcome locale key')
  assert.ok(src.includes('seekerHome.comingSoon'), 'seeker_home.js should use seekerHome.comingSoon locale key')
})
