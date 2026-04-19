import { renderNav, setTenantOptions } from "./components/nav.js"
import { apiGet } from "./api.js"
import dashboard        from "./pages/dashboard.js"
import workers          from "./pages/workers.js"
import pods             from "./pages/pods.js"
import assignments      from "./pages/assignments.js"
import evidence         from "./pages/evidence.js"
import scheduler        from "./pages/scheduler.js"
import governance       from "./pages/governance.js"
import tenants          from "./pages/tenants.js"
import analytics        from "./pages/analytics.js"
import system           from "./pages/system.js"
import ai               from "./pages/ai.js"
import dataPrivacy      from "./pages/data_privacy.js"
import feeTransparency  from "./pages/fee_transparency.js"
import identity         from "./pages/identity.js"
import betaDashboard    from "./pages/beta_dashboard.js"
import register         from "./pages/register.js"
import onboarding       from "./pages/onboarding.js"
import invite           from "./pages/invite.js"
import acceptInvite     from "./pages/accept_invite.js"
import signin           from "./pages/signin.js"

// S40-G5/G6/S42: routes that skip auth and hide nav
const PUBLIC_ROUTES = new Set(["register", "onboarding", "accept-invite", "signin"])

const ROUTES = {
  "dashboard":        dashboard,
  "workers":          workers,
  "pods":             pods,
  "assignments":      assignments,
  "evidence":         evidence,
  "scheduler":        scheduler,
  "governance":       governance,
  "tenants":          tenants,
  "analytics":        analytics,
  "system":           system,
  "ai":               ai,
  "data-privacy":     dataPrivacy,
  "fee-transparency": feeTransparency,
  "identity":         identity,
  "beta-dashboard":   betaDashboard,
  "register":         register,
  "onboarding":       onboarding,
  "invite":           invite,
  "accept-invite":    acceptInvite,
  "signin":           signin,
}

const DEFAULT = "dashboard"

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, "").split("?")[0].trim()
  return ROUTES[hash] ? hash : DEFAULT
}

let _pageEl = null

function navigate(name, pushState = true) {
  const key = ROUTES[name] ? name : DEFAULT
  if (pushState) location.hash = key

  // S40-G5: hide nav on public routes (register, onboarding)
  const navEl = document.getElementById("nav")
  if (PUBLIC_ROUTES.has(key)) {
    if (navEl) navEl.style.display = "none"
  } else {
    if (navEl) navEl.style.display = ""
    renderNav(key)
  }

  if (_pageEl) {
    _pageEl.innerHTML = ""
    ROUTES[key].render(_pageEl)
  }
}

export function initRouter(appEl, onSignOut) {
  appEl.innerHTML = ""
  appEl.className = "app-layout"

  const navEl = document.createElement("div")
  navEl.id = "nav"
  appEl.appendChild(navEl)

  _pageEl = document.createElement("div")
  _pageEl.id = "page"
  _pageEl.className = "main-content"
  // WCAG 2.4.1: skip-link target — "Skip to main content" in index.html jumps here
  _pageEl.setAttribute("id", "main-content")
  _pageEl.setAttribute("tabindex", "-1")
  appEl.appendChild(_pageEl)

  renderNav(currentRoute(), onSignOut)

  // S30: load tenant list from registry; token is already set at this point
  apiGet("/api/admin/tenants")
    .then(data => {
      const ids = Array.isArray(data && data.tenants)
        ? data.tenants.map(t => t.tenant_id).filter(Boolean)
        : null
      if (ids && ids.length) { setTenantOptions(ids); renderNav(currentRoute()) }
    })
    .catch(() => {})  // silent fallback — hardcoded list stays

  window.addEventListener("hashchange", () => navigate(currentRoute(), false))

  navigate(currentRoute(), false)

  // expose global navigate for nav links
  window.__pwNavigate = navigate
}

export { ROUTES }
