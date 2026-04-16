/**
 * S39-G4 — FeeCalculator Component
 *
 * Embeds on: job post screen, offer builder, contract confirmation.
 * Shows complete fee math on ONE screen before any payment commitment.
 *
 * Constraint: 0% freelancer commission badge is MANDATORY — not optional.
 * Dynamic: updates live as payment method or amount changes.
 * RTL: Arabic labels via logical CSS properties (margin-inline-start, etc.)
 *
 * Usage:
 *   import { createFeeCalculator } from "./components/fee_calculator.js"
 *   const calc = createFeeCalculator({ container, onResult?, initialAmount?, currency? })
 *   calc.setValue(5000)    // programmatic update
 *   calc.getResult()       // current { freelancerPayout, employerTotalCost, ... }
 *   calc.destroy()
 */

import { apiGet, apiPost } from "../api.js"

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n, currency) {
  currency = currency || "SAR"
  return new Intl.NumberFormat("en-SA", {
    style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n)
}

function fmtAr(n, currency) {
  currency = currency || "SAR"
  return new Intl.NumberFormat("ar-SA", {
    style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n)
}

function el(tag, attrs, ...children) {
  const e = document.createElement(tag)
  if (attrs) {
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === "style") { e.style.cssText = v }
      else if (k === "class") { e.className = v }
      else { e.setAttribute(k, v) }
    })
  }
  children.forEach(c => {
    if (typeof c === "string") { e.appendChild(document.createTextNode(c)) }
    else if (c) { e.appendChild(c) }
  })
  return e
}

// ── Zero-commission badge ─────────────────────────────────────────────────────

/**
 * buildZeroCommissionBadge()
 *
 * Renders the MANDATORY 0% freelancer commission badge.
 * Must appear on every offer and contract screen — never hidden.
 */
function buildZeroCommissionBadge() {
  const wrap = el("div", { class: "fee-zero-badge", role: "status", "aria-live": "polite" })

  const icon = el("span", { class: "fee-zero-badge__icon", "aria-hidden": "true" }, "✓")

  const textWrap = el("div", { class: "fee-zero-badge__text" })
  const en = el("div", { class: "fee-zero-badge__en" }, "0% freelancer commission — WorkCaptain charges employers only")
  const ar = el("div", { class: "fee-zero-badge__ar", dir: "rtl", lang: "ar" }, "٠٪ عمولة على المستقل — WorkCaptain تحصل من صاحب العمل فقط")
  textWrap.appendChild(en)
  textWrap.appendChild(ar)

  wrap.appendChild(icon)
  wrap.appendChild(textWrap)
  return wrap
}

// ── Competitor comparison ─────────────────────────────────────────────────────

function buildCompetitorTable(comparison) {
  const wrap = el("div", { class: "fee-competitor" })

  const header = el("div", { class: "fee-competitor__header" })
  const enH = el("div", {}, "What changes, when — why 0% matters")
  const arH = el("div", { dir: "rtl", lang: "ar", style: "font-size:11px;color:#666" }, "لماذا يهم غياب العمولة — مقارنة بالمنافسين")
  header.appendChild(enH)
  header.appendChild(arH)
  wrap.appendChild(header)

  const rows = [
    { name: "WorkCaptain", fee: "0% always", note: "Structural policy, not a promotion. Never changes.", highlight: true },
    { name: "Upwork",      fee: "10–20%",    note: "Changed 3× in 5 years. Most recently May 2023.",  highlight: false },
    { name: "Fiverr",      fee: "20% flat",  note: "Stable rate + added processing fees in 2024.",    highlight: false },
    { name: "Malt",        fee: "0–5%",      note: "Varies by region and contract type.",              highlight: false },
  ]

  const table = el("table", { class: "fee-competitor__table", role: "table" })
  const thead = el("thead")
  const hrow  = el("tr")
  ;["Platform", "Freelancer fee", "Stability"].forEach(label => {
    hrow.appendChild(el("th", { scope: "col" }, label))
  })
  thead.appendChild(hrow)
  table.appendChild(thead)

  const tbody = el("tbody")
  rows.forEach(r => {
    const tr = el("tr", { class: r.highlight ? "fee-competitor__row--highlight" : "" })
    tr.appendChild(el("td", {}, r.name))
    tr.appendChild(el("td", { class: r.highlight ? "fee-zero-value" : "" }, r.fee))
    tr.appendChild(el("td", { style: "font-size:11px;color:#666" }, r.note))
    tbody.appendChild(tr)
  })
  table.appendChild(tbody)
  wrap.appendChild(table)
  return wrap
}

// ── Breakdown row ─────────────────────────────────────────────────────────────

