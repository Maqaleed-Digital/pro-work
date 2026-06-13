// WO-WC-HYPERPAY-001 — webhook AES-256-GCM verify is fail-closed (real crypto round-trip).
import { test } from "node:test"
import assert from "node:assert/strict"
import crypto from "node:crypto"
import { createAdapter, __encryptForTest } from "../hyperpay_adapter.js"

const KEY = crypto.randomBytes(32).toString("hex")
const adapter = createAdapter({ mode: "sandbox", entityId: "E", accessToken: "T", webhookSecret: KEY })
const flipLast = (hex) => hex.replace(/.$/, (m) => (m === "0" ? "1" : "0"))

test("valid AES-256-GCM webhook decrypts + authenticates", () => {
  const enc = __encryptForTest(KEY, { id: "chk_1", result: { code: "000.000.000" } })
  const out = adapter.verifyAndDecryptWebhook(enc)
  assert.equal(out.id, "chk_1")
  assert.equal(out.result.code, "000.000.000")
})

test("tampered ciphertext -> throws (fail closed)", () => {
  const enc = __encryptForTest(KEY, { id: "x" })
  assert.throws(() => adapter.verifyAndDecryptWebhook({ ...enc, bodyHex: flipLast(enc.bodyHex) }))
})

test("tampered auth tag -> throws (fail closed)", () => {
  const enc = __encryptForTest(KEY, { id: "x" })
  assert.throws(() => adapter.verifyAndDecryptWebhook({ ...enc, authTagHex: flipLast(enc.authTagHex) }))
})

test("wrong key -> throws (fail closed)", () => {
  const enc = __encryptForTest(KEY, { id: "x" })
  const other = createAdapter({ mode: "sandbox", entityId: "E", accessToken: "T", webhookSecret: crypto.randomBytes(32).toString("hex") })
  assert.throws(() => other.verifyAndDecryptWebhook(enc))
})

test("missing webhook secret -> throws", () => {
  const noSecret = createAdapter({ mode: "sandbox", entityId: "E", accessToken: "T" })
  assert.throws(() => noSecret.verifyAndDecryptWebhook({ ivHex: "00", authTagHex: "00", bodyHex: "00" }))
})

test("non-32-byte key -> throws (rejects weak/misconfigured key)", () => {
  const shortKey = createAdapter({ mode: "sandbox", entityId: "E", accessToken: "T", webhookSecret: "abcd" })
  assert.throws(() => shortKey.verifyAndDecryptWebhook({ ivHex: "00", authTagHex: "00", bodyHex: "00" }))
})
