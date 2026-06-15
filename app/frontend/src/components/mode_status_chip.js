/*
 * ModeStatusChip — Mode-A / Mode-D capability status indicator
 *
 * Authority:
 *   - MPP-UX-001 §8.1 (Mode-state disclosure)
 *   - MPP-AM-001 (Mode A / Mode D framework — Sponsor B1(b) inline binding)
 *   - MPP-RM-001 §10.1 (Mode-D categorical-prohibition language)
 *   - UX-G2 V1.1 §5 (mode treatments at component layer)
 *
 * Brief §4 binding (Mode-state disclosure):
 *   - Every revenue-eligible capability shows current Mode (A or D)
 *   - Mode-D shows non-blocking advisory banner copy
 *   - No UI mechanism activates Mode-A (governed out-of-band)
 *   - No payment collection on Mode-D capability
 *
 * Stricter-interpretation default (PROPOSAL §11.A2): when in doubt, render
 * Mode D with advisory tooltip. Mode A requires explicit `mode: 'A'` input
 * from caller; component never infers.
 *
 * Brand-neutral per §11.A5: receives `mode` + `capabilityName` as input;
 * does not import brand files. Reusable across Crédito / Società / S2PPRO
 * / VetiCare.
 *
 * Accessibility:
 *   - role="status" — non-interrupting screen reader announcement
 *   - aria-label resolves the full disclosure string bilingually
 *   - WCAG AA contrast: Mode-A pairs --maq-mode-a + white; Mode-D pairs
 *     --maq-mode-d + --maq-mode-d-bg (both V1.0 §3.4 tokens)
 *
 * Usage:
 *   import { renderModeStatusChip } from './components/mode_status_chip.js'
 *   const chip = renderModeStatusChip({ mode: 'D', capabilityName: 'WC-SAUD' })
 */

import { t, getLocale } from '../locale.js'

const MODE_A_LABEL = { en: 'Active', ar: 'مُفعَّل' }
const MODE_D_LABEL = { en: 'Available · advisory only', ar: 'متاح · استشاري فقط' }

/**
 * @param {object} opts
 * @param {'A'|'D'} [opts.mode='D']  — default Mode D per stricter rule
 * @param {string}  [opts.capabilityName]  — e.g., 'WC-SAUD' (for aria-label)
 * @param {'inline'|'block'} [opts.variant='inline']
 * @param {string}  [opts.locale]  — defaults to getLocale()
 * @returns {HTMLElement}
 */
