// S36-G5: RTL utility — replaces useRTL.ts from spec (vanilla JS, no React)
// Used by layout components to set dir attribute and select logical CSS.
// BRD Refs: Gold BRD A6, Consolidated §5.2
//
// Usage:
//   import { getDir, isRTL, getLocale } from "./hooks/rtl.js"
//   document.documentElement.setAttribute("dir", getDir())
//   document.documentElement.setAttribute("lang", getLocale())

import { getLocale as _getLocale } from "../locale.js"

const RTL_LOCALES = new Set(["ar", "he", "fa", "ur"])

/**
 * Returns true if the current locale is right-to-left.
 * @returns {boolean}
 */
export function isRTL() {
  return RTL_LOCALES.has(_getLocale())
}

/**
 * Returns the CSS dir value for the current locale.
 * @returns {'rtl' | 'ltr'}
 */
export function getDir() {
  return isRTL() ? "rtl" : "ltr"
}

/**
 * Returns the current locale string (e.g. 'en', 'ar').
 * @returns {string}
 */
export function getLocale() {
  return _getLocale()
}

/**
 * Apply dir and lang attributes to <html> element.
 * Call on locale change and on initial load.
 */
export function applyDocumentLocale() {
  const dir    = getDir()
  const locale = getLocale()
  document.documentElement.setAttribute("dir",  dir)
  document.documentElement.setAttribute("lang", locale)
}
