'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { createTapAdapter }      = require('../app/modules/payments/tap_adapter');
const { createHyperPayAdapter } = require('../app/modules/payments/hyperpay_adapter');
const { createPspRouter }       = require('../app/modules/payments/psp_router');

// ── test adapters ─────────────────────────────────────────────────────────────

function makeSandboxAdapters() {
  return {
    TAP:      createTapAdapter(     { env: { TAP_ENV:      'sandbox' } }),
    HYPERPAY: createHyperPayAdapter({ env: { HYPERPAY_ENV: 'sandbox' } }),
  };
}

function makeFailingAdapter(name) {
  return {
    pspName: name,
    isSandbox: true,
    async charge()       { throw new Error(`${name} charge failed (test)`); },
    async refund()       { throw new Error(`${name} refund failed (test)`); },
    async splitPayout()  { throw new Error(`${name} payout failed (test)`); },
    async getPayoutStatus() { throw new Error(`${name} status failed (test)`); },
  };
}

const CHARGE_PARAMS = { chargeId: 'ch-r-001', amount: 500, currency: 'SAR', paymentMethod: 'MADA' };
const PAYOUT_PARAMS = { payoutId: 'po-r-001', amount: 400, currency: 'SAR', recipientId: 'dest-001' };

// ── routing matrix ────────────────────────────────────────────────────────────

describe('PSP Router — routing matrix', () => {
  test('KSA buyer + MADA routes to TAP (primary)', async () => {
    const router = createPspRouter({ adapters: makeSandboxAdapters() });
    const result = await router.route({ buyerCountry: 'SA', paymentMethod: 'MADA', operation: 'charge', params: CHARGE_PARAMS });
    assert.equal(result._routing.psp_used,    'TAP');
    assert.equal(result._routing.used_fallback, false);
  });

  test('KSA buyer + VISA routes to TAP', async () => {
    const router = createPspRouter({ adapters: makeSandboxAdapters() });
    const params = { ...CHARGE_PARAMS, paymentMethod: 'VISA' };
    const result = await router.route({ buyerCountry: 'SA', paymentMethod: 'VISA', operation: 'charge', params });
    assert.equal(result._routing.psp_used, 'TAP');
  });

  test('KSA buyer + MASTERCARD routes to TAP', async () => {
    const router = createPspRouter({ adapters: makeSandboxAdapters() });
    const params = { ...CHARGE_PARAMS, paymentMethod: 'MASTERCARD' };
    const result = await router.route({ buyerCountry: 'SA', paymentMethod: 'MASTERCARD', operation: 'charge', params });
    assert.equal(result._routing.psp_used, 'TAP');
  });

  test('Global buyer (US) falls back to default PSP (STRIPE)', async () => {
    const adapters = {
      ...makeSandboxAdapters(),
      STRIPE: {
        pspName: 'STRIPE',
        async charge() { return { success: true, chargeId: 'ch-s-001', status: 'CAPTURED', pspRef: 'stripe_ref' }; },
      },
    };
    const router = createPspRouter({ adapters });
    const params = { ...CHARGE_PARAMS, paymentMethod: 'VISA' };
    const result = await router.route({ buyerCountry: 'US', paymentMethod: 'VISA', operation: 'charge', params });
    assert.equal(result._routing.psp_used, 'STRIPE');
    assert.equal(result._routing.rule_matched, 'DEFAULT');
  });

  test('unknown country routes to default PSP', async () => {
    const adapters = {
      ...makeSandboxAdapters(),
      STRIPE: {
        pspName: 'STRIPE',
        async charge() { return { success: true, pspRef: 'stripe_x' }; },
      },
    };
    const router = createPspRouter({ adapters });
    const result = await router.route({ buyerCountry: 'XX', paymentMethod: 'VISA', operation: 'charge', params: { ...CHARGE_PARAMS, paymentMethod: 'VISA' } });
    assert.equal(result._routing.psp_used, 'STRIPE');
  });
});

// ── fallback logic ────────────────────────────────────────────────────────────

