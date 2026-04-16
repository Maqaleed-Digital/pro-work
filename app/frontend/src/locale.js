// S36-G5: Locale module — translation key lookup + locale management
// BRD Refs: Gold BRD A6, Consolidated §5.2
//
// Tier-2 locales (ur, fr, es) are feature-flagged — empty values fall through to 'en'.
// Arabic (ar) is fully translated and enabled by default for KSA deployments.
//
// Usage:
//   import { t, getLocale, setLocale } from "./locale.js"
//   t("nav.dashboard")        // → "Dashboard" (en) or "لوحة التحكم" (ar)
//   setLocale("ar")
//   t("common.approve")       // → "موافقة"

// Feature flags for tier-2 locales — set via localStorage or env
const TIER2_FLAGS = {
  ur: "ENABLE_LOCALE_UR",
  fr: "ENABLE_LOCALE_FR",
  es: "ENABLE_LOCALE_ES",
}

// Locale registry — populated lazily on first use
const _localeCache = {}

// Active locale — default 'en', overridable
let _locale = (() => {
  try { return localStorage.getItem("pw_locale") || "en" } catch { return "en" }
})()

/**
 * Load a locale JSON file. In the browser this is a static import;
 * in test/Node environments this resolves from the filesystem.
 * Uses a synchronous require() when available (Node), dynamic import otherwise.
 */
async function _loadLocale(lang) {
  if (_localeCache[lang]) return _localeCache[lang]
  try {
    // Node.js environment (tests, check-translations.js)
    if (typeof require !== "undefined") {
      const data = require("./locales/" + lang + ".json")
      _localeCache[lang] = data
      return data
    }
    // Browser — locales are bundled by Vite as static JSON assets
    const mod = await import("./locales/" + lang + ".json", { assert: { type: "json" } })
    _localeCache[lang] = mod.default || mod
    return _localeCache[lang]
  } catch {
    _localeCache[lang] = {}
    return {}
  }
}

// Synchronous locale store — populated by initLocale() before first render
let _messages = {}

/**
 * Initialise the locale system. Must be called before renderNav/initRouter.
 * @param {string} [lang]  - locale code, defaults to stored preference
 */
export async function initLocale(lang) {
  const target = lang || _locale
  _locale = target
  _messages = await _loadLocale(target)
  // Fallback to EN for tier-2 locales with empty values
  if (target !== "en") {
    const en = await _loadLocale("en")
    for (const key of Object.keys(en)) {
      if (!_messages[key]) _messages[key] = en[key]
    }
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
  const flag = TIER2_FLAGS[lang]
  if (!flag) return true // 'en' and 'ar' are always enabled
  try { return !!localStorage.getItem(flag) } catch { return false }
}
