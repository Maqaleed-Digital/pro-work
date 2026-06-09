// WC-PAY-TEST-001 · HyperPay SANDBOX test depth. Exercises the Copy&Pay flow's pure logic
// (prepare → submit → handle result) across APPROVED / DECLINED / ERROR, and re-asserts the hard
// lines on the surface source: sandbox-only (eu-test, no prod path), no embedded secret (env-only),
// disclosed-not-live / G5 gating. NOT D7 (real transaction) — no network, no money, no production.
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  SANDBOX, BRANDS, CURRENCY, RESULT_CODES, OUTCOMES, isApprovedCode,
  prepareCheckout, submitSandboxPayment,
} from "../../pages/hyperpay_sandbox.js"

const SRC = readFileSync(fileURLToPath(new URL("../../pages/hyperpay_sandbox.js", import.meta.url)), "utf8")
function hasEmbeddedSecret(text) {
  return /Bearer\s+[A-Za-z0-9._\-]{8,}/.test(text)
    || /HYPERPAY_[A-Z_]*(TOKEN|SECRET|ENTITY_ID)\s*[:=]\s*["'][^"']+["']/.test(text)
    || /\b(sk_live|sk_test)_[A-Za-z0-9]{8,}\b/.test(text)
}

test("WC-PAY-TEST · sandbox contract mirrors S38-G1 adapter (eu-test base, DB, SAR, MADA/VISA/MC)", () => {
  assert.equal(SANDBOX.env, "sandbox")
  assert.equal(SANDBOX.base, "https://eu-test.oppwa.com/v1")
  assert.equal(SANDBOX.paymentType, "DB")
  assert.equal(CURRENCY, "SAR")
  assert.deepEqual(BRANDS, ["MADA", "VISA", "MASTERCARD"])
})

test("WC-PAY-TEST · (c) Copy&Pay flow — APPROVED path (prepare → submit → captured), no fund movement", () => {
  const checkout = prepareCheckout({ amount: 250, paymentMethod: "MADA" })
  assert.ok(checkout.checkoutId.startsWith("chk_sbx_") && checkout.sandbox === true)
  const res = submitSandboxPayment({ checkout, outcome: "APPROVED" })
  assert.equal(res.success, true)
  assert.equal(res.status, "CAPTURED")
  assert.equal(res.pspResponse.result.code, RESULT_CODES.APPROVED)
  assert.equal(isApprovedCode(res.pspResponse.result.code), true)
  assert.equal(res.fundMovement, false) // NO money moves, ever
  assert.equal(res.sandbox, true)
})

test("WC-PAY-TEST · (c) Copy&Pay flow — DECLINED path renders correctly, no fund movement", () => {
  const checkout = prepareCheckout({ amount: 100, paymentMethod: "VISA" })
  const res = submitSandboxPayment({ checkout, outcome: "DECLINED" })
  assert.equal(res.success, false)
  assert.equal(res.status, "DECLINED")
  assert.equal(res.pspResponse.result.code, RESULT_CODES.DECLINED)
  assert.equal(isApprovedCode(res.pspResponse.result.code), false)
  assert.equal(res.fundMovement, false)
})

test("WC-PAY-TEST · (c) Copy&Pay flow — ERROR path renders correctly, no fund movement", () => {
  const checkout = prepareCheckout({ amount: 450, paymentMethod: "MASTERCARD" })
  const res = submitSandboxPayment({ checkout, outcome: "ERROR" })
  assert.equal(res.success, false)
  assert.equal(res.status, "ERROR")
  assert.equal(res.pspResponse.result.code, RESULT_CODES.ERROR)
  assert.equal(res.fundMovement, false)
})

test("WC-PAY-TEST · (c) flow guards — submit requires a prepared checkout; unsupported brand/amount rejected", () => {
  assert.throws(() => submitSandboxPayment({ checkout: null, outcome: "APPROVED" }), /prepared sandbox checkout/)
  assert.throws(() => prepareCheckout({ amount: 0, paymentMethod: "VISA" }), /amount must be positive/)
  assert.throws(() => prepareCheckout({ amount: 100, paymentMethod: "APPLEPAY" }), /unsupported brand/)
  // outcome set is exactly the three paths
  assert.deepEqual(OUTCOMES, ["APPROVED", "DECLINED", "ERROR"])
})

test("WC-PAY-TEST · (a) sandbox-ONLY — eu-test present, NO production base, NO live-charge path", () => {
  assert.match(SRC, /eu-test\.oppwa\.com/)
  assert.equal(/https:\/\/oppwa\.com\/v1/.test(SRC), false, "no production base URL")
  assert.equal(/\bfetch\s*\(/.test(SRC), false, "no network call")
  assert.equal(/\bAuthorization\b/.test(SRC), false, "no Authorization header")
  // CONTROL: the detector is non-vacuous — a planted production base IS caught
  assert.equal(/https:\/\/oppwa\.com\/v1/.test("await fetch('https://oppwa.com/v1/payments')"), true)
})

test("WC-PAY-TEST · (b) no embedded secret in the surface (env-only) — with non-vacuous control", () => {
  assert.equal(hasEmbeddedSecret(SRC), false, "no Bearer token / token assignment / api key in source")
  // CONTROL: an actually-embedded secret IS detected
  assert.equal(hasEmbeddedSecret('headers: { Authorization: "Bearer sk_live_abc123def456" }'), true)
  assert.equal(hasEmbeddedSecret('HYPERPAY_ACCESS_TOKEN = "OGE4Mjk0ODg..."'), true)
})

test("WC-PAY-TEST · (d) disclosed-not-live / G5 gate is visibly enforced on the surface", () => {
  // the rendered banner carries the disclosed-not-live state + G5 gate marker and the no-live-payment copy
  assert.match(SRC, /data-state",\s*"disclosed-not-live"/)
  assert.match(SRC, /data-gate",\s*"G5"/)
  assert.match(SRC, /SANDBOX — NO LIVE PAYMENT/)
  assert.match(SRC, /held behind G5/)
  // CONTROL: every synthetic result asserts fundMovement:false across all outcomes
  for (const oc of OUTCOMES) {
    const res = submitSandboxPayment({ checkout: prepareCheckout({ amount: 10, paymentMethod: "MADA" }), outcome: oc })
    assert.equal(res.fundMovement, false, `${oc} must not move funds`)
  }
})
