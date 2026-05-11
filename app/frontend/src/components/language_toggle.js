/*
 * LanguageToggle — bilingual locale switcher
 *
 * Authority: brief §I (bilingual: Arabic primary RTL; English paired LTR;
 * persistent across sessions; UX-001 §4.4).
 *
 * Brand-neutral per PROPOSAL §11.A5. Consumes locale.js setLocale().
 *
 * Accessibility:
 *   - <button> with aria-pressed for active locale
 *   - aria-label in both languages (locale-aware)
 *   - Visible language names self-document ('عربي' / 'English')
 *
 * Behaviour:
 *   - Click toggles ar ↔ en, persists to localStorage via setLocale()
 *   - Triggers re-render via custom event 'maq:locale-changed' for
 *     observer components to react without page reload
 *   - Sets <html dir> to 'rtl' when locale is 'ar', 'ltr' otherwise
 *
 * Usage:
 *   import { renderLanguageToggle, applyLocaleToDocument } from './language_toggle.js'
 *   applyLocaleToDocument()  // initial direction set
 *   header.appendChild(renderLanguageToggle({ onChange: () => rerender() }))
 */

import { getLocale, setLocale } from '../locale.js'

/**
 * Apply the current locale to the document root (sets <html lang> + dir).
 * Call once at app boot before first render.
 */
export function applyLocaleToDocument() {
  if (typeof document === 'undefined') return
  const loc = getLocale()
  document.documentElement.setAttribute('lang', loc)
  document.documentElement.setAttribute('dir', loc === 'ar' ? 'rtl' : 'ltr')
}

/**
 * @param {object} [opts]
 * @param {Function} [opts.onChange]  — invoked after locale switch + persist
 * @returns {HTMLElement}
 */
export function renderLanguageToggle(opts = {}) {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.setAttribute('data-component', 'language-toggle')

  function paint() {
    const cur = getLocale()
    // The button shows the OTHER language as its action label
    const targetLocale = cur === 'ar' ? 'en' : 'ar'
    const labelMap = { ar: 'عربي', en: 'English' }

    btn.textContent = labelMap[targetLocale]
    btn.setAttribute('aria-pressed', 'false')  // shows the target, not the active
    btn.setAttribute('aria-label', cur === 'ar' ? 'Switch to English' : 'التبديل إلى العربية')
    btn.setAttribute('lang', targetLocale)
  }

  btn.style.cssText = [
    'background: transparent',
    'border: 1px solid var(--maq-neutral-300)',
    'color: var(--maq-neutral-700)',
    'cursor: pointer',
    'font-family: var(--maq-font-arabic), var(--maq-font-latin)',
    'font-size: var(--maq-text-sm)',
    'font-weight: var(--maq-weight-medium)',
    'padding-inline: var(--maq-space-3)',
    'padding-block: var(--maq-space-2)',
    'border-radius: var(--maq-radius-md)',
    'transition: var(--transition-fast)',
    'min-height: 36px',  // WCAG 2.5.8 minimum target — close to 24px CSS px floor + comfortable
    'min-width: 60px',
  ].join(';')

  btn.addEventListener('mouseenter', () => {
    btn.style.background = 'var(--maq-neutral-100)'
  })
  btn.addEventListener('mouseleave', () => {
    btn.style.background = 'transparent'
  })
  btn.addEventListener('focus', () => {
    btn.style.outline = '2px solid var(--maq-brand-primary)'
    btn.style.outlineOffset = '2px'
  })
  btn.addEventListener('blur', () => {
    btn.style.outline = 'none'
  })

  btn.addEventListener('click', async () => {
    const next = getLocale() === 'ar' ? 'en' : 'ar'
    await setLocale(next)
    applyLocaleToDocument()
    paint()
    if (typeof opts.onChange === 'function') opts.onChange(next)
    // Notify observers
    document.dispatchEvent(new CustomEvent('maq:locale-changed', { detail: { locale: next } }))
  })

  paint()
  return btn
}

export default renderLanguageToggle
