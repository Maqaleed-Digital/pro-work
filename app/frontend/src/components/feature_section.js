/*
 * FeatureSection / FeatureCard
 *
 * Authority: brief §1 — five feature sections matching capability lines:
 *   WC-SAUD (Saudisation OS)
 *   WC-PYR  (Payroll)
 *   WC-WFA  (Workforce Analytics)
 *   WC-REC  (Record-keeping bundle)
 *   WC-B2G  (Government workforce contract — informational only)
 *
 * Each marked with Mode-A or Mode-D status per brief §4. Stricter
 * default (PROPOSAL §11.A2): Mode-D unless explicitly Mode-A.
 *
 * Brand-neutral per PROPOSAL §11.A5: features list is passed as input.
 * WC-specific feature copy lives in the landing.js orchestrator (which
 * itself consumes locale + brand), not here.
 */

import { renderModeStatusChip, renderModeDAdvisory } from './mode_status_chip.js'
import { getLocale } from '../locale.js'

/**
 * @typedef {object} Feature
 * @property {string} id       — e.g., 'WC-SAUD'
 * @property {{en: string, ar: string}} title
 * @property {{en: string, ar: string}} body
 * @property {'A'|'D'} mode
 * @property {boolean} [informationalOnly]  — brief §1: WC-B2G enrolment not yet open
 */

/**
 * @param {object} opts
 * @param {Feature[]} opts.features
 * @param {string} [opts.locale]
 * @returns {HTMLElement}
 */
export function renderFeatureSection(opts = {}) {
  const features = opts.features || []
  const locale = opts.locale || getLocale()

  const section = document.createElement('section')
  section.setAttribute('data-component', 'feature-section')
  section.setAttribute('aria-labelledby', 'features-heading')
  section.className = 'wc-features'

  const heading = document.createElement('h2')
  heading.id = 'features-heading'
  heading.className = 'wc-features__heading'
  heading.textContent = locale === 'ar' ? 'القدرات' : 'Capabilities'
  section.appendChild(heading)

  const grid = document.createElement('div')
  grid.className = 'wc-features__grid'
  grid.setAttribute('role', 'list')

  for (const f of features) {
    grid.appendChild(renderFeatureCard(f, locale))
  }

  section.appendChild(grid)

  // Mode-D advisory at section level — sits beneath the grid since most
  // capabilities are Mode-D during controlled beta.
  if (features.some(f => f.mode === 'D')) {
    section.appendChild(renderModeDAdvisory({ locale }))
  }

  return section
}

/**
 * @param {Feature} f
 * @param {string} locale
 * @returns {HTMLElement}
 */
function renderFeatureCard(f, locale) {
  const card = document.createElement('article')
  card.setAttribute('role', 'listitem')
  card.setAttribute('data-component', 'feature-card')
  // data-capability retains the internal code (WC-SAUD / WC-PYR / ...)
  // for testing + analytics selectors. It is NOT rendered as visible
  // text — per Day 7 fix #4 Finding 4 (capability codes are internal
  // MPP-MON-001 §7.2 identifiers and must not surface to customers).
  card.setAttribute('data-capability', f.id)
  card.className = 'wc-feature-card'

  // Commercial title used as both the h3 heading and the screen-reader
  // capabilityName for the chip's aria-label. Replaces the prior pattern
  // that passed f.id (e.g., "WC-SAUD") to the chip.
  const commercialTitle = (f.title && f.title[locale]) || (f.title && f.title.en) || ''

  // Header row: mode chip only (capability code removed from visible UI
  // per Day 7 fix #4 Finding 4 — was an h3-prefixed <p class="wc-feature-
  // card__id"> rendering "WC-SAUD" etc.). The .wc-feature-card__id CSS
  // rule in landing.css becomes inert; left in place for now in case any
  // brand variant wants to reintroduce a visible internal code under an
  // explicit governance decision.
  const header = document.createElement('div')
  header.className = 'wc-feature-card__header'

  header.appendChild(renderModeStatusChip({
    mode: f.mode,
    capabilityName: commercialTitle,   // commercial name, not f.id
    locale,
  }))
  card.appendChild(header)

  // Title
  const title = document.createElement('h3')
  title.className = 'wc-feature-card__title'
  title.textContent = commercialTitle || f.id
  card.appendChild(title)

  // Body
  const body = document.createElement('p')
  body.className = 'wc-feature-card__body'
  body.textContent = (f.body && f.body[locale]) || (f.body && f.body.en) || ''
  card.appendChild(body)

  // Informational-only note (e.g., WC-B2G)
  if (f.informationalOnly) {
    const note = document.createElement('p')
    note.className = 'wc-feature-card__note'
    note.textContent = locale === 'ar'
      ? 'معلومات فقط — لم يُفتح التسجيل لهذه القدرة بعد.'
      : 'Informational only — cohort enrolment not yet open.'
    card.appendChild(note)
  }

  return card
}

export default renderFeatureSection
