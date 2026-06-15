// WC-CB Day 3 (D-3, 2026-05-13): Controlled-beta acknowledgement screen.
//
// Authority: brief §2 — "Controlled-beta acknowledgement (single screen,
// one-time): Plain-language explanation of controlled-beta posture, the
// allowed scope, feedback channel."
//
// Behaviour:
//   - Shown once per user after first-time onboarding completes.
//   - Stores acknowledgement timestamp to localStorage so the screen
//     doesn't recur in this beta window.
//   - "I understand" button advances to dashboard.
//
// PROPOSAL §11.A2 stricter-interpretation rule: explicit acknowledgement
// is binding; no auto-dismiss; no decorative animations; no marketing
// language.
//
// Per WC Controlled-Launch Memo V1.1 (Sponsor B1(b)): cohort ~25–30;
// allowed scope D11–D15 controlled-beta progression; prohibited:
// marketing-as-launched copy, cohort expansion mechanics, Mode-D revenue
// collection.
//
// Brand-neutral per PROPOSAL §11.A5.

import { t, getLocale } from "../locale.js"
import { getBrand } from "../brand/index.js"

const ACK_STORAGE_KEY = "pw_cb_acknowledged_at"

function render(el) {
  el.innerHTML = ""
  const locale = getLocale()
  const brand  = getBrand()

  // If already acknowledged this session, skip to dashboard. Defends
  // against direct-link reload after acknowledgement.
  try {
    if (localStorage.getItem(ACK_STORAGE_KEY)) {
      window.location.hash = "dashboard"
      return
    }
  } catch {}

  const wrap = document.createElement("div")
  wrap.className = "onboarding-screen"

  const box = document.createElement("div")
  box.className = "onboarding-box onboarding-wide"
  box.style.cssText = "max-width:680px;text-align:start"

  // ── Brand row ──────────────────────────────────────────────────────
  const brandRow = document.createElement("div")
  brandRow.style.cssText = "margin-bottom:var(--maq-space-6)"
  const wordmark = document.createElement("span")
  wordmark.style.cssText = "font-size:var(--maq-text-xl);font-weight:var(--maq-weight-bold);color:var(--maq-brand-primary);font-family:var(--maq-font-arabic),var(--maq-font-latin)"
  wordmark.textContent = (brand.publicName && brand.publicName[locale]) || "WorkCaptain"
  brandRow.appendChild(wordmark)
  box.appendChild(brandRow)

  // ── Title ──────────────────────────────────────────────────────────
  const title = document.createElement("h1")
  title.textContent = t("controlledBeta.posture.title")
  title.style.cssText = "font-size:var(--maq-text-2xl);margin:0 0 var(--maq-space-4)"
  box.appendChild(title)

  // ── Body paragraphs ───────────────────────────────────────────────
  const body = document.createElement("div")
  body.style.cssText = "font-size:var(--maq-text-base);color:var(--maq-neutral-700);line-height:var(--maq-leading-relaxed)"

  // Lead paragraph — plain-language explanation.
  const p1 = document.createElement("p")
  p1.textContent = t("controlledBeta.posture.body")
  p1.style.cssText = "margin:0 0 var(--maq-space-4)"
  body.appendChild(p1)

  // ── Allowed scope ──────────────────────────────────────────────────
  const scopeTitle = document.createElement("h2")
  scopeTitle.textContent = t("controlledBeta.scope.title")
  scopeTitle.style.cssText = "font-size:var(--maq-text-lg);margin:var(--maq-space-6) 0 var(--maq-space-3);color:var(--maq-neutral-900)"
  body.appendChild(scopeTitle)

  const scopeList = document.createElement("ul")
  scopeList.style.cssText = "padding-inline-start:var(--maq-space-6);margin:0;display:flex;flex-direction:column;gap:var(--maq-space-2)"
  const scopeItems = [
    "controlledBeta.scope.item1",  // Mode-D advisory only
    "controlledBeta.scope.item2",  // No billable events
    "controlledBeta.scope.item3",  // KSA data residency
    "controlledBeta.scope.item4",  // Manual feedback in-app
  ]
  for (const key of scopeItems) {
    const li = document.createElement("li")
    li.textContent = t(key)
    scopeList.appendChild(li)
  }
  body.appendChild(scopeList)

  // ── Feedback channel ──────────────────────────────────────────────
  const fbTitle = document.createElement("h2")
  fbTitle.textContent = t("controlledBeta.feedback.title")
  fbTitle.style.cssText = "font-size:var(--maq-text-lg);margin:var(--maq-space-6) 0 var(--maq-space-3);color:var(--maq-neutral-900)"
  body.appendChild(fbTitle)

  const fbBody = document.createElement("p")
  fbBody.textContent = t("controlledBeta.feedback.body")
  fbBody.style.cssText = "margin:0 0 var(--maq-space-4)"
  body.appendChild(fbBody)

  box.appendChild(body)

  // ── Acknowledgement button ─────────────────────────────────────────
  const btnRow = document.createElement("div")
  btnRow.style.cssText = "margin-top:var(--maq-space-8);display:flex;gap:var(--maq-space-3)"

  const ackBtn = document.createElement("button")
  ackBtn.type = "button"
  ackBtn.className = "btn btn-accent"
  ackBtn.style.cssText = "min-height:44px;padding:var(--maq-space-3) var(--maq-space-6)"
  ackBtn.textContent = t("controlledBeta.posture.acknowledge")
  ackBtn.addEventListener("click", () => {
    try { localStorage.setItem(ACK_STORAGE_KEY, new Date().toISOString()) } catch {}
    window.location.hash = "dashboard"
  })
  btnRow.appendChild(ackBtn)

  box.appendChild(btnRow)

  wrap.appendChild(box)
  el.appendChild(wrap)
}

export default { render }
