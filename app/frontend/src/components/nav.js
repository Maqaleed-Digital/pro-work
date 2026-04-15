import { getToken, setToken, getTenant, setTenant } from "../api.js"

let _tenantOptions = null

export function setTenantOptions(options) {
  _tenantOptions = Array.isArray(options) ? options : null
}

export function clearTenantOptions() {
  _tenantOptions = null
}

const TABS = [
  { key: "dashboard",    label: "⌂ Command Center" },
  { key: "workers",      label: "👥 Workforce"      },
  { key: "pods",         label: "🔷 Pods"           },
  { key: "assignments",  label: "📋 Execution"      },
  { key: "ai_control",   label: "🤖 AI Control"     },
  { key: "compliance",   label: "⚖️ Compliance"     },
  { key: "evidence",     label: "🧾 Evidence"       },
  { key: "trust_ledger", label: "📒 Trust Ledger"   },
  { key: "eri",          label: "⚠ ERI"             },
  { key: "pdpl",         label: "🔒 PDPL"           },
  { key: "wps",          label: "💳 WPS"            },
  { key: "governance",   label: "🏛 Governance"     },
  { key: "analytics",    label: "📊 Analytics"      },
  { key: "tenants",      label: "🏢 Tenants"        },
  { key: "system",       label: "⚙️ System"         },
]

let _signOutCb = null
let _tenantChangeCb = null

export function renderNav(activeKey, onSignOut, onTenantChange) {
  if (onSignOut) _signOutCb = onSignOut
  if (onTenantChange) _tenantChangeCb = onTenantChange

  const nav = document.getElementById("nav")
  if (!nav) return
  nav.innerHTML = ""

  const brand = document.createElement("div")
  brand.className = "brand"
  brand.innerHTML = "Work<span>Captain</span>"
  nav.appendChild(brand)

  const tabs = document.createElement("div")
  tabs.className = "tabs"
  TABS.forEach(({ key, label }) => {
    const a = document.createElement("a")
    a.className = "tab" + (key === activeKey ? " active" : "")
    a.href = "#" + key
    a.textContent = label
    tabs.appendChild(a)
  })
  nav.appendChild(tabs)

  const right = document.createElement("div")
  right.style.cssText = "display:flex;gap:8px;align-items:center;flex-shrink:0"

  const tenantWrap = document.createElement("div")
  tenantWrap.className = "tenant-wrap"
  const tenantLabel = document.createElement("span")
  tenantLabel.textContent = "Tenant:"
  const tenantSel = document.createElement("select")
  const currentTenant = getTenant()
  const base = _tenantOptions || ["default", "t1", "t2", "t3"]
  const tenantOptions = [...base]
  if (!tenantOptions.includes(currentTenant)) tenantOptions.unshift(currentTenant)
  tenantOptions.forEach(tid => {
    const opt = document.createElement("option")
    opt.value = tid; opt.textContent = tid
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
    badge.textContent = token.length > 12 ? token.slice(0, 6) + "…" + token.slice(-4) : token
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
