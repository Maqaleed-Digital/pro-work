// WO-WC-HYPERPAY-001 — HyperPay LIVE-MODE checkout wiring (Front A).
//
// DISCLOSED-NOT-LIVE by default: live mode is OFF unless explicitly enabled, so the
// existing synthetic sandbox surface (hyperpay_sandbox.js) remains the default and
// the G5 markers in nav-model.js are untouched. This module talks ONLY to the
// WorkCaptain backend (/api/payments/*) — it never embeds the entityId/token/secret
// (those are backend env-only). The backend, in sandbox mode, drives the eu-test
// rail; no live base URL and no live fund movement are reachable from here.

// Live mode is gated by an explicit runtime flag; absence => OFF (sandbox stays).
export function isLiveModeEnabled(win = typeof window !== "undefined" ? window : {}) {
  return Boolean(win && win.__WC_PAYMENTS_LIVE_MODE__ === true)
}

// POST /api/payments/checkouts — returns { checkoutId, base, mode } from the backend.
export async function requestLiveCheckout({ amount, currency, paymentBrand, merchantTransactionId }, fetchImpl) {
  const f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null)
  if (!f) throw new Error("fetch unavailable")
  const res = await f("/api/payments/checkouts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, currency, paymentBrand, merchantTransactionId }),
  })
  const json = await res.json()
  if (!res.ok || !json || json.ok !== true) {
    throw new Error((json && json.error && json.error.code) || "checkout_failed")
  }
  return json.data // { checkoutId, base, mode, resultCode }
}

// GET /api/payments/{id}/status
export async function pollLiveStatus(checkoutId, fetchImpl) {
  const f = fetchImpl || (typeof fetch !== "undefined" ? fetch : null)
  if (!f) throw new Error("fetch unavailable")
  const res = await f(`/api/payments/${encodeURIComponent(checkoutId)}/status`)
  const json = await res.json()
  if (!res.ok || !json || json.ok !== true) throw new Error("status_failed")
  return json.data // { checkoutId, status, resultCode }
}

// Copy&Pay widget script URL — loaded against the SAME rail the backend reports
// (eu-test in sandbox mode). The checkout was created server-side; only its id is here.
export function widgetScriptUrl(base, checkoutId) {
  return `${base}/v1/paymentWidgets.js?checkoutId=${encodeURIComponent(checkoutId)}`
}

// Entry point used by the page/router. No-op (returns null) unless live mode is ON,
// so the disclosed-not-live sandbox path remains the default experience.
export async function mountLiveCheckout(container, opts, deps = {}) {
  const win = deps.win || (typeof window !== "undefined" ? window : {})
  if (!isLiveModeEnabled(win)) return null
  const data = await requestLiveCheckout(opts, deps.fetchImpl)
  if (container && deps.document) {
    const script = deps.document.createElement("script")
    script.src = widgetScriptUrl(data.base, data.checkoutId)
    container.appendChild(script)
  }
  return data
}
