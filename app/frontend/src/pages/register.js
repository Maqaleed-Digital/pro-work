// S40-G5: Registration page — Step 1 of employer onboarding
import { apiPostPublic, setToken } from "../api.js"
import { t } from "../locale.js"

function render(el) {
  el.innerHTML = ""

  const wrap = document.createElement("div")
  wrap.className = "onboarding-screen"

  const box = document.createElement("div")
  box.className = "onboarding-box"

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
  btn.className = "btn btn-primary onboarding-btn"
  btn.textContent = t("register.submit")

  btn.addEventListener("click", async () => {
    errEl.textContent = ""

    const email       = (inputs.email.value || "").trim()
    const password    = inputs.password.value || ""
    const confirm     = inputs.confirmPassword.value || ""
    const companyName = (inputs.companyName.value || "").trim()

    if (!companyName) { errEl.textContent = t("register.err.companyRequired"); return }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.textContent = t("register.err.emailInvalid"); return }
    if (password.length < 8) { errEl.textContent = t("register.err.passwordShort"); return }
    if (password !== confirm) { errEl.textContent = t("register.err.passwordMismatch"); return }

    btn.disabled = true
    btn.textContent = t("register.submitting")

    try {
      const data = await apiPostPublic("/api/auth/register", { email, password, companyName })
      setToken(data.token)
      // Navigate to onboarding step 2
      location.hash = "onboarding"
    } catch (e) {
      errEl.textContent = e.message || t("register.err.failed")
      btn.disabled = false
      btn.textContent = t("register.submit")
    }
  })

  form.appendChild(btn)

  const loginLink = document.createElement("p")
  loginLink.className = "onboarding-link"
  loginLink.innerHTML = `${t("register.hasAccount")} <a href="#login">${t("register.signIn")}</a>`
  form.appendChild(loginLink)

  box.appendChild(form)
  wrap.appendChild(box)
  el.appendChild(wrap)
}

export default { render }