describe('PSP Router — fallback', () => {
  test('KSA + MADA falls back to HYPERPAY when TAP fails', async () => {
    const adapters = {
      TAP:      makeFailingAdapter('TAP'),
      HYPERPAY: createHyperPayAdapter({ env: { HYPERPAY_ENV: 'sandbox' } }),
    };
    const router = createPspRouter({ adapters });
    const result = await router.route({ buyerCountry: 'SA', paymentMethod: 'MADA', operation: 'charge', params: CHARGE_PARAMS });
    assert.equal(result._routing.psp_used,    'HYPERPAY');
    assert.equal(result._routing.used_fallback, true);
  });

  test('throws when both primary and fallback fail', async () => {
    const adapters = { TAP: makeFailingAdapter('TAP'), HYPERPAY: makeFailingAdapter('HYPERPAY') };
    const router   = createPspRouter({ adapters });
    await assert.rejects(
      () => router.route({ buyerCountry: 'SA', paymentMethod: 'MADA', operation: 'charge', params: CHARGE_PARAMS }),
      /Error/
    );
  });
});

// ── routing audit log ─────────────────────────────────────────────────────────

describe('PSP Router — routing audit log', () => {
  test('every routing decision is logged via logService', async () => {
    const logs  = [];
    const router = createPspRouter({
      adapters:   makeSandboxAdapters(),
      logService: { log: entry => logs.push(entry) },
    });
    await router.route({ buyerCountry: 'SA', paymentMethod: 'MADA', operation: 'charge', params: CHARGE_PARAMS });
    assert.ok(logs.length >= 1, 'at least one log entry');
    const entry = logs[0];
    assert.ok(entry.psp_used,     'psp_used present in log');
    assert.ok(entry.payment_method, 'payment_method present in log');
    assert.ok(entry.logged_at,    'logged_at present in log');
  });

  test('log entry contains outcome field', async () => {
    const logs  = [];
    const router = createPspRouter({
      adapters:   makeSandboxAdapters(),
      logService: { log: entry => logs.push(entry) },
    });
    await router.route({ buyerCountry: 'SA', paymentMethod: 'MADA', operation: 'charge', params: CHARGE_PARAMS });
    assert.ok(logs[0].outcome, 'outcome present in log entry');
  });
});

// ── circuit breaker ───────────────────────────────────────────────────────────

describe('PSP Router — circuit breaker', () => {
  test('circuit breaker opens after 3 failures within window', async () => {
    const adapters = { TAP: makeFailingAdapter('TAP'), HYPERPAY: makeFailingAdapter('HYPERPAY') };
    const router   = createPspRouter({ adapters });

    // Force 3 failures to open TAP circuit
    for (let i = 0; i < 3; i++) {
      await router.route({ buyerCountry: 'SA', paymentMethod: 'MADA', operation: 'charge', params: CHARGE_PARAMS })
        .catch(() => {});
    }

    const state = router.getCircuitBreakerState('TAP');
    assert.equal(state.state, 'OPEN', 'TAP circuit should be OPEN after 3 failures');
  });

  test('circuit breaker rejects requests when OPEN (no fallback)', async () => {
    // Use a route with no fallback (SA+VISA → TAP only)
    const adapters = { TAP: makeFailingAdapter('TAP') };
    const router   = createPspRouter({ adapters });
    const params   = { ...CHARGE_PARAMS, paymentMethod: 'VISA' };

    // Burn 3 failures to open circuit
    for (let i = 0; i < 3; i++) {
      await router.route({ buyerCountry: 'SA', paymentMethod: 'VISA', operation: 'charge', params })
        .catch(() => {});
    }

    // 4th call: circuit is OPEN — should get CIRCUIT_OPEN or failure
    await assert.rejects(
      () => router.route({ buyerCountry: 'SA', paymentMethod: 'VISA', operation: 'charge', params }),
      /Error/
    );
  });

  test('getCircuitBreakerState returns state object for known PSP', () => {
    const router = createPspRouter({ adapters: makeSandboxAdapters() });
    const state  = router.getCircuitBreakerState('TAP');
    assert.ok(state,              'state object returned');
    assert.equal(state.psp,       'TAP');
    assert.equal(state.state,     'CLOSED');
    assert.equal(state.failures,   0);
  });

  test('getCircuitBreakerState returns null for unknown PSP', () => {
    const router = createPspRouter({ adapters: makeSandboxAdapters() });
    assert.equal(router.getCircuitBreakerState('UNKNOWN'), null);
  });
});

// ── factory validation ────────────────────────────────────────────────────────

describe('PSP Router — factory validation', () => {
  test('throws when no adapters provided', () => {
    assert.throws(() => createPspRouter({ adapters: {} }), /PspRouterError/);
  });

  test('MATRIX exposes policy version', () => {
    const router = createPspRouter({ adapters: makeSandboxAdapters() });
    assert.ok(router.MATRIX.version, 'MATRIX.version present');
  });
});
