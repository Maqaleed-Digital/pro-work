import { renderNav, setTenantOptions } from "./components/nav.js"
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
import compliance   from "./pages/compliance.js"
import ai_control   from "./pages/ai_control.js"
import trust_ledger from "./pages/trust_ledger.js"
import eri          from "./pages/eri.js"
import pdpl         from "./pages/pdpl.js"
import wps          from "./pages/wps.js"
import payments     from "./pages/payments.js"
import identity     from "./pages/identity.js"
import revenue      from "./pages/revenue.js"
import onboarding   from "./pages/onboarding.js"
import enterprise    from "./pages/enterprise.js"
import trust         from "./pages/trust.js"
import reliability   from "./pages/reliability.js"
import ops_readiness from "./pages/ops_readiness.js"

const ROUTES = {
  "dashboard":    dashboard,
  "workers":      workers,
  "pods":         pods,
  "assignments":  assignments,
  "evidence":     evidence,
  "scheduler":    scheduler,
  "governance":   governance,
  "tenants":      tenants,
  "analytics":    analytics,
  "system":       system,
  "compliance":   compliance,
  "ai_control":   ai_control,
  "trust_ledger": trust_ledger,
  "eri":          eri,
  "pdpl":         pdpl,
  "wps":          wps,
  "payments":     payments,
  "identity":     identity,
  "revenue":      revenue,
  "onboarding":   onboarding,
  "enterprise":    enterprise,
  "trust":         trust,
  "reliability":   reliability,
  "ops_readiness": ops_readiness,
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
