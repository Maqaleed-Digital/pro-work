import { renderNav, setTenantOptions, getFront } from "./components/nav.js"
import { canAccessRoute } from "./components/nav-model.js"
import { apiGet } from "./api.js"
import dashboard   from "./pages/dashboard.js"
import workers     from "./pages/workers.js"
import pods        from "./pages/pods.js"
import assignments from "./pages/assignments.js"
import evidence    from "./pages/evidence.js"
import scheduler   from "./pages/scheduler.js"
import governance  from "./pages/governance.js"
import tenants     from "./pages/tenants.js"
import analytics   from "./pages/analytics.js"
import system      from "./pages/system.js"
import betaDashboard from "./pages/beta_dashboard.js" // UI-2: internal /admin/beta (Front B; guard-walled from Front A)

const ROUTES = {
  "dashboard":   dashboard,
  "workers":     workers,
  "pods":        pods,
  "assignments": assignments,
  "evidence":    evidence,
  "scheduler":   scheduler,
  "governance":  governance,
  "tenants":     tenants,
  "analytics":   analytics,
  "system":      system,
  "beta":        betaDashboard,
}

const DEFAULT = "dashboard"

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, "").split("?")[0].trim()
  return ROUTES[hash] ? hash : DEFAULT
}

let _pageEl = null

function renderAccessDenied(el, key, front) {
  const box = document.createElement("div")
  box.className = "access-denied"
  box.setAttribute("role", "alert")
  box.setAttribute("data-denied-route", key)
  box.textContent = `Surface "${key}" is not available on the WorkCaptain (customer) front.`
  el.appendChild(box)
}

function navigate(name, pushState = true) {
  const front = getFront()
  const requested = ROUTES[name] ? name : DEFAULT
  // SURFACE-ACCESS GUARD (routing-level): a front that cannot reach a route hits a wall here,
  // even on a direct URL (#governance) — not merely a hidden nav link.
  if (!canAccessRoute(front, requested)) {
    if (pushState) location.hash = DEFAULT
    renderNav(DEFAULT)
    if (_pageEl) { _pageEl.innerHTML = ""; renderAccessDenied(_pageEl, requested, front) }
    return
  }
  const key = requested
  if (pushState) location.hash = key
  renderNav(key)
  if (_pageEl) {
    _pageEl.innerHTML = ""
    ROUTES[key].render(_pageEl)
  }
}

export function initRouter(appEl, onSignOut) {
  appEl.innerHTML = ""

  const navEl = document.createElement("div")
  navEl.id = "nav"
  appEl.appendChild(navEl)

  _pageEl = document.createElement("div")
  _pageEl.id = "page"
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