function buildBreakdownRow(labelEn, labelAr, value, currency, opts) {
  opts = opts || {}
  const row = el("div", { class: "fee-breakdown__row" + (opts.total ? " fee-breakdown__row--total" : "") + (opts.zero ? " fee-breakdown__row--zero" : "") })

  const labels = el("div", { class: "fee-breakdown__labels" })
  labels.appendChild(el("span", { class: "fee-breakdown__en" }, labelEn))
  labels.appendChild(el("span", { class: "fee-breakdown__ar", dir: "rtl", lang: "ar" }, labelAr))
  row.appendChild(labels)

  const val = el("div", { class: "fee-breakdown__value" })
  val.textContent = value !== null ? fmt(value, currency) : "—"
  if (opts.zero) val.classList.add("fee-breakdown__value--zero")
  if (opts.total) val.classList.add("fee-breakdown__value--total")
  if (opts.highlight) val.classList.add("fee-breakdown__value--highlight")
  row.appendChild(val)

  return { row, valueEl: val }
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * createFeeCalculator({ container, onResult?, initialAmount?, currency? })
 */
export function createFeeCalculator(opts) {
  const container   = opts.container
  const currency    = opts.currency || "SAR"
  const onResult    = opts.onResult || null

  let _methods    = []
  let _result     = null
  let _destroyed  = false

  // ── Skeleton ────────────────────────────────────────────────────────────────

  const root = el("div", { class: "fee-calculator", role: "region", "aria-label": "Fee calculator" })
  container.appendChild(root)

  // MANDATORY 0% badge — always visible
  root.appendChild(buildZeroCommissionBadge())

  // Input row
  const inputSection = el("div", { class: "fee-calculator__inputs" })

  const amountGroup = el("div", { class: "fee-calculator__input-group" })
  const amountLabel = el("label", { class: "fee-calculator__label", for: "fee-calc-amount" })
  amountLabel.appendChild(el("span", {}, "Contract amount "))
  amountLabel.appendChild(el("span", { dir: "rtl", lang: "ar", style: "font-size:11px;color:#666" }, "/ قيمة العقد"))
  amountLabel.appendChild(el("span", { style: "font-size:11px;color:#888;margin-inline-start:4px" }, `(${currency})`))
  const amountInput = el("input", {
    id: "fee-calc-amount", type: "number", class: "fee-calculator__input",
    min: "1", step: "1", placeholder: "e.g. 5000",
    "aria-describedby": "fee-calc-amount-hint",
  })
  if (opts.initialAmount) amountInput.value = String(opts.initialAmount)
  const amountHint = el("div", { id: "fee-calc-amount-hint", class: "fee-calculator__hint" },
    "Enter the agreed contract value")
  amountGroup.appendChild(amountLabel)
  amountGroup.appendChild(amountInput)
  amountGroup.appendChild(amountHint)

  const methodGroup = el("div", { class: "fee-calculator__input-group" })
  const methodLabel = el("label", { class: "fee-calculator__label", for: "fee-calc-method" })
  methodLabel.appendChild(el("span", {}, "Payment method "))
  methodLabel.appendChild(el("span", { dir: "rtl", lang: "ar", style: "font-size:11px;color:#666" }, "/ طريقة الدفع"))
  const methodSelect = el("select", {
    id: "fee-calc-method", class: "fee-calculator__select",
    "aria-describedby": "fee-calc-method-hint",
  })
  const methodHint = el("div", { id: "fee-calc-method-hint", class: "fee-calculator__hint" },
    "Fee breakdown updates instantly as you choose")
  methodGroup.appendChild(methodLabel)
  methodGroup.appendChild(methodSelect)
  methodGroup.appendChild(methodHint)

  inputSection.appendChild(amountGroup)
  inputSection.appendChild(methodGroup)
  root.appendChild(inputSection)

  // Result section
  const resultSection = el("div", { class: "fee-calculator__result", "aria-live": "polite", "aria-atomic": "true" })
  root.appendChild(resultSection)

  // Competitor comparison — shown below the calculator
  const compSection = el("div", { class: "fee-calculator__competitor" })
  root.appendChild(compSection)

  // ── Load payment methods ────────────────────────────────────────────────────

  apiGet(`/api/payments/fee-transparency/methods?currency=${encodeURIComponent(currency)}`)
    .then(methods => {
      if (_destroyed) return
      _methods = Array.isArray(methods) ? methods : []
      methodSelect.innerHTML = ""
      _methods.forEach(m => {
        const opt = document.createElement("option")
        opt.value = m.id
        opt.textContent = `${m.label} — ${m.payout_eta_label}`
        methodSelect.appendChild(opt)
      })
      if (_methods.length) recalculate()
    })
    .catch(() => {
      resultSection.innerHTML = '<div class="fee-calculator__error">Failed to load payment methods</div>'
    })

  apiGet("/api/payments/fee-transparency/competitor-comparison")
    .then(comparison => {
      if (_destroyed) return
      compSection.innerHTML = ""
      compSection.appendChild(buildCompetitorTable(comparison))
    })
    .catch(() => {})

  // ── Recalculate ──────────────────────────────────────────────────────────────

  function recalculate() {
    const rawAmount = parseFloat(amountInput.value)
    const methodId  = methodSelect.value
    if (!Number.isFinite(rawAmount) || rawAmount <= 0 || !methodId) {
      resultSection.innerHTML = '<div class="fee-calculator__hint">Enter a contract amount to see the fee breakdown.</div>'
      return
    }

    apiPost("/api/payments/fee-transparency/calculate", {
      contract_amount: rawAmount,
      payment_method_id: methodId,
      currency,
    })
      .then(data => {
        if (_destroyed) return
        _result = data
        renderResult(data)
        if (onResult) onResult(data)
      })
      .catch(e => {
        resultSection.innerHTML = `<div class="fee-calculator__error">${String(e && e.message ? e.message : e)}</div>`
      })
  }

  // ── Render result ────────────────────────────────────────────────────────────

  function renderResult(r) {
    resultSection.innerHTML = ""

    const breakdown = el("div", { class: "fee-breakdown", role: "table", "aria-label": "Fee breakdown" })

    // Freelancer receives (always = contract amount)
    const { row: fRow } = buildBreakdownRow(
      "Freelancer receives", "يستلم المستقل",
      r.freelancerPayout, currency, { highlight: true },
    )
    breakdown.appendChild(fRow)

    // 0% commission line — explicit confirmation
    const commRow = el("div", { class: "fee-breakdown__row fee-breakdown__row--zero" })
    const commLabels = el("div", { class: "fee-breakdown__labels" })
    commLabels.appendChild(el("span", { class: "fee-breakdown__en" }, "WorkCaptain commission on freelancer"))
    commLabels.appendChild(el("span", { class: "fee-breakdown__ar", dir: "rtl", lang: "ar" }, "عمولة WorkCaptain على المستقل"))
    commRow.appendChild(commLabels)
    const commVal = el("div", { class: "fee-breakdown__value fee-breakdown__value--zero" }, "0%  — always")
    commRow.appendChild(commVal)
    breakdown.appendChild(commRow)

    // Divider
    breakdown.appendChild(el("hr", { class: "fee-breakdown__divider", "aria-hidden": "true" }))

    // Employer side
    const empLabel = el("div", { class: "fee-breakdown__section-label" })
    empLabel.appendChild(el("span", {}, "Employer pays"))
    empLabel.appendChild(el("span", { dir: "rtl", lang: "ar", style: "margin-inline-start:8px;font-size:11px;color:#666" }, "يدفع صاحب العمل"))
    breakdown.appendChild(empLabel)

    const { row: contractRow } = buildBreakdownRow(
      "Contract amount", "قيمة العقد", r.contractAmount, currency,
    )
    breakdown.appendChild(contractRow)

    const { row: platformRow } = buildBreakdownRow(
      `Platform fee (${r.policy.employer_platform_fee_pct}%)`,
      `رسوم المنصة (${r.policy.employer_platform_fee_pct}٪)`,
      r.platformFeeAmount, currency,
    )
    breakdown.appendChild(platformRow)

    const pspPct = r.paymentMethod.psp_fee_pct
    const { row: pspRow } = buildBreakdownRow(
      `${r.paymentMethod.label} fee (${pspPct}%)`,
      `${r.paymentMethod.label_ar} (${pspPct}٪)`,
      r.pspFeeAmount, currency,
    )
    breakdown.appendChild(pspRow)

    const { row: totalRow } = buildBreakdownRow(
      "Employer total cost", "إجمالي تكلفة صاحب العمل",
      r.employerTotalCost, currency, { total: true },
    )
    breakdown.appendChild(totalRow)

    resultSection.appendChild(breakdown)

    // Payout ETA badge
    resultSection.appendChild(buildPayoutEtaBadge(r))
  }

  // ── Events ───────────────────────────────────────────────────────────────────

  amountInput.addEventListener("input", recalculate)
  methodSelect.addEventListener("change", recalculate)

  // Trigger initial calculation if amount pre-set
  if (opts.initialAmount && _methods.length) recalculate()

  // ── Public API ────────────────────────────────────────────────────────────────

  return {
    setValue(amount) {
      amountInput.value = String(amount)
      if (_methods.length) recalculate()
    },
    setMethod(methodId) {
      methodSelect.value = methodId
      if (_methods.length) recalculate()
    },
    getResult() {
      return _result
    },
    destroy() {
      _destroyed = true
      if (root.parentNode) root.parentNode.removeChild(root)
    },
  }
}

// ── PayoutETABadge helper (also exported standalone) ──────────────────────────

/**
 * buildPayoutEtaBadge(result)
 *
 * Builds the payout ETA badge element from a calculateFees result.
 * Used inline in FeeCalculator AND exported for standalone use on
 * contract/earnings screens.
 */
export function buildPayoutEtaBadge(result) {
  const isInstant = result.instant
  const wrap = el("div", { class: "payout-eta-badge" + (isInstant ? " payout-eta-badge--instant" : ""), role: "status" })

  const icon = el("span", { class: "payout-eta-badge__icon", "aria-hidden": "true" }, isInstant ? "⚡" : "🕐")

  const text = el("div", { class: "payout-eta-badge__text" })
  const enLine = el("div", { class: "payout-eta-badge__en" },
    `Payout: ${result.payoutEtaLabel}`)
  const arLine = el("div", { class: "payout-eta-badge__ar", dir: "rtl", lang: "ar" },
    `الدفع: ${result.payoutEtaLabelAr}`)
  text.appendChild(enLine)
  text.appendChild(arLine)

  wrap.appendChild(icon)
  wrap.appendChild(text)
  return wrap
}
