/*
 * D-U1 ComplianceHealthHeader
 *
 * Authority:
 *   - WC-IMPL-001 V1.0 §T-1 — Engineering Implementation Handoff
 *     (D-U1 MVP composition only; six refinement composition pieces
 *     deferred per WC-OPSDASH-001 V1.0.1 §D and §E.1)
 *   - WC-OPSDASH-001 V1.0.1 §D — Dashboard hierarchy: ratio is the
 *     first hierarchical element the cohort user sees on load
 *   - UX-G1 V1.1.1 — brand tokens via CSS vars (no literal hex)
 *   - UX-G2 V1.1 §3.14 N-01 — canonical dashboard grammar
 *   - PROPOSAL §11.A4 NO PHANTOM FEATURES — panel surfaces only the
 *     data the backend actually supplies
 *   - PROPOSAL §11.A5 brand-neutral — reusable across WorkCaptain /
 *     Crédito / Società / S2PPRO / VetiCare waves
 *   - Register V1.2 L-01 (WCAG 2.2 AA) · L-03 (Hijri+Gregorian dual
 *     dates in ar) · L-05 (reduced motion)
 *   - Register V1.2 G2-D5 — Hindu-Arabic numerals (0–9) in both
 *     locales; ٪ (U+066A) for ar, % for en
 *
 * Binding acceptance gate: the 30-second test. A new user, opening
 * the dashboard for the first time, can grasp their compliance
 * posture (ratio + state colour + click affordance) before reading
 * any other element on the page.
 *
 * MVP composition only — explicitly deferred (do NOT add here):
 *   - Trend indicator (30-day directional)
 *   - Threshold-distance numeric ("4.5pp above 20% threshold")
 *   - Confidence state (high/medium/low)
 *   - Stale-data indicator
 *   - Missing-evidence indicator
 *   - Pending-sync visibility
 *
 * Usage:
 *   import { renderComplianceHealthHeader } from "../components/compliance_health_header.js"
 *
 *   const el = renderComplianceHealthHeader({
 *     snapshot: {
 *       totalHeadcount: 120,
 *       saudiCount: 26,
 *       nonSaudiCount: 94,
 *       ratio: 0.2167,
 *       thresholdRatio: 0.20,
 *       approachingMargin: 0.03,
 *       sources: [{ system: 'Qiwa', lastSyncAt: '2026-05-15T09:00:00Z', recordCount: 120 }],
 *       computedAt: '2026-05-16T08:00:00Z',
 *     },
 *     locale: 'en',
 *     onAddData: () => { location.hash = '#employees' },
 *   })
 *
 *   document.body.appendChild(el)
 */

import { t, getLocale } from "../locale.js"

/**
 * @typedef {object} WorkforceSource
 * @property {string} system       — 'Qiwa' | 'GOSI' | 'Mudad' | 'Manual' | string
 * @property {string} lastSyncAt   — ISO 8601
 * @property {number} recordCount  — number of records from this source
 * @property {'fresh'|'pending'|'stale'} [status]  — reserved for post-MVP composition
 */

/**
 * @typedef {object} WorkforceSnapshot
 * @property {number} totalHeadcount
 * @property {number} saudiCount
 * @property {number} nonSaudiCount
 * @property {number} ratio                    — 0..1
 * @property {number} [thresholdRatio]         — 0..1; optional
 * @property {number} [approachingMargin]      — 0..1; optional, defaults to 0.03
 * @property {WorkforceSource[]} [sources]     — optional; per-source breakdown
 * @property {string} [computedAt]             — ISO 8601
 * @property {string} [lastUpdated]            — ISO 8601 (fallback when sources absent)
 * @property {'platinum'|'high_green'|'medium_green'|'low_green'|'green'|'yellow'|'red'|'unknown'} [zone]
 *                                              — present when backend supplies Nitaqat-style zone
 *                                              — used for state colour when thresholdRatio absent
 */

/** @typedef {'at_or_above'|'approaching'|'baseline'} RatioState */

/** @typedef {'ar'|'en'|'es'|'fr'|'ur'} Locale */

