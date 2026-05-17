'use strict'

/*
 * D-U1 Compliance Health Header — acceptance tests
 *
 * Authority: WC-IMPL-001 V1.0 §T-1 acceptance criteria (verbatim)
 *
 * Test approach: static-source inspection (matches existing
 * tests/frontend/*.test.js pattern — no jsdom dependency).
 *
 * Coverage:
 *   Suite 1 — AC5 i18n parity (en + ar non-empty; es/fr/ur structural)
 *   Suite 2 — Component source structure (exports + imports)
 *   Suite 3 — AC1 ratio renders large + mono on load
 *   Suite 4 — AC2 three-state colour via tokens (no literal hex)
 *   Suite 5 — AC3 click + Enter/Space toggle reveals panel with required fields
 *   Suite 6 — AC4 empty state with bilingual CTA
 *   Suite 7 — AC5 Arabic-first + RTL + Hindu-Arabic digits + Arabic percent (٪) + Hijri/Gregorian dual date
 *   Suite 8 — ARIA discipline (role=button, tabindex, aria-expanded, aria-controls, aria-label, lang, dir)
 *   Suite 9 — §7 explicit deferrals NOT implemented (negative scope verify)
 *   Suite 10 — Dashboard mount (wired into dashboard.js)
 */

const test   = require('node:test')
const assert = require('node:assert/strict')
const fs     = require('fs')
const path   = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const COMPONENT_PATH = path.join(ROOT, 'app/frontend/src/components/compliance_health_header.js')
const DASHBOARD_PATH = path.join(ROOT, 'app/frontend/src/pages/dashboard.js')
const EN_PATH        = path.join(ROOT, 'app/frontend/src/locales/en.json')
const AR_PATH        = path.join(ROOT, 'app/frontend/src/locales/ar.json')
const ES_PATH        = path.join(ROOT, 'app/frontend/src/locales/es.json')
const FR_PATH        = path.join(ROOT, 'app/frontend/src/locales/fr.json')
const UR_PATH        = path.join(ROOT, 'app/frontend/src/locales/ur.json')

const src       = fs.readFileSync(COMPONENT_PATH, 'utf8')
const dashboard = fs.readFileSync(DASHBOARD_PATH, 'utf8')

