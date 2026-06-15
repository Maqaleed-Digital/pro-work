/*
 * ControlledBetaBanner
 *
 * Non-blocking, bilingual, persistent banner shown on customer-facing
 * surfaces during the WorkCaptain controlled-beta window (D15→D15+41).
 *
 * Authority: WC Controlled-Launch Memo V1.1 (Sponsor B1(b) inline binding):
 *   controlled-beta posture binding; cohort ~25–30; no marketing-as-launched
 *   copy; no cohort expansion mechanics; no Mode-D revenue collection.
 *
 * Brand-neutral per PROPOSAL §11.A5: receives brand config as input;
 * does not import brand files. Reusable across Crédito / Società / S2PPRO
 * / VetiCare in subsequent waves.
 *
 * Mode-D awareness: when paired with a Mode-D capability, defaults to the
 * stricter interpretation (PROPOSAL §11.A2): renders as info-tone banner
 * with explicit cohort message; no upgrade affordance.
 *
 * Accessibility:
 *   - role="status" + aria-live="polite" (non-interrupting)
 *   - Bilingual aria-label resolves via locale.t()
 *   - WCAG 2.2 AA contrast: --maq-semantic-info-bg + --maq-semantic-info text
 *   - Dismissible only via explicit user action; remembered per-session (sessionStorage)
 *
 * Usage:
 *   import { renderControlledBetaBanner } from './components/controlled_beta_banner.js'
 *   const banner = renderControlledBetaBanner({ brand: getBrand(), locale: getLocale() })
 *   document.body.prepend(banner)
 */

import { t, getLocale } from '../locale.js'

const SESSION_KEY = 'maq_cb_banner_dismissed'

/**
 * @param {object} opts
 * @param {object} [opts.brand]   — brand variant from src/brand/index.js getBrand()
 * @param {string} [opts.locale]  — 'en' or 'ar'; defaults to getLocale()
 * @param {boolean} [opts.dismissible=true]
 * @returns {HTMLElement}
 */
export function renderControlledBetaBanner(opts = {}) {
  const locale = opts.locale || getLocale()
  const brand = opts.brand || null
  const dismissible = opts.dismissible !== false

  // Honour per-session dismissal
  if (dismissible && sessionStorage.getItem(SESSION_KEY) === '1') {
    const empty = document.createElement('div')
    empty.setAttribute('data-component', 'controlled-beta-banner')
    empty.setAttribute('data-dismissed', 'true')
    empty.hidden = true
    return empty
  }

  // Resolve message — brand override > locale t() fallback
  const messageText = (brand && brand.cohortCapMessage && brand.cohortCapMessage[locale])
    || t('controlledBeta.banner')
    || (locale === 'ar'
        ? 'مرحلة تجريبية مُدارة — نستقبل عدداً محدوداً من أصحاب العمل في المملكة.'
        : 'Currently in controlled beta — accepting a limited cohort of Saudi employers.')

  // ── Root element ─────────────────────────────────────────────────────
  const el = document.createElement('div')
  el.setAttribute('data-component', 'controlled-beta-banner')
  el.setAttribute('role', 'status')
  el.setAttribute('aria-live', 'polite')
  el.style.cssText = [
    'background: var(--maq-semantic-info-bg)',
    'color: var(--maq-semantic-info)',
    'border-block-end: 1px solid var(--maq-semantic-info)',
    'padding-inline-start: var(--maq-space-6)',
    'padding-inline-end: var(--maq-space-4)',
    'padding-block: var(--maq-space-3)',
    'font-family: var(--maq-font-arabic), var(--maq-font-latin)',
    'font-size: var(--maq-text-sm)',
    'line-height: var(--maq-leading-normal)',
    'display: flex',
    'align-items: center',
    'gap: var(--maq-space-3)',
  ].join(';')

  // ── Icon (info) — decorative; meaning comes from text ────────────────
  const icon = document.createElement('span')
  icon.setAttribute('aria-hidden', 'true')
  icon.textContent = 'ⓘ'
  icon.style.cssText = 'font-size: var(--maq-icon-md); flex-shrink: 0'
  el.appendChild(icon)

  // ── Message ──────────────────────────────────────────────────────────
  const msg = document.createElement('span')
  msg.textContent = messageText
  msg.style.cssText = 'flex: 1; min-inline-size: 0'
  el.appendChild(msg)

  // ── Dismiss button (optional) ────────────────────────────────────────
  if (dismissible) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.setAttribute('aria-label', locale === 'ar' ? 'إغلاق الإشعار' : 'Dismiss notice')
    btn.textContent = '×'
    btn.style.cssText = [
      'background: transparent',
      'border: none',
      'color: inherit',
      'cursor: pointer',
      'font-size: var(--maq-text-lg)',
      'line-height: 1',
      'padding: var(--maq-space-1) var(--maq-space-2)',
      'border-radius: var(--maq-radius-sm)',
      'flex-shrink: 0',
    ].join(';')
    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'var(--maq-neutral-100)'
    })
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent'
    })
    btn.addEventListener('click', () => {
      try { sessionStorage.setItem(SESSION_KEY, '1') } catch {}
      el.remove()
    })
    el.appendChild(btn)
  }

  return el
}

export default renderControlledBetaBanner
