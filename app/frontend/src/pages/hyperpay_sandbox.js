// WC-W4-UI-001 · UI-7 — HyperPay Sandbox payment surface. FRONT A (customer), route hyperpay-sandbox.
// CLASSIFICATION (Pattern-3): a payment surface EXECUTES (charge) → Mode A + executing-tag. It is
// customer-facing (Front A) but DISCLOSED-NOT-LIVE and SANDBOX-only: live fund movement is HELD
// behind G5 (WC-PAY-TEST-001). NON-CUSTODIAL.
//
// This surface demonstrates the Copy&Pay flow WITHOUT moving money:
//   • It performs NO network call and reaches NO payment endpoint (no live charge path).
//   • It produces a CLIENT-SIDE SYNTHETIC response mirroring the real adapter's sandbox contract
//     (hyperpay_adapter.js: SANDBOX_BASE_URL https://eu-test.oppwa.com/v1, result 000.000.000,
//     brands MADA/VISA/MASTERCARD, SAR). The production base (oppwa.com) is NEVER referenced here.
//   • It references NO secret. HyperPay credentials (HYPERPAY_ENTITY_ID / HYPERPAY_ACCESS_TOKEN /
//     HYPERPAY_WEBHOOK_SECRET) live in the BACKEND adapter, env-only — never in this client surface,
//     never in committed code, never in CI. The live charge runs server-side behind G5, not here.
//   • Fail-closed-visible: a prominent SANDBOX / NOT-LIVE disclosure is always rendered.

// Sandbox environment disclosure (display only — no call is made to it).
const SANDBOX = Object.freeze({ env: "sandbox", base: "https://eu-test.oppwa.com/v1", custody: "non-custodial" })
const BRANDS = ["MADA", "VISA", "MASTERCARD"] // KSA debit/credit (mirrors adapter SUPPORTED_METHODS)
const CURRENCY = "SAR"

// Synthetic sandbox charge — CLIENT-SIDE ONLY. Mirrors hyperpay_adapter sandboxChargeResponse shape.
// No network, no money, no secret. Demonstrates the flow's result envelope for the demo.
function syntheticSandboxCharge({ amount, paymentMethod }) {
  const rand = Math.random().toString(16).slice(2, 14)
  return {
    success: true,
    status: "CAPTURED",
    pspRef: `hp_chg_${rand}`,
    sandbox: true,
    pspResponse: {
      amount: String(amount),
      currency: CURRENCY,
      paymentBrand: paymentMethod,
      result: { code: "000.000.000", description: "Transaction approved (sandbox)" },
      sandbox: true,
    },
  }
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
    banner.textContent =
      "SANDBOX — NO LIVE PAYMENT. This surface demonstrates the HyperPay flow only; no money moves. " +
      "Live fund movement is held behind G5 (WC-PAY-TEST-001). Non-custodial."
    container.appendChild(banner)

    const env = document.createElement("p")
    env.className = "sandbox-env"
    env.setAttribute("data-mode", "A")
    env.textContent = `Environment: HyperPay sandbox · ${SANDBOX.base} · ${SANDBOX.custody}`
    container.appendChild(env)

    // Copy&Pay-style sandbox form (no real fields submitted anywhere).
    const form = document.createElement("div")
    form.className = "hyperpay-form"

    const amountLabel = document.createElement("label")
    amountLabel.textContent = `Amount (${CURRENCY})`
    const amount = document.createElement("input")
    amount.type = "number"
    amount.min = "1"
    amount.value = "250"
    amount.className = "hp-amount"
    amountLabel.appendChild(amount)

    const brandLabel = document.createElement("label")
    brandLabel.textContent = "Card brand"
    const brand = document.createElement("select")
    brand.className = "hp-brand"
    BRANDS.forEach((b) => {
      const o = document.createElement("option")
      o.value = b
      o.textContent = b
      brand.appendChild(o)
    })
    brandLabel.appendChild(brand)

    const note = document.createElement("p")
    note.className = "hp-note"
    note.textContent = "Use HyperPay sandbox test cards only. No live card is charged."

    const btn = document.createElement("button")
    btn.className = "hp-run-sandbox"
    btn.textContent = "Run sandbox charge"

    const out = document.createElement("pre")
    out.className = "hp-result"
    out.setAttribute("data-sandbox", "true")

    btn.addEventListener("click", () => {
      // CLIENT-SIDE synthetic result only — no fetch, no endpoint, no secret, no money.
      const res = syntheticSandboxCharge({ amount: Number(amount.value) || 0, paymentMethod: brand.value })
      out.textContent = JSON.stringify(res, null, 2)
    })

    form.appendChild(amountLabel)
    form.appendChild(brandLabel)
    form.appendChild(note)
    form.appendChild(btn)
    container.appendChild(form)
    container.appendChild(out)
  },
}
