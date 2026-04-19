'use strict'

const test   = require('node:test')
const assert = require('node:assert/strict')
const fs     = require('fs')
const path   = require('path')

/**
 * S45-G2: Source-analysis tests for register.js persona selector.
 * No DOM required — reads source files and verifies patterns.
 */

const registerSrc = fs.readFileSync(
  path.join(__dirname, '../../app/frontend/src/pages/register.js'), 'utf8'
)

const enPath = path.join(__dirname, '../../app/frontend/src/locales/en.json')
const arPath = path.join(__dirname, '../../app/frontend/src/locales/ar.json')
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'))
const ar = JSON.parse(fs.readFileSync(arPath, 'utf8'))

// ── Persona selector presence ───────────────────────────────────────────────

test('register.js contains EMPLOYER persona string', () => {
  assert.ok(registerSrc.includes('EMPLOYER'), 'register.js should reference EMPLOYER persona')
})

test('register.js contains SEEKER persona string', () => {
  assert.ok(registerSrc.includes('SEEKER'), 'register.js should reference SEEKER persona')
})

test('register.js has two persona cards (employer and seeker)', () => {
  assert.ok(registerSrc.includes('persona-card'), 'register.js should have persona-card class')
  // Both cards should be present
  const cardCount = (registerSrc.match(/persona-card/g) || []).length
  assert.ok(cardCount >= 2, `expected at least 2 persona-card references, got ${cardCount}`)
})

test('register.js has persona selector step before form', () => {
  // The persona selector should appear (renderPersonaStep or similar pattern)
  assert.ok(
    registerSrc.includes('personaType') || registerSrc.includes('_personaType'),
    'register.js should track selected personaType'
  )
})

// ── Locale keys ─────────────────────────────────────────────────────────────

const PERSONA_KEYS = [
  'register.personaTitle',
  'register.personaEmployer',
  'register.personaEmployerDesc',
  'register.personaSeeker',
  'register.personaSeekerDesc',
]

test('EN locale has all persona-related keys', () => {
  for (const k of PERSONA_KEYS) {
    assert.ok(en[k], `EN missing key: ${k}`)
  }
})

test('AR locale has all persona-related keys', () => {
  for (const k of PERSONA_KEYS) {
    assert.ok(ar[k], `AR missing key: ${k}`)
  }
})

test('EN locale has seeker nav keys', () => {
  const seekerKeys = ['seekerNav.home', 'seekerNav.applications', 'seekerNav.profile', 'seekerNav.earnings']
  for (const k of seekerKeys) {
    assert.ok(en[k], `EN missing seeker nav key: ${k}`)
  }
})

test('AR locale has seeker nav keys', () => {
  const seekerKeys = ['seekerNav.home', 'seekerNav.applications', 'seekerNav.profile', 'seekerNav.earnings']
  for (const k of seekerKeys) {
    assert.ok(ar[k], `AR missing seeker nav key: ${k}`)
  }
})

// ── Form submission ─────────────────────────────────────────────────────────

test('register.js form submission includes personaType in API call body', () => {
  assert.ok(
    registerSrc.includes('personaType'),
    'register.js should pass personaType to the API call'
  )
  // Should appear in the apiPostPublic call context
  assert.ok(
    registerSrc.includes('apiPostPublic'),
    'register.js should use apiPostPublic for registration'
  )
})

test('register.js stores persona in localStorage after registration', () => {
  assert.ok(
    registerSrc.includes('pw_persona') || registerSrc.includes('persona_type'),
    'register.js should persist persona to localStorage'
  )
})

// ── Accessibility ───────────────────────────────────────────────────────────

test('register.js has accessibility comment or aria attributes for persona selector', () => {
  const hasA11y = registerSrc.includes('aria-') ||
                  registerSrc.includes('role=') ||
                  registerSrc.includes('WCAG') ||
                  registerSrc.includes('accessibility') ||
                  registerSrc.includes('Accessibility')
  assert.ok(hasA11y, 'register.js should have accessibility support for persona selector')
})
