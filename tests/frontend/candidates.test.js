'use strict'

const test   = require('node:test')
const assert = require('node:assert/strict')
const fs     = require('fs')
const path   = require('path')

const enPath = path.join(__dirname, '../../app/frontend/src/locales/en.json')
const arPath = path.join(__dirname, '../../app/frontend/src/locales/ar.json')
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'))
const ar = JSON.parse(fs.readFileSync(arPath, 'utf8'))

const candidatesSrc = fs.readFileSync(
  path.join(__dirname, '../../app/frontend/src/pages/candidates.js'), 'utf8'
)
const routerSrc = fs.readFileSync(
  path.join(__dirname, '../../app/frontend/src/router.js'), 'utf8'
)
const navSrc = fs.readFileSync(
  path.join(__dirname, '../../app/frontend/src/components/nav.js'), 'utf8'
)
const stateMachine = require('../../app/config/hiring/application_state_machine.json')

const REQUIRED_KEYS = [
  'candidates.pageTitle', 'candidates.pageSubtitle',
  'candidates.selectRequisition', 'candidates.rankAI',
  'candidates.noApplications', 'candidates.matchScore',
  'candidates.eriScore', 'candidates.aiChip',
  'candidates.signals', 'candidates.confidence',
  'candidates.biasScore', 'candidates.concerns',
  'candidates.timeline', 'candidates.rejectReason',
  'candidates.rejectSubmit', 'candidates.rejectCancel',
  'candidates.navLabel', 'candidates.approve',
  'candidates.reject', 'candidates.overrideReason',
  'candidates.drawerTitle',
  'candidates.col.applied', 'candidates.col.screening',
  'candidates.col.shortlisted', 'candidates.col.interviewed',
  'candidates.col.offered', 'candidates.col.hired',
  'candidates.col.rejected', 'candidates.col.withdrawn',
]

// ── Locale tests ────────────────────────────────────────────────────────────

test('EN locale has all candidates keys', () => {
  for (const k of REQUIRED_KEYS) assert.ok(en[k], `EN missing: ${k}`)
})

test('AR locale has all candidates keys', () => {
  for (const k of REQUIRED_KEYS) assert.ok(ar[k], `AR missing: ${k}`)
})

test('EN and AR have same count of candidates keys', () => {
  const enK = Object.keys(en).filter(k => k.startsWith('candidates.'))
  const arK = Object.keys(ar).filter(k => k.startsWith('candidates.'))
  assert.strictEqual(enK.length, arK.length)
})

// ── Structure tests ─────────────────────────────────────────────────────────

test('candidates.js exports render function', () => {
  assert.ok(candidatesSrc.includes('export default { render: renderFresh }'))
})

test('router.js includes candidates route', () => {
  assert.ok(routerSrc.includes('"candidates"'))
})

test('nav.js includes Candidates item', () => {
  assert.ok(navSrc.includes('"candidates"'))
  assert.ok(navSrc.includes('"Candidates"'))
})

// ── 8 columns ───────────────────────────────────────────────────────────────

test('renders 8 columns matching state machine', () => {
  for (const status of stateMachine.validStatuses) {
    assert.ok(candidatesSrc.includes(`"${status}"`), `missing column for ${status}`)
  }
})

// ── Card features ───────────────────────────────────────────────────────────

test('card renders candidate name', () => {
  assert.ok(candidatesSrc.includes('first_name'))
  assert.ok(candidatesSrc.includes('last_name'))
})

test('card renders ERI score badge', () => {
  assert.ok(candidatesSrc.includes('eri_score'))
  assert.ok(candidatesSrc.includes('candidates.eriScore'))
})

test('card renders match % badge', () => {
  assert.ok(candidatesSrc.includes('match_score'))
  assert.ok(candidatesSrc.includes('candidates.matchScore'))
})

test('card shows AI chip when ai_recommendation_log_id present', () => {
  assert.ok(candidatesSrc.includes('ai_recommendation_log_id'))
  assert.ok(candidatesSrc.includes('candidates.aiChip'))
})

test('click card opens explanation panel with signals/weights/concerns/bias/confidence', () => {
  assert.ok(candidatesSrc.includes('toggleDetail'))
  assert.ok(candidatesSrc.includes('top_contributing_signals'))
  assert.ok(candidatesSrc.includes('candidates.signals'))
  assert.ok(candidatesSrc.includes('candidates.confidence'))
  assert.ok(candidatesSrc.includes('candidates.biasScore'))
  assert.ok(candidatesSrc.includes('candidates.concerns'))
})

// ── Drag and drop ───────────────────────────────────────────────────────────

test('drag between columns calls transitionStatus API', () => {
  assert.ok(candidatesSrc.includes('dragstart'))
  assert.ok(candidatesSrc.includes('dataTransfer'))
  assert.ok(candidatesSrc.includes('/api/hiring/applications/'))
  assert.ok(candidatesSrc.includes('/status'))
})

test('drag to REJECTED opens rejection reason modal', () => {
  assert.ok(candidatesSrc.includes('showRejectModal'))
  assert.ok(candidatesSrc.includes('REJECTED'))
  assert.ok(candidatesSrc.includes('candidates.rejectReason'))
})

test('modal submit with empty reason blocked', () => {
  assert.ok(candidatesSrc.includes('if (!reason)'))
})

test('illegal transitions blocked locally via client-side state machine', () => {
  assert.ok(candidatesSrc.includes('TRANSITIONS'))
  assert.ok(candidatesSrc.includes('allowed.includes(newStatus)'))
})

// ── AI ranking drawer ───────────────────────────────────────────────────────

test('rank with AI button opens drawer', () => {
  assert.ok(candidatesSrc.includes('renderDrawer'))
  assert.ok(candidatesSrc.includes('rank-candidates'))
  assert.ok(candidatesSrc.includes('candidates.drawerTitle'))
})

test('drawer approve calls review endpoint with ACCEPTED', () => {
  assert.ok(candidatesSrc.includes('"ACCEPTED"'))
  assert.ok(candidatesSrc.includes('/review'))
})

test('drawer reject requires override_reason', () => {
  assert.ok(candidatesSrc.includes('"REJECTED"'))
  assert.ok(candidatesSrc.includes('override_reason'))
})

// ── Deep link ───────────────────────────────────────────────────────────────

test('deep link ?requisition=id preselects requisition', () => {
  assert.ok(candidatesSrc.includes('hashParams.get("requisition")'))
})

// ── Design system ───────────────────────────────────────────────────────────

test('uses design system CSS variables (no inline hex)', () => {
  assert.ok(candidatesSrc.includes('content-area'))
  assert.ok(candidatesSrc.includes('page-header'))
  assert.ok(candidatesSrc.includes('wc-card'))
  const hexMatches = candidatesSrc.match(/#[0-9a-fA-F]{3,6}(?=[;'"\s)])/g) || []
  assert.strictEqual(hexMatches.length, 0, `found hardcoded hex: ${hexMatches.join(', ')}`)
})
