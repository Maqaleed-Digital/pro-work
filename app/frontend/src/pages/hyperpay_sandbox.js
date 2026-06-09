// WC-W4-UI-001 · UI-7 / WC-PAY-TEST-001 — HyperPay Sandbox payment surface. FRONT A (customer),
// route hyperpay-sandbox. A payment surface EXECUTES (charge) → Mode A + executing-tag. Customer-
// facing but DISCLOSED-NOT-LIVE and SANDBOX-only: live fund movement is HELD behind G5
// (WC-PAY-TEST-001 D7 is gated on the pending Maqaleed MID + G5). NON-CUSTODIAL.
//
// WC-PAY-TEST-001 (sandbox test depth): this surface walks the HyperPay Copy&Pay flow
// (prepare checkout → render Copy&Pay widget → submit test card → handle result) and exercises the
// three sandbox result paths — APPROVED / DECLINED / ERROR — WITHOUT moving money:
//   • NO network call, NO payment endpoint, NO live charge path. Client-side synthetic only.
//   • Mirrors the S38-G1 HyperPay adapter's SANDBOX contract (app/modules/payments/hyperpay_adapter.js
//     on sprint/S45: SANDBOX_BASE_URL https://eu-test.oppwa.com/v1, PaymentType DB, SAR, brands
//     MADA/VISA/MASTERCARD; success family 000.000.* / 000.100.*). The production base (oppwa.com)
//     is NEVER referenced here, and the backend production-charge path is NOT part of this surface.
//   • References NO secret. HyperPay credentials (HYPERPAY_ENTITY_ID / HYPERPAY_ACCESS_TOKEN /
//     HYPERPAY_WEBHOOK_SECRET) live in the BACKEND adapter, env-only — never in this client surface,
//     never committed, never in CI. The test Entity ID is a non-secret test-pack value; the Access
//     Token is the secret and is never present here.
//   • Fail-closed-visible: a prominent SANDBOX / NOT-LIVE (G5) disclosure is always rendered.

// Sandbox environment disclosure (display only — no call is made to it).
export const SANDBOX = Object.freeze({ env: "sandbox", base: "https://eu-test.oppwa.com/v1", paymentType: "DB", custody: "non-custodial" })
export const BRANDS = ["MADA", "VISA", "MASTERCARD"] // KSA debit/credit (mirrors adapter SUPPORTED_METHODS)
export const CURRENCY = "SAR"

// HyperPay sandbox result codes (mirror the adapter's contract). Success family = 000.000.* / 000.100.*.
export const RESULT_CODES = Object.freeze({
  APPROVED: "000.000.000", // sandbox approved
  DECLINED: "800.100.151", // sandbox rejection (declined)
  ERROR:    "900.100.100", // sandbox communication/system error
})
// Outcome selector → the test-card behaviour being simulated (no real PAN needed).
export const OUTCOMES = ["APPROVED", "DECLINED", "ERROR"]

// Mirrors the adapter's success test: a code in the 000.000 / 000.100 family is captured.
export function isApprovedCode(code) {
  return typeof code === "string" && (code.startsWith("000.000") || code.startsWith("000.100"))
}

// prepareCheckout — synthetic, client-side. Mirrors the adapter's checkout preparation. NO network.
export function prepareCheckout({ amount, currency = CURRENCY, paymentMethod }) {
  if (!(amount > 0)) throw new Error("amount must be positive")
  if (!BRANDS.includes(String(paymentMethod).toUpperCase())) throw new Error(`unsupported brand: ${paymentMethod}`)
  const rand = Math.random().toString(16).slice(2, 14)
  return Object.freeze({
    checkoutId: `chk_sbx_${rand}`,
    env: "sandbox", base: SANDBOX.base, paymentType: SANDBOX.paymentType,
    amount: String(amount), currency, paymentBrand: String(paymentMethod).toUpperCase(),
    sandbox: true,
  })
}

// submitSandboxPayment — synthetic result for the selected outcome. CLIENT-SIDE ONLY: no network,
// no money, no secret. Mirrors the adapter's sandbox response envelope.
export function submitSandboxPayment({ checkout, outcome }) {
  if (!checkout || checkout.sandbox !== true) throw new Error("a prepared sandbox checkout is required")
  const oc = OUTCOMES.includes(outcome) ? outcome : "APPROVED"
  const code = RESULT_CODES[oc]
  const status = oc === "APPROVED" ? "CAPTURED" : oc === "DECLINED" ? "DECLINED" : "ERROR"
  const descriptions = {
    APPROVED: "Transaction approved (sandbox)",
    DECLINED: "Transaction declined (sandbox)",
    ERROR:    "System/communication error (sandbox)",
  }
  return Object.freeze({
    success: isApprovedCode(code),
    status,
    fundMovement: false,          // NEVER — this is sandbox, no money moves
    pspRef: `hp_chg_${Math.random().toString(16).slice(2, 14)}`,
    sandbox: true,
    pspResponse: Object.freeze({
      amount: checkout.amount, currency: checkout.currency, paymentBrand: checkout.paymentBrand,
      result: Object.freeze({ code, description: descriptions[oc] }),
      sandbox: true,
    }),
  })
}

