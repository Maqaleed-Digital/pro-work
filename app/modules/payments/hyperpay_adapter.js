'use strict';

/**
 * hyperpay_adapter.js — HyperPay HyperSplit PSP adapter
 *
 * Credentials (environment variables — NEVER in code or config):
 *   HYPERPAY_ENTITY_ID      — HyperPay entity ID
 *   HYPERPAY_ACCESS_TOKEN   — HyperPay bearer access token
 *   HYPERPAY_WEBHOOK_SECRET — HyperPay webhook signing secret
 *   HYPERPAY_ENV            — 'sandbox' | 'production' (default: 'production')
 *
 * Sandbox mode: set HYPERPAY_ENV=sandbox — no real HTTP calls, synthetic responses.
 *
 * Supported payment methods: MADA, VISA, MASTERCARD (KSA debit/credit)
 * Split settlement: HyperPay marketplace / HyperSplit model
 */

const crypto = require('crypto');

// HyperPay brand codes for KSA
const SUPPORTED_METHODS = new Set(['MADA', 'VISA', 'MASTERCARD']);

const SANDBOX_BASE_URL    = 'https://eu-test.oppwa.com/v1';
const PRODUCTION_BASE_URL = 'https://oppwa.com/v1';

function hyperPayError(message, code) {
  const err = new Error(message);
  err.name  = 'HyperPayAdapterError';
  err.code  = code || 'HYPERPAY_ERROR';
  return err;
}

function assert(condition, message, code) {
  if (!condition) throw hyperPayError(message, code);
}

function nowIso() { return new Date().toISOString(); }

function sandboxRef(prefix) {
  return `${prefix}_hp_${crypto.randomBytes(6).toString('hex')}`;
}

// HyperPay result codes: '000.000.000' = success family, '000.100.xxx' = pending
const SUCCESS_RESULT_CODE = '000.000.000';
const PENDING_RESULT_CODE = '000.100.112';

// ── sandbox response builders ─────────────────────────────────────────────────

function sandboxChargeResponse({ chargeId, amount, currency, paymentMethod }) {
  return {
    success:     true,
    chargeId,
    status:      'CAPTURED',
    pspRef:      sandboxRef('hp_chg'),
    pspResponse: {
      id:          sandboxRef('id'),
      amount:      String(amount),
      currency,
      paymentBrand: paymentMethod,
      result:      { code: SUCCESS_RESULT_CODE, description: 'Transaction approved (sandbox)' },
      sandbox:     true,
      timestamp:   nowIso(),
    },
  };
}

function sandboxRefundResponse({ refundId, chargeId, amount, currency }) {
  return {
    success:     true,
    refundId,
    chargeId,
    status:      'REFUNDED',
    pspRef:      sandboxRef('hp_ref'),
    pspResponse: {
      id:       sandboxRef('id'),
      amount:   String(amount),
      currency,
      result:   { code: SUCCESS_RESULT_CODE, description: 'Refund approved (sandbox)' },
      sandbox:  true,
      timestamp: nowIso(),
    },
  };
}

function sandboxPayoutResponse({ payoutId, amount, currency, recipientId }) {
  return {
    success:     true,
    payoutId,
    status:      'PENDING',
    pspRef:      sandboxRef('hp_pay'),
    etaMinutes:  30,
    pspResponse: {
      id:          sandboxRef('id'),
      amount:      String(amount),
      currency,
      merchantAccount: recipientId,
      result:      { code: PENDING_RESULT_CODE, description: 'Payout pending (sandbox)' },
      splitType:   'HYPERSPLIT',
      sandbox:     true,
      timestamp:   nowIso(),
    },
  };
}

// ── adapter factory ───────────────────────────────────────────────────────────

/**
 * createHyperPayAdapter({ env })
 *
 * @param env — optional override for process.env (useful in tests)
 */
