// WC-CB Day 3 (D-3, 2026-05-13): Cohort access request form
//
// Authority: brief §2 "Cohort registration / Request access flow".
//   Submission stored for sponsor review and manual invitation issuance
//   (no auto-approval). PROPOSAL §11.A4 NO PHANTOM FEATURES: posts to
//   real backend POST /api/cohort/request (cohort_router.js).
//
// Stricter-interpretation rule (PROPOSAL §11.A2): only fields the brief
// §2 enumerates. No additions. Bilingual; RTL when locale=ar.
//
// Brand-neutral per PROPOSAL §11.A5: consumes getBrand() + t().

import { apiPostPublic } from "../api.js"
import { t, getLocale } from "../locale.js"
import { getBrand } from "../brand/index.js"

const USE_CASES = [
  { value: "saudisation", en: "Saudisation (Nitaqat)", ar: "السعودة (نطاقات)" },
  { value: "payroll",     en: "Payroll",                ar: "الرواتب" },
  { value: "both",        en: "Both",                   ar: "كلاهما" },
]

const LOCALES = [
  { value: "en", en: "English", ar: "الإنجليزية" },
  { value: "ar", en: "Arabic",  ar: "العربية" },
]

function render(el) {
  el.innerHTML = ""
  const locale = getLocale()
  const brand  = getBrand()

  const wrap = document.createElement("div")
  wrap.className = "onboarding-screen"

  const box = document.createElement("div")
  box.className = "onboarding-box onboarding-wide"

  // ── Brand wordmark + back link ────────────────────────────────────
  const brandRow = document.createElement("div")
  brandRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--maq-space-6)"
  const wordmark = document.createElement("span")
  wordmark.style.cssText = "font-size:var(--maq-text-xl);font-weight:var(--maq-weight-bold);color:var(--maq-brand-primary);font-family:var(--maq-font-arabic),var(--maq-font-latin)"
  wordmark.textContent = (brand.publicName && brand.publicName[locale]) || "WorkCaptain"
  brandRow.appendChild(wordmark)

  const backLink = document.createElement("a")
  backLink.href = "/"
  backLink.textContent = locale === "ar" ? "← العودة" : "← Back"
  backLink.style.cssText = "color:var(--maq-neutral-600);text-decoration:none;font-size:var(--maq-text-sm)"
  brandRow.appendChild(backLink)
  box.appendChild(brandRow)

  // ── Title ──────────────────────────────────────────────────────────
  const title = document.createElement("h1")
  title.textContent = t("requestAccess.title")
  title.style.cssText = "font-size:var(--maq-text-2xl);margin:0 0 var(--maq-space-2)"
  box.appendChild(title)

  const subtitle = document.createElement("p")
  subtitle.className = "onboarding-subtitle"
  subtitle.textContent = t("requestAccess.subtitle")
  box.appendChild(subtitle)

  // ── Form ───────────────────────────────────────────────────────────
  const form = document.createElement("form")
  form.autocomplete = "on"
  form.addEventListener("submit", e => e.preventDefault())

  const errEl = document.createElement("div")
  errEl.className = "onboarding-err"
  errEl.setAttribute("role", "alert")
  errEl.setAttribute("aria-live", "polite")

  function textField(key, type, autocomplete, helper) {
    const wrap = document.createElement("div")
    wrap.className = "field-group"
    const label = document.createElement("label")
    label.htmlFor = `req-${key}`
    label.textContent = t(`requestAccess.${key}`)
    wrap.appendChild(label)
    const input = document.createElement("input")
    input.type = type
    input.id = `req-${key}`
    input.name = key
    input.autocomplete = autocomplete || ""
    input.required = true
    wrap.appendChild(input)
    if (helper) {
      const h = document.createElement("p")
      h.style.cssText = "font-size:var(--maq-text-xs);color:var(--maq-neutral-500);margin:var(--maq-space-1) 0 0"
      h.textContent = helper
      wrap.appendChild(h)
    }
    return { wrap, input }
  }

  function selectField(key, options) {
    const wrap = document.createElement("div")
    wrap.className = "field-group"
    const label = document.createElement("label")
    label.htmlFor = `req-${key}`
    label.textContent = t(`requestAccess.${key}`)
    wrap.appendChild(label)
    const select = document.createElement("select")
    select.id = `req-${key}`
    select.name = key
    select.required = true
    for (const opt of options) {
      const o = document.createElement("option")
      o.value = opt.value
      o.textContent = opt[locale] || opt.en
      select.appendChild(o)
    }
    wrap.appendChild(select)
    return { wrap, input: select }
  }

  // Fields per brief §2: orgName, crNumber, contactName, email, phone,
  // primaryUseCase, teamSize, locale. STRICTER RULE — no additions.
  const orgName    = textField("orgName",    "text",  "organization")
  const crNumber   = textField("crNumber",   "text",  "off",
    locale === "ar"
      ? "10 أرقام (التحقق عبر واثق سيُفعَّل بعد المرحلة التجريبية)"
      : "10 digits (Wathq verification post-beta — TODO)")
  const contactName = textField("contactName", "text",  "name")
  const email      = textField("email",      "email", "email")
  const phone      = textField("phone",      "tel",   "tel",
    locale === "ar" ? "مثال: +966 5XX XXX XXXX" : "e.g. +966 5XX XXX XXXX")
  const primaryUseCase = selectField("primaryUseCase", USE_CASES)
  const teamSize   = textField("teamSize",   "number", "off")
  teamSize.input.min = 1
  teamSize.input.max = 1000000
  const localePref = selectField("locale", LOCALES)
  localePref.input.value = locale  // pre-select the user's current locale

  form.appendChild(orgName.wrap)
  form.appendChild(crNumber.wrap)
  form.appendChild(contactName.wrap)
  form.appendChild(email.wrap)
  form.appendChild(phone.wrap)
  form.appendChild(primaryUseCase.wrap)
  form.appendChild(teamSize.wrap)
  form.appendChild(localePref.wrap)
  form.appendChild(errEl)

  // ── Submit ────────────────────────────────────────────────────────
  const btn = document.createElement("button")
  btn.type = "submit"
  btn.className = "btn btn-accent onboarding-btn"
  btn.textContent = t("requestAccess.submit")

  btn.addEventListener("click", async () => {
    errEl.textContent = ""
    const payload = {
      orgName: orgName.input.value.trim(),
      crNumber: crNumber.input.value.trim(),
      contactName: contactName.input.value.trim(),
      email: email.input.value.trim().toLowerCase(),
      phone: phone.input.value.trim(),
      primaryUseCase: primaryUseCase.input.value,
      teamSize: parseInt(teamSize.input.value, 10),
      locale: localePref.input.value,
    }

    // UI-side format checks; backend re-validates (defense-in-depth).
    if (!payload.orgName) { errEl.textContent = t("requestAccess.err.orgRequired"); return }
    if (!/^[0-9]{10}$/.test(payload.crNumber)) { errEl.textContent = t("requestAccess.err.crFormat"); return }
    if (!payload.contactName) { errEl.textContent = t("requestAccess.err.contactRequired"); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) { errEl.textContent = t("requestAccess.err.emailInvalid"); return }
    if (!payload.phone) { errEl.textContent = t("requestAccess.err.phoneRequired"); return }
    if (!Number.isInteger(payload.teamSize) || payload.teamSize < 1) {
      errEl.textContent = t("requestAccess.err.teamSizeInvalid"); return
    }

    btn.disabled = true
    btn.textContent = t("requestAccess.submitting")

    try {
      const data = await apiPostPublic("/api/cohort/request", payload)
      // Success state — render the receipt screen (NOT a redirect-to-app).
      // Brief §2: "no auto-approval"; we explicitly do NOT issue a JWT here.
      renderReceipt(el, data, locale)
    } catch (e) {
      const msg = (e.code === "DUPLICATE_REQUEST")
        ? t("requestAccess.err.duplicate")
        : (e.message || t("requestAccess.err.failed"))
      errEl.textContent = msg
      btn.disabled = false
      btn.textContent = t("requestAccess.submit")
    }
  })

  form.appendChild(btn)

  // ── Sign-in link for invited members ──────────────────────────────
  const signinLink = document.createElement("p")
  signinLink.className = "onboarding-link"
  signinLink.innerHTML = `${t("requestAccess.haveInvite")} <a href="#signin">${t("cta.signIn")}</a>`
  form.appendChild(signinLink)

  box.appendChild(form)
  wrap.appendChild(box)
  el.appendChild(wrap)
}

