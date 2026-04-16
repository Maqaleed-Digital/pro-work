'use strict'

/**
 * S39-G4 — Fee Transparency Service
 *
 * Computes employer and freelancer fee breakdowns for any contract value
 * and payment method. Structural policy: freelancer_commission_pct is
 * always 0 — WorkCaptain charges employers only.
 *
 * Pure functions — no I/O, no side effects. Safe to call in both API
 * handlers and frontend-side bundle (if ever imported).
 */

const path = require('path')
const fs   = require('fs')

const MATRIX_PATH = path.join(__dirname, '../../config/payments/psp_routing_matrix_v1.json')

// ── Load matrix once at module init ───────────────────────────────────────────

let _matrix = null

function getMatrix() {
  if (_matrix) return _matrix
  const raw = fs.readFileSync(MATRIX_PATH, 'utf8')
  _matrix = JSON.parse(raw)
  return _matrix
}

// ── Error helper ──────────────────────────────────────────────────────────────

function feeError(message, code) {
  const e = new Error(message)
  e.code = code
  return e
}

// ── Core calculation ──────────────────────────────────────────────────────────

/**
 * calculateFees(contractAmount, paymentMethodId, options?)
 *
 * Returns the complete fee breakdown for a contract.
 *
 * @param {number}  contractAmount    - Agreed contract value (gross, in currency units)
 * @param {string}  paymentMethodId   - One of the IDs in psp_routing_matrix_v1.json
 * @param {object}  [options]
 * @param {string}  [options.currency] - Currency code (default: 'SAR')
 * @param {object}  [options.matrix]   - Override matrix (for testing)
 *
 * @returns {{
 *   contractAmount:       number,
 *   currency:             string,
 *   paymentMethod:        object,
 *   freelancerCommission: number,   // always 0 — structural policy
 *   freelancerPayout:     number,   // always === contractAmount
 *   pspFeeAmount:         number,   // employer-side PSP fee
 *   platformFeeAmount:    number,   // employer-side platform fee
 *   employerTotalCost:    number,   // contractAmount + pspFee + platformFee
 *   payoutEtaLabel:       string,
 *   payoutEtaLabelAr:     string,
 *   payoutEtaDays:        { min: number, max: number },
 *   instant:              boolean,
 *   policy:               object,   // policy block from matrix
 * }}
 */
function calculateFees(contractAmount, paymentMethodId, options) {
  options = options || {}
  const matrix = options.matrix || getMatrix()
  const currency = options.currency || 'SAR'

  if (typeof contractAmount !== 'number' || !Number.isFinite(contractAmount) || contractAmount <= 0) {
    throw feeError('contractAmount must be a positive finite number', 'INVALID_AMOUNT')
  }

  if (!paymentMethodId || typeof paymentMethodId !== 'string') {
    throw feeError('paymentMethodId is required', 'INVALID_PAYMENT_METHOD')
  }

  const method = matrix.payment_methods.find(m => m.id === paymentMethodId)
  if (!method) {
    throw feeError(
      `Unknown payment method: "${paymentMethodId}". ` +
      `Valid: ${matrix.payment_methods.map(m => m.id).join(', ')}`,
      'UNKNOWN_PAYMENT_METHOD',
    )
  }

  if (!method.supported_currencies.includes(currency)) {
    throw feeError(
      `Payment method "${paymentMethodId}" does not support currency "${currency}". ` +
      `Supported: ${method.supported_currencies.join(', ')}`,
      'UNSUPPORTED_CURRENCY',
    )
  }

  const policy              = matrix.policy
  const freelancerCommPct   = policy.freelancer_commission_pct     // always 0
  const employerPlatformPct = policy.employer_platform_fee_pct     // 5%

  // Freelancer always gets 100% — structural guarantee
  const freelancerCommission = round2(contractAmount * freelancerCommPct / 100)
  const freelancerPayout     = round2(contractAmount - freelancerCommission)

  // Employer pays platform fee + PSP fee on top of contract amount
  const platformFeeAmount = round2(contractAmount * employerPlatformPct / 100)
  const pspFeeAmount      = round2(contractAmount * method.psp_fee_pct / 100)
  const employerTotalCost = round2(contractAmount + platformFeeAmount + pspFeeAmount)

  return {
    contractAmount,
    currency,
    paymentMethod:       method,
    freelancerCommission,
    freelancerPayout,
    pspFeeAmount,
    platformFeeAmount,
    employerTotalCost,
    payoutEtaLabel:    method.payout_eta_label,
    payoutEtaLabelAr:  method.payout_eta_label_ar,
    payoutEtaDays:     { min: method.payout_eta_days_min, max: method.payout_eta_days_max },
    instant:           method.instant,
    policy,
  }
}

/**
 * listPaymentMethods(currency?)
 *
 * Returns all payment methods, optionally filtered by supported currency.
 */
function listPaymentMethods(currency, matrixOverride) {
  const matrix = matrixOverride || getMatrix()
  const methods = matrix.payment_methods
  if (!currency) return methods
  return methods.filter(m => m.supported_currencies.includes(currency))
}

/**
 * getCompetitorComparison()
 *
 * Returns the competitor fee volatility comparison block for UI display.
 */
function getCompetitorComparison(matrixOverride) {
  const matrix = matrixOverride || getMatrix()
  return matrix.competitor_comparison
}

/**
 * getPolicy()
 *
 * Returns the fee policy block, including the structural 0% freelancer
 * commission guarantee.
 */
function getPolicy(matrixOverride) {
  const matrix = matrixOverride || getMatrix()
  return matrix.policy
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function round2(n) {
  return Math.round(n * 100) / 100
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  calculateFees,
  listPaymentMethods,
  getCompetitorComparison,
  getPolicy,
  round2,
}
