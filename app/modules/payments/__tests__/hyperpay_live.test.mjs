// WO-WC-HYPERPAY-001 — frontend live-mode: default OFF, talks only to backend, no secrets.
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import {
  isLiveModeEnabled, requestLiveCheckout, pollLiveStatus, widgetScriptUrl, mountLiveCheckout,
} from "../../../frontend/src/pages/hyperpay_live.js"

const SRC = readFileSync(fileURLToPath(new URL("../../../frontend/src/pages/hyperpay_live.js", import.meta.url)), "utf8")

test("live mode is OFF by default (sandbox stays the default surface)", () => {
  assert.equal(isLiveModeEnabled({}), false)
  assert.equal(isLiveModeEnabled({ __WC_PAYMENTS_LIVE_MODE__: true }), true)
})

test("mountLiveCheckout is a no-op unless live mode is explicitly enabled", async () => {
  let called = false
  const out = await mountLiveCheckout(null, { amount: "10", currency: "SAR" }, {
    win: {}, fetchImpl: async () => { called = true; return { ok: true, json: async () => ({ ok: true, data: {} }) } },
  })
  assert.equal(out, null)
  assert.equal(called, false)
})

test("requestLiveCheckout calls the BACKEND endpoint (not OPPWA directly) and returns data", async () => {
  let url, init
  const data = await requestLiveCheckout({ amount: "92.00", currency: "SAR" }, async (u, i) => {
    url = u; init = i
    return { ok: true, json: async () => ({ ok: true, data: { checkoutId: "chk_1", base: "https://eu-test.oppwa.com", mode: "sandbox" } }) }
  })
  assert.equal(url, "/api/payments/checkouts")
  assert.equal(init.method, "POST")
  assert.equal(data.checkoutId, "chk_1")
  assert.equal(data.base, "https://eu-test.oppwa.com")
})

test("pollLiveStatus hits the backend status route", async () => {
  let url
  const d = await pollLiveStatus("chk_9", async (u) => { url = u; return { ok: true, json: async () => ({ ok: true, data: { status: "success" } }) } })
  assert.equal(url, "/api/payments/chk_9/status")
  assert.equal(d.status, "success")
})

test("widgetScriptUrl points at the backend-reported rail", () => {
  assert.equal(widgetScriptUrl("https://eu-test.oppwa.com", "chk_1"), "https://eu-test.oppwa.com/v1/paymentWidgets.js?checkoutId=chk_1")
})

test("no embedded secret / no hardcoded production base in the live module source", () => {
  assert.doesNotMatch(SRC, /Bearer\s+[A-Za-z0-9._\-]{8,}/)
  assert.doesNotMatch(SRC, /HYPERPAY_[A-Z_]*(TOKEN|SECRET|ENTITY_ID)\s*[:=]\s*["'][^"']+["']/)
  assert.doesNotMatch(SRC, /https:\/\/oppwa\.com/) // no hardcoded production base
})
