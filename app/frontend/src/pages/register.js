// S45-G2: Registration page — persona selector + employer onboarding form
// Accessibility: persona cards use role="radio" with aria-checked for screen readers
import { apiPostPublic, setToken } from "../api.js"
import { t } from "../locale.js"

let _personaType = null

function renderPersonaStep(el, onSelect) {
  el.innerHTML = ""

  const wrap = document.createElement("div")
  wrap.className = "onboarding-screen"

  const box = document.createElement("div")
  box.className = "onboarding-box"

  // Brand wordmark
  const brandRow = document.createElement("div")
  brandRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:var(--space-3)"
  const brandMark = document.createElement("div")
  brandMark.className = "sidebar-brand-mark"
  brandMark.textContent = "W"
  const brandName = document.createElement("span")
  brandName.style.cssText = "font-family:var(--font-display);font-size:var(--text-xl);font-weight:700;color:var(--color-text-primary)"
  brandName.textContent = "WorkCaptain"
  brandRow.appendChild(brandMark)
  brandRow.appendChild(brandName)
  box.appendChild(brandRow)

  const title = document.createElement("h1")
  title.textContent = t("register.personaTitle")
  box.appendChild(title)

  // Persona cards container — acts as radiogroup for accessibility
  const cardWrap = document.createElement("div")
  cardWrap.className = "persona-cards"
  cardWrap.setAttribute("role", "radiogroup")
  cardWrap.setAttribute("aria-label", t("register.personaTitle"))
  cardWrap.style.cssText = "display:flex;gap:var(--space-4);margin-top:var(--space-4)"

  // EMPLOYER card
  const empCard = document.createElement("div")
  empCard.className = "persona-card"
  empCard.setAttribute("role", "radio")
  empCard.setAttribute("aria-checked", "false")
  empCard.setAttribute("tabindex", "0")
  empCard.style.cssText = "flex:1;padding:var(--space-5);border:2px solid var(--color-border);border-radius:var(--radius-lg);cursor:pointer;text-align:center"
  empCard.innerHTML = `<h2 style="margin:0 0 var(--space-2)">${t("register.personaEmployer")}</h2><p style="margin:0;color:var(--color-text-secondary)">${t("register.personaEmployerDesc")}</p>`
  empCard.addEventListener("click", () => {
    _personaType = "EMPLOYER"
    onSelect("EMPLOYER")
  })
  empCard.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); empCard.click() }
  })
  cardWrap.appendChild(empCard)

  // SEEKER card
  const seekCard = document.createElement("div")
  seekCard.className = "persona-card"
  seekCard.setAttribute("role", "radio")
  seekCard.setAttribute("aria-checked", "false")
  seekCard.setAttribute("tabindex", "0")
  seekCard.style.cssText = "flex:1;padding:var(--space-5);border:2px solid var(--color-border);border-radius:var(--radius-lg);cursor:pointer;text-align:center"
  seekCard.innerHTML = `<h2 style="margin:0 0 var(--space-2)">${t("register.personaSeeker")}</h2><p style="margin:0;color:var(--color-text-secondary)">${t("register.personaSeekerDesc")}</p>`
  seekCard.addEventListener("click", () => {
    _personaType = "SEEKER"
    onSelect("SEEKER")
  })
  seekCard.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); seekCard.click() }
  })
  cardWrap.appendChild(seekCard)

  box.appendChild(cardWrap)
  wrap.appendChild(box)
  el.appendChild(wrap)
}

