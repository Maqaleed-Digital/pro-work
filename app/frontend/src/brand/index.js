/*
 * Brand variant resolver
 *
 * Single entry point for brand-aware components. Components import
 * `getBrand()` and consume the typed variant object; they never import
 * individual brand files. This keeps WorkCaptain-specific content
 * contained to src/brand/*.js per PROPOSAL §11.A5 portfolio reuse rule.
 *
 * Variant selection order:
 *   1. URL query ?brand= (dev-only convenience)
 *   2. window.__MAQ_BRAND__ (set by Vite define from VITE_BRAND env)
 *   3. Default: 'workcaptain' (the active variant for controlled beta)
 *
 * Per Sponsor B5: brand-variant capability is binding day one; only the
 * workcaptain variant deploys in the controlled-beta window.
 *
 * @typedef {object} BrandVariant
 * @property {string} id
 * @property {{en: string, ar: string}} publicName
 * @property {{en: string, ar: string}} tagline
 * @property {string} backendIdentifier
 * @property {'b2c-smb'|'b2g-corporate'} audience
 * @property {{apex: string, appPath: string}} deploymentTargets
 * @property {boolean} controlledBeta
 * @property {{en: string, ar: string}} cohortCapMessage
 * @property {'A'|'D'} defaultMode
 * @property {object} copy
 * @property {string} themeClass
 * @property {string[]} regulators
 * @property {{pdpl: boolean, residency: string, samaPosture: string, ncaEccPosture: string}} trustBand
 */

import workcaptain from './workcaptain.js'
import maqaleedWorkforce from './maqaleed-workforce.js'

const VARIANTS = {
  'workcaptain': workcaptain,
  'maqaleed-workforce': maqaleedWorkforce,
}

const DEFAULT_VARIANT = 'workcaptain'

function resolveVariantId() {
  // 1. URL query ?brand= (dev-only)
  if (typeof window !== 'undefined' && window.location) {
    try {
      const u = new URL(window.location.href)
      const q = u.searchParams.get('brand')
      if (q && VARIANTS[q]) return q
    } catch (_) { /* ignore malformed URL */ }
  }

  // 2. Vite-injected __MAQ_BRAND__ (build-time)
  if (typeof __MAQ_BRAND__ !== 'undefined' && VARIANTS[__MAQ_BRAND__]) {
    return __MAQ_BRAND__
  }

  // 3. Default
  return DEFAULT_VARIANT
}

let _resolved = null

/**
 * Returns the active BrandVariant object. Cached after first resolve.
 * @returns {BrandVariant}
 */
export function getBrand() {
  if (_resolved) return _resolved
  const id = resolveVariantId()
  _resolved = VARIANTS[id]
  return _resolved
}

/**
 * Returns the localised brand display name for a given locale.
 * @param {'en'|'ar'} locale
 * @returns {string}
 */
export function getBrandName(locale) {
  const b = getBrand()
  return b.publicName[locale] || b.publicName.en
}

/**
 * Applies the brand themeClass to document.documentElement so CSS
 * `.theme-workcaptain { ... }` selectors can target brand-specific styling
 * without WC content leaking into the canonical token namespace.
 */
export function applyBrandTheme() {
  if (typeof document === 'undefined') return
  const b = getBrand()
  // Remove any prior brand theme class
  for (const v of Object.values(VARIANTS)) {
    document.documentElement.classList.remove(v.themeClass)
  }
  document.documentElement.classList.add(b.themeClass)
  document.documentElement.setAttribute('data-brand', b.id)
}

// Convenience export for components that want both
export default { getBrand, getBrandName, applyBrandTheme }
