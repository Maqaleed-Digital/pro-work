'use strict'

/**
 * WC-06: Invoice mechanism config.
 *
 * These are config-overridable DEFAULTS, not ratified commercial/tax decisions.
 * The authoritative VAT rate and currency live in Register B / config; the build
 * must not depend on these values being "correct" — they are placeholders that a
 * deployment overrides via env. 0.15 happens to be the KSA standard rate, but it
 * is supplied here only as a default and is overridable per-request.
 */
const DEFAULT_VAT_RATE = process.env.WC_VAT_RATE ? Number(process.env.WC_VAT_RATE) : 0.15
const DEFAULT_CURRENCY = process.env.WC_INVOICE_CURRENCY || 'SAR'

module.exports = { DEFAULT_VAT_RATE, DEFAULT_CURRENCY }
