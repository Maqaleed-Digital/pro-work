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
import requestAccess    from "./pages/request_access.js"
import onboarding       from "./pages/onboarding.js"
import invite           from "./pages/invite.js"
import acceptInvite     from "./pages/accept_invite.js"
import signin           from "./pages/signin.js"
import betaAcknowledgement from "./pages/beta_acknowledgement.js"
import settings           from "./pages/settings.js"
import postRole         from "./pages/post_role.js"
import candidates       from "./pages/candidates.js"
import offerBuilder     from "./pages/offer_builder.js"
import seekerHome       from "./pages/seeker_home.js"
import marketplace      from "./pages/marketplace.js"
import seekerApply      from "./pages/seeker_apply.js"
import seekerContract   from "./pages/seeker_contract.js"
import compliance       from "./pages/compliance.js"
import complianceNitaqat   from "./pages/compliance_nitaqat_detail.js"
import complianceWps       from "./pages/compliance_wps_list.js"
import complianceProbation from "./pages/compliance_probation_list.js"
import complianceEsb       from "./pages/compliance_esb_list.js"

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
  "post-role":        postRole,
  "candidates":       candidates,
  "offer-builder":    offerBuilder,
  "seeker-home":      seekerHome,
  "marketplace":      marketplace,
  "seeker-apply":     seekerApply,
  "seeker-contract":  seekerContract,
  "compliance":          compliance,
  "compliance-nitaqat":  complianceNitaqat,
  "compliance-wps":      complianceWps,
  "compliance-probation": complianceProbation,
  "compliance-esb":      complianceEsb,
}

const DEFAULT = "dashboard"

function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, "").split("?")[0].trim()
  if (ROUTES[hash]) return hash
  // S45-G5: parameterized route for apply flow
  if (/^marketplace\/role\/[a-f0-9-]+\/apply$/.test(hash)) return "seeker-apply"
  // S45-G6: parameterized route for contract detail
  if (/^seeker-home\/contracts\/[a-f0-9-]+$/.test(hash)) return "seeker-contract"
  return DEFAULT
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