function createHyperPayAdapter({ env } = {}) {
  const ENV       = env || process.env;
  const isSandbox = (ENV.HYPERPAY_ENV || 'production') === 'sandbox';

  // Credentials required in production only
  if (!isSandbox) {
    assert(ENV.HYPERPAY_ENTITY_ID,    'HYPERPAY_ENTITY_ID env var is required in production mode',    'MISSING_CREDENTIALS');
    assert(ENV.HYPERPAY_ACCESS_TOKEN, 'HYPERPAY_ACCESS_TOKEN env var is required in production mode', 'MISSING_CREDENTIALS');
    assert(ENV.HYPERPAY_WEBHOOK_SECRET, 'HYPERPAY_WEBHOOK_SECRET env var is required in production mode', 'MISSING_CREDENTIALS');
  }

  const entityId      = ENV.HYPERPAY_ENTITY_ID     || 'sandbox-entity-not-used';
  const accessToken   = ENV.HYPERPAY_ACCESS_TOKEN   || 'sandbox-token-not-used';
  const webhookSecret = ENV.HYPERPAY_WEBHOOK_SECRET || 'sandbox-secret-not-used';
  const baseUrl       = isSandbox ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL;

  // ── charge ──────────────────────────────────────────────────────────────────

  async function charge({ chargeId, amount, currency, paymentMethod, customerId, metadata }) {
    assert(chargeId,       'chargeId is required');
    assert(amount > 0,     'amount must be positive', 'INVALID_AMOUNT');
    assert(currency,       'currency is required');
    assert(paymentMethod,  'paymentMethod is required');
    assert(
      SUPPORTED_METHODS.has(String(paymentMethod).toUpperCase()),
      `Unsupported payment method: ${paymentMethod}. HyperPay supports: ${[...SUPPORTED_METHODS].join(', ')}`,
      'UNSUPPORTED_METHOD'
    );

    if (isSandbox) {
      return sandboxChargeResponse({ chargeId, amount, currency, paymentMethod });
    }

    // Production: HyperPay uses form-encoded POST for checkouts
    const params = new URLSearchParams({
      entityId,
      amount:       String(amount),
      currency,
      paymentBrand: paymentMethod,
      paymentType:  'DB',
      merchantTransactionId: chargeId,
      customer:     customerId || '',
    });
    const response = await fetch(`${baseUrl}/checkouts`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params.toString(),
    });
    if (!response.ok) throw hyperPayError(`HyperPay charge failed: ${response.status}`, 'CHARGE_FAILED');
    const data = await response.json();
    const success = data.result?.code?.startsWith('000.000') || data.result?.code?.startsWith('000.100');
    if (!success) throw hyperPayError(`HyperPay charge declined: ${data.result?.description}`, 'CHARGE_DECLINED');
    return { success: true, chargeId, status: 'CAPTURED', pspRef: data.id, pspResponse: data };
  }

  // ── refund ───────────────────────────────────────────────────────────────────

  async function refund({ refundId, chargeId, amount, currency, reason }) {
    assert(refundId,   'refundId is required');
    assert(chargeId,   'chargeId is required');
    assert(amount > 0, 'refund amount must be positive', 'INVALID_AMOUNT');

    if (isSandbox) {
      return sandboxRefundResponse({ refundId, chargeId, amount, currency });
    }

    const params = new URLSearchParams({ entityId, amount: String(amount), currency, paymentType: 'RF' });
    const response = await fetch(`${baseUrl}/payments/${encodeURIComponent(chargeId)}`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params.toString(),
    });
    if (!response.ok) throw hyperPayError(`HyperPay refund failed: ${response.status}`, 'REFUND_FAILED');
    const data = await response.json();
    return { success: true, refundId, chargeId, status: 'REFUNDED', pspRef: data.id, pspResponse: data };
  }

  // ── splitPayout ──────────────────────────────────────────────────────────────
  // HyperPay HyperSplit marketplace model: platform → sub-merchant

  async function splitPayout({ payoutId, amount, currency, recipientId, description, metadata }) {
    assert(payoutId,    'payoutId is required');
    assert(amount > 0,  'payout amount must be positive', 'INVALID_AMOUNT');
    assert(currency,    'currency is required');
    assert(recipientId, 'recipientId is required');

    if (isSandbox) {
      return sandboxPayoutResponse({ payoutId, amount, currency, recipientId });
    }

    const params = new URLSearchParams({
      entityId,
      amount:       String(amount),
      currency,
      paymentType:  'PA',
      merchantAccount: recipientId,
      merchantTransactionId: payoutId,
      description:  description || '',
    });
    const response = await fetch(`${baseUrl}/payments`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params.toString(),
    });
    if (!response.ok) throw hyperPayError(`HyperPay splitPayout failed: ${response.status}`, 'PAYOUT_FAILED');
    const data = await response.json();
    return { success: true, payoutId, status: 'PENDING', pspRef: data.id, etaMinutes: 30, pspResponse: data };
  }

  // ── getPayoutStatus ───────────────────────────────────────────────────────────

  async function getPayoutStatus(payoutId) {
    assert(payoutId, 'payoutId is required');

    if (isSandbox) {
      return { payoutId, status: 'PENDING', pspRef: sandboxRef('hp_pay'), updatedAt: nowIso() };
    }

    const response = await fetch(
      `${baseUrl}/query?entityId=${encodeURIComponent(entityId)}&merchantTransactionId=${encodeURIComponent(payoutId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!response.ok) throw hyperPayError(`HyperPay getPayoutStatus failed: ${response.status}`, 'STATUS_FAILED');
    const data = await response.json();
    return { payoutId, status: data.result?.code?.startsWith('000.000') ? 'PAID' : 'PENDING', pspRef: data.id, updatedAt: data.timestamp };
  }

  // ── webhookVerify ─────────────────────────────────────────────────────────────
  // HyperPay: HMAC-SHA256 over raw body

  function webhookVerify(rawBody, signature) {
    if (!rawBody || !signature) return false;
    try {
      const expected = crypto.createHmac('sha256', webhookSecret)
        .update(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody))
        .digest('hex');
      return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  }

  return {
    pspName:      'HYPERPAY',
    isSandbox,
    baseUrl,
    charge,
    refund,
    splitPayout,
    getPayoutStatus,
    webhookVerify,
    SUPPORTED_METHODS: [...SUPPORTED_METHODS],
    SPLIT_MODEL: 'HYPERSPLIT',
  };
}

module.exports = { createHyperPayAdapter };
