// WO-WC-HYPERPAY-001 — adapter request-building + result classification (no network).
import { test } from "node:test"
import assert from "node:assert/strict"
import { createAdapter, classifyResult, baseForMode } from "../hyperpay_adapter.js"

test("createCheckout builds the correct OPPWA request (eu-test base, form body, bearer)", async () => {
  let captured
  const adapter = createAdapter(
    { mode: "sandbox", entityId: "ENT_TEST", accessToken: "TOK_TEST" },
    { httpClient: async (req) => { captured = req; return { status: 200, json: { id: "chk_1", result: { code: "000.200.100" } } } } }
  )
  const r = await adapter.createCheckout({ amount: "92.00", currency: "SAR", paymentBrand: "VISA", merchantTransactionId: "m1" })
  assert.equal(captured.method, "POST")
  assert.equal(captured.url, "https://eu-test.oppwa.com/v1/checkouts")
  assert.match(captured.headers.Authorization, /^Bearer /)
  assert.match(captured.headers["Content-Type"], /x-www-form-urlencoded/)
  assert.match(captured.body, /entityId=ENT_TEST/)
  assert.match(captured.body, /paymentType=DB/)
  assert.match(captured.body, /currency=SAR/)
  assert.match(captured.body, /merchantTransactionId=m1/)
  assert.equal(r.json.id, "chk_1")
})

test("base defaults to eu-test for sandbox/unknown; oppwa ONLY for production mode", () => {
  assert.equal(baseForMode("sandbox"), "https://eu-test.oppwa.com")
  assert.equal(baseForMode(""), "https://eu-test.oppwa.com")
  assert.equal(baseForMode("whatever"), "https://eu-test.oppwa.com")
  assert.equal(baseForMode("production"), "https://oppwa.com")
})

test("adapter wired in sandbox uses the TEST base (no live URL)", () => {
  const adapter = createAdapter({ mode: "sandbox", entityId: "E", accessToken: "T" })
  assert.equal(adapter.base, "https://eu-test.oppwa.com")
})

test("getStatus targets the Copy&Pay status endpoint with entityId", async () => {
  let captured
  const adapter = createAdapter(
    { mode: "sandbox", entityId: "E", accessToken: "T" },
    { httpClient: async (r) => { captured = r; return { status: 200, json: { result: { code: "000.000.000" } } } } }
  )
  await adapter.getStatus("chk_9")
  assert.equal(captured.method, "GET")
  assert.equal(captured.url, "https://eu-test.oppwa.com/v1/checkouts/chk_9/payment?entityId=E")
})

test("classifyResult maps OPPWA result codes", () => {
  assert.equal(classifyResult("000.000.000"), "success")
  assert.equal(classifyResult("000.100.110"), "success")
  assert.equal(classifyResult("000.200.100"), "pending")
  assert.equal(classifyResult("800.400.500"), "pending")
  assert.equal(classifyResult("800.100.150"), "rejected")
  assert.equal(classifyResult(""), "rejected")
})
