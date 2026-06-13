"use strict"

/**
 * WO-WC-HYPERPAY-001 — payments environment config (names only, never values).
 *
 * MODE defaults to "sandbox". Production mode (which selects the oppwa.com base) is
 * the G5-gated live flip and is NOT enabled by this WO. validatePaymentsConfig()
 * requires the three HYPERPAY_* secrets ONLY when mode==="production"; in sandbox
 * they are optional (production-sandbox verification uses a test access token).
 *
 * Env variable NAMES referenced (values are never read here or logged):
 *   HYPERPAY_MODE          'sandbox' (default) | 'production'
 *   HYPERPAY_ENTITY_ID     merchant/channel entity id (a production entity id is
 *                          acceptable on the TEST base = "production-sandbox")
 *   HYPERPAY_ACCESS_TOKEN  bearer token (secret)
 *   HYPERPAY_WEBHOOK_SECRET notification encryption key, hex (secret)
 *   HYPERPAY_BASE_URL      optional explicit override (else derived from mode)
 */

function resolvePaymentsConfig(env = process.env) {
  const mode = String(env.HYPERPAY_MODE || "sandbox").trim().toLowerCase() === "production"
    ? "production"
    : "sandbox"
  return {
    mode,
    entityId: env.HYPERPAY_ENTITY_ID || "",
    accessToken: env.HYPERPAY_ACCESS_TOKEN || "",
    webhookSecret: env.HYPERPAY_WEBHOOK_SECRET || "",
    // base URL is derived by the adapter from mode unless explicitly overridden.
    baseUrl: env.HYPERPAY_BASE_URL || "",
  }
}

/**
 * @returns {{ok:boolean, missing:string[]}} missing required HYPERPAY_* var NAMES
 * (never values). Only enforced in production mode.
 */
function validatePaymentsConfig(env = process.env) {
  const cfg = resolvePaymentsConfig(env)
  if (cfg.mode !== "production") return { ok: true, missing: [] }
  const missing = []
  if (!cfg.entityId) missing.push("HYPERPAY_ENTITY_ID")
  if (!cfg.accessToken) missing.push("HYPERPAY_ACCESS_TOKEN")
  if (!cfg.webhookSecret) missing.push("HYPERPAY_WEBHOOK_SECRET")
  return { ok: missing.length === 0, missing }
}

module.exports = { resolvePaymentsConfig, validatePaymentsConfig }
