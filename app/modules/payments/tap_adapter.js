'use strict';

/**
 * tap_adapter.js — Tap Marketplaces PSP adapter
 *
 * Credentials (environment variables — NEVER in code or config):
 *   TAP_API_KEY          — Tap API secret key
 *   TAP_WEBHOOK_SECRET   — Tap webhook signing secret
 *   TAP_ENV              — 'sandbox' | 'production' (default: 'production')
 *
 * Sandbox mode: set TAP_ENV=sandbox — no real HTTP calls, synthetic responses.
 *
 * Supported payment methods: MADA, VISA, MASTERCARD, APPLEPAY, STCPAY
 * Webhook events: CHARGE.CREATED, CHARGE.CAPTURED, PAYOUT.PAID, PAYOUT.FAILED
 */

const crypto = require('crypto');

const SUPPORTED_METHODS = new Set(['MADA', 'VISA', 'MASTERCARD', 'APPLEPAY', 'STCPAY']);

const SANDBOX_BASE_URL    = 'https://api.tap.company/v2/sandbox';
const PRODUCTION_BASE_URL = 'https://api.tap.company/v2';

function tapError(message, code) {
  const err = new Error(message);
  err.name  = 'TapAdapterError';
  err.code  = code || 'TAP_ERROR';
  return err;
}

function assert(condition, message, code) {
  if (!condition) throw tapError(message, code);
}

function nowIso() { return new Date().toISOString(); }

function sandboxRef(prefix) {
  return `${prefix}_sandbox_${crypto.randomBytes(6).toString('hex')}`;
}

// ── sandbox response builders ─────────────────────────────────────────────────

function sandboxChargeResponse({ chargeId, amount, currency, paymentMethod }) {
  return {
    success:     true,
    chargeId,
    status:      'CAPTURED',
    pspRef:      sandboxRef('tap_chg'),
    pspResponse: {
      id:             sandboxRef('ch'),
      amount,
      currency,
      payment_method: paymentMethod,
      status:         'CAPTURED',
      sandbox:        true,
      created:        nowIso(),
    },
  };
}

function sandboxRefundResponse({ refundId, chargeId, amount, currency }) {
  return {
    success:     true,
    refundId,
    chargeId,
    status:      'REFUNDED',
    pspRef:      sandboxRef('tap_ref'),
    pspResponse: { id: sandboxRef('re'), amount, currency, sandbox: true, created: nowIso() },
  };
}

function sandboxPayoutResponse({ payoutId, amount, currency, recipientId }) {
  return {
    success:     true,
    payoutId,
    status:      'PENDING',
    pspRef:      sandboxRef('tap_pay'),
    etaMinutes:  30,
    pspResponse: {
      id:          sandboxRef('po'),
      amount,
      currency,
      recipient:   recipientId,
      status:      'PENDING',
      sandbox:     true,
      created:     nowIso(),
    },
  };
}

// ── adapter factory ───────────────────────────────────────────────────────────

/**
 * createTapAdapter({ env })
 *
 * @param env — optional override for process.env (useful in tests)
 *
 * Returns adapter with: charge, refund, splitPayout, getPayoutStatus, webhookVerify
 */
