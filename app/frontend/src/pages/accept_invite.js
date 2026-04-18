// S40-G6: Accept invitation page
import { apiPostPublic, setToken } from "../api.js"
import { t } from "../locale.js"

function render(el) {
  el.innerHTML = ""

  // Extract token from hash: #accept-invite?token=...
  const hashParams = new URLSearchParams(location.hash.replace(/^#[^?]*\??/, ""))
  const token = hashParams.get("token") || ""

  const wrap = document.createElement("div")
  wrap.className = "onboarding-screen"

  const box = document.createElement("div")
  box.className = "onboarding-box"

  if (!token) {
    box.innerHTML = `<h2>${t("invite.accept.noToken")}</h2><p>${t("invite.accept.noTokenDesc")}</p>`
    wrap.appendChild(box)
    el.appendChild(wrap)
    return
  }

  const title = document.createElement("h2")
  title.textContent = t("invite.accept.title")
  box.appendChild(title)

  const subtitle = document.createElement("p")
  subtitle.className = "onboarding-subtitle"
  subtitle.textContent = t("invite.accept.subtitle")
  box.appendChild(subtitle)

  const form = document.createElement("form")
  form.addEventListener("submit", e => e.preventDefault())

  const pwGroup = document.createElement("div")
  pwGroup.className = "field-group"
  const pwLabel = document.createElement("label")
  pwLabel.htmlFor = "accept-password"
  pwLabel.textContent = t("invite.accept.password")
  const pwInput = document.createElement("input")
  pwInput.type = "password"
  pwInput.id = "accept-password"
  pwInput.placeholder = t("invite.accept.passwordPlaceholder")
  pwInput.autocomplete = "new-password"
  pwInput.required = true
  pwGroup.appendChild(pwLabel)
  pwGroup.appendChild(pwInput)
  form.appendChild(pwGroup)

  const pw2Group = document.createElement("div")
  pw2Group.className = "field-group"
  const pw2Label = document.createElement("label")
  pw2Label.htmlFor = "accept-confirm"
  pw2Label.textContent = t("invite.accept.confirmPassword")
  const pw2Input = document.createElement("input")
  pw2Input.type = "password"
  pw2Input.id = "accept-confirm"
  pw2Input.placeholder = t("invite.accept.confirmPlaceholder")
  pw2Input.autocomplete = "new-password"
  pw2Input.required = true
  pw2Group.appendChild(pw2Label)
  pw2Group.appendChild(pw2Input)
  form.appendChild(pw2Group)

  const errEl = document.createElement("div")
  errEl.className = "onboarding-err"
  errEl.setAttribute("role", "alert")
  form.appendChild(errEl)

  const btn = document.createElement("button")
  btn.type = "submit"
  btn.className = "btn btn-primary onboarding-btn"
  btn.textContent = t("invite.accept.submit")

  btn.addEventListener("click", async () => {
    errEl.textContent = ""
    const password = pwInput.value || ""
    const confirm  = pw2Input.value || ""

    if (password.length < 8) { errEl.textContent = t("register.err.passwordShort"); return }
    if (password !== confirm) { errEl.textContent = t("register.err.passwordMismatch"); return }

    btn.disabled = true
    btn.textContent = t("invite.accept.accepting")

    try {
      const data = await apiPostPublic("/api/invitations/accept", { token, password })
      setToken(data.token)
      location.hash = "dashboard"
    } catch (e) {
      errEl.textContent = e.message || t("invite.accept.failed")
      btn.disabled = false
      btn.textContent = t("invite.accept.submit")
    }
  })

  form.appendChild(btn)
  box.appendChild(form)
  wrap.appendChild(box)
  el.appendChild(wrap)
}

export default { render }
