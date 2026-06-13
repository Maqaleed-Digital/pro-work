"use strict"

/**
 * WO-WC-HYPERPAY-001 — payment route handlers + dispatch.
 *
 * Wires the OPPWA adapter to persistence behind three endpoints:
 *   POST /api/payments/checkouts        create a Copy&Pay checkout
 *   GET  /api/payments/{id}/status      retrieve + persist payment status
 *   POST /api/payments/webhook          verify (AES-GCM) + persist a notification
 *
 * The webhook handler is FAIL CLOSED: a payload whose GCM auth tag does not verify
 * is recorded with signature_valid=false and REJECTED (400) — the transaction is
 * never mutated from an unauthenticated notification.
 *
 * Handlers are produced by makeHandlers({adapter, repo, config}) so tests inject
 * mocks. server.js uses the lazily-built default (wired from env).
 */

const { createAdapter } = require("./hyperpay_adapter")
const { resolvePaymentsConfig } = require("./payments_config")
const { makeRepo } = require("./payments_repo")

const RAW_LIMIT = 256 * 1024

async function readRaw(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > RAW_LIMIT) throw new Error("payload too large")
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function makeHandlers({ adapter, repo, config }) {
  async function createCheckout(req, res, srv) {
    const body = await srv.readJson(req, res)
    if (body === null) return // readJson already responded
    const { amount, currency, paymentBrand, merchantTransactionId, tenantId } = body || {}
    if (amount == null || !currency) {
      return srv.fail(res, "VALIDATION_ERROR", "amount and currency are required", 422)
    }
    let r
    try {
      r = await adapter.createCheckout({ amount, currency, paymentBrand, merchantTransactionId })
    } catch (e) {
      return srv.fail(res, "PSP_UNAVAILABLE", "payment gateway request failed", 502)
    }
    const checkoutId = r.json && r.json.id ? r.json.id : null
    const code = r.json && r.json.result ? r.json.result.code : null
    if (!checkoutId) {
      return srv.fail(res, "PSP_ERROR", "checkout not created", 502)
    }
    await repo.createTransaction({
      tenantId, merchantTransactionId, amount, currency, paymentBrand,
      checkoutId, status: "created", resultCode: code, pspResponse: r.json, mode: config.mode,
    })
    // base is exposed so the frontend can load the Copy&Pay widget against the SAME rail
    return srv.ok(res, { checkoutId, resultCode: code, base: adapter.base, mode: config.mode }, 201)
  }

  async function getStatus(req, res, srv, params) {
    const checkoutId = params && params.id
    if (!checkoutId) return srv.fail(res, "VALIDATION_ERROR", "checkout id required", 422)
    let r
    try {
      r = await adapter.getStatus(checkoutId)
    } catch (e) {
      return srv.fail(res, "PSP_UNAVAILABLE", "payment gateway request failed", 502)
    }
    const code = r.json && r.json.result ? r.json.result.code : null
    const status = adapter.classifyResult(code)
    await repo.updateTransactionByCheckout(checkoutId, { status, resultCode: code, pspResponse: r.json })
    return srv.ok(res, { checkoutId, status, resultCode: code }, 200)
  }

  async function webhook(req, res, srv) {
    const ivHex = req.headers["x-initialization-vector"]
    const authTagHex = req.headers["x-authentication-tag"]
    let rawHex
    try {
      const raw = await readRaw(req)
      rawHex = raw.toString("utf8").trim()
    } catch {
      return srv.fail(res, "PAYLOAD_TOO_LARGE", "webhook body too large", 413)
    }

    let payload
    try {
      payload = adapter.verifyAndDecryptWebhook({ ivHex, authTagHex, bodyHex: rawHex })
    } catch (e) {
      // FAIL CLOSED: record the rejection, do NOT touch the transaction.
      await repo.recordWebhookEvent({
        checkoutId: null, paymentId: null, eventType: "unverified",
        signatureValid: false, payload: null,
        headers: { hasIv: Boolean(ivHex), hasTag: Boolean(authTagHex) },
      })
      return srv.fail(res, "WEBHOOK_SIGNATURE_INVALID", "notification could not be authenticated", 400)
    }

    const checkoutId = payload.id || (payload.payload && payload.payload.id) || null
    const code = (payload.result && payload.result.code)
      || (payload.payload && payload.payload.result && payload.payload.result.code)
      || null
    const status = adapter.classifyResult(code)

    await repo.recordWebhookEvent({
      checkoutId, paymentId: payload.paymentId || null,
      eventType: payload.type || "PAYMENT",
      signatureValid: true, payload,
      headers: { hasIv: true, hasTag: true },
    })
    if (checkoutId) {
      await repo.updateTransactionByCheckout(checkoutId, { status, resultCode: code, pspResponse: payload })
    }
    return srv.ok(res, { received: true, status }, 200)
  }

  return { createCheckout, getStatus, webhook }
}

// ---- default singleton wired from env (lazy; importing never builds a DB conn) -
let _default = null
function getDefault() {
  if (!_default) {
    const config = resolvePaymentsConfig()
    _default = makeHandlers({ config, adapter: createAdapter(config), repo: makeRepo() })
  }
  return _default
}

async function dispatch(route, req, res, srv) {
  const h = getDefault()
  if (route.name === "payments.checkout.create") return h.createCheckout(req, res, srv)
  if (route.name === "payments.status.get") return h.getStatus(req, res, srv, route.params)
  if (route.name === "payments.webhook") return h.webhook(req, res, srv)
  return srv.fail(res, "NOT_FOUND", "unknown payments route", 404)
}

module.exports = { makeHandlers, dispatch }