// State → CSS var (no literal hex per UX-G1 V1.1.1)
// at_or_above → brand-secondary (#006C35 Saudi green)
// approaching → brand-accent    (#C9A227 gold)
// baseline    → brand-primary   (#1E3A5F navy)
const STATE_TOKEN = {
  at_or_above: 'var(--maq-brand-secondary)',
  approaching: 'var(--maq-brand-accent)',
  baseline:    'var(--maq-brand-primary)',
}

// Nitaqat-zone → ratio state mapping (when explicit thresholdRatio absent).
// Aligns with brief §3.3 + Nitaqat policy: any green tier is compliant;
// yellow is approaching the boundary; red is substantially below.
const ZONE_TO_STATE = {
  platinum:     'at_or_above',
  high_green:   'at_or_above',
  medium_green: 'at_or_above',
  low_green:    'at_or_above',
  green:        'at_or_above',
  yellow:       'approaching',
  red:          'baseline',
  unknown:      'baseline',
}

/**
 * Compute the three-state colour assignment.
 * @param {WorkforceSnapshot} snapshot
 * @returns {RatioState}
 */
export function computeRatioState(snapshot) {
  if (!snapshot) return 'baseline'
  const { ratio, thresholdRatio, approachingMargin, zone } = snapshot
  if (typeof thresholdRatio === 'number' && typeof ratio === 'number') {
    const margin = typeof approachingMargin === 'number' ? approachingMargin : 0.03
    if (ratio >= thresholdRatio) return 'at_or_above'
    if (ratio >= thresholdRatio - margin) return 'approaching'
    return 'baseline'
  }
  if (zone && ZONE_TO_STATE[zone]) return ZONE_TO_STATE[zone]
  return 'baseline'
}

/**
 * Format a 0..1 ratio as a percent string.
 *   en → "21.7%"
 *   ar → "21.7٪"  (Hindu-Arabic 0-9 per G2-D5, Arabic percent U+066A)
 * @param {number} value
 * @param {Locale} locale
 * @returns {string}
 */
export function formatPercent(value, locale) {
  const n = (Number(value) * 100).toFixed(1)
  return locale === 'ar' ? `${n}٪` : `${n}%`
}

/**
 * Format an ISO 8601 timestamp.
 *   en → "16 May 2026"
 *   ar → "16 \u200Fمايو\u200F 2026 / 29 ذو القعدة 1447"  (Gregorian / Hijri dual, L-03)
 * Hindu-Arabic numerals enforced via `-u-nu-latn` (G2-D5).
 * @param {string} iso
 * @param {Locale} locale
 * @returns {string}
 */
export function formatDate(iso, locale) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const opts = { year: 'numeric', month: 'short', day: 'numeric' }
  if (locale === 'ar') {
    try {
      const greg = new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', opts).format(d)
      const hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-nu-latn', opts).format(d)
      return `${greg} / ${hijri}`
    } catch {
      return new Intl.DateTimeFormat('en-GB', opts).format(d)
    }
  }
  return new Intl.DateTimeFormat('en-GB', opts).format(d)
}

let _instanceCounter = 0
function _nextId(prefix) { _instanceCounter += 1; return `${prefix}-${_instanceCounter}` }

/**
 * Render the D-U1 Compliance Health Header.
 *
 * @param {object} opts
 * @param {WorkforceSnapshot | null} opts.snapshot
 * @param {Locale} [opts.locale]
 * @param {() => void} [opts.onAddData]  — called when empty-state CTA is activated
 * @returns {HTMLElement}
 */
