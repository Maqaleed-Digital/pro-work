'use strict'

/**
 * S39-G4 — Fee Transparency API Router
 *
 * Routes:
 *   GET  /api/payments/fee-transparency/policy
 *   GET  /api/payments/fee-transparency/methods[?currency=SAR]
 *   POST /api/payments/fee-transparency/calculate
 *        body: { contract_amount, payment_method_id, currency? }
 *   GET  /api/payments/fee-transparency/competitor-comparison
 */

const {
  calculateFees,
  listPaymentMethods,
  getCompetitorComparison,
  getPolicy,
} = require('../modules/payments/fee_transparency_service')

function ok(res, data) {
  const body = JSON.stringify({ ok: true, data })
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

function fail(res, code, message, status) {
  const body = JSON.stringify({ ok: false, error: { code, message } })
  res.writeHead(status || 400, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

/**
 * createFeeTransparencyRouter()
 *
 * Returns a router with a single .handle(req, res, pathname, method, body) interface.
 * body is pre-parsed JSON (or null for GET requests).
 */
function createFeeTransparencyRouter() {
  return {
    handle(req, res, pathname, method, body) {
      // GET /api/payments/fee-transparency/policy
      if (pathname === '/api/payments/fee-transparency/policy' && method === 'GET') {
        return ok(res, getPolicy())
      }

      // GET /api/payments/fee-transparency/competitor-comparison
      if (pathname === '/api/payments/fee-transparency/competitor-comparison' && method === 'GET') {
        return ok(res, getCompetitorComparison())
      }

      // GET /api/payments/fee-transparency/methods
      if (pathname === '/api/payments/fee-transparency/methods' && method === 'GET') {
        const urlObj = new URL(req.url, 'http://x')
        const currency = urlObj.searchParams.get('currency') || undefined
        return ok(res, listPaymentMethods(currency))
      }

      // POST /api/payments/fee-transparency/calculate
      if (pathname === '/api/payments/fee-transparency/calculate' && method === 'POST') {
        if (!body) return fail(res, 'MISSING_BODY', 'Request body required', 400)

        const { contract_amount, payment_method_id, currency } = body

        if (contract_amount === undefined || contract_amount === null) {
          return fail(res, 'VALIDATION_ERROR', 'contract_amount is required', 422)
        }
        const amount = Number(contract_amount)
        if (!Number.isFinite(amount) || amount <= 0) {
          return fail(res, 'VALIDATION_ERROR', 'contract_amount must be a positive number', 422)
        }
        if (!payment_method_id) {
          return fail(res, 'VALIDATION_ERROR', 'payment_method_id is required', 422)
        }

        try {
          const result = calculateFees(amount, payment_method_id, { currency: currency || 'SAR' })
          return ok(res, result)
        } catch (e) {
          const status = e.code === 'INVALID_AMOUNT' ? 422
            : e.code === 'UNKNOWN_PAYMENT_METHOD' ? 422
            : e.code === 'UNSUPPORTED_CURRENCY' ? 422
            : 500
          return fail(res, e.code || 'FEE_CALC_ERROR', e.message, status)
        }
      }

      return fail(res, 'NOT_FOUND', 'Route not found', 404)
    },
  }
}

module.exports = { createFeeTransparencyRouter }
