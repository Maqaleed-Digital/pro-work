'use strict';

/**
 * psp_router.js — MENA PSP routing with circuit breaker
 *
 * Routing matrix (from psp_routing_matrix_v1.json):
 *   KSA (SA) buyer + MADA   → TAP (primary), HYPERPAY (fallback)
 *   KSA (SA) buyer + VISA   → TAP
 *   KSA (SA) buyer + MC     → TAP
 *   Global buyer             → STRIPE (default — passed through)
 *
 * Circuit breaker:
 *   3 failures within 60s → OPEN → subsequent calls rejected immediately
 *   After 120s reset timeout → HALF_OPEN → allow one trial request
 *   Trial succeeds → CLOSED; trial fails → OPEN again
 *
 * Every routing decision is logged via injected logService.
 */

const path = require('path');
const fs   = require('fs');

const MATRIX = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../config/payments/psp_routing_matrix_v1.json'),
    'utf8'
  )
);

const CB_CONFIG = MATRIX.circuitBreaker;

function routerError(message, code) {
  const err = new Error(message);
  err.name  = 'PspRouterError';
  err.code  = code || 'ROUTER_ERROR';
  return err;
}

function assert(condition, message, code) {
  if (!condition) throw routerError(message, code);
}

function nowMs() { return Date.now(); }

// ── Circuit Breaker ───────────────────────────────────────────────────────────

function createCircuitBreaker(pspName, config) {
  let state       = 'CLOSED';    // CLOSED | OPEN | HALF_OPEN
  let failures    = [];          // timestamps of recent failures
  let openedAt    = null;

  function recordFailure() {
    const now = nowMs();
    failures.push(now);
    // Prune failures outside the window
    failures = failures.filter(t => now - t < config.windowSeconds * 1000);
    if (failures.length >= config.failureThreshold) {
      state    = 'OPEN';
      openedAt = now;
    }
  }

  function recordSuccess() {
    failures = [];
    state    = 'CLOSED';
    openedAt = null;
  }

  function isAvailable() {
    if (state === 'CLOSED') return true;
    if (state === 'OPEN') {
      const elapsed = nowMs() - openedAt;
      if (elapsed >= config.resetTimeoutSeconds * 1000) {
        state = 'HALF_OPEN';
        return true;   // allow one trial
      }
      return false;
    }
    if (state === 'HALF_OPEN') return true;  // allow the trial
    return false;
  }

  return {
    get state()    { return state; },
    get failures() { return failures.length; },
    pspName,
    isAvailable,
    recordFailure,
    recordSuccess,
  };
}

// ── routing logic ─────────────────────────────────────────────────────────────

function resolveRule(buyerCountry, paymentMethod) {
  const method = String(paymentMethod || '').toUpperCase();
  const country = String(buyerCountry || '').toUpperCase();
  return MATRIX.routing.rules.find(r => r.buyerCountry === country && r.paymentMethod === method) || null;
}

// ── service factory ───────────────────────────────────────────────────────────

/**
 * createPspRouter({ adapters, logService })
 *
 * @param adapters   — { TAP: tapAdapter, HYPERPAY: hyperPayAdapter, STRIPE?: stripeAdapter }
 * @param logService — optional { log(entry) } — called for every routing decision
 *
 * Returns: { route, getCircuitBreakerState, MATRIX }
 */
