import { getToken, setToken } from "./api.js"
import { initRouter } from "./router.js"

function showLogin() {
  const app = document.getElementById("app")
  app.innerHTML = ""

  const screen = document.createElement("div")
  screen.id = "login-screen"

  const box = document.createElement("div")
  box.className = "login-box"
  box.innerHTML = `
    <h1>ProWork Admin</h1>
    <p>Enter your admin bearer token to continue.</p>
  `

  const input = document.createElement("input")
  input.type = "password"
  input.placeholder = "Bearer token"
  input.autocomplete = "current-password"

  const errEl = document.createElement("div")
  errEl.className = "login-err"

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
