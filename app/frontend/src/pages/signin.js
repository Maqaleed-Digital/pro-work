// S42: Sign-in page — email + password login
import { apiPostPublic, setToken } from "../api.js"
import { t } from "../locale.js"

function render(el) {
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
  title.textContent = t("signin.title")
  box.appendChild(title)

  const subtitle = document.createElement("p")
  subtitle.className = "onboarding-subtitle"
  subtitle.textContent = t("signin.subtitle")
  box.appendChild(subtitle)

  const form = document.createElement("form")
  form.autocomplete = "on"
  form.addEventListener("submit", e => e.preventDefault())

  const errEl = document.createElement("div")
  errEl.className = "onboarding-err"
  errEl.setAttribute("role", "alert")
  errEl.setAttribute("aria-live", "polite")

  // Email
  const emailGroup = document.createElement("div")
  emailGroup.className = "field-group"
  const emailLabel = document.createElement("label")
  emailLabel.htmlFor = "signin-email"
  emailLabel.textContent = t("signin.email")
  const emailInput = document.createElement("input")
  emailInput.type = "email"
  emailInput.id = "signin-email"
  emailInput.placeholder = t("signin.email")
  emailInput.autocomplete = "email"
  emailInput.required = true
  emailGroup.appendChild(emailLabel)
  emailGroup.appendChild(emailInput)
  form.appendChild(emailGroup)

  // Password
  const pwGroup = document.createElement("div")
  pwGroup.className = "field-group"
  const pwLabel = document.createElement("label")
  pwLabel.htmlFor = "signin-password"
  pwLabel.textContent = t("signin.password")
  const pwInput = document.createElement("input")
  pwInput.type = "password"
  pwInput.id = "signin-password"
  pwInput.placeholder = t("signin.password")
  pwInput.autocomplete = "current-password"
  pwInput.required = true
  pwGroup.appendChild(pwLabel)
  pwGroup.appendChild(pwInput)
  form.appendChild(pwGroup)

  form.appendChild(errEl)

  const btn = document.createElement("button")
  btn.type = "submit"
  btn.className = "btn btn-accent onboarding-btn"
  btn.textContent = t("signin.submit")

  btn.addEventListener("click", async () => {
    errEl.textContent = ""
    const email    = (emailInput.value || "").trim()
    const password = pwInput.value || ""

    if (!email) { errEl.textContent = t("signin.err.emailRequired"); return }
    if (!password) { errEl.textContent = t("signin.err.passwordRequired"); return }

    btn.disabled = true
    btn.textContent = t("signin.submitting")

    try {
      const data = await apiPostPublic("/api/auth/login", { email, password })
      setToken(data.token)
      try { localStorage.setItem("pw_email", data.user && data.user.email || email) } catch {}
      try { localStorage.setItem("pw_company", data.user && data.user.companyName || "") } catch {}
      try { localStorage.setItem("pw_tenant", data.user && data.user.tenant_id || "default") } catch {}
      window.location.hash = "dashboard"
      window.location.reload()
    } catch (e) {
      errEl.textContent = t("signin.err.invalid")
      btn.disabled = false
      btn.textContent = t("signin.submit")
    }
  })

  form.appendChild(btn)

  const registerLink = document.createElement("p")
  registerLink.className = "onboarding-link"
  registerLink.innerHTML = `${t("signin.noAccount")} <a href="#register">${t("signin.signUp")}</a>`
  form.appendChild(registerLink)

  box.appendChild(form)
  wrap.appendChild(box)
  el.appendChild(wrap)
}

export default { render }
