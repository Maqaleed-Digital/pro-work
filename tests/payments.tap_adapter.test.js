'use strict';

/**
 * TAP_ENV=sandbox node --test tests/payments.tap_adapter.test.js
 * All tests run in sandbox mode — no real HTTP calls, no real money movement.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { createTapAdapter } = require('../app/modules/payments/tap_adapter');

// All tests use sandbox env — set via TAP_ENV=sandbox or injected directly
const SANDBOX_ENV = { TAP_ENV: 'sandbox' };

// ── factory / sandbox mode ────────────────────────────────────────────────────

describe('Tap adapter — sandbox mode', () => {
  test('creates adapter in sandbox mode when TAP_ENV=sandbox', () => {
    const adapter = createTapAdapter({ env: SANDBOX_ENV });
    assert.equal(adapter.isSandbox, true);
    assert.equal(adapter.pspName, 'TAP');
  });

  test('sandbox mode does not require TAP_API_KEY or TAP_WEBHOOK_SECRET', () => {
    // Should not throw even without credentials
    assert.doesNotThrow(() => createTapAdapter({ env: { TAP_ENV: 'sandbox' } }));
  });

  test('production mode throws when TAP_API_KEY is missing', () => {
    assert.throws(
      () => createTapAdapter({ env: { TAP_ENV: 'production' } }),
      /TAP_API_KEY/
    );
  });

  test('production mode throws when TAP_WEBHOOK_SECRET is missing', () => {
    assert.throws(
      () => createTapAdapter({ env: { TAP_ENV: 'production', TAP_API_KEY: 'key' } }),
      /TAP_WEBHOOK_SECRET/
    );
  });
});

// ── charge ────────────────────────────────────────────────────────────────────

describe('Tap adapter — charge()', () => {
  test('charge() in sandbox returns success with pspRef', async () => {
    const adapter = createTapAdapter({ env: SANDBOX_ENV });
    const result  = await adapter.charge({ chargeId: 'ch-001', amount: 100, currency: 'SAR', paymentMethod: 'MADA' });
    assert.equal(result.success, true);
    assert.ok(result.pspRef,  'pspRef present');
    assert.equal(result.status, 'CAPTURED');
  });

  test('charge() with MADA (KSA-specific method) succeeds', async () => {
    const adapter = createTapAdapter({ env: SANDBOX_ENV });
    const result  = await adapter.charge({ chargeId: 'ch-002', amount: 500, currency: 'SAR', paymentMethod: 'MADA' });
    assert.equal(result.success, true);
  });

  test('charge() with VISA succeeds', async () => {
    const adapter = createTapAdapter({ env: SANDBOX_ENV });
    const result  = await adapter.charge({ chargeId: 'ch-003', amount: 200, currency: 'SAR', paymentMethod: 'VISA' });
    assert.equal(result.success, true);
  });

  test('charge() with APPLEPAY succeeds', async () => {
    const adapter = createTapAdapter({ env: SANDBOX_ENV });
    const result  = await adapter.charge({ chargeId: 'ch-004', amount: 150, currency: 'SAR', paymentMethod: 'APPLEPAY' });
    assert.equal(result.success, true);
  });

  test('charge() with STCPAY succeeds', async () => {
    const adapter = createTapAdapter({ env: SANDBOX_ENV });
    const result  = await adapter.charge({ chargeId: 'ch-005', amount: 75, currency: 'SAR', paymentMethod: 'STCPAY' });
    assert.equal(result.success, true);
  });

  test('charge() with unsupported payment method throws TapAdapterError', async () => {
    const adapter = createTapAdapter({ env: SANDBOX_ENV });
    await assert.rejects(
      () => adapter.charge({ chargeId: 'ch-006', amount: 100, currency: 'SAR', paymentMethod: 'BANKTRANSFER' }),
      /TapAdapterError/
    );
  });

  test('charge() with zero amount throws TapAdapterError', async () => {
    const adapter = createTapAdapter({ env: SANDBOX_ENV });
    await assert.rejects(
      () => adapter.charge({ chargeId: 'ch-007', amount: 0, currency: 'SAR', paymentMethod: 'VISA' }),
      /TapAdapterError/
    );
  });

  test('charge() with negative amount throws TapAdapterError', async () => {
    const adapter = createTapAdapter({ env: SANDBOX_ENV });
    await assert.rejects(
      () => adapter.charge({ chargeId: 'ch-008', amount: -50, currency: 'SAR', paymentMethod: 'VISA' }),
      /TapAdapterError/
    );
  });

  test('charge() result contains pspResponse object', async () => {
    const adapter = createTapAdapter({ env: SANDBOX_ENV });
    const result  = await adapter.charge({ chargeId: 'ch-009', amount: 300, currency: 'SAR', paymentMethod: 'MASTERCARD' });
    assert.ok(result.pspResponse && typeof result.pspResponse === 'object', 'pspResponse is an object');
  });
});

// ── refund ────────────────────────────────────────────────────────────────────

describe('Tap adapter — refund()', () => {
  test('refund() in sandbox returns success with pspRef', async () => {
    const adapter = createTapAdapter({ env: SANDBOX_ENV });
    const result  = await adapter.refund({ refundId: 'rf-001', chargeId: 'ch-001', amount: 100, currency: 'SAR' });
    assert.equal(result.success, true);
    assert.ok(result.pspRef);
    assert.equal(result.status, 'REFUNDED');
  });

  test('refund() with zero amount throws', async () => {
    const adapter = createTapAdapter({ env: SANDBOX_ENV });
    await assert.rejects(
      () => adapter.refund({ refundId: 'rf-002', chargeId: 'ch-001', amount: 0, currency: 'SAR' }),
      /TapAdapterError/
    );
  });

  test('refund() result echoes chargeId', async () => {
    const adapter  = createTapAdapter({ env: SANDBOX_ENV });
    const result   = await adapter.refund({ refundId: 'rf-003', chargeId: 'ch-abc', amount: 50, currency: 'SAR' });
    assert.equal(result.chargeId, 'ch-abc');
  });
});

// ── splitPayout ───────────────────────────────────────────────────────────────

describe('Tap adapter — splitPayout()', () => {
  test('splitPayout() in sandbox returns payout with etaMinutes', async () => {
    const adapter = createTapAdapter({ env: SANDBOX_ENV });
    const result  = await adapter.splitPayout({ payoutId: 'po-001', amount: 500, currency: 'SAR', recipientId: 'dest-001' });
    assert.equal(result.success, true);
    assert.ok(result.pspRef);
    assert.ok(typeof result.etaMinutes === 'number', 'etaMinutes is a number');
  });

  test('splitPayout() MENA SLA: etaMinutes <= 30 for SAR/mada route', async () => {
    const adapter = createTapAdapter({ env: SANDBOX_ENV });
    const result  = await adapter.splitPayout({ payoutId: 'po-002', amount: 1000, currency: 'SAR', recipientId: 'dest-002' });
    assert.ok(result.etaMinutes <= 30, `etaMinutes should be ≤30, got ${result.etaMinutes}`);
  });
});

// ── getPayoutStatus ───────────────────────────────────────────────────────────

describe('Tap adapter — getPayoutStatus()', () => {
  test('getPayoutStatus() in sandbox returns status and pspRef', async () => {
    const adapter = createTapAdapter({ env: SANDBOX_ENV });
    const result  = await adapter.getPayoutStatus('po-001');
    assert.ok(result.status, 'status present');
    assert.ok(result.pspRef, 'pspRef present');
    assert.equal(result.payoutId, 'po-001');
  });

  test('getPayoutStatus() throws when payoutId missing', async () => {
    const adapter = createTapAdapter({ env: SANDBOX_ENV });
    await assert.rejects(() => adapter.getPayoutStatus(null), /TapAdapterError/);
  });
});

// ── webhookVerify ─────────────────────────────────────────────────────────────

describe('Tap adapter — webhookVerify()', () => {
  test('webhookVerify() returns true for valid HMAC-SHA256 signature', () => {
    const secret   = 'test-webhook-secret';
    const body     = JSON.stringify({ event: 'CHARGE.CAPTURED', id: 'ch-001' });
    const sig      = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const adapter  = createTapAdapter({ env: { TAP_ENV: 'sandbox', TAP_WEBHOOK_SECRET: secret } });
    assert.equal(adapter.webhookVerify(body, sig), true);
  });

  test('webhookVerify() returns false for invalid signature', () => {
    const adapter = createTapAdapter({ env: SANDBOX_ENV });
    assert.equal(adapter.webhookVerify('{"event":"CHARGE.CAPTURED"}', 'bad_sig'), false);
  });

  test('webhookVerify() returns false for empty signature', () => {
    const adapter = createTapAdapter({ env: SANDBOX_ENV });
    assert.equal(adapter.webhookVerify('{"event":"CHARGE.CAPTURED"}', ''), false);
  });

  test('webhookVerify() returns false for null body', () => {
    const adapter = createTapAdapter({ env: SANDBOX_ENV });
    assert.equal(adapter.webhookVerify(null, 'some_sig'), false);
  });
});

// ── supported methods ─────────────────────────────────────────────────────────

describe('Tap adapter — supported methods', () => {
  test('SUPPORTED_METHODS includes MADA, VISA, MASTERCARD, APPLEPAY, STCPAY', () => {
    const adapter = createTapAdapter({ env: SANDBOX_ENV });
    const methods = adapter.SUPPORTED_METHODS;
    ['MADA', 'VISA', 'MASTERCARD', 'APPLEPAY', 'STCPAY'].forEach(m => {
      assert.ok(methods.includes(m), `${m} should be supported`);
    });
  });

  test('WEBHOOK_EVENTS includes CHARGE.CREATED, CHARGE.CAPTURED, PAYOUT.PAID, PAYOUT.FAILED', () => {
    const adapter = createTapAdapter({ env: SANDBOX_ENV });
    ['CHARGE.CREATED', 'CHARGE.CAPTURED', 'PAYOUT.PAID', 'PAYOUT.FAILED'].forEach(evt => {
      assert.ok(adapter.WEBHOOK_EVENTS.includes(evt), `${evt} event should be declared`);
    });
  });
});