function createTapAdapter({ env } = {}) {
  const ENV     = env || process.env;
  const isSandbox = (ENV.TAP_ENV || 'production') === 'sandbox';

  // Credentials required in production only
  if (!isSandbox) {
    assert(ENV.TAP_API_KEY,        'TAP_API_KEY env var is required in production mode',  'MISSING_CREDENTIALS');
    assert(ENV.TAP_WEBHOOK_SECRET, 'TAP_WEBHOOK_SECRET env var is required in production mode', 'MISSING_CREDENTIALS');
  }

  const apiKey         = ENV.TAP_API_KEY        || 'sandbox-key-not-used';
  const webhookSecret  = ENV.TAP_WEBHOOK_SECRET  || 'sandbox-secret-not-used';
  const baseUrl        = isSandbox ? SANDBOX_BASE_URL : PRODUCTION_BASE_URL;

  // ── charge ──────────────────────────────────────────────────────────────────

  async function charge({ chargeId, amount, currency, paymentMethod, customerId, metadata }) {
    assert(chargeId,       'chargeId is required');
    assert(amount > 0,     'amount must be positive', 'INVALID_AMOUNT');
    assert(currency,       'currency is required');
    assert(paymentMethod,  'paymentMethod is required');
    assert(
      SUPPORTED_METHODS.has(String(paymentMethod).toUpperCase()),
      `Unsupported payment method: ${paymentMethod}. Tap supports: ${[...SUPPORTED_METHODS].join(', ')}`,
      'UNSUPPORTED_METHOD'
    );

    if (isSandbox) {
      return sandboxChargeResponse({ chargeId, amount, currency, paymentMethod });
    }

    // Production: call real Tap API
    const response = await fetch(`${baseUrl}/charges`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: chargeId, amount, currency, payment_method: paymentMethod, customer: customerId, metadata }),
    });
    if (!response.ok) throw tapError(`Tap charge failed: ${response.status}`, 'CHARGE_FAILED');
    const data = await response.json();
    return { success: true, chargeId, status: data.status, pspRef: data.id, pspResponse: data };
  }

  // ── refund ───────────────────────────────────────────────────────────────────

  async function refund({ refundId, chargeId, amount, currency, reason }) {
    assert(refundId,   'refundId is required');
    assert(chargeId,   'chargeId is required');
    assert(amount > 0, 'refund amount must be positive', 'INVALID_AMOUNT');

    if (isSandbox) {
      return sandboxRefundResponse({ refundId, chargeId, amount, currency });
    }

    const response = await fetch(`${baseUrl}/refunds`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: refundId, charge_id: chargeId, amount, currency, reason }),
    });
    if (!response.ok) throw tapError(`Tap refund failed: ${response.status}`, 'REFUND_FAILED');
    const data = await response.json();
    return { success: true, refundId, chargeId, status: data.status, pspRef: data.id, pspResponse: data };
  }

  // ── splitPayout ──────────────────────────────────────────────────────────────
  // Split settlement: buyer funds → escrow → freelancer payout

  async function splitPayout({ payoutId, amount, currency, recipientId, description, metadata }) {
    assert(payoutId,     'payoutId is required');
    assert(amount > 0,   'payout amount must be positive', 'INVALID_AMOUNT');
    assert(currency,     'currency is required');
    assert(recipientId,  'recipientId is required');

    if (isSandbox) {
      return sandboxPayoutResponse({ payoutId, amount, currency, recipientId });
    }

    const response = await fetch(`${baseUrl}/transfers`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: payoutId, amount, currency, destination: recipientId, description, metadata }),
    });
    if (!response.ok) throw tapError(`Tap splitPayout failed: ${response.status}`, 'PAYOUT_FAILED');
    const data = await response.json();
    return { success: true, payoutId, status: data.status, pspRef: data.id, etaMinutes: 30, pspResponse: data };
  }

  // ── getPayoutStatus ───────────────────────────────────────────────────────────

  async function getPayoutStatus(payoutId) {
    assert(payoutId, 'payoutId is required');

    if (isSandbox) {
      return { payoutId, status: 'PENDING', pspRef: sandboxRef('tap_pay'), updatedAt: nowIso() };
    }

    const response = await fetch(`${baseUrl}/transfers/${encodeURIComponent(payoutId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) throw tapError(`Tap getPayoutStatus failed: ${response.status}`, 'STATUS_FAILED');
    const data = await response.json();
    return { payoutId, status: data.status, pspRef: data.id, updatedAt: data.updated };
  }

  // ── webhookVerify ─────────────────────────────────────────────────────────────
  // Tap uses HMAC-SHA256: signature = hmac(webhookSecret, rawBody)

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
    pspName:      'TAP',
    isSandbox,
    baseUrl,
    charge,
    refund,
    splitPayout,
    getPayoutStatus,
    webhookVerify,
    SUPPORTED_METHODS: [...SUPPORTED_METHODS],
    WEBHOOK_EVENTS: ['CHARGE.CREATED', 'CHARGE.CAPTURED', 'PAYOUT.PAID', 'PAYOUT.FAILED'],
  };
}

module.exports = { createTapAdapter };
