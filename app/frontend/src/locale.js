// S36-G5: Locale module — translation key lookup + locale management
// BRD Refs: Gold BRD A6, Consolidated §5.2
//
// S40: Static imports — all locales bundled by Vite at build time.
// Arabic (ar) is fully translated and enabled by default for KSA deployments.
//
// Usage:
//   import { t, getLocale, setLocale, initLocale } from "./locale.js"
//   t("nav.dashboard")        // → "Dashboard" (en) or "لوحة التحكم" (ar)
//   setLocale("ar")
//   t("common.approve")       // → "موافقة"

import en from './locales/en.json'
import ar from './locales/ar.json'
import ur from './locales/ur.json'
import fr from './locales/fr.json'
import es from './locales/es.json'

const LOCALES = { en, ar, ur, fr, es }

// Active locale — default 'en', overridable
let _locale = (() => {
  try { return localStorage.getItem("pw_locale") || "en" } catch { return "en" }
})()

// Synchronous locale store — populated by initLocale() before first render
let _messages = {}

/**
 * Initialise the locale system. Must be called before renderNav/initRouter.
 * @param {string} [lang]  - locale code, defaults to stored preference
 */
export async function initLocale(lang) {
  const target = lang || _locale
  _locale = target

  const base = LOCALES[target] || LOCALES['en']

  // For non-EN locales, merge with EN so missing keys fall through
  if (target !== 'en') {
    _messages = Object.assign({}, LOCALES['en'], base)
  } else {
    _messages = Object.assign({}, base)
  }

  try { localStorage.setItem("pw_locale", target) } catch {}
}

/**
 * Translate a key. Returns the translation or the key itself if not found.
 * @param {string} key
 * @returns {string}
 */
export function t(key) {
  return _messages[key] || key
}


/**
 * Get the active locale code.
 * @returns {string}
 */
export function getLocale() {
  return _locale
}

/**
 * Set the active locale and reinitialise translations.
 * @param {string} lang
 * @returns {Promise<void>}
 */
export async function setLocale(lang) {
  await initLocale(lang)
}

/**
 * Check whether a tier-2 locale is enabled via feature flag.
 * @param {string} lang
 * @returns {boolean}
 */
export function isTier2Enabled(lang) {
  const TIER2_FLAGS = { ur: "ENABLE_LOCALE_UR", fr: "ENABLE_LOCALE_FR", es: "ENABLE_LOCALE_ES" }
  const flag = TIER2_FLAGS[lang]
  if (!flag) return true // 'en' and 'ar' are always enabled
  try { return !!localStorage.getItem(flag) } catch { return false }
}
