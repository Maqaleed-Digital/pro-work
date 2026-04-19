import { getToken, setToken, getTenant, setTenant, apiGetJson } from "../api.js"

// S30: live tenant list (null = use hardcoded fallback)
let _tenantOptions = null

// S36-G2: pending AI approval count for nav badge (refreshed on renderNav)
let _aiPendingCount = 0
function refreshAiPendingCount() {
  apiGetJson("/api/admin/ai/audit-log/pending/count", {})
    .then(data => { _aiPendingCount = (data && data.count) || 0 })
    .catch(() => { _aiPendingCount = 0 })
}

export function setTenantOptions(options) {
  _tenantOptions = Array.isArray(options) ? options : null
}

export function clearTenantOptions() {
  _tenantOptions = null
}

// S42: Nav tabs with icons, grouped by workflow section
const NAV_SECTIONS = [
  {
    label: null, // primary — no label
    items: [
      { key: "dashboard",        label: "Command Center",   icon: "\u2302" },
      { key: "workers",          label: "Workers",          icon: "\u{1F465}" },
      { key: "post-role",       label: "Post a Role",      icon: "\u{1F4DD}" },
      { key: "governance",       label: "Compliance",       icon: "\u{1F6E1}" },
      { key: "ai",               label: "AI Control",       icon: "\u2728",    badge: () => _aiPendingCount },
    ]
  },
  {
    label: "Operations",
    items: [
      { key: "evidence",         label: "Evidence",         icon: "\u{1F4C2}" },
      { key: "pods",             label: "Pods",             icon: "\u2B1A" },
      { key: "assignments",      label: "Assignments",      icon: "\u2611" },
      { key: "scheduler",        label: "Scheduler",        icon: "\u23F1" },
    ]
  },
  {
    label: "Configuration",
    items: [
      { key: "tenants",          label: "Tenants",          icon: "\u{1F3E2}" },
      { key: "analytics",        label: "Analytics",        icon: "\u{1F4CA}" },
      { key: "system",           label: "System",           icon: "\u2699" },
      { key: "data-privacy",     label: "Data Privacy",     icon: "\u{1F512}" },
      { key: "fee-transparency", label: "Fee Transparency", icon: "\u{1F4B0}" },
      { key: "identity",         label: "Work Identity",    icon: "\u{1FAAA}" },
      { key: "beta-dashboard",   label: "Beta / GTM",       icon: "\u{1F680}" },
    ]
  },
]

let _signOutCb = null

export function renderNav(activeKey, onSignOut) {
  if (onSignOut) _signOutCb = onSignOut

  // S40: skip AI pending count on public routes
  const _hash = window.location.hash.replace('#', '').split('?')[0]
  if (!['register', 'onboarding', 'accept-invite'].includes(_hash)) {
    refreshAiPendingCount()
  }

  const nav = document.getElementById("nav")
  if (!nav) return
  nav.innerHTML = ""
  nav.className = "sidebar"
  nav.setAttribute("role", "navigation")
  nav.setAttribute("aria-label", "Main navigation")

  // ── Brand ─────────────────────────────────────────────────────────────
  const brand = document.createElement("div")
  brand.className = "sidebar-brand"

  const mark = document.createElement("div")
  mark.className = "sidebar-brand-mark"
  mark.textContent = "W"

  const brandText = document.createElement("div")
  brandText.className = "sidebar-brand-text"
  const companyName = (() => { try { return localStorage.getItem("pw_company") } catch { return null } })()
  brandText.innerHTML = `${companyName || "WorkCaptain"}<small>Workforce OS</small>`

  brand.appendChild(mark)
  brand.appendChild(brandText)
  nav.appendChild(brand)

  // ── Nav sections ──────────────────────────────────────────────────────
  const navWrap = document.createElement("div")
  navWrap.className = "sidebar-nav"

  NAV_SECTIONS.forEach(section => {
    const sectionEl = document.createElement("div")
    sectionEl.className = "nav-section"

    if (section.label) {
      const sectionLabel = document.createElement("div")
      sectionLabel.className = "nav-section-label"
      sectionLabel.textContent = section.label
      sectionEl.appendChild(sectionLabel)
    }

    section.items.forEach(({ key, label, icon, badge }) => {
      const a = document.createElement("a")
      a.className = "nav-item" + (key === activeKey ? " active" : "")
      a.href = "#" + key
      if (key === activeKey) a.setAttribute("aria-current", "page")

      const iconEl = document.createElement("span")
      iconEl.className = "nav-item-icon"
      iconEl.textContent = icon
      a.appendChild(iconEl)

      const labelEl = document.createElement("span")
      labelEl.className = "nav-item-label"
      labelEl.textContent = label
      a.appendChild(labelEl)

      if (badge) {
        const count = badge()
        if (count > 0) {
          const badgeEl = document.createElement("span")
          badgeEl.className = "nav-item-badge"
          badgeEl.textContent = count > 99 ? "99+" : String(count)
          a.appendChild(badgeEl)
        }
      }

      sectionEl.appendChild(a)
    })

    navWrap.appendChild(sectionEl)
  })

  nav.appendChild(navWrap)

  // ── Footer: user + sign out ───────────────────────────────────────────
  const footer = document.createElement("div")
  footer.className = "sidebar-footer"

  const userEl = document.createElement("div")
  userEl.className = "sidebar-user"

  const avatar = document.createElement("div")
  avatar.className = "sidebar-user-avatar"
  const email = (() => { try { return localStorage.getItem("pw_email") || "" } catch { return "" } })()
  avatar.textContent = email ? email.charAt(0).toUpperCase() : "U"

  const userInfo = document.createElement("div")
  userInfo.className = "sidebar-user-info"
  userInfo.textContent = email || "My Account"

  userEl.appendChild(avatar)
  userEl.appendChild(userInfo)
  footer.appendChild(userEl)

  const signOutBtn = document.createElement("button")
  signOutBtn.className = "sidebar-signout"
  signOutBtn.textContent = "Sign out"
  signOutBtn.addEventListener("click", () => {
    try { localStorage.removeItem("pw_token") } catch {}
    try { localStorage.removeItem("pw_company") } catch {}
    try { localStorage.removeItem("pw_email") } catch {}
    try { localStorage.removeItem("pw_tenant") } catch {}
    window.location.hash = "register"
    window.location.reload()
  })
  footer.appendChild(signOutBtn)

  nav.appendChild(footer)
}
