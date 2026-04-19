'use strict'

const test   = require('node:test')
const assert = require('node:assert/strict')
const fs     = require('fs')
const path   = require('path')

const enPath = path.join(__dirname, '../../app/frontend/src/locales/en.json')
const arPath = path.join(__dirname, '../../app/frontend/src/locales/ar.json')
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'))
const ar = JSON.parse(fs.readFileSync(arPath, 'utf8'))

const postRoleSrc = fs.readFileSync(
  path.join(__dirname, '../../app/frontend/src/pages/post_role.js'), 'utf8'
)
const routerSrc = fs.readFileSync(
  path.join(__dirname, '../../app/frontend/src/router.js'), 'utf8'
)
const navSrc = fs.readFileSync(
  path.join(__dirname, '../../app/frontend/src/components/nav.js'), 'utf8'
)

// ── Locale completeness ─────────────────────────────────────────────────────

const REQUIRED_KEYS = [
  'postRole.pageTitle', 'postRole.pageSubtitle',
  'postRole.step1.title', 'postRole.step1.roleTitleEn', 'postRole.step1.roleTitleAr',
  'postRole.step1.department', 'postRole.step1.contractType',
  'postRole.step1.fte', 'postRole.step1.freelancer', 'postRole.step1.aiExecutable',
  'postRole.step2.title', 'postRole.step2.skills', 'postRole.step2.skillPlaceholder',
  'postRole.step2.experience', 'postRole.step2.occupationCode',
  'postRole.step2.suggestCode', 'postRole.step2.useThis', 'postRole.step2.override',
  'postRole.step3.title', 'postRole.step3.salaryMin', 'postRole.step3.salaryMax',
  'postRole.step3.gosiEstimate', 'postRole.step3.totalCost',
  'postRole.step4.title', 'postRole.step4.currentZone', 'postRole.step4.projectedZone',
  'postRole.step4.publish', 'postRole.step4.rerun',
  'postRole.step4.previewRequired', 'postRole.step4.previewStale',
  'postRole.next', 'postRole.back', 'postRole.step',
  'postRole.err.titleEnRequired', 'postRole.err.titleArRequired',
  'postRole.err.contractRequired', 'postRole.err.skillsMin',
  'postRole.err.salaryInvalid', 'postRole.navLabel',
]

test('EN locale has all postRole keys', () => {
  for (const k of REQUIRED_KEYS) {
    assert.ok(en[k], `EN missing key: ${k}`)
  }
})

test('AR locale has all postRole keys', () => {
  for (const k of REQUIRED_KEYS) {
    assert.ok(ar[k], `AR missing key: ${k}`)
  }
})

test('EN and AR have same number of postRole keys', () => {
  const enKeys = Object.keys(en).filter(k => k.startsWith('postRole.'))
  const arKeys = Object.keys(ar).filter(k => k.startsWith('postRole.'))
  assert.strictEqual(enKeys.length, arKeys.length, `EN has ${enKeys.length} but AR has ${arKeys.length}`)
})

// ── Source structure ─────────────────────────────────────────────────────────

test('post_role.js exports default with render function', () => {
  // ESM module — verify via source analysis (CJS require fails on ESM JSON imports)
  assert.ok(postRoleSrc.includes('export default { render: renderFresh }'),
    'must export default with render function')
})

test('router.js includes post-role route', () => {
  assert.ok(routerSrc.includes('"post-role"'), 'router missing post-role route')
  assert.ok(routerSrc.includes('postRole'), 'router missing postRole import')
})

test('nav.js includes Post a Role item', () => {
  assert.ok(navSrc.includes('post-role'), 'nav missing post-role key')
  assert.ok(navSrc.includes('Post a Role'), 'nav missing Post a Role label')
})

test('post_role.js has 4 step render functions', () => {
  assert.ok(postRoleSrc.includes('renderStep1'), 'missing renderStep1')
  assert.ok(postRoleSrc.includes('renderStep2'), 'missing renderStep2')
  assert.ok(postRoleSrc.includes('renderStep3'), 'missing renderStep3')
  assert.ok(postRoleSrc.includes('renderStep4'), 'missing renderStep4')
})

test('step 1 validates English title required', () => {
  assert.ok(postRoleSrc.includes('titleEnRequired'))
})

test('step 1 validates Arabic title required', () => {
  assert.ok(postRoleSrc.includes('titleArRequired'))
})

test('step 2 validates minimum 3 skills', () => {
  assert.ok(postRoleSrc.includes('skills.length < 3'))
})

test('step 2 has AI suggestion button', () => {
  assert.ok(postRoleSrc.includes('suggestCode'))
  assert.ok(postRoleSrc.includes('occupation-code/suggest'))
})

test('step 2 has override button for AI suggestion', () => {
  assert.ok(postRoleSrc.includes('override'))
})

test('step 3 validates salary range', () => {
  assert.ok(postRoleSrc.includes('salaryInvalid'))
})

test('step 3 shows GOSI estimate', () => {
  assert.ok(postRoleSrc.includes('gosiEstimate'))
  assert.ok(postRoleSrc.includes('gosiRate') || postRoleSrc.includes('GOSI') || postRoleSrc.includes('0.1175'))
})

test('step 4 auto-fires Nitaqat preview on entry', () => {
  assert.ok(postRoleSrc.includes('runPreview()'), 'should auto-call runPreview on step 4')
})

test('step 4 calls nitaqat-preview endpoint', () => {
  assert.ok(postRoleSrc.includes('nitaqat-preview'))
})

test('step 4 publish button disabled until preview succeeds', () => {
  assert.ok(postRoleSrc.includes('publishBtn.disabled = true'))
  assert.ok(postRoleSrc.includes('publishBtn.disabled = false'))
})

test('step 4 calls publish endpoint', () => {
  assert.ok(postRoleSrc.includes('/publish'))
})

test('all 3 contract types present', () => {
  assert.ok(postRoleSrc.includes('FTE'))
  assert.ok(postRoleSrc.includes('FREELANCER'))
  assert.ok(postRoleSrc.includes('AI_EXECUTABLE'))
})

test('uses design system CSS classes (no inline hex)', () => {
  // Check for design system classes
  assert.ok(postRoleSrc.includes('content-area'))
  assert.ok(postRoleSrc.includes('page-header'))
  assert.ok(postRoleSrc.includes('wc-card'))
  assert.ok(postRoleSrc.includes('kpi-card'))
  assert.ok(postRoleSrc.includes('btn btn-accent'))
  // No hardcoded hex colors
  const hexMatches = postRoleSrc.match(/#[0-9a-fA-F]{3,6}/g) || []
  assert.strictEqual(hexMatches.length, 0, `found hardcoded hex colors: ${hexMatches.join(', ')}`)
})

test('step indicator shows current step / 4', () => {
  assert.ok(postRoleSrc.includes('/ 4'))
})

test('resets state on fresh render', () => {
  assert.ok(postRoleSrc.includes('_step = 1'))
  assert.ok(postRoleSrc.includes('_requisitionId = null'))
  assert.ok(postRoleSrc.includes('_skills = []'))
})

test('calls apiPost for create and apiPatch for update', () => {
  assert.ok(postRoleSrc.includes('apiPost("/api/hiring/requisitions"'))
  assert.ok(postRoleSrc.includes('apiPatch("/api/hiring/requisitions/"'))
})
