'use strict'

const test   = require('node:test')
const assert = require('node:assert/strict')
const fs     = require('fs')
const path   = require('path')

const en = JSON.parse(fs.readFileSync(path.join(__dirname, '../../app/frontend/src/locales/en.json'), 'utf8'))
const ar = JSON.parse(fs.readFileSync(path.join(__dirname, '../../app/frontend/src/locales/ar.json'), 'utf8'))
const src = fs.readFileSync(path.join(__dirname, '../../app/frontend/src/pages/offer_builder.js'), 'utf8')
const routerSrc = fs.readFileSync(path.join(__dirname, '../../app/frontend/src/router.js'), 'utf8')

const REQUIRED_KEYS = [
  'offer.pageTitle', 'offer.pageSubtitle',
  'offer.pathFTE', 'offer.pathFreelancer', 'offer.pathAI',
  'offer.baseSalary', 'offer.allowances', 'offer.gosiEstimate', 'offer.totalCost',
  'offer.qiwaBadge', 'offer.probation', 'offer.noticePeriod',
  'offer.milestones', 'offer.addMilestone', 'offer.commissionBadge',
  'offer.platformFee', 'offer.totalClientPays',
  'offer.deliveryWindow', 'offer.outcomeCriteria', 'offer.modelVersion',
  'offer.auditStatement',
  'offer.compliancePreview', 'offer.runPreview', 'offer.sendOffer',
  'offer.overrideBtn', 'offer.overrideReason', 'offer.sendBlocked',
  'offer.sent',
]

test('EN locale has all offer keys', () => {
  for (const k of REQUIRED_KEYS) assert.ok(en[k], `EN missing: ${k}`)
})

test('AR locale has all offer keys', () => {
  for (const k of REQUIRED_KEYS) assert.ok(ar[k], `AR missing: ${k}`)
})

test('EN and AR offer keys match count', () => {
  const enK = Object.keys(en).filter(k => k.startsWith('offer.'))
  const arK = Object.keys(ar).filter(k => k.startsWith('offer.'))
  assert.strictEqual(enK.length, arK.length)
})

test('three-path selector renders FTE, FREELANCER, AI_EXECUTABLE', () => {
  assert.ok(src.includes('"FTE"'))
  assert.ok(src.includes('"FREELANCER"'))
  assert.ok(src.includes('"AI_EXECUTABLE"'))
  assert.ok(src.includes('renderFTEPath'))
  assert.ok(src.includes('renderFreelancerPath'))
  assert.ok(src.includes('renderAIPath'))
})

test('FTE path shows salary, allowances, GOSI, Qiwa badge', () => {
  assert.ok(src.includes('offer.baseSalary'))
  assert.ok(src.includes('offer.allowances'))
  assert.ok(src.includes('offer.gosiEstimate'))
  assert.ok(src.includes('offer.qiwaBadge'))
  assert.ok(src.includes('0.1175')) // GOSI rate
})

test('FREELANCER path shows 0% commission badge as non-dismissible', () => {
  assert.ok(src.includes('commission-badge'), 'badge class present')
  assert.ok(src.includes('offer.commissionBadge'), 'badge text key referenced')
  // Badge must not have close/dismiss/collapse functionality
  assert.ok(!src.includes('dismiss-badge') && !src.includes('close-badge'), 'no dismiss mechanism')
})

test('0% commission badge text present in EN', () => {
  assert.ok(en['offer.commissionBadge'].includes('0% commission'))
  assert.ok(en['offer.commissionBadge'].includes('every dirham'))
})

test('0% commission badge text present in AR', () => {
  assert.ok(ar['offer.commissionBadge'].includes('0%'))
})

test('AI_EXECUTABLE path has NO attendance fields', () => {
  // The AI path should not contain shift/attendance/roster inputs
  assert.ok(!src.includes('id="offer-shift"'))
  assert.ok(!src.includes('id="offer-attendance"'))
  assert.ok(!src.includes('id="offer-roster"'))
  // But does reference audit statement
  assert.ok(src.includes('offer.auditStatement'))
})

test('compliance preview renders checks with GREEN/AMBER/RED status dots', () => {
  assert.ok(src.includes('renderComplianceSection'))
  assert.ok(src.includes('has_red'))
  assert.ok(src.includes('compliance-preview') || src.includes('compliancePreview'))
  assert.ok(src.includes('color-success')) // GREEN dot
  assert.ok(src.includes('color-warning')) // AMBER dot
  assert.ok(src.includes('color-danger'))  // RED dot
})

test('send button disabled when RED checks', () => {
  assert.ok(src.includes('sendBtn.disabled = !_complianceResult || _complianceResult.has_red'))
})

test('override field appears when override clicked', () => {
  assert.ok(src.includes('offer.overrideBtn'))
  assert.ok(src.includes('offer.overrideReason'))
})

test('deep link ?application=<id> loads context', () => {
  assert.ok(src.includes('hashParams.get("application")'))
})

test('router.js includes offer-builder route', () => {
  assert.ok(routerSrc.includes('"offer-builder"'))
  assert.ok(routerSrc.includes('offerBuilder'))
})

test('uses design system CSS (no inline hex)', () => {
  assert.ok(src.includes('content-area'))
  assert.ok(src.includes('wc-card'))
  assert.ok(src.includes('btn btn-accent'))
  const hexMatches = src.match(/#[0-9a-fA-F]{3,6}(?=[;'"\s)])/g) || []
  assert.strictEqual(hexMatches.length, 0, `found hex: ${hexMatches.join(', ')}`)
})

test('export default with render function', () => {
  assert.ok(src.includes('export default { render: renderFresh }'))
})
