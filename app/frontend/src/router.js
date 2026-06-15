import { renderNav, setTenantOptions, getFront } from "./components/nav.js"
import { canAccessRoute } from "./components/nav-model.js"
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
import evidenceExport   from "./pages/evidence_export.js"   // UI-5: internal evidence-pack export (Front B; guard-walled)
import hyperpaySandbox  from "./pages/hyperpay_sandbox.js"  // UI-7: customer HyperPay SANDBOX (Front A; disclosed-not-live, no live funds)
import register         from "./pages/register.js"
import requestAccess    from "./pages/request_access.js"
import onboarding       from "./pages/onboarding.js"
import invite           from "./pages/invite.js"
import acceptInvite     from "./pages/accept_invite.js"
import signin           from "./pages/signin.js"
import betaAcknowledgement from "./pages/beta_acknowledgement.js"
import settings           from "./pages/settings.js"
import employees          from "./pages/employees.js"
import saudisation        from "./pages/saudisation.js"
import payroll            from "./pages/payroll.js"
import trust              from "./pages/trust.js"
import postRole         from "./pages/post_role.js"
import candidates       from "./pages/candidates.js"
import offerBuilder     from "./pages/offer_builder.js"
import compliance       from "./pages/compliance.js"

// S40-G5/G6/S42 + WC-CB Day 3: routes that skip auth and hide nav.
// `register` is preserved as a redirect-only stub to `request-access`
// (kill-switch for self-serve self-invitation per brief §2). The
// onboarding wizard and beta-acknowledgement screens are also public
// because the user is mid-flow and shouldn't be re-prompted for login.
const PUBLIC_ROUTES = new Set([
  "register",
  "request-access",
  "onboarding",
  "accept-invite",
  "signin",
  "beta-acknowledgement",
])

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
  // GO-2 union — HEAD demo surfaces preserved alongside feat customer routes:
  "beta":             betaDashboard,    // HEAD UI-2 key (nav-model guard references "beta")
  "evidence-export":  evidenceExport,   // HEAD UI-5 (Front B, guard-walled)
  "hyperpay-sandbox": hyperpaySandbox,  // HEAD UI-7 (Front A, disclosed-not-live)
  "register":            register,            // redirect-only stub → #request-access
  "request-access":      requestAccess,       // WC-CB Day 3 — cohort intake
  "onboarding":          onboarding,
  "invite":              invite,
  "accept-invite":       acceptInvite,
  "signin":              signin,
  "beta-acknowledgement": betaAcknowledgement, // WC-CB Day 3 — one-time
                                                // controlled-beta posture
                                                // screen post-onboarding
  "settings":             settings,             // WC-CB Day 4 — brief §3.6
  "employees":            employees,            // WC-CB Day 5 — brief §3.2
  "saudisation":          saudisation,          // WC-CB Day 5 — brief §3.3
  "payroll":              payroll,              // WC-CB Day 5 — brief §3.4
  "trust":                trust,                // WC-CB Day 6 — brief §6
  "post-role":        postRole,
  "candidates":       candidates,
  "offer-builder":    offerBuilder,
  "compliance":          compliance,
}

const DEFAULT = "dashboard"

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, "").split("?")[0].trim()
  if (ROUTES[hash]) return hash
  return DEFAULT
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