// Comments-stripped view of the component source. Used for negative-scope
// checks (Suite 4 "no literal hex", Suite 9 "deferred features not
// implemented") so that documentation comments that correctly *name* the
// deferred features or token hex values don't trigger false-positives.
const srcCode = src
  .replace(/\/\*[\s\S]*?\*\//g, '')  // strip /* … */ block comments
  .replace(/\/\/[^\n]*/g, '')        // strip // line comments
const en        = JSON.parse(fs.readFileSync(EN_PATH, 'utf8'))
const ar        = JSON.parse(fs.readFileSync(AR_PATH, 'utf8'))
const es        = JSON.parse(fs.readFileSync(ES_PATH, 'utf8'))
const fr        = JSON.parse(fs.readFileSync(FR_PATH, 'utf8'))
const ur        = JSON.parse(fs.readFileSync(UR_PATH, 'utf8'))

const DU1_KEYS = [
  'du1.ratioLabel',
  'du1.hint',
  'du1.emptyMsg',
  'du1.emptyCta',
  'du1.panelTotal',
  'du1.panelSaudi',
  'du1.panelNonSaudi',
  'du1.panelThreshold',
  'du1.sourcesLabel',
  'du1.records',
  'du1.lastSync',
  'du1.stateAbove',
  'du1.stateApproaching',
  'du1.stateBelow',
]

// ── Suite 1 — AC5 i18n parity ─────────────────────────────────────────────

test('Suite 1 / AC5 — EN locale has every du1 key with non-empty value', () => {
  for (const k of DU1_KEYS) {
    assert.ok(en[k], `EN missing: ${k}`)
    assert.ok(String(en[k]).trim().length > 0, `EN empty: ${k}`)
  }
})

test('Suite 1 / AC5 — AR locale has every du1 key with non-empty Arabic value', () => {
  for (const k of DU1_KEYS) {
    assert.ok(ar[k], `AR missing: ${k}`)
    assert.ok(String(ar[k]).trim().length > 0, `AR empty: ${k}`)
    // Arabic value should not equal the English value (real localization)
    assert.notStrictEqual(ar[k], en[k], `AR equals EN for ${k} (not localized)`)
    // Must contain at least one Arabic-script codepoint
    assert.ok(/[؀-ۿ]/.test(ar[k]), `AR value lacks Arabic script: ${k}`)
  }
})

test('Suite 1 / AC5 — tier-2 locales (es/fr/ur) have structural parity', () => {
  for (const k of DU1_KEYS) {
    assert.ok(k in es, `ES missing key: ${k}`)
    assert.ok(k in fr, `FR missing key: ${k}`)
    assert.ok(k in ur, `UR missing key: ${k}`)
  }
})

// ── Suite 2 — Component source structure ──────────────────────────────────

test('Suite 2 — exports renderComplianceHealthHeader (named)', () => {
  assert.match(src, /export function renderComplianceHealthHeader\b/, 'named export missing')
})

test('Suite 2 — exports default renderComplianceHealthHeader', () => {
  assert.match(src, /export default renderComplianceHealthHeader\b/, 'default export missing')
})

test('Suite 2 — exports pure helpers (computeRatioState, formatPercent, formatDate)', () => {
  assert.match(src, /export function computeRatioState\b/)
  assert.match(src, /export function formatPercent\b/)
  assert.match(src, /export function formatDate\b/)
})

test('Suite 2 — imports t + getLocale from ../locale.js', () => {
  assert.match(src, /import\s*\{\s*t\s*,\s*getLocale\s*\}\s*from\s*["']\.\.\/locale\.js["']/)
})

// ── Suite 3 — AC1 ratio renders large + mono on load ──────────────────────

test('Suite 3 / AC1 — ratio span uses var(--maq-font-mono) (IBM Plex Mono stack)', () => {
  assert.match(src, /font-family:\s*var\(--maq-font-mono\)/, 'ratio must use mono font token')
})

test('Suite 3 / AC1 — ratio renders large (clamp() with rem)', () => {
  assert.match(src, /font-size:\s*clamp\(/, 'ratio must scale large; clamp() expected')
})

test('Suite 3 / AC1 — ratio rendered without interaction (data-testid wc-du1-ratio appended in populated branch)', () => {
  assert.match(src, /data-testid['"]?\s*,\s*['"]wc-du1-ratio/, 'ratio button data-testid missing')
  // Must appear in the populated-state branch (after empty-state early return)
  const emptyReturnIdx = src.indexOf('return section')
  const ratioIdx = src.indexOf('wc-du1-ratio')
  assert.ok(emptyReturnIdx >= 0 && ratioIdx > emptyReturnIdx, 'ratio must be rendered post-empty-state-return (i.e., on populated load, no interaction needed)')
})

// ── Suite 4 — AC2 three-state colour via tokens (no literal hex) ──────────

test('Suite 4 / AC2 — STATE_TOKEN maps to brand CSS vars (no literal hex)', () => {
  assert.match(src, /at_or_above:\s*['"]var\(--maq-brand-secondary\)['"]/)
  assert.match(src, /approaching:\s*['"]var\(--maq-brand-accent\)['"]/)
  assert.match(src, /baseline:\s*['"]var\(--maq-brand-primary\)['"]/)
})

test('Suite 4 / AC2 — component code contains no literal brand hex (comments OK)', () => {
  // Hex must come from the token registry, not the rendered component code.
  // Documentation comments that name token hex values are acceptable —
  // we scan the comments-stripped source.
  assert.doesNotMatch(srcCode, /#1E3A5F/i, 'literal navy hex in component code')
  assert.doesNotMatch(srcCode, /#006C35/i, 'literal Saudi-green hex in component code')
  assert.doesNotMatch(srcCode, /#C9A227/i, 'literal gold hex in component code')
})

test('Suite 4 / AC2 — Nitaqat zones map to expected ratio states', () => {
  // platinum/high_green/medium_green/low_green/green → at_or_above
  // yellow → approaching
  // red → baseline
  for (const z of ['platinum', 'high_green', 'medium_green', 'low_green', 'green']) {
    assert.match(src, new RegExp(`${z}:\\s*['"]at_or_above['"]`), `zone ${z} → at_or_above mapping missing`)
  }
  assert.match(src, /yellow:\s*['"]approaching['"]/)
  assert.match(src, /red:\s*['"]baseline['"]/)
})

// ── Suite 5 — AC3 click + Enter/Space toggle reveals panel ────────────────

test('Suite 5 / AC3 — ratio button has click handler that toggles panel', () => {
  assert.match(src, /ratioBtn\.addEventListener\(['"]click['"]\s*,\s*togglePanel/)
})

test('Suite 5 / AC3 — keydown handler covers Enter, Space, Spacebar', () => {
  // Match any order of these three keys inside the keydown handler
  assert.match(src, /e\.key === ['"]Enter['"]/)
  assert.match(src, /e\.key === ['"] ['"]/, 'space key handling expected')
  assert.match(src, /e\.key === ['"]Spacebar['"]/)
  assert.match(src, /e\.preventDefault\(\)/)
})

test('Suite 5 / AC3 — panel renders required fields: total / Saudi / non-Saudi / threshold', () => {
  assert.match(src, /panelTotal/)
  assert.match(src, /panelSaudi/)
  assert.match(src, /panelNonSaudi/)
  assert.match(src, /panelThreshold/)
})

test('Suite 5 / AC3 — panel surfaces sync timestamps (sources array OR fallback lastUpdated/computedAt)', () => {
  assert.match(src, /snapshot\.sources/)
  assert.match(src, /snapshot\.lastUpdated/)
  assert.match(src, /snapshot\.computedAt/)
  assert.match(src, /formatDate/)
})

// ── Suite 6 — AC4 empty state + bilingual CTA ─────────────────────────────

test('Suite 6 / AC4 — empty state branches off isEmpty + uses emptyMsg + emptyCta keys', () => {
  assert.match(src, /const isEmpty\s*=/)
  assert.match(src, /t\(['"]du1\.emptyMsg['"]\)/)
  assert.match(src, /t\(['"]du1\.emptyCta['"]\)/)
})

test('Suite 6 / AC4 — empty state CTA invokes onAddData callback when present', () => {
  assert.match(src, /opts\.onAddData/)
  assert.match(src, /cta\.addEventListener\(['"]click['"]/)
})

test('Suite 6 / AC4 — empty state has dedicated data-testid for tests', () => {
  assert.match(src, /data-testid['"]?\s*,\s*['"]wc-du1-empty/)
})

// ── Suite 7 — AC5 Arabic-first + RTL + Hindu-Arabic digits + Arabic percent ─

test('Suite 7 / AC5 — dir attribute drives off locale (ar → rtl, else ltr)', () => {
  assert.match(src, /const dir\s*=\s*locale === ['"]ar['"] \? ['"]rtl['"]\s*:\s*['"]ltr['"]/)
  assert.match(src, /section\.setAttribute\(['"]dir['"]\s*,\s*dir\)/)
})

test('Suite 7 / AC5 — lang attribute set to active locale', () => {
  assert.match(src, /section\.setAttribute\(['"]lang['"]\s*,\s*locale\)/)
})

test('Suite 7 / AC5 — formatPercent emits Arabic percent sign ٪ (U+066A) for ar', () => {
  // Verify both: direct char and that en uses regular %
  assert.match(src, /\$\{n\}٪/, 'ar percent must use ٪ (U+066A)')
  assert.match(src, /\$\{n\}%/, 'en percent must use %')
})

test('Suite 7 / AC5 — formatPercent uses .toFixed (Hindu-Arabic digits, not Arabic-Indic)', () => {
  // toFixed always emits Latin/Hindu-Arabic digits — required per G2-D5.
  assert.match(src, /\.toFixed\(1\)/)
})

test('Suite 7 / AC5 — formatDate for ar uses gregory + islamic calendars with nu-latn (Hindu-Arabic digits)', () => {
  assert.match(src, /ar-SA-u-ca-gregory-nu-latn/)
  assert.match(src, /ar-SA-u-ca-islamic-nu-latn/)
})

// ── Suite 8 — ARIA discipline ─────────────────────────────────────────────

test('Suite 8 — ratio button declares role=button + tabindex=0', () => {
  assert.match(src, /ratioBtn\.setAttribute\(['"]role['"]\s*,\s*['"]button['"]\)/)
  assert.match(src, /ratioBtn\.setAttribute\(['"]tabindex['"]\s*,\s*['"]0['"]\)/)
})

test('Suite 8 — aria-expanded toggles on activation', () => {
  assert.match(src, /aria-expanded['"]\s*,\s*['"]false['"]/)
  assert.match(src, /ratioBtn\.setAttribute\(['"]aria-expanded['"]\s*,\s*String\(next\)\)/)
})

test('Suite 8 — aria-controls binds ratio button to panel id', () => {
  assert.match(src, /ratioBtn\.setAttribute\(['"]aria-controls['"]\s*,\s*panelId\)/)
})

test('Suite 8 — aria-label announces ratio + state', () => {
  assert.match(src, /aria-label['"]\s*,\s*`\$\{t\(['"]du1\.ratioLabel['"]\)\}: \$\{ratioText\}, \$\{stateText\}`/)
})

test('Suite 8 — section uses aria-labelledby pointing at the label id', () => {
  assert.match(src, /section\.setAttribute\(['"]aria-labelledby['"]\s*,\s*labelId\)/)
})

test('Suite 8 — panel uses role=region with aria-label', () => {
  assert.match(src, /panel\.setAttribute\(['"]role['"]\s*,\s*['"]region['"]\)/)
  assert.match(src, /panel\.setAttribute\(['"]aria-label['"]\s*,\s*t\(['"]du1\.sourcesLabel['"]\)\)/)
})

// ── Suite 9 — §7 explicit deferrals NOT implemented ───────────────────────

test('Suite 9 / §7 — trend indicator NOT implemented (code-only scan)', () => {
  // Documentation comments may name the deferred feature; rendered code must not.
  // Note: `flex-direction` (CSS) is unrelated to the deferred *trend direction* concept.
  assert.doesNotMatch(srcCode, /\btrend\b/, '§7 forbids trend indicator')
  assert.doesNotMatch(srcCode, /\bdirectional\b/i, '§7 forbids trend direction concept')
})

test('Suite 9 / §7 — threshold-distance numeric NOT implemented', () => {
  // The component renders the threshold in the panel but does NOT
  // compute "X points above/below" — verify no pp / "points" formatting.
  assert.doesNotMatch(srcCode, /\bpp\b/, '§7 forbids threshold-distance numeric (e.g., "4.5pp above")')
  assert.doesNotMatch(srcCode, /points (above|below)/i)
})

test('Suite 9 / §7 — confidence state NOT implemented (code-only scan)', () => {
  assert.doesNotMatch(srcCode, /confidence/i, '§7 forbids confidence state in MVP')
})

test('Suite 9 / §7 — stale-data + missing-evidence + pending-sync indicators NOT implemented (code-only scan)', () => {
  // The TYPE annotation reserves status:'fresh'|'pending'|'stale' for
  // post-MVP composition, but the rendered code must NOT consume it.
  assert.doesNotMatch(srcCode, /\bstale\b/i, '§7 forbids stale-data indicator in code')
  assert.doesNotMatch(srcCode, /missing.evidence/i, '§7 forbids missing-evidence indicator')
  assert.doesNotMatch(srcCode, /pending.sync/i, '§7 forbids pending-sync indicator')
})

// ── Suite 10 — Dashboard mount ────────────────────────────────────────────

test('Suite 10 — dashboard imports renderComplianceHealthHeader', () => {
  assert.match(dashboard, /import\s*\{\s*renderComplianceHealthHeader\s*\}\s*from\s*["']\.\.\/components\/compliance_health_header\.js["']/)
})

test('Suite 10 — dashboard imports getNitaqatStatus (real zone authority, no invented threshold)', () => {
  assert.match(dashboard, /import\s*\{\s*getNitaqatStatus\s*\}\s*from\s*["']\.\.\/api\/nitaqat\.js["']/)
})

test('Suite 10 — dashboard renders D-U1 slot above the KPI grid', () => {
  const slotIdx = dashboard.indexOf('du1-slot')
  const gridIdx = dashboard.indexOf('aria-label", t("dashboard.kpiGrid")')
  assert.ok(slotIdx > -1, 'D-U1 slot not present')
  assert.ok(gridIdx > -1, 'KPI grid not present')
  assert.ok(slotIdx < gridIdx, 'D-U1 slot must precede KPI grid (first hierarchical element)')
})

test('Suite 10 — dashboard fetchAndRenderDU1 wires onAddData → #employees', () => {
  assert.match(dashboard, /fetchAndRenderDU1/)
  assert.match(dashboard, /location\.hash = ["']#employees["']/)
})
