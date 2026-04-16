/**
 * S39-G4 — Fee Transparency Page
 *
 * Single-screen view showing:
 *   1. 0% freelancer commission badge (MANDATORY, always visible)
 *   2. Job post section with FeeCalculator embedded
 *   3. Offer builder section (pre-loaded from calculator result)
 *   4. Contract confirmation section with PayoutETABadge
 *
 * Constraint: ALL fee math is visible on ONE screen before payment commitment.
 * RTL: Arabic labels via logical CSS + dir="rtl" on Arabic spans.
 */

import { createFeeCalculator }  from "../components/fee_calculator.js"
import { createPayoutEtaBadge } from "../components/payout_eta_badge.js"

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

function sectionTitle(enText, arText) {
  const div = el("div", { class: "ft-section-title" })
  div.appendChild(el("span", {}, enText))
  div.appendChild(el("span", { class: "ft-section-title__ar", dir: "rtl", lang: "ar" }, ` / ${arText}`))
  return div
}

export default {
  render(container) {
    container.innerHTML = ""

    // ── Page header ────────────────────────────────────────────────────────────
    const header = el("div", { class: "page-title" })
    header.appendChild(el("span", {}, "Fee Transparency "))
    header.appendChild(el("span", { dir: "rtl", lang: "ar", style: "font-size:13px;font-weight:400;color:#666" }, "/ شفافية الرسوم"))
    container.appendChild(header)

    const intro = el("p", { class: "ft-intro" },
      "Full fee breakdown — see exactly what you pay and what the freelancer receives before committing.")
    container.appendChild(intro)

    // ── Section 1: Job Post + Fee Calculator ───────────────────────────────────
    const calcSection = el("section", { class: "ft-section", "aria-labelledby": "ft-calc-heading" })

    const calcHeading = el("div", { id: "ft-calc-heading" })
    calcHeading.appendChild(sectionTitle("1. Job Post & Fee Calculator", "١. نشر الوظيفة وحاسبة الرسوم"))
    calcSection.appendChild(calcHeading)

    const calcDesc = el("p", { class: "ft-section-desc" },
      "Enter the contract amount and select a payment method. All fees update live.")
    calcSection.appendChild(calcDesc)

    // FeeCalculator embeds here
    const calcContainer = el("div", { class: "ft-calc-container" })
    calcSection.appendChild(calcContainer)
    container.appendChild(calcSection)

    let _calcResult = null
    let _payoutBadge = null

    const calc = createFeeCalculator({
      container: calcContainer,
      currency: "SAR",
      initialAmount: 5000,
      onResult(result) {
        _calcResult = result
        refreshOfferSection(result)
        refreshContractSection(result)
      },
    })

    // ── Section 2: Offer Builder ───────────────────────────────────────────────
    const offerSection = el("section", { class: "ft-section", "aria-labelledby": "ft-offer-heading" })
    offerSection.appendChild(sectionTitle("2. Offer Builder", "٢. بناء العرض"))

    const offerDesc = el("p", { class: "ft-section-desc" },
      "Review the offer terms. Freelancer sees the contract amount — no hidden deductions.")
    offerSection.appendChild(offerDesc)

    const offerCard = el("div", { class: "ft-offer-card" })
    offerSection.appendChild(offerCard)
    container.appendChild(offerSection)

    function refreshOfferSection(r) {
      offerCard.innerHTML = ""

      // 0% badge is MANDATORY on offer screen
      const zeroBadge = el("div", { class: "fee-zero-badge fee-zero-badge--compact", role: "status" })
      zeroBadge.appendChild(el("span", { "aria-hidden": "true" }, "✓ "))
      zeroBadge.appendChild(el("strong", {}, "0% freelancer commission"))
      zeroBadge.appendChild(el("span", { dir: "rtl", lang: "ar", style: "margin-inline-start:8px;font-size:11px;color:#1a7f37" }, "٠٪ عمولة على المستقل"))
      offerCard.appendChild(zeroBadge)

      const rows = [
        { en: "Contract amount", ar: "قيمة العقد",          val: r.contractAmount },
        { en: "Freelancer receives", ar: "يستلم المستقل",   val: r.freelancerPayout, highlight: true },
        { en: "WorkCaptain deduction", ar: "خصم WorkCaptain", val: r.freelancerCommission, zero: true },
      ]
      const kv = el("div", { class: "ft-kv" })
      rows.forEach(row => {
        const kvRow = el("div", { class: "ft-kv__row" + (row.highlight ? " ft-kv__row--highlight" : "") + (row.zero ? " ft-kv__row--zero" : "") })

        const labWrap = el("div", { class: "ft-kv__labels" })
        labWrap.appendChild(el("span", {}, row.en))
        labWrap.appendChild(el("span", { dir: "rtl", lang: "ar", style: "margin-inline-start:6px;font-size:11px;color:#666" }, row.ar))
        kvRow.appendChild(labWrap)

        const valEl = el("div", { class: "ft-kv__val" + (row.zero ? " fee-zero-value" : "") + (row.highlight ? " ft-kv__val--highlight" : "") })
        valEl.textContent = row.zero ? "SAR 0.00" : `SAR ${r.contractAmount === row.val ? r.contractAmount.toFixed(2) : row.val.toFixed(2)}`
        kvRow.appendChild(valEl)
        kv.appendChild(kvRow)
      })
      offerCard.appendChild(kv)

      // Payout ETA badge on offer screen
      const etaWrap = el("div", { style: "margin-top:12px" })
      offerCard.appendChild(etaWrap)
      if (_payoutBadge) _payoutBadge.destroy()
      _payoutBadge = createPayoutEtaBadge({
        container: etaWrap,
        paymentMethodId: r.paymentMethod.id,
        contractAmount: r.contractAmount,
        currency: r.currency,
      })
    }

    // ── Section 3: Contract Confirmation ──────────────────────────────────────
    const contractSection = el("section", { class: "ft-section", "aria-labelledby": "ft-contract-heading" })
    contractSection.appendChild(sectionTitle("3. Contract Confirmation", "٣. تأكيد العقد"))

    const contractDesc = el("p", { class: "ft-section-desc" },
      "Complete fee summary before you commit. No surprises after signing.")
    contractSection.appendChild(contractDesc)

    const contractCard = el("div", { class: "ft-contract-card" })
    contractSection.appendChild(contractCard)
    container.appendChild(contractSection)

    function refreshContractSection(r) {
      contractCard.innerHTML = ""

      // 0% badge is MANDATORY on contract screen
      const zeroBadge = el("div", { class: "fee-zero-badge fee-zero-badge--compact", role: "status" })
      zeroBadge.appendChild(el("span", { "aria-hidden": "true" }, "✓ "))
      zeroBadge.appendChild(el("strong", {}, "0% freelancer commission — structural policy"))
      zeroBadge.appendChild(el("span", { dir: "rtl", lang: "ar", style: "margin-inline-start:8px;font-size:11px;color:#1a7f37" }, "٠٪ عمولة — سياسة هيكلية ثابتة"))
      contractCard.appendChild(zeroBadge)

      const summaryRows = [
        { en: "Contract value",      ar: "قيمة العقد",            val: `SAR ${r.contractAmount.toFixed(2)}` },
        { en: "Freelancer receives", ar: "يستلم المستقل",          val: `SAR ${r.freelancerPayout.toFixed(2)}`,  em: true },
        { en: "Platform fee (employer)", ar: "رسوم المنصة (صاحب العمل)", val: `SAR ${r.platformFeeAmount.toFixed(2)}` },
        { en: `${r.paymentMethod.label} fee`, ar: r.paymentMethod.label_ar, val: `SAR ${r.pspFeeAmount.toFixed(2)}` },
        { en: "Total employer cost", ar: "إجمالي تكلفة صاحب العمل", val: `SAR ${r.employerTotalCost.toFixed(2)}`, total: true },
      ]

      const kv = el("div", { class: "ft-kv" })
      summaryRows.forEach(row => {
        const cls = "ft-kv__row" + (row.total ? " ft-kv__row--total" : "") + (row.em ? " ft-kv__row--highlight" : "")
        const kvRow = el("div", { class: cls })

        const labWrap = el("div", { class: "ft-kv__labels" })
        labWrap.appendChild(el("span", {}, row.en))
        labWrap.appendChild(el("span", { dir: "rtl", lang: "ar", style: "margin-inline-start:6px;font-size:11px;color:#666" }, row.ar))
        kvRow.appendChild(labWrap)

        const valCls = "ft-kv__val" + (row.total ? " ft-kv__val--total" : "") + (row.em ? " ft-kv__val--highlight" : "")
        kvRow.appendChild(el("div", { class: valCls }, row.val))
        kv.appendChild(kvRow)
      })
      contractCard.appendChild(kv)

      // PayoutETABadge on contract screen
      const etaWrap = el("div", { style: "margin-top:14px" })
      contractCard.appendChild(etaWrap)
      createPayoutEtaBadge({
        container: etaWrap,
        paymentMethodId: r.paymentMethod.id,
        contractAmount: r.contractAmount,
        currency: r.currency,
      })

      // Confirm button
      const confirmBtn = el("button", {
        class: "btn btn-primary",
        style: "margin-top:16px;width:100%;max-width:320px",
        "aria-label": "Confirm contract",
      }, "Confirm contract / تأكيد العقد")
      contractCard.appendChild(confirmBtn)
    }

    // Initial render with placeholder
    offerCard.innerHTML = '<div class="ft-placeholder">Enter a contract amount above to preview the offer.</div>'
    contractCard.innerHTML = '<div class="ft-placeholder">Fee summary will appear here.</div>'
  },
}
