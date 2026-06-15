/*
 * ConfidenceBand
 *
 * Authority:
 *   - MPP-UX-001 §7.2 (Calibrated confidence band — Low / Moderate / High)
 *   - MPP-UX-001 §7.4 (Confidence-below-threshold auto-HITL)
 *   - UX-G2-INV-001 V1.1 §3.3 OBL C-02 (missing — implemented here)
 *
 * Stricter-interpretation default (PROPOSAL §11.A2): numeric percentage
 * is shown ONLY when the backend supplies a `calibrated: true` flag.
 * Otherwise only the qualitative band is rendered, to avoid false
 * precision (UX-001 §7.2 "never raw probability without calibration
 * evidence").
 *
 * Brand-neutral per §11.A5. WCAG 2.2 AA contrast verified through
 * canonical --maq-semantic-* tokens.
 *
 * Bands:
 *   low      → --maq-semantic-warning (amber)
 *   moderate → --maq-semantic-info    (info navy)
 *   high     → --maq-semantic-success (green)
 *   unknown  → --maq-neutral-500       (grey, fallback)
 *
 * Usage:
 *   renderConfidenceBand({ band: 'high', value: 0.92, calibrated: true })
 *   renderConfidenceBand({ band: 'low' })                  // qualitative only
 */

import { getLocale } from '../locale.js'

const BAND_LABELS = {
  low:      { en: 'Low confidence',      ar: 'ثقة منخفضة' },
  moderate: { en: 'Moderate confidence', ar: 'ثقة متوسطة' },
  high:     { en: 'High confidence',     ar: 'ثقة عالية' },
  unknown:  { en: 'Confidence unknown',  ar: 'الثقة غير معروفة' },
}

const BAND_TOKEN = {
  low:      { bg: 'var(--maq-semantic-warning-bg)', fg: 'var(--maq-semantic-warning)' },
  moderate: { bg: 'var(--maq-semantic-info-bg)',    fg: 'var(--maq-semantic-info)' },
  high:     { bg: 'var(--maq-semantic-success-bg)', fg: 'var(--maq-semantic-success)' },
  unknown:  { bg: 'var(--maq-neutral-100)',         fg: 'var(--maq-neutral-500)' },
}

/**
 * @param {object} opts
 * @param {'low'|'moderate'|'high'|'unknown'} [opts.band='unknown']
 * @param {number} [opts.value]       — decimal 0..1; rendered ONLY if calibrated=true
 * @param {boolean} [opts.calibrated=false]
 * @param {string} [opts.locale]
 * @returns {HTMLElement}
 */
export function renderConfidenceBand(opts = {}) {
  const locale = opts.locale || getLocale()
  const band = ['low', 'moderate', 'high', 'unknown'].includes(opts.band) ? opts.band : 'unknown'
  const value = typeof opts.value === 'number' ? Math.max(0, Math.min(1, opts.value)) : null
  const calibrated = opts.calibrated === true && value !== null

  const tokens = BAND_TOKEN[band]
  const labelText = BAND_LABELS[band][locale] || BAND_LABELS[band].en

  const el = document.createElement('span')
  el.setAttribute('data-component', 'confidence-band')
  el.setAttribute('data-band', band)
  el.setAttribute('role', 'meter')
  if (calibrated) {
    el.setAttribute('aria-valuenow', String(Math.round(value * 100)))
    el.setAttribute('aria-valuemin', '0')
    el.setAttribute('aria-valuemax', '100')
  }
  el.setAttribute('aria-label', calibrated
    ? `${labelText} (${Math.round(value * 100)}%)`
    : labelText)
  el.style.cssText = [
    'display: inline-flex',
    'align-items: center',
    'gap: var(--maq-space-2)',
    'padding-inline: var(--maq-space-3)',
    'padding-block: var(--maq-space-1)',
    'background: ' + tokens.bg,
    'color: ' + tokens.fg,
    'border-radius: var(--maq-radius-sm)',
    'font-family: var(--maq-font-arabic), var(--maq-font-latin)',
    'font-size: var(--maq-text-xs)',
    'font-weight: var(--maq-weight-semibold)',
    'letter-spacing: var(--maq-tracking-wide)',
    'line-height: var(--maq-leading-tight)',
  ].join(';')

  // Dot indicator — decorative; meaning is in text + aria
  const dot = document.createElement('span')
  dot.setAttribute('aria-hidden', 'true')
  dot.textContent = '●'
  dot.style.cssText = 'font-size:0.6em;line-height:1'
  el.appendChild(dot)

  const lbl = document.createElement('span')
  lbl.textContent = labelText
  el.appendChild(lbl)

  // Numeric percentage — ONLY when calibrated (UX-001 §7.2 stricter)
  if (calibrated) {
    const pct = document.createElement('span')
    pct.style.cssText = 'opacity:0.8;font-family:var(--maq-font-mono);font-weight:var(--maq-weight-regular)'
    pct.textContent = Math.round(value * 100) + '%'
    el.appendChild(pct)
  }

  return el
}

export default renderConfidenceBand