export function renderModeStatusChip(opts = {}) {
  const mode = opts.mode === 'A' ? 'A' : 'D'  // stricter default: D
  const variant = opts.variant === 'block' ? 'block' : 'inline'
  const locale = opts.locale || getLocale()
  const capabilityName = opts.capabilityName || ''

  const labels = mode === 'A' ? MODE_A_LABEL : MODE_D_LABEL
  const labelText = labels[locale] || labels.en

  const el = document.createElement('span')
  el.setAttribute('data-component', 'mode-status-chip')
  el.setAttribute('data-mode', mode)
  el.setAttribute('role', 'status')

  // Bilingual aria-label for screen readers — full disclosure string
  const ariaLabelEn = capabilityName
    ? `${capabilityName}: ${MODE_A_LABEL.en === labels.en ? 'Mode A (active)' : 'Mode D (advisory only; not yet activated for revenue events)'}`
    : (mode === 'A' ? 'Mode A — active' : 'Mode D — advisory only; not activated for revenue events')
  const ariaLabelAr = capabilityName
    ? `${capabilityName}: ${mode === 'A' ? 'الوضع أ (مُفعَّل)' : 'الوضع د (استشاري فقط; لم يُفعَّل بعد لأحداث الإيرادات)'}`
    : (mode === 'A' ? 'الوضع أ — مُفعَّل' : 'الوضع د — استشاري فقط; لم يُفعَّل لأحداث الإيرادات')
  el.setAttribute('aria-label', locale === 'ar' ? ariaLabelAr : ariaLabelEn)

  // ── Tokenised styling — no literal colours, no Tailwind utilities ───
  const baseStyle = [
    'display: inline-flex',
    'align-items: center',
    'gap: var(--maq-space-2)',
    'padding-inline: var(--maq-space-3)',
    'padding-block: var(--maq-space-1)',
    'border-radius: var(--maq-radius-sm)',
    'font-family: var(--maq-font-arabic), var(--maq-font-latin)',
    'font-size: var(--maq-text-xs)',
    'font-weight: var(--maq-weight-medium)',
    'letter-spacing: var(--maq-tracking-wide)',
    'text-transform: uppercase',
    'line-height: var(--maq-leading-tight)',
  ]
  if (variant === 'block') baseStyle.push('display: flex', 'width: 100%')

  if (mode === 'A') {
    // Mode-A: brand-success bg + on-success foreground (V1.1.1 §3.2
    // verified 5.30:1 white-on---maq-mode-a). Dot inherits chip text
    // colour and renders white on green.
    baseStyle.push('background: var(--maq-mode-a)', 'color: var(--maq-neutral-0)')
  } else {
    // Mode-D: lavender-bg + DARK NEUTRAL text + mode-d border.
    //
    // Day 7 fix #3 (2026-05-16): text foreground was --maq-mode-d
    // (#7A6F8A) on --maq-mode-d-bg (#F0EEF5) — measured 4.08:1 in
    // axe-core, below WCAG AA 4.5:1 (failed across all 5 feature-card
    // chips on the apex landing). V1.0 anti-mutation forbids changing
    // either canonical token value, so we pair the lavender bg with
    // --maq-neutral-800 (#1F2937) for ~11.5:1 contrast. The Mode-D
    // SEMANTIC remains conveyed by:
    //   - the lavender background tint
    //   - the --maq-mode-d border
    //   - the dot indicator (explicit colour below)
    // Do NOT revert the text colour to --maq-mode-d without a runtime
    // axe-core contrast re-verification.
    baseStyle.push(
      'background: var(--maq-mode-d-bg)',
      'color: var(--maq-neutral-800)',
      'border: 1px solid var(--maq-mode-d)',
    )
  }

  el.style.cssText = baseStyle.join(';')

  // Dot indicator (decorative; meaning conveyed via text + aria-label).
  // Day 7 fix #3: explicit dot colour preserves the Mode-D visual
  // identity now that the chip text colour is a dark neutral, not the
  // mode-d hue. Mode-A's dot inherits (white on green) and remains
  // visible at WCAG AA without an override.
  const dot = document.createElement('span')
  dot.setAttribute('aria-hidden', 'true')
  dot.textContent = '●'
  dot.style.cssText = mode === 'D'
    ? 'font-size: 0.6em; line-height: 1; color: var(--maq-mode-d)'
    : 'font-size: 0.6em; line-height: 1'
  el.appendChild(dot)

  // Label
  const label = document.createElement('span')
  label.textContent = labelText
  el.appendChild(label)

  return el
}

/**
 * Convenience: renders the Mode-D advisory banner copy per brief §4.
 * Non-blocking; sits adjacent to the chip on surfaces with Mode-D state.
 *
 * @param {object} opts
 * @param {string} [opts.locale]
 * @returns {HTMLElement}
 */
export function renderModeDAdvisory(opts = {}) {
  const locale = opts.locale || getLocale()
  const el = document.createElement('p')
  el.setAttribute('data-component', 'mode-d-advisory')
  el.setAttribute('role', 'note')
  el.textContent = locale === 'ar'
    ? 'القدرة متاحة; لم يُفعَّل بعد لأحداث الإيرادات.'
    : 'Capability available; not yet activated for revenue events.'
  el.style.cssText = [
    'font-family: var(--maq-font-arabic), var(--maq-font-latin)',
    'font-size: var(--maq-text-sm)',
    'color: var(--maq-neutral-600)',
    'margin-block: var(--maq-space-2)',
    'line-height: var(--maq-leading-normal)',
  ].join(';')
  return el
}

export default renderModeStatusChip
