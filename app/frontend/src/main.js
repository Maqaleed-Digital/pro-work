import { getToken, setToken } from "./api.js"
import { initRouter } from "./router.js"
import { initLocale } from "./locale.js"

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
  const hash = window.location.hash.replace('#', '').split('?')[0]
  const PUBLIC_ROUTES = ['register', 'onboarding', 'accept-invite', 'signin']
  const INTERNAL_ROUTES = ['admin-login']
  const app = document.getElementById("app")

  // Internal admin token login (for ADMIN_API_TOKEN users)
  if (INTERNAL_ROUTES.includes(hash)) {
    showLogin()
    return
  }

  // Public routes — no auth required
  if (PUBLIC_ROUTES.includes(hash)) {
    initRouter(app, () => {
      // WC-UX-NAV-001: sign-out replaces rather than pushes, so the signed-in
      // route is not left behind the reload for Back to return to.
      if (window.history && typeof window.history.replaceState === 'function') {
        window.history.replaceState(null, '', '#register')
      } else {
        window.location.hash = 'register'
      }
      window.location.reload()
    })
    return
  }

  // Has token — load app
  const token = getToken()
  if (token) {
    initRouter(app, () => {
      // WC-UX-NAV-001: sign-out replaces rather than pushes, so the signed-in
      // route is not left behind the reload for Back to return to.
      if (window.history && typeof window.history.replaceState === 'function') {
        window.history.replaceState(null, '', '#register')
      } else {
        window.location.hash = 'register'
      }
      window.location.reload()
    })
    return
  }

  // No token, no public route — send to the intake route.
  //
  // WC-UX-NAV-001: REPLACE rather than push. Pushing here put /admin#register on
  // the stack behind the visitor; register.js then pushed #request-access on top,
  // so Back re-entered the redirect stub and bounced. The escape from that bounce
  // is what carried people past /admin onto the governed JSON-404 apex. With both
  // hops replacing, entering /admin without a token costs zero history entries.
  if (window.history && typeof window.history.replaceState === 'function') {
    window.history.replaceState(null, '', '#register')
  } else {
    window.location.hash = 'register'
  }
  initRouter(app, () => {
    if (window.history && typeof window.history.replaceState === 'function') {
      window.history.replaceState(null, '', '#register')
    } else {
      window.location.hash = 'register'
    }
    window.location.reload()
  })
}

initLocale().then(() => boot())
