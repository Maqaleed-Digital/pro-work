// WC-CB Day 3 (D-3, 2026-05-13): Lean first-time onboarding wizard.
//
// Authority: brief §2 + Sponsor stricter rule (2026-05-13):
//   "keep onboarding wizard lean — only the fields defined in brief §2
//   (org name, CR format-only, contact, primary use case, team size,
//   locale, beta acknowledgement). No additions."
//
// PROPOSAL §11.A2 stricter-interpretation rule binding. Fields beyond
// brief §2 (activity_code, region, saudi_employees from the prior S40-G5
// wizard) are REMOVED here. They can be collected later in the SPA
// (Compliance / Settings surfaces) where they belong, not in the lean
// first-time onboarding.
//
// PDPL-relevant processing consent is captured per brief §2 last clause:
// "Captures consent for PDPL-relevant processing." This is a single
// checkbox plus a link to the privacy notice (placeholder for now;
// Day 6 wires the consent ledger view at /app/#data-privacy).
//
// Flow:
//   1. Single screen with 5 fields + PDPL consent checkbox.
//   2. Submit → PATCH /api/onboarding/profile with WC-relevant subset of
//      tenant config. The backend tenant config schema accepts
//      establishment_name etc.; we map orgName→establishment_name and
//      teamSize→total_employees. Custom fields (crNumber, primaryUseCase,
//      locale, pdplConsent) are stored under tenant.config additively.
//   3. Success → /#beta-acknowledgement (one-time controlled-beta posture
//      screen per brief §2 last sub-deliverable).
//
// Brand-neutral per PROPOSAL §11.A5: copy from t(); brand wordmark
// from getBrand().