export default {
  render(container) {
    const title = document.createElement("div")
    title.className = "page-title"
    title.textContent = "Payments — HyperPay (Sandbox)"
    container.appendChild(title)

    // FAIL-CLOSED-VISIBLE disclosed-not-live banner (G5 gate, surfaced).
    const banner = document.createElement("div")
    banner.className = "sandbox-banner"
    banner.setAttribute("role", "alert")
    banner.setAttribute("data-state", "disclosed-not-live")
    banner.setAttribute("data-env", "sandbox")
    banner.setAttribute("data-gate", "G5")
    banner.textContent =
      "SANDBOX — NO LIVE PAYMENT. This surface demonstrates the HyperPay Copy&Pay flow only; no money " +
      "moves. Live transactions (D7) are held behind G5 (WC-PAY-TEST-001). Non-custodial."
    container.appendChild(banner)

    const env = document.createElement("p")
    env.className = "sandbox-env"
    env.setAttribute("data-mode", "A")
    env.textContent = `Environment: HyperPay sandbox · ${SANDBOX.base} · PaymentType ${SANDBOX.paymentType} · ${SANDBOX.custody}`
    container.appendChild(env)

    // ── Copy&Pay sandbox form ──────────────────────────────────────────────────
    const form = document.createElement("div")
    form.className = "hyperpay-form"

    const amountLabel = document.createElement("label")
    amountLabel.textContent = `Amount (${CURRENCY})`
    const amount = document.createElement("input")
    amount.type = "number"; amount.min = "1"; amount.value = "250"; amount.className = "hp-amount"
    amountLabel.appendChild(amount)

    const brandLabel = document.createElement("label")
    brandLabel.textContent = "Card brand"
    const brand = document.createElement("select"); brand.className = "hp-brand"
    BRANDS.forEach((b) => { const o = document.createElement("option"); o.value = b; o.textContent = b; brand.appendChild(o) })
    brandLabel.appendChild(brand)

    const outcomeLabel = document.createElement("label")
    outcomeLabel.textContent = "Sandbox test card outcome"
    const outcome = document.createElement("select"); outcome.className = "hp-outcome"
    OUTCOMES.forEach((o) => { const op = document.createElement("option"); op.value = o; op.textContent = o; outcome.appendChild(op) })
    outcomeLabel.appendChild(outcome)

    const note = document.createElement("p")
    note.className = "hp-note"
    note.textContent = "Use HyperPay sandbox test cards only. No live card is charged; no funds move."

    // Copy&Pay widget placeholder (disclosed-not-live — no live iframe is loaded to eu-test here).
    const widget = document.createElement("div")
    widget.className = "hp-widget"; widget.setAttribute("data-state", "disclosed-not-live")
    widget.textContent = "[ HyperPay Copy&Pay widget — sandbox placeholder, not live ]"

    const prepareBtn = document.createElement("button"); prepareBtn.className = "hp-prepare"; prepareBtn.textContent = "Prepare checkout"
    const submitBtn  = document.createElement("button"); submitBtn.className = "hp-submit"; submitBtn.textContent = "Submit test card"; submitBtn.disabled = true

    const out = document.createElement("pre"); out.className = "hp-result"; out.setAttribute("data-sandbox", "true")

    let checkout = null
    prepareBtn.addEventListener("click", () => {
      try {
        checkout = prepareCheckout({ amount: Number(amount.value) || 0, paymentMethod: brand.value })
        submitBtn.disabled = false
        out.setAttribute("data-status", "PREPARED")
        out.textContent = JSON.stringify({ step: "checkout-prepared", checkoutId: checkout.checkoutId, env: checkout.env }, null, 2)
      } catch (e) {
        out.setAttribute("data-status", "ERROR")
        out.textContent = `prepare error: ${e.message}`
      }
    })
    submitBtn.addEventListener("click", () => {
      // CLIENT-SIDE synthetic result only — no fetch, no endpoint, no secret, no money.
      const res = submitSandboxPayment({ checkout, outcome: outcome.value })
      out.setAttribute("data-status", res.status)
      out.textContent = JSON.stringify(res, null, 2)
    })

    form.appendChild(amountLabel); form.appendChild(brandLabel); form.appendChild(outcomeLabel)
    form.appendChild(note); form.appendChild(widget); form.appendChild(prepareBtn); form.appendChild(submitBtn)
    container.appendChild(form)
    container.appendChild(out)
  },
}