export function renderComplianceHealthHeader(opts = {}) {
  const locale = opts.locale || getLocale()
  const snapshot = opts.snapshot
  const dir = locale === 'ar' ? 'rtl' : 'ltr'

  const labelId = _nextId('du1-label')
  const panelId = _nextId('du1-panel')

  const section = document.createElement('section')
  section.setAttribute('data-component', 'compliance-health-header')
  section.setAttribute('data-testid', 'wc-du1')
  section.setAttribute('dir', dir)
  section.setAttribute('lang', locale)
  section.setAttribute('aria-labelledby', labelId)
  section.style.cssText = [
    'display: flex',
    'flex-direction: column',
    'gap: var(--maq-space-2)',
    'padding: var(--maq-space-5) var(--maq-space-4)',
    'background: var(--maq-neutral-0)',
    'border-block-end: 1px solid var(--maq-neutral-200)',
  ].join(';')

  // ── Empty state (AC4) ─────────────────────────────────────────────────
  const isEmpty = !snapshot || !snapshot.totalHeadcount || snapshot.totalHeadcount === 0
  if (isEmpty) {
    section.setAttribute('data-state', 'empty')
    section.setAttribute('data-testid', 'wc-du1-empty')

    const label = document.createElement('p')
    label.id = labelId
    label.textContent = t('du1.ratioLabel')
    label.style.cssText = 'margin:0;font-size:var(--maq-text-sm);font-weight:var(--maq-weight-medium);color:var(--maq-neutral-600)'
    section.appendChild(label)

    const msg = document.createElement('p')
    msg.textContent = t('du1.emptyMsg')
    msg.style.cssText = 'margin:0;font-size:var(--maq-text-base);color:var(--maq-neutral-700);line-height:var(--maq-leading-relaxed)'
    section.appendChild(msg)

    if (typeof opts.onAddData === 'function') {
      const cta = document.createElement('button')
      cta.type = 'button'
      cta.textContent = t('du1.emptyCta')
      cta.setAttribute('data-testid', 'wc-du1-empty-cta')
      cta.style.cssText = [
        'align-self: flex-start',
        'padding: var(--maq-space-2) var(--maq-space-4)',
        'background: var(--maq-brand-primary)',
        'color: var(--maq-neutral-0)',
        'border: 0',
        'border-radius: var(--maq-radius-md)',
        'font-size: var(--maq-text-sm)',
        'font-weight: var(--maq-weight-semibold)',
        'cursor: pointer',
        'margin-block-start: var(--maq-space-2)',
      ].join(';')
      cta.addEventListener('click', () => opts.onAddData())
      section.appendChild(cta)
    }

    return section
  }

  // ── Populated state (AC1, AC2, AC3, AC5) ───────────────────────────────
  const state = computeRatioState(snapshot)
  const ratioColor = STATE_TOKEN[state]
  const ratioText = formatPercent(snapshot.ratio, locale)
  const stateText =
    state === 'at_or_above' ? t('du1.stateAbove')
    : state === 'approaching' ? t('du1.stateApproaching')
    : t('du1.stateBelow')

  section.setAttribute('data-state', state)

  // Label
  const label = document.createElement('p')
  label.id = labelId
  label.textContent = t('du1.ratioLabel')
  label.style.cssText = 'margin:0;font-size:var(--maq-text-sm);font-weight:var(--maq-weight-medium);color:var(--maq-neutral-600)'
  section.appendChild(label)

  // Ratio button (click/Enter/Space toggles panel)
  const ratioBtn = document.createElement('span')
  ratioBtn.setAttribute('role', 'button')
  ratioBtn.setAttribute('tabindex', '0')
  ratioBtn.setAttribute('aria-expanded', 'false')
  ratioBtn.setAttribute('aria-controls', panelId)
  ratioBtn.setAttribute('aria-label', `${t('du1.ratioLabel')}: ${ratioText}, ${stateText}`)
  ratioBtn.setAttribute('data-state', state)
  ratioBtn.setAttribute('data-testid', 'wc-du1-ratio')
  ratioBtn.textContent = ratioText
  ratioBtn.style.cssText = [
    'display: inline-flex',
    'align-items: baseline',
    'align-self: flex-start',
    'gap: var(--maq-space-3)',
    'color: ' + ratioColor,
    'font-family: var(--maq-font-mono)',
    'font-size: clamp(2.5rem, 6vw, 4rem)',
    'font-weight: var(--maq-weight-bold)',
    'line-height: var(--maq-leading-tight)',
    'cursor: pointer',
    'outline-offset: 4px',
    'border-radius: var(--maq-radius-sm)',
    'user-select: none',
  ].join(';')
  section.appendChild(ratioBtn)

  // Hint line
  const hint = document.createElement('p')
  hint.textContent = t('du1.hint')
  hint.style.cssText = 'margin:0;font-size:var(--maq-text-xs);color:var(--maq-neutral-500)'
  section.appendChild(hint)

  // Source-of-truth panel (initially hidden)
  const panel = _buildPanel(panelId, snapshot, locale)
  panel.hidden = true
  section.appendChild(panel)

  function togglePanel() {
    const open = ratioBtn.getAttribute('aria-expanded') === 'true'
    const next = !open
    ratioBtn.setAttribute('aria-expanded', String(next))
    panel.hidden = !next
  }

  ratioBtn.addEventListener('click', togglePanel)
  ratioBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault()
      togglePanel()
    }
  })

  return section
}

