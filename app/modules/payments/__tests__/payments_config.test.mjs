// WO-WC-HYPERPAY-001 — env config: secrets required only in production mode.
import { test } from "node:test"
import assert from "node:assert/strict"
import { resolvePaymentsConfig, validatePaymentsConfig } from "../payments_config.js"

test("defaults to sandbox; secrets NOT required", () => {
  assert.equal(resolvePaymentsConfig({}).mode, "sandbox")
  const v = validatePaymentsConfig({})
  assert.equal(v.ok, true)
  assert.deepEqual(v.missing, [])
})

test("production mode requires the three HYPERPAY secrets (names only)", () => {
  const v = validatePaymentsConfig({ HYPERPAY_MODE: "production" })
  assert.equal(v.ok, false)
  assert.deepEqual(v.missing.sort(), ["HYPERPAY_ACCESS_TOKEN", "HYPERPAY_ENTITY_ID", "HYPERPAY_WEBHOOK_SECRET"])
})

test("production mode with all secrets present passes", () => {
  const v = validatePaymentsConfig({
    HYPERPAY_MODE: "production",
    HYPERPAY_ENTITY_ID: "e", HYPERPAY_ACCESS_TOKEN: "t", HYPERPAY_WEBHOOK_SECRET: "s",
  })
  assert.equal(v.ok, true)
})

test("a production entityId on sandbox mode is fine (production-sandbox) — base stays test", () => {
  const cfg = resolvePaymentsConfig({ HYPERPAY_MODE: "sandbox", HYPERPAY_ENTITY_ID: "prod-entity" })
  assert.equal(cfg.mode, "sandbox")
  assert.equal(cfg.baseUrl, "") // adapter derives eu-test from sandbox mode
})