import { apiPatch } from "../api.js"
import { t, getLocale, setLocale } from "../locale.js"
import { applyLocaleToDocument } from "../components/language_toggle.js"
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

  // ── Brand wordmark ─────────────────────────────────────────────────
  const brandRow = document.createElement("div")
  brandRow.style.cssText = "margin-bottom:var(--maq-space-6)"
  const wordmark = document.createElement("span")
  wordmark.style.cssText = "font-size:var(--maq-text-xl);font-weight:var(--maq-weight-bold);color:var(--maq-brand-primary);font-family:var(--maq-font-arabic),var(--maq-font-latin)"
  wordmark.textContent = (brand.publicName && brand.publicName[locale]) || "WorkCaptain"
  brandRow.appendChild(wordmark)
  box.appendChild(brandRow)

  const title = document.createElement("h1")
  title.textContent = t("onboarding.lean.title")
  title.style.cssText = "font-size:var(--maq-text-2xl);margin:0 0 var(--maq-space-2)"
  box.appendChild(title)

  const subtitle = document.createElement("p")
  subtitle.className = "onboarding-subtitle"
  subtitle.textContent = t("onboarding.lean.subtitle")
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
    const w = document.createElement("div"); w.className = "field-group"
    const lbl = document.createElement("label"); lbl.htmlFor = `ob-${key}`; lbl.textContent = t(`onboarding.lean.${key}`)
    w.appendChild(lbl)
    const inp = document.createElement("input")
    inp.type = type; inp.id = `ob-${key}`; inp.name = key; inp.autocomplete = autocomplete || ""; inp.required = true
    w.appendChild(inp)
    if (helper) {
      const h = document.createElement("p"); h.style.cssText = "font-size:var(--maq-text-xs);color:var(--maq-neutral-500);margin:var(--maq-space-1) 0 0"; h.textContent = helper
      w.appendChild(h)
    }
    return { wrap: w, input: inp }
  }

  function selectField(key, options) {
    const w = document.createElement("div"); w.className = "field-group"
    const lbl = document.createElement("label"); lbl.htmlFor = `ob-${key}`; lbl.textContent = t(`onboarding.lean.${key}`)
    w.appendChild(lbl)
    const s = document.createElement("select"); s.id = `ob-${key}`; s.name = key; s.required = true
    for (const opt of options) {
      const o = document.createElement("option"); o.value = opt.value; o.textContent = opt[locale] || opt.en; s.appendChild(o)
    }
    w.appendChild(s)
    return { wrap: w, input: s }
  }

  // Lean fields per Sponsor stricter rule: orgName, crNumber,
  // primaryUseCase (confirm), teamSize, locale. NO activity_code, NO
  // region, NO saudi_employees.
  const orgName = textField("orgName", "text", "organization")
  const crNumber = textField("crNumber", "text", "off",
    locale === "ar"
      ? "10 أرقام (التحقق عبر واثق سيُفعَّل بعد المرحلة التجريبية)"
      : "10 digits (Wathq verification post-beta — TODO)")
  const primaryUseCase = selectField("primaryUseCase", USE_CASES)
  const teamSize = textField("teamSize", "number", "off")
  teamSize.input.min = 1; teamSize.input.max = 1000000
  const localePref = selectField("locale", LOCALES)
  localePref.input.value = locale

  form.appendChild(orgName.wrap)
  form.appendChild(crNumber.wrap)
  form.appendChild(primaryUseCase.wrap)
  form.appendChild(teamSize.wrap)
  form.appendChild(localePref.wrap)

  // ── PDPL consent (brief §2 last clause) ──────────────────────────
  const consentGroup = document.createElement("div")
  consentGroup.className = "field-group"
  consentGroup.style.cssText = "margin-top:var(--maq-space-4);padding:var(--maq-space-4);background:var(--maq-semantic-info-bg);border-radius:var(--maq-radius-md);border-inline-start:4px solid var(--maq-semantic-info)"

  const consentLabel = document.createElement("label")
  consentLabel.style.cssText = "display:flex;align-items:flex-start;gap:var(--maq-space-3);cursor:pointer;line-height:var(--maq-leading-normal)"
  const consentInput = document.createElement("input")
  consentInput.type = "checkbox"
  consentInput.id = "ob-pdpl-consent"
  consentInput.required = true
  consentInput.style.cssText = "margin-top:3px;flex-shrink:0"
  consentLabel.appendChild(consentInput)

  const consentText = document.createElement("span")
  consentText.style.cssText = "font-size:var(--maq-text-sm);color:var(--maq-neutral-700)"
  consentText.innerHTML = `${t("onboarding.lean.pdplConsent")} <a href="#data-privacy" style="color:var(--maq-brand-primary);text-decoration:underline">${t("onboarding.lean.pdplLink")}</a>`
  consentLabel.appendChild(consentText)
  consentGroup.appendChild(consentLabel)
  form.appendChild(consentGroup)

  form.appendChild(errEl)

  // ── Submit ─────────────────────────────────────────────────────────
  const btn = document.createElement("button")
  btn.type = "submit"
  btn.className = "btn btn-accent onboarding-btn"
  btn.textContent = t("onboarding.lean.submit")

  btn.addEventListener("click", async () => {
    errEl.textContent = ""
    const orgVal = orgName.input.value.trim()
    const crVal  = crNumber.input.value.trim()
    const tsVal  = parseInt(teamSize.input.value, 10)
    const useVal = primaryUseCase.input.value
    const locVal = localePref.input.value
    const consent = consentInput.checked

    if (!orgVal) { errEl.textContent = t("onboarding.lean.err.orgRequired"); return }
    if (!/^[0-9]{10}$/.test(crVal)) { errEl.textContent = t("onboarding.lean.err.crFormat"); return }
    if (!Number.isInteger(tsVal) || tsVal < 1) { errEl.textContent = t("onboarding.lean.err.teamSizeInvalid"); return }
    if (!consent) { errEl.textContent = t("onboarding.lean.err.consentRequired"); return }

    btn.disabled = true
    btn.textContent = t("onboarding.lean.submitting")

    try {
      // Map lean fields to backend schema. The PATCH endpoint accepts
      // establishment_name + total_employees today. Other fields land in
      // tenant.config additively via the same PATCH.
      // TODO Day 6: surface CR / use-case / consent_at on Settings page
      // and Consent Ledger view per brief §6.
      await apiPatch("/api/onboarding/profile", {
        establishment_name: orgVal,
        total_employees: tsVal,
        // Extras go into tenant.config (server merges via config || $1):
        cr_number: crVal,
        primary_use_case: useVal,
        preferred_locale: locVal,
        pdpl_consent: {
          granted: true,
          granted_at: new Date().toISOString(),
          version: "v1",
        },
      })

      // Persist locale preference client-side if changed.
      if (locVal !== locale) {
        await setLocale(locVal)
        applyLocaleToDocument()
      }
      try { localStorage.setItem("pw_company", orgVal) } catch {}

      // Advance to controlled-beta acknowledgement screen.
      window.location.hash = "beta-acknowledgement"
    } catch (e) {
      errEl.textContent = e.message || t("onboarding.lean.err.failed")
      btn.disabled = false
      btn.textContent = t("onboarding.lean.submit")
    }
  })

  form.appendChild(btn)

  box.appendChild(form)
  wrap.appendChild(box)
  el.appendChild(wrap)
}

export default { render }
