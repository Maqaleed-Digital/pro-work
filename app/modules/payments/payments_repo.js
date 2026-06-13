"use strict"

/**
 * WO-WC-HYPERPAY-001 — payments persistence repository.
 *
 * Uses the existing postgres_client interface (insert/findAll/update). The DB is
 * injectable so tests exercise repo logic with a fake recording client (no pg, no
 * network); the default client is LAZILY required so importing this module never
 * pulls in `pg` until a real DB call is made at runtime.
 */

const crypto = require("node:crypto")

function lazyDefaultDb() {
  // required only when actually used at runtime (prod has pg installed)
  return require("../../lib/persistence/postgres_client")
}

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`
}

function makeRepo(injectedDb) {
  const db = () => injectedDb || lazyDefaultDb()

  async function createTransaction(t) {
    return db().insert("payment_transactions", {
      id: newId("pay"),
      tenant_id: t.tenantId || "default",
      merchant_transaction_id: t.merchantTransactionId || null,
      checkout_id: t.checkoutId || null,
      amount: t.amount != null ? String(t.amount) : null,
      currency: t.currency || null,
      payment_brand: t.paymentBrand || null,
      status: t.status || "created",
      result_code: t.resultCode || null,
      psp_response: t.pspResponse ? JSON.stringify(t.pspResponse) : null,
      mode: t.mode || "sandbox",
    })
  }

  async function findByCheckout(checkoutId) {
    const rows = await db().findAll("payment_transactions", { checkout_id: checkoutId }, { limit: 1 })
    return rows && rows[0] ? rows[0] : null
  }

  async function updateTransactionByCheckout(checkoutId, patch) {
    const existing = await findByCheckout(checkoutId)
    if (!existing) return null
    const data = {}
    if (patch.status != null) data.status = patch.status
    if (patch.resultCode != null) data.result_code = patch.resultCode
    if (patch.pspResponse != null) data.psp_response = JSON.stringify(patch.pspResponse)
    return db().update("payment_transactions", existing.id, data)
  }

  async function recordWebhookEvent(e) {
    return db().insert("payment_webhook_events", {
      id: newId("whk"),
      checkout_id: e.checkoutId || null,
      payment_id: e.paymentId || null,
      event_type: e.eventType || null,
      signature_valid: e.signatureValid === true, // explicit boolean, defaults false
      payload: e.payload ? JSON.stringify(e.payload) : null,
      headers: e.headers ? JSON.stringify(e.headers) : null,
    })
  }

  return { createTransaction, findByCheckout, updateTransactionByCheckout, recordWebhookEvent }
}

module.exports = { makeRepo }