function _buildPanel(panelId, snapshot, locale) {
  const panel = document.createElement('div')
  panel.id = panelId
  panel.setAttribute('role', 'region')
  panel.setAttribute('aria-label', t('du1.sourcesLabel'))
  panel.setAttribute('data-testid', 'wc-du1-panel')
  panel.style.cssText = [
    'margin-block-start: var(--maq-space-3)',
    'padding: var(--maq-space-4)',
    'background: var(--maq-neutral-50)',
    'border: 1px solid var(--maq-neutral-200)',
    'border-radius: var(--maq-radius-md)',
    'display: flex',
    'flex-direction: column',
    'gap: var(--maq-space-3)',
    'font-size: var(--maq-text-sm)',
  ].join(';')

  panel.appendChild(_panelRow(t('du1.panelTotal'), _formatInt(snapshot.totalHeadcount)))
  panel.appendChild(_panelRow(t('du1.panelSaudi'), _formatInt(snapshot.saudiCount)))
  panel.appendChild(_panelRow(t('du1.panelNonSaudi'), _formatInt(snapshot.nonSaudiCount)))

  if (typeof snapshot.thresholdRatio === 'number') {
    panel.appendChild(_panelRow(t('du1.panelThreshold'), formatPercent(snapshot.thresholdRatio, locale)))
  }

  // Per §11.A4: render per-source breakdown only if backend supplied it.
  // Otherwise fall back to single lastUpdated row (no phantom rows).
  if (Array.isArray(snapshot.sources) && snapshot.sources.length > 0) {
    const sourcesWrap = document.createElement('div')
    sourcesWrap.style.cssText = 'display:flex;flex-direction:column;gap:var(--maq-space-2);padding-block-start:var(--maq-space-2);border-block-start:1px solid var(--maq-neutral-200)'
    const slabel = document.createElement('p')
    slabel.textContent = t('du1.sourcesLabel')
    slabel.style.cssText = 'margin:0;font-size:var(--maq-text-xs);font-weight:var(--maq-weight-semibold);color:var(--maq-neutral-600);text-transform:uppercase;letter-spacing:0.04em'
    sourcesWrap.appendChild(slabel)
    for (const s of snapshot.sources) {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;justify-content:space-between;gap:var(--maq-space-3);font-size:var(--maq-text-sm)'
      const sys = document.createElement('span')
      sys.textContent = s.system
      const meta = document.createElement('span')
      meta.style.color = 'var(--maq-neutral-600)'
      const count = typeof s.recordCount === 'number' ? _formatInt(s.recordCount) : ''
      meta.textContent = [formatDate(s.lastSyncAt, locale), count && `${count} ${t('du1.records')}`].filter(Boolean).join(' · ')
      row.appendChild(sys)
      row.appendChild(meta)
      sourcesWrap.appendChild(row)
    }
    panel.appendChild(sourcesWrap)
  } else if (snapshot.lastUpdated || snapshot.computedAt) {
    const iso = snapshot.lastUpdated || snapshot.computedAt
    panel.appendChild(_panelRow(t('du1.lastSync'), formatDate(iso, locale)))
  }

  return panel
}

function _panelRow(label, value) {
  const row = document.createElement('div')
  row.style.cssText = 'display:flex;justify-content:space-between;gap:var(--maq-space-3)'
  const l = document.createElement('span')
  l.textContent = label
  l.style.color = 'var(--maq-neutral-600)'
  const v = document.createElement('span')
  v.textContent = value
  v.style.cssText = 'font-family:var(--maq-font-mono);font-weight:var(--maq-weight-semibold);color:var(--maq-neutral-900)'
  row.appendChild(l)
  row.appendChild(v)
  return row
}

function _formatInt(n) {
  // Hindu-Arabic digits in both locales per G2-D5; en-GB grouping.
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—'
  return n.toLocaleString('en-GB')
}

export default renderComplianceHealthHeader
