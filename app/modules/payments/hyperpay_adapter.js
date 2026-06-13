"use strict"

/**
 * WO-WC-HYPERPAY-001 — HyperPay (OPPWA) Copy&Pay adapter.
 *
 * Builds to production-SANDBOX-verified. The base URL is selected by MODE and
 * DEFAULTS TO TEST (eu-test.oppwa.com). The production base (oppwa.com) is only
 * selectable when mode==='production' — that flip is the G5-gated live-activation
 * step and is NOT exercised by this WO (liveFundMovement stays false).
 *
 * Webhook authenticity: OPPWA does NOT use HMAC for notifications. It encrypts the
 * payload with AES-256-GCM under the merchant "notification encryption key"
 * (HYPERPAY_WEBHOOK_SECRET, hex). The GCM authentication tag IS the cryptographic
 * integrity/authenticity guarantee — if it does not verify, decryption throws and
 * we FAIL CLOSED (reject, never process). This is the correct OPPWA scheme; the WO
 * wording "HMAC verification" is satisfied by this stronger authenticated mode.
 *
 * Zero runtime dependencies: Node built-ins only (node:https, node:crypto).
 * The HTTP client is injectable so tests exercise request-building and response
 * parsing with NO network and NO credentials.
 */

const https = require("node:https")
const crypto = require("node:crypto")

const TEST_BASE = "https://eu-test.oppwa.com"
const PROD_BASE = "https://oppwa.com" // G5-gated; never the default

function baseForMode(mode) {
  // default to test for ANY non-production mode (fail-safe to sandbox)
  return mode === "production" ? PROD_BASE : TEST_BASE
}

// Copy&Pay status endpoint. (The WO noted GET /v1/payments/{id}; for the Copy&Pay
// flow the canonical status URL is /v1/checkouts/{id}/payment — centralised here
// so the credentialed live-rail verification can confirm/adjust it in one place.)
function statusPath(checkoutId) {
  return `/v1/checkouts/${encodeURIComponent(checkoutId)}/payment`
}

// OPPWA result.code classification (documented regexes).
const RE_SUCCESS = /^(000\.000\.|000\.100\.1|000\.[36]|000\.400\.0[^3]|000\.400\.[1][0-9][0-9])/
const RE_PENDING = /^(000\.200|800\.400\.5|100\.400\.500)/
function classifyResult(code) {
  const c = String(code || "")
  if (RE_SUCCESS.test(c)) return "success"
  if (RE_PENDING.test(c)) return "pending"
  return "rejected"
}

function defaultHttpClient({ method, url, headers, body }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method, headers },
      (res) => {
        const chunks = []
        res.on("data", (c) => chunks.push(c))
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8")
          let json = null
          try { json = JSON.parse(text) } catch { /* non-JSON */ }
          resolve({ status: res.statusCode, json, text })
        })
      }
    )
    req.on("error", reject)
    if (body) req.write(body)
    req.end()
  })
}

/**
 * @param {{mode?:string, entityId:string, accessToken:string, webhookSecret?:string, baseUrl?:string}} config
 * @param {{httpClient?:Function}} [deps]
 */
function createAdapter(config, deps = {}) {
  const httpClient = deps.httpClient || defaultHttpClient
  const base = config.baseUrl || baseForMode(config.mode)

  async function createCheckout({ amount, currency, paymentBrand, merchantTransactionId }) {
    const form = new URLSearchParams({
      entityId: config.entityId,
      amount: String(amount),
      currency: String(currency),
      paymentType: "DB",
    })
    if (paymentBrand) form.set("paymentBrand", String(paymentBrand))
    if (merchantTransactionId) form.set("merchantTransactionId", String(merchantTransactionId))
    const res = await httpClient({
      method: "POST",
      url: `${base}/v1/checkouts`,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    })
    return res
  }

  async function getStatus(checkoutId) {
    const res = await httpClient({
      method: "GET",
      url: `${base}${statusPath(checkoutId)}?entityId=${encodeURIComponent(config.entityId)}`,
      headers: { Authorization: `Bearer ${config.accessToken}` },
    })
    return res
  }

  /**
   * Verify + decrypt an OPPWA webhook (AES-256-GCM). FAIL CLOSED: any tampering of
   * ciphertext, IV, or auth tag, or a wrong key, makes decipher.final() throw.
   * @param {{ivHex:string, authTagHex:string, bodyHex:string}} parts
   * @returns {object} the decrypted, authenticated payload
   */
  function verifyAndDecryptWebhook({ ivHex, authTagHex, bodyHex }) {
    if (!config.webhookSecret) throw new Error("webhook secret not configured")
    const key = Buffer.from(config.webhookSecret, "hex")
    if (key.length !== 32) throw new Error("webhook key must be 256-bit (32 bytes hex)")
    const iv = Buffer.from(String(ivHex || ""), "hex")
    const tag = Buffer.from(String(authTagHex || ""), "hex")
    const ct = Buffer.from(String(bodyHex || ""), "hex")
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAuthTag(tag)
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]) // throws on bad tag
    return JSON.parse(pt.toString("utf8"))
  }

  return { base, createCheckout, getStatus, verifyAndDecryptWebhook, classifyResult }
}

/** Test-only helper: produce a valid AES-256-GCM encrypted webhook for round-trip tests. */
function __encryptForTest(webhookSecretHex, payloadObj) {
  const key = Buffer.from(webhookSecretHex, "hex")
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const ct = Buffer.concat([cipher.update(JSON.stringify(payloadObj), "utf8"), cipher.final()])
  return { ivHex: iv.toString("hex"), authTagHex: cipher.getAuthTag().toString("hex"), bodyHex: ct.toString("hex") }
}

module.exports = { createAdapter, classifyResult, baseForMode, statusPath, TEST_BASE, PROD_BASE, __encryptForTest }