function renderForm(el) {
  el.innerHTML = ""

  const wrap = document.createElement("div")
  wrap.className = "onboarding-screen"

  const box = document.createElement("div")
  box.className = "onboarding-box"

  // Brand wordmark
  const brandRow = document.createElement("div")
  brandRow.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:var(--space-3)"
  const brandMark = document.createElement("div")
  brandMark.className = "sidebar-brand-mark"
  brandMark.textContent = "W"
  const brandName = document.createElement("span")
  brandName.style.cssText = "font-family:var(--font-display);font-size:var(--text-xl);font-weight:700;color:var(--color-text-primary)"
  brandName.textContent = "WorkCaptain"
  brandRow.appendChild(brandMark)
  brandRow.appendChild(brandName)
  box.appendChild(brandRow)

  const title = document.createElement("h1")
  title.textContent = t("register.title")
  box.appendChild(title)

  const subtitle = document.createElement("p")
  subtitle.className = "onboarding-subtitle"
  subtitle.textContent = t("register.subtitle")
  box.appendChild(subtitle)

  const form = document.createElement("form")
  form.autocomplete = "on"
  form.addEventListener("submit", e => e.preventDefault())

  const errEl = document.createElement("div")
  errEl.className = "onboarding-err"
  errEl.setAttribute("role", "alert")
  errEl.setAttribute("aria-live", "polite")

  const fields = [
    { id: "reg-company",  label: t("register.companyName"), type: "text",     auto: "organization", key: "companyName" },
    { id: "reg-email",    label: t("register.email"),       type: "email",    auto: "email",        key: "email" },
    { id: "reg-password", label: t("register.password"),    type: "password", auto: "new-password",  key: "password" },
    { id: "reg-confirm",  label: t("register.confirmPassword"), type: "password", auto: "new-password", key: "confirmPassword" },
  ]

  const inputs = {}

  fields.forEach(f => {
    const group = document.createElement("div")
    group.className = "field-group"

    const label = document.createElement("label")
    label.htmlFor = f.id
    label.textContent = f.label
    group.appendChild(label)

    const input = document.createElement("input")
    input.type = f.type
    input.id = f.id
    input.name = f.key
    input.placeholder = f.label
    input.autocomplete = f.auto
    input.required = true
    group.appendChild(input)

    inputs[f.key] = input
    form.appendChild(group)
  })

  form.appendChild(errEl)

  const btn = document.createElement("button")
  btn.type = "submit"
  btn.className = "btn btn-accent onboarding-btn"
  btn.textContent = t("register.submit")

  btn.addEventListener("click", async () => {
    errEl.textContent = ""

    const email       = (inputs.email.value || "").trim()
    const password    = inputs.password.value || ""
    const confirm     = inputs.confirmPassword.value || ""
    const companyName = (inputs.companyName.value || "").trim()
    const personaType = _personaType || "EMPLOYER"

    if (!companyName) { errEl.textContent = t("register.err.companyRequired"); return }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.textContent = t("register.err.emailInvalid"); return }
    if (password.length < 8) { errEl.textContent = t("register.err.passwordShort"); return }
    if (password !== confirm) { errEl.textContent = t("register.err.passwordMismatch"); return }

    btn.disabled = true
    btn.textContent = t("register.submitting")

    try {
      const data = await apiPostPublic("/api/auth/register", { email, password, companyName, personaType })
      setToken(data.token)
      try { localStorage.setItem("pw_company", data.tenant && data.tenant.name || companyName) } catch {}
      try { localStorage.setItem("pw_tenant", data.user && data.user.tenant_id || "default") } catch {}
      try { localStorage.setItem("pw_email", data.user && data.user.email || email) } catch {}
      try { localStorage.setItem("pw_persona", data.user && data.user.persona_type || personaType) } catch {}

      // Route SEEKER to seeker-home, EMPLOYER to onboarding
      if (personaType === "SEEKER") {
        location.hash = "seeker-home"
      } else {
        location.hash = "onboarding"
      }
    } catch (e) {
      errEl.textContent = e.message || t("register.err.failed")
      btn.disabled = false
      btn.textContent = t("register.submit")
    }
  })

  form.appendChild(btn)

  const loginLink = document.createElement("p")
  loginLink.className = "onboarding-link"
  loginLink.innerHTML = `${t("register.hasAccount")} <a href="#signin">${t("register.signIn")}</a>`
  form.appendChild(loginLink)

  box.appendChild(form)
  wrap.appendChild(box)
  el.appendChild(wrap)
}

function render(el) {
  _personaType = null
  renderPersonaStep(el, () => {
    renderForm(el)
  })
}

export default { render }
