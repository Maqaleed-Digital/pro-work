import { getToken, setToken } from "./api.js"
import { initRouter } from "./router.js"

function showLogin() {
  const app = document.getElementById("app")
  app.innerHTML = ""

  const screen = document.createElement("div")
  screen.id = "login-screen"

  const box = document.createElement("div")
  box.className = "login-box"
  // WCAG 2.4.2: page has descriptive title (set via index.html); heading provides section title
  box.innerHTML = `<h1>WorkCaptain Admin</h1>`

  // WCAG 1.3.1 / 4.1.2: form input requires associated label
  const tokenLabel = document.createElement("label")
  tokenLabel.htmlFor = "token-input"
  tokenLabel.className = "sr-only"
  tokenLabel.textContent = "Admin bearer token"
  box.appendChild(tokenLabel)

  const input = document.createElement("input")
  input.type = "password"
  input.id = "token-input"
  input.placeholder = "Bearer token"
  input.autocomplete = "current-password"
  input.setAttribute("aria-describedby", "token-hint")

  // WCAG 1.3.1: hint text referenced by aria-describedby
  const hintEl = document.createElement("div")
  hintEl.id = "token-hint"
  hintEl.className = "login-hint"
  hintEl.textContent = "Enter your admin bearer token to continue."
  box.appendChild(hintEl)

  const errEl = document.createElement("div")
  errEl.className = "login-err"
  errEl.setAttribute("role", "alert")
  errEl.setAttribute("aria-live", "polite")

  const btn = document.createElement("button")
  btn.className = "btn btn-primary"
  btn.textContent = "Sign in"
  btn.style.width = "100%"

  function submit() {
    const v = input.value.trim()
    if (!v) { errEl.textContent = "Token required"; return }
    setToken(v)
    boot()
  }

  btn.addEventListener("click", submit)
  input.addEventListener("keydown", e => { if (e.key === "Enter") submit() })

  box.appendChild(input)
  box.appendChild(errEl)
  box.appendChild(btn)
  screen.appendChild(box)
  app.appendChild(screen)
  input.focus()
}

function boot() {
  const token = getToken()
  if (!token) { showLogin(); return }
  const app = document.getElementById("app")
  initRouter(app, () => showLogin())
}

boot()