/**
 * Receipt screen after successful submission. NO account created.
 * Plain-language explanation of "we'll contact you" per brief §2.
 */
function renderReceipt(el, data, locale) {
  el.innerHTML = ""
  const wrap = document.createElement("div")
  wrap.className = "onboarding-screen"
  const box = document.createElement("div")
  box.className = "onboarding-box"

  const icon = document.createElement("div")
  icon.setAttribute("aria-hidden", "true")
  icon.style.cssText = "font-size:var(--maq-text-3xl);color:var(--maq-semantic-success);margin-bottom:var(--maq-space-4)"
  icon.textContent = "✓"
  box.appendChild(icon)

  const title = document.createElement("h1")
  title.textContent = t("requestAccess.success.title")
  title.style.cssText = "font-size:var(--maq-text-xl);margin:0 0 var(--maq-space-3)"
  box.appendChild(title)

  const body = document.createElement("p")
  body.className = "onboarding-subtitle"
  body.textContent = (locale === "ar" && data && data.messageAr) || (data && data.message) || t("requestAccess.success.body")
  box.appendChild(body)

  // Show request id for support correlation (PROPOSAL §7 error/state pattern).
  if (data && data.requestId) {
    const ref = document.createElement("p")
    ref.style.cssText = "font-family:var(--maq-font-mono);font-size:var(--maq-text-xs);color:var(--maq-neutral-500);margin-top:var(--maq-space-4)"
    ref.textContent = `${t("requestAccess.success.refId")}: ${data.requestId}`
    box.appendChild(ref)
  }

  const homeLink = document.createElement("a")
  homeLink.href = "/"
  homeLink.className = "btn btn-secondary onboarding-btn"
  homeLink.textContent = t("requestAccess.success.backHome")
  homeLink.style.display = "inline-block"
  homeLink.style.textDecoration = "none"
  homeLink.style.marginTop = "var(--maq-space-4)"
  box.appendChild(homeLink)

  wrap.appendChild(box)
  el.appendChild(wrap)
}

export default { render }
