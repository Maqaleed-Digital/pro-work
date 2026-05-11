// WC-CB Day 3 (D-3, 2026-05-13): Sign-in for invited cohort members.
//
// Authority: brief §2 — "Sign-in (email + password baseline)" +
// "Nafath placeholder stub per UX-001 §5.1 with TODO marker for future
// wiring (display the option, button disabled with 'Coming soon' label)."
//
// Brand-neutral per PROPOSAL §11.A5: brand wordmark from getBrand();
// copy from locale t().
//
// NO self-serve registration link — that route is gated. Users without
// invitations are pointed to /request-access (cohort intake).

import { apiPostPublic, setToken } from "../api.js"
import { t, getLocale } from "../locale.js"
import { getBrand } from "../brand/index.js"

function render(el) {
  el.innerHTML = ""
  const locale = getLocale()
  const brand  = getBrand()

  const wrap = document.createElement("div")
  wrap.className = "onboarding-screen"

  const box = document.createElement("div")
  box.className = "onboarding-box"

  // ── Brand wordmark ─────────────────────────────────────────────────
  const brandRow = document.createElement("div")
  brandRow.style.cssText = "margin-bottom:var(--maq-space-6)"
  const wordmark = document.createElement("span")
  wordmark.style.cssText = "font-size:var(--maq-text-xl);font-weight:var(--maq-weight-bold);color:var(--maq-brand-primary);font-family:var(--maq-font-arabic),var(--maq-font-latin)"
  wordmark.textContent = (brand.publicName && brand.publicName[locale]) || "WorkCaptain"
  brandRow.appendChild(wordmark)
  box.appendChild(brandRow)

  const title = document.createElement("h1")
  title.textContent = t("signin.title")
  title.style.cssText = "font-size:var(--maq-text-2xl);margin:0 0 var(--maq-space-2)"
  box.appendChild(title)

  const subtitle = document.createElement("p")
  subtitle.className = "onboarding-subtitle"
  subtitle.textContent = t("signin.subtitle")
  box.appendChild(subtitle)

  // ── Form ───────────────────────────────────────────────────────────
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
  pwInput.autocomplete = "current-password"
  pwInput.required = true
  pwGroup.appendChild(pwLabel)
  pwGroup.appendChild(pwInput)
  form.appendChild(pwGroup)

  form.appendChild(errEl)

  // ── Submit ─────────────────────────────────────────────────────────
  const btn = document.createElement("button")
  btn.type = "submit"
  btn.className = "btn btn-accent onboarding-btn"
  btn.textContent = t("signin.submit")

  btn.addEventListener("click", async () => {
    errEl.textContent = ""
    const email = (emailInput.value || "").trim().toLowerCase()
    const password = pwInput.value || ""
    if (!email) { errEl.textContent = t("signin.err.emailRequired"); return }
    if (!password) { errEl.textContent = t("signin.err.passwordRequired"); return }

    btn.disabled = true
    btn.textContent = t("signin.submitting")

    try {
      const data = await apiPostPublic("/api/auth/login", { email, password })
      setToken(data.token)
      try { localStorage.setItem("pw_email", (data.user && data.user.email) || email) } catch {}
      try { localStorage.setItem("pw_company", (data.user && data.user.companyName) || "") } catch {}
      try { localStorage.setItem("pw_tenant", (data.user && data.user.tenant_id) || "default") } catch {}
      window.location.hash = "dashboard"
      window.location.reload()
    } catch (e) {
      errEl.textContent = t("signin.err.invalid")
      btn.disabled = false
      btn.textContent = t("signin.submit")
    }
  })

  form.appendChild(btn)

  // ── Divider ────────────────────────────────────────────────────────
  const divider = document.createElement("div")
  divider.setAttribute("aria-hidden", "true")
  divider.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:var(--maq-space-3)",
    "margin:var(--maq-space-6) 0",
    "color:var(--maq-neutral-400)",
    "font-size:var(--maq-text-xs)",
    "text-transform:uppercase",
    "letter-spacing:var(--maq-tracking-wide)",
  ].join(";")
  const line1 = document.createElement("span"); line1.style.cssText = "flex:1;height:1px;background:var(--maq-neutral-200)"
  const orText = document.createElement("span"); orText.textContent = t("signin.or")
  const line2 = document.createElement("span"); line2.style.cssText = "flex:1;height:1px;background:var(--maq-neutral-200)"
  divider.appendChild(line1); divider.appendChild(orText); divider.appendChild(line2)
  form.appendChild(divider)

  // ── Nafath stub (UX-001 §5.1 + brief §2) ───────────────────────────
  // Display the option; button DISABLED with "Coming soon" label.
  // TODO post-D15+41: wire to platform identity service (UX-G2 V1.1 §7.2
  // NafathSignInButton spec) — never auto-trigger.
  const nafathBtn = document.createElement("button")
  nafathBtn.type = "button"
  nafathBtn.disabled = true
  nafathBtn.setAttribute("aria-disabled", "true")
  nafathBtn.title = t("signin.nafathComingSoon")
  nafathBtn.style.cssText = [
    "width:100%",
    "padding:var(--maq-space-3) var(--maq-space-4)",
    "background:transparent",
    "color:var(--maq-neutral-500)",
    "border:1px dashed var(--maq-neutral-300)",
    "border-radius:var(--maq-radius-md)",
    "font-family:inherit",
    "font-size:var(--maq-text-sm)",
    "cursor:not-allowed",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "gap:var(--maq-space-2)",
  ].join(";")
  // Icon placeholder (decorative — Nafath brand asset to come from
  // platform asset registry per UX-G2 V1.1 §7.3, not bundled here).
  const nafathIcon = document.createElement("span")
  nafathIcon.setAttribute("aria-hidden", "true")
  nafathIcon.textContent = "🪪"
  nafathBtn.appendChild(nafathIcon)
  const nafathLabel = document.createElement("span")
  nafathLabel.textContent = t("signin.nafath")
  nafathBtn.appendChild(nafathLabel)
  const nafathBadge = document.createElement("span")
  nafathBadge.textContent = t("common.comingSoon")
  nafathBadge.style.cssText = "margin-inline-start:var(--maq-space-2);padding:0 var(--maq-space-2);background:var(--maq-neutral-100);color:var(--maq-neutral-600);border-radius:var(--maq-radius-sm);font-size:var(--maq-text-xs);font-weight:var(--maq-weight-medium)"
  nafathBtn.appendChild(nafathBadge)
  form.appendChild(nafathBtn)

  // ── Footer link to cohort request ──────────────────────────────────
  const requestLink = document.createElement("p")
  requestLink.className = "onboarding-link"
  requestLink.innerHTML = `${t("signin.noInvite")} <a href="#request-access">${t("cta.requestAccess")}</a>`
  form.appendChild(requestLink)

  box.appendChild(form)
  wrap.appendChild(box)
  el.appendChild(wrap)
}

export default { render }
