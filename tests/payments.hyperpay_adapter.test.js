'use strict';

/**
 * HYPERPAY_ENV=sandbox node --test tests/payments.hyperpay_adapter.test.js
 * All tests run in sandbox mode — no real HTTP calls, no real money movement.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { createHyperPayAdapter } = require('../app/modules/payments/hyperpay_adapter');

const SANDBOX_ENV = { HYPERPAY_ENV: 'sandbox' };

// ── factory / sandbox mode ────────────────────────────────────────────────────

describe('HyperPay adapter — sandbox mode', () => {
  test('creates adapter in sandbox mode when HYPERPAY_ENV=sandbox', () => {
    const adapter = createHyperPayAdapter({ env: SANDBOX_ENV });
    assert.equal(adapter.isSandbox, true);
    assert.equal(adapter.pspName, 'HYPERPAY');
  });

  test('sandbox mode does not require HYPERPAY_ENTITY_ID or ACCESS_TOKEN', () => {
    assert.doesNotThrow(() => createHyperPayAdapter({ env: { HYPERPAY_ENV: 'sandbox' } }));
  });

  test('production mode throws when HYPERPAY_ENTITY_ID is missing', () => {
    assert.throws(
      () => createHyperPayAdapter({ env: { HYPERPAY_ENV: 'production' } }),
      /HYPERPAY_ENTITY_ID/
    );
  });

  test('production mode throws when HYPERPAY_ACCESS_TOKEN is missing', () => {
    assert.throws(
      () => createHyperPayAdapter({ env: { HYPERPAY_ENV: 'production', HYPERPAY_ENTITY_ID: 'eid' } }),
      /HYPERPAY_ACCESS_TOKEN/
    );
  });

  test('production mode throws when HYPERPAY_WEBHOOK_SECRET is missing', () => {
    assert.throws(
      () => createHyperPayAdapter({ env: { HYPERPAY_ENV: 'production', HYPERPAY_ENTITY_ID: 'eid', HYPERPAY_ACCESS_TOKEN: 'tok' } }),
      /HYPERPAY_WEBHOOK_SECRET/
    );
  });
});

// ── charge ────────────────────────────────────────────────────────────────────

describe('HyperPay adapter — charge()', () => {
  test('charge() in sandbox returns success', async () => {
    const adapter = createHyperPayAdapter({ env: SANDBOX_ENV });
    const result  = await adapter.charge({ chargeId: 'hp-ch-001', amount: 200, currency: 'SAR', paymentMethod: 'MADA' });
    assert.equal(result.success, true);
    assert.ok(result.pspRef);
    assert.equal(result.status, 'CAPTURED');
  });

  test('charge() with MADA (KSA debit) succeeds', async () => {
    const adapter = createHyperPayAdapter({ env: SANDBOX_ENV });
    const result  = await adapter.charge({ chargeId: 'hp-ch-002', amount: 100, currency: 'SAR', paymentMethod: 'MADA' });
    assert.equal(result.success, true);
  });

  test('charge() with VISA succeeds', async () => {
    const adapter = createHyperPayAdapter({ env: SANDBOX_ENV });
    const result  = await adapter.charge({ chargeId: 'hp-ch-003', amount: 300, currency: 'SAR', paymentMethod: 'VISA' });
    assert.equal(result.success, true);
  });

  test('charge() with MASTERCARD succeeds', async () => {
    const adapter = createHyperPayAdapter({ env: SANDBOX_ENV });
    const result  = await adapter.charge({ chargeId: 'hp-ch-004', amount: 450, currency: 'SAR', paymentMethod: 'MASTERCARD' });
    assert.equal(result.success, true);
  });

  test('charge() with APPLEPAY throws — not supported by HyperPay', async () => {
    const adapter = createHyperPayAdapter({ env: SANDBOX_ENV });
    await assert.rejects(
      () => adapter.charge({ chargeId: 'hp-ch-005', amount: 100, currency: 'SAR', paymentMethod: 'APPLEPAY' }),
      /HyperPayAdapterError/
    );
  });

  test('charge() with STCPAY throws — not supported by HyperPay', async () => {
    const adapter = createHyperPayAdapter({ env: SANDBOX_ENV });
    await assert.rejects(
      () => adapter.charge({ chargeId: 'hp-ch-006', amount: 100, currency: 'SAR', paymentMethod: 'STCPAY' }),
      /HyperPayAdapterError/
    );
  });

  test('charge() with zero amount throws HyperPayAdapterError', async () => {
    const adapter = createHyperPayAdapter({ env: SANDBOX_ENV });
    await assert.rejects(
      () => adapter.charge({ chargeId: 'hp-ch-007', amount: 0, currency: 'SAR', paymentMethod: 'VISA' }),
      /HyperPayAdapterError/
    );
  });

  test('charge() with negative amount throws HyperPayAdapterError', async () => {
    const adapter = createHyperPayAdapter({ env: SANDBOX_ENV });
    await assert.rejects(
      () => adapter.charge({ chargeId: 'hp-ch-008', amount: -100, currency: 'SAR', paymentMethod: 'VISA' }),
      /HyperPayAdapterError/
    );
  });

  test('charge() pspResponse contains HyperPay result code', async () => {
    const adapter = createHyperPayAdapter({ env: SANDBOX_ENV });
    const result  = await adapter.charge({ chargeId: 'hp-ch-009', amount: 250, currency: 'SAR', paymentMethod: 'VISA' });
    assert.ok(result.pspResponse.result?.code, 'result.code present in pspResponse');
  });

  test('charge() returns SAR currency in sandbox (KSA-specific)', async () => {
    const adapter = createHyperPayAdapter({ env: SANDBOX_ENV });
    const result  = await adapter.charge({ chargeId: 'hp-ch-010', amount: 100, currency: 'SAR', paymentMethod: 'MADA' });
    assert.equal(result.pspResponse.currency, 'SAR');
  });
});

// ── refund ────────────────────────────────────────────────────────────────────

describe('HyperPay adapter — refund()', () => {
  test('refund() in sandbox returns success', async () => {
    const adapter = createHyperPayAdapter({ env: SANDBOX_ENV });
    const result  = await adapter.refund({ refundId: 'hp-rf-001', chargeId: 'hp-ch-001', amount: 200, currency: 'SAR' });
    assert.equal(result.success, true);
    assert.ok(result.pspRef);
    assert.equal(result.status, 'REFUNDED');
  });

  test('refund() with zero amount throws', async () => {
    const adapter = createHyperPayAdapter({ env: SANDBOX_ENV });
    await assert.rejects(
      () => adapter.refund({ refundId: 'hp-rf-002', chargeId: 'hp-ch-001', amount: 0, currency: 'SAR' }),
      /HyperPayAdapterError/
    );
  });

  test('refund() result echoes chargeId and refundId', async () => {
    const adapter = createHyperPayAdapter({ env: SANDBOX_ENV });
    const result  = await adapter.refund({ refundId: 'hp-rf-003', chargeId: 'hp-ch-xyz', amount: 50, currency: 'SAR' });
    assert.equal(result.chargeId,  'hp-ch-xyz');
    assert.equal(result.refundId,  'hp-rf-003');
  });
});

// ── splitPayout ───────────────────────────────────────────────────────────────

describe('HyperPay adapter — splitPayout()', () => {
  test('splitPayout() in sandbox returns payout with etaMinutes', async () => {
    const adapter = createHyperPayAdapter({ env: SANDBOX_ENV });
    const result  = await adapter.splitPayout({ payoutId: 'hp-po-001', amount: 800, currency: 'SAR', recipientId: 'sub-001' });
    assert.equal(result.success, true);
    assert.ok(result.pspRef);
    assert.ok(typeof result.etaMinutes === 'number');
  });

  test('splitPayout() uses HyperSplit model (splitType in pspResponse)', async () => {
    const adapter = createHyperPayAdapter({ env: SANDBOX_ENV });
    const result  = await adapter.splitPayout({ payoutId: 'hp-po-002', amount: 500, currency: 'SAR', recipientId: 'sub-002' });
    assert.equal(result.pspResponse.splitType, 'HYPERSPLIT');
  });

  test('splitPayout() MENA SLA: etaMinutes <= 30', async () => {
    const adapter = createHyperPayAdapter({ env: SANDBOX_ENV });
    const result  = await adapter.splitPayout({ payoutId: 'hp-po-003', amount: 1000, currency: 'SAR', recipientId: 'sub-003' });
    assert.ok(result.etaMinutes <= 30, `etaMinutes should be ≤30, got ${result.etaMinutes}`);
  });
});

// ── getPayoutStatus ───────────────────────────────────────────────────────────

describe('HyperPay adapter — getPayoutStatus()', () => {
  test('getPayoutStatus() returns status and pspRef', async () => {
    const adapter = createHyperPayAdapter({ env: SANDBOX_ENV });
    const result  = await adapter.getPayoutStatus('hp-po-001');
    assert.ok(result.status);
    assert.ok(result.pspRef);
    assert.equal(result.payoutId, 'hp-po-001');
  });

  test('getPayoutStatus() throws when payoutId is missing', async () => {
    const adapter = createHyperPayAdapter({ env: SANDBOX_ENV });
    await assert.rejects(() => adapter.getPayoutStatus(null), /HyperPayAdapterError/);
  });
});

// ── webhookVerify ─────────────────────────────────────────────────────────────

describe('HyperPay adapter — webhookVerify()', () => {
  test('webhookVerify() returns true for valid HMAC-SHA256 signature', () => {
    const secret  = 'hp-test-secret';
    const body    = JSON.stringify({ type: 'PAYMENT', id: 'hp-001' });
    const sig     = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const adapter = createHyperPayAdapter({ env: { HYPERPAY_ENV: 'sandbox', HYPERPAY_WEBHOOK_SECRET: secret } });
    assert.equal(adapter.webhookVerify(body, sig), true);
  });

  test('webhookVerify() returns false for wrong signature', () => {
    const adapter = createHyperPayAdapter({ env: SANDBOX_ENV });
    assert.equal(adapter.webhookVerify('{"type":"PAYMENT"}', 'wrong'), false);
  });

  test('webhookVerify() returns false for empty signature', () => {
    const adapter = createHyperPayAdapter({ env: SANDBOX_ENV });
    assert.equal(adapter.webhookVerify('{"type":"PAYMENT"}', ''), false);
  });

  test('webhookVerify() returns false for null body', () => {
    const adapter = createHyperPayAdapter({ env: SANDBOX_ENV });
    assert.equal(adapter.webhookVerify(null, 'sig'), false);
  });
});

// ── supported methods ─────────────────────────────────────────────────────────

describe('HyperPay adapter — supported methods', () => {
  test('SUPPORTED_METHODS contains MADA, VISA, MASTERCARD', () => {
    const adapter = createHyperPayAdapter({ env: SANDBOX_ENV });
    ['MADA', 'VISA', 'MASTERCARD'].forEach(m => {
      assert.ok(adapter.SUPPORTED_METHODS.includes(m), `${m} should be supported`);
    });
  });

  test('SUPPORTED_METHODS does NOT include APPLEPAY or STCPAY', () => {
    const adapter = createHyperPayAdapter({ env: SANDBOX_ENV });
    assert.ok(!adapter.SUPPORTED_METHODS.includes('APPLEPAY'), 'APPLEPAY not supported');
    assert.ok(!adapter.SUPPORTED_METHODS.includes('STCPAY'),   'STCPAY not supported');
  });

  test('SPLIT_MODEL is HYPERSPLIT', () => {
    const adapter = createHyperPayAdapter({ env: SANDBOX_ENV });
    assert.equal(adapter.SPLIT_MODEL, 'HYPERSPLIT');
  });
});
