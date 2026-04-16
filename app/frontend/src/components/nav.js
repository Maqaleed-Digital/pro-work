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

const TABS = [
  { key: "dashboard",        label: "Dashboard"   },
  { key: "workers",          label: "Workers"      },
  { key: "pods",             label: "Pods"         },
  { key: "assignments",      label: "Assignments"  },
  { key: "evidence",         label: "Evidence"     },
  { key: "scheduler",        label: "Scheduler"    },
  { key: "governance",       label: "Governance"   },
  { key: "tenants",          label: "Tenants"      },
  { key: "analytics",        label: "Analytics"    },
  { key: "system",           label: "System"       },
  { key: "ai",               label: "AI Control", badge: () => _aiPendingCount },
  { key: "data-privacy",     label: "Data Privacy" },
  { key: "fee-transparency", label: "Fee Transparency" },
  { key: "identity",         label: "Work Identity" },
  { key: "beta-dashboard",   label: "Beta / GTM" },
]

let _signOutCb = null
let _tenantChangeCb = null

export function renderNav(activeKey, onSignOut, onTenantChange) {
  if (onSignOut) _signOutCb = onSignOut
  if (onTenantChange) _tenantChangeCb = onTenantChange

  // S36-G2: refresh pending count on every nav render (polling on navigation)
  refreshAiPendingCount()

  const nav = document.getElementById("nav")
  if (!nav) return
  nav.innerHTML = ""
  // WCAG 4.1.2: navigation landmark with accessible name
  nav.setAttribute("role", "navigation")
  nav.setAttribute("aria-label", "Main navigation")

  // brand
  const brand = document.createElement("div")
  brand.className = "brand"
  brand.setAttribute("aria-hidden", "true")  // decorative duplicate of page title
  brand.textContent = "ProWork Admin"
  nav.appendChild(brand)

  // tabs
  const tabs = document.createElement("div")
  tabs.className = "tabs"
  tabs.setAttribute("role", "list")
  TABS.forEach(({ key, label, badge }) => {
    const li = document.createElement("div")
    li.setAttribute("role", "listitem")
    const a = document.createElement("a")
    a.className = "tab" + (key === activeKey ? " active" : "")
    a.href = "#" + key
    // WCAG 1.3.1 / 4.1.2: active page state communicated to assistive technology
    if (key === activeKey) a.setAttribute("aria-current", "page")

    const labelSpan = document.createElement("span")
    labelSpan.textContent = label
    a.appendChild(labelSpan)

    // Pending badge — red dot with count, shown when count > 0
    if (badge) {
      const count = badge()
      if (count > 0) {
        const dot = document.createElement("span")
        dot.style.cssText = [
          "display:inline-flex",
          "align-items:center",
          "justify-content:center",
          "background:#ef4444",
          "color:#fff",
          "font-size:10px",
          "font-weight:700",
          "border-radius:999px",
          "min-width:16px",
          "height:16px",
          "padding:0 4px",
          "margin-inline-start:4px",
          "vertical-align:middle",
          "line-height:1",
        ].join(";")
        dot.setAttribute("aria-label", `${count} pending`)
        dot.textContent = count > 99 ? "99+" : String(count)
        a.appendChild(dot)
      }
    }

    li.appendChild(a)
    tabs.appendChild(li)
  })
  nav.appendChild(tabs)

  // token + sign-out
  const right = document.createElement("div")
  right.style.display = "flex"
  right.style.gap = "8px"
  right.style.alignItems = "center"

  // tenant selector
  const tenantWrap = document.createElement("div")
  tenantWrap.style.cssText = "display:flex;align-items:center;gap:4px;font-size:12px;color:#888"
  const tenantLabel = document.createElement("span")
  tenantLabel.textContent = "Tenant:"
  const tenantSel = document.createElement("select")
  tenantSel.style.cssText = "font-size:12px;padding:2px 4px;border-radius:4px;border:1px solid #ccc;cursor:pointer"
  const currentTenant = getTenant()
  const base = _tenantOptions || ["default", "t1", "t2", "t3"]
  const tenantOptions = [...base]
  if (!tenantOptions.includes(currentTenant)) tenantOptions.unshift(currentTenant)
  tenantOptions.forEach(tid => {
    const opt = document.createElement("option")
    opt.value = tid
    opt.textContent = tid
    if (tid === currentTenant) opt.selected = true
    tenantSel.appendChild(opt)
  })
  tenantSel.addEventListener("change", () => {
    setTenant(tenantSel.value)
    if (_tenantChangeCb) _tenantChangeCb(tenantSel.value)
  })
  tenantWrap.appendChild(tenantLabel)
  tenantWrap.appendChild(tenantSel)
  right.appendChild(tenantWrap)

  const token = getToken()
  if (token) {
    const badge = document.createElement("div")
    badge.className = "token-badge"
    badge.textContent = token.length > 12
      ? token.slice(0, 6) + "…" + token.slice(-4)
      : token
    right.appendChild(badge)
  }

  const btn = document.createElement("button")
  btn.className = "signout-btn"
  btn.textContent = "Sign out"
  btn.addEventListener("click", () => {
    setToken("")
    clearTenantOptions()
    if (_signOutCb) _signOutCb()
  })
  right.appendChild(btn)
  nav.appendChild(right)
}
