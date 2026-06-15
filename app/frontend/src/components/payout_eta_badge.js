/**
 * S39-G4 — PayoutETABadge Component
 *
 * Standalone component for displaying payout ETA on contract and earnings screens.
 * Data sourced from psp_routing_matrix_v1.json via the fee transparency API.
 *
 * Usage:
 *   import { createPayoutEtaBadge } from "./components/payout_eta_badge.js"
 *   const badge = createPayoutEtaBadge({ container, paymentMethodId, currency? })
 *   badge.update(newMethodId)
 *   badge.destroy()
 */

import { apiPost } from "../api.js"

/**
 * createPayoutEtaBadge({ container, paymentMethodId, contractAmount?, currency? })
 *
 * Mounts a payout ETA badge into `container`.
 * If contractAmount is provided, fetches live data from the calculate endpoint.
 * Otherwise renders a loading state and waits for update().
 */
export function createPayoutEtaBadge(opts) {
  const container       = opts.container
  const currency        = opts.currency || "SAR"
  let   paymentMethodId = opts.paymentMethodId
  let   contractAmount  = opts.contractAmount || 1000  // sentinel for ETA-only calls
  let   _destroyed      = false

  function el(tag, attrs, ...children) {
    const e = document.createElement(tag)
    if (attrs) {
      Object.entries(attrs).forEach(([k, v]) => {
        if (k === "style") e.style.cssText = v
        else if (k === "class") e.className = v
        else e.setAttribute(k, v)
      })
    }
    children.forEach(c => {
      if (typeof c === "string") e.appendChild(document.createTextNode(c))
      else if (c) e.appendChild(c)
    })
    return e
  }

  const root = el("div", { class: "payout-eta-badge-wrap" })
  container.appendChild(root)

  function renderLoading() {
    root.innerHTML = ""
    root.appendChild(el("div", { class: "payout-eta-badge payout-eta-badge--loading" }, "Loading payout info…"))
  }

  function renderBadge(result) {
    if (_destroyed) return
    root.innerHTML = ""

    const isInstant = result.instant
    const wrap = el("div", {
      class: "payout-eta-badge" + (isInstant ? " payout-eta-badge--instant" : ""),
      role: "status",
      "aria-live": "polite",
    })

    const icon = el("span", { class: "payout-eta-badge__icon", "aria-hidden": "true" },
      isInstant ? "⚡" : "🕐")

    const text = el("div", { class: "payout-eta-badge__text" })

    const enLine = el("div", { class: "payout-eta-badge__en" },
      `Payout: ${result.payoutEtaLabel}`)
    const arLine = el("div", { class: "payout-eta-badge__ar", dir: "rtl", lang: "ar" },
      `الدفع: ${result.payoutEtaLabelAr}`)

    // Method name line
    const methodEn = el("div", { class: "payout-eta-badge__method" },
      `via ${result.paymentMethod.label}`)
    const methodAr = el("div", { class: "payout-eta-badge__method-ar", dir: "rtl", lang: "ar", style: "font-size:11px;color:#666" },
      `عبر ${result.paymentMethod.label_ar}`)

    text.appendChild(enLine)
    text.appendChild(arLine)
    text.appendChild(methodEn)
    text.appendChild(methodAr)

    wrap.appendChild(icon)
    wrap.appendChild(text)
    root.appendChild(wrap)
  }

  function renderError(msg) {
    root.innerHTML = ""
    root.appendChild(el("div", { class: "payout-eta-badge payout-eta-badge--error" }, msg || "ETA unavailable"))
  }

  function load(methodId, amount) {
    if (!methodId) { renderError("No payment method selected"); return }
    renderLoading()
    apiPost("/api/payments/fee-transparency/calculate", {
      contract_amount: amount || contractAmount,
      payment_method_id: methodId,
      currency,
    })
      .then(result => renderBadge(result))
      .catch(e => renderError(String(e && e.message ? e.message : "ETA unavailable")))
  }

  // Initial load
  if (paymentMethodId) load(paymentMethodId, contractAmount)

  return {
    /**
     * update(newMethodId, newAmount?) — refresh badge for a different method/amount
     */
    update(newMethodId, newAmount) {
      if (_destroyed) return
      paymentMethodId = newMethodId
      if (newAmount) contractAmount = newAmount
      load(paymentMethodId, contractAmount)
    },
    destroy() {
      _destroyed = true
      if (root.parentNode) root.parentNode.removeChild(root)
    },
  }
}