function createPspRouter({ adapters, logService }) {
  assert(adapters && typeof adapters === 'object', 'adapters is required');
  assert(Object.keys(adapters).length > 0, 'at least one adapter must be registered');

  const breakers = {};
  Object.keys(adapters).forEach(name => {
    breakers[name] = createCircuitBreaker(name, CB_CONFIG);
  });

  function log(entry) {
    if (logService && typeof logService.log === 'function') {
      logService.log({ ...entry, logged_at: new Date().toISOString() });
    }
  }

  /**
   * route({ buyerCountry, paymentMethod, operation, params })
   *
   * Routes the operation to the correct PSP adapter, applying circuit breaker
   * and fallback logic.
   *
   * @param operation  — 'charge' | 'refund' | 'splitPayout' | 'getPayoutStatus'
   * @param params     — passed directly to the adapter method
   *
   * @returns adapter result with `_routing` metadata attached
   */
  async function route({ buyerCountry, paymentMethod, operation, params }) {
    assert(operation, 'operation is required');
    assert(params,    'params is required');

    const rule         = resolveRule(buyerCountry, paymentMethod);
    const primaryName  = rule ? rule.primaryPsp  : MATRIX.routing.defaultPsp;
    const fallbackName = rule ? rule.fallbackPsp  : null;

    const routing = {
      buyer_country:   buyerCountry    || null,
      payment_method:  paymentMethod   || null,
      rule_matched:    rule ? `${buyerCountry}+${paymentMethod}` : 'DEFAULT',
      primary_psp:     primaryName,
      fallback_psp:    fallbackName    || null,
      operation,
    };

    // Try primary
    const primaryBreaker = breakers[primaryName];
    if (primaryBreaker && primaryBreaker.isAvailable()) {
      try {
        const adapter = adapters[primaryName];
        assert(adapter, `No adapter registered for PSP: ${primaryName}`, 'ADAPTER_NOT_FOUND');
        const result = await adapter[operation](params);
        primaryBreaker.recordSuccess();
        log({ ...routing, psp_used: primaryName, outcome: 'SUCCESS' });
        return { ...result, _routing: { ...routing, psp_used: primaryName, used_fallback: false } };
      } catch (err) {
        if (err.name === 'PspRouterError') throw err;  // routing errors re-throw immediately
        primaryBreaker.recordFailure();
        log({ ...routing, psp_used: primaryName, outcome: 'FAILURE', error: err.message });

        if (!fallbackName) throw err;  // no fallback available
      }
    } else if (primaryBreaker) {
      log({ ...routing, psp_used: primaryName, outcome: 'CIRCUIT_OPEN', circuit_state: primaryBreaker.state });
      if (!fallbackName) throw routerError(`PSP ${primaryName} circuit breaker is OPEN — no fallback available`, 'CIRCUIT_OPEN');
    }

    // Try fallback
    if (fallbackName) {
      const fallbackBreaker = breakers[fallbackName];
      if (!fallbackBreaker || !fallbackBreaker.isAvailable()) {
        throw routerError(`Both primary (${primaryName}) and fallback (${fallbackName}) PSPs unavailable`, 'ALL_PSPS_DOWN');
      }
      try {
        const adapter = adapters[fallbackName];
        assert(adapter, `No adapter registered for fallback PSP: ${fallbackName}`, 'ADAPTER_NOT_FOUND');
        const result = await adapter[operation](params);
        fallbackBreaker.recordSuccess();
        log({ ...routing, psp_used: fallbackName, outcome: 'FALLBACK_SUCCESS' });
        return { ...result, _routing: { ...routing, psp_used: fallbackName, used_fallback: true } };
      } catch (fallbackErr) {
        fallbackBreaker.recordFailure();
        log({ ...routing, psp_used: fallbackName, outcome: 'FALLBACK_FAILURE', error: fallbackErr.message });
        throw fallbackErr;
      }
    }

    throw routerError(`No PSP route available for ${buyerCountry}+${paymentMethod}`, 'NO_ROUTE');
  }

  function getCircuitBreakerState(pspName) {
    const cb = breakers[pspName];
    if (!cb) return null;
    return { psp: pspName, state: cb.state, failures: cb.failures };
  }

  function getAllCircuitBreakerStates() {
    return Object.keys(breakers).map(name => getCircuitBreakerState(name));
  }

  return { route, getCircuitBreakerState, getAllCircuitBreakerStates, MATRIX };
}

module.exports = { createPspRouter };
