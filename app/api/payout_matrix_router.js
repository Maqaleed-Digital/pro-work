'use strict';

const path = require('path');
const fs   = require('fs');

const MATRIX = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../config/payments/psp_routing_matrix_v1.json'),
    'utf8'
  )
);

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.name = 'PayoutMatrixRouterError';
    throw err;
  }
}

/**
 * createPayoutMatrixRouter()
 *
 * Routes:
 *   GET /payments/payout-matrix?country=SA&method=MADA
 *     Returns: fees, ETA, currency, cut-off, instant availability
 *
 *   GET /payments/payout-matrix
 *     Returns: full matrix for all countries/methods
 */
function createPayoutMatrixRouter() {
  return {
    async handle({ method, path: reqPath, query }) {
      if (method !== 'GET' || reqPath !== '/payments/payout-matrix') {
        return { status: 404, body: { error: 'NOT_FOUND' } };
      }

      const country  = (query && query.country) ? String(query.country).toUpperCase() : null;
      const pmMethod = (query && query.method)  ? String(query.method).toUpperCase()  : null;

      if (country && pmMethod) {
        const countryMatrix = MATRIX.payoutMatrix[country] || MATRIX.payoutMatrix.DEFAULT;
        const entry = countryMatrix && countryMatrix[pmMethod];
        if (!entry) {
          return { status: 404, body: { error: 'METHOD_NOT_FOUND', country, method: pmMethod } };
        }
        return {
          status: 200,
          body: {
            country,
            method: pmMethod,
            ...entry,
            policy_version: MATRIX.version,
          },
        };
      }

      // Return full matrix
      return {
        status: 200,
        body: {
          payout_matrix:    MATRIX.payoutMatrix,
          routing_rules:    MATRIX.routing.rules,
          supported_methods: MATRIX.supportedMethods,
          policy_version:   MATRIX.version,
        },
      };
    },
  };
}

module.exports = { createPayoutMatrixRouter };
