import { getToken, setToken, getTenant, setTenant } from "../api.js"
import { BRANDS, ROLE_NAV, ROLES, roleMode, isExcluded } from "./nav-model.js"

// WC-W4-UI-001 · UI-1 shell — dual-brand (DL-037) + role-aware nav + Mode-A/D visible tagging.
// In-scope surfaces only; marketplace + ERI hard-excluded; ai held until UI-4 (see nav-model.js).
// 3 stacks NOT consolidated (flagged). Renders from the pure nav-model.

// S30: live tenant list (null = use hardcoded fallback)
let _tenantOptions = null
export function setTenantOptions(options) { _tenantOptions = Array.isArray(options) ? options : null }
export function clearTenantOptions() { _tenantOptions = null }

let _signOutCb = null
let _tenantChangeCb = null
let _currentRole = "admin"

export function setRole(role) { if (ROLES.includes(role)) _currentRole = role }
export function getRole() { return _currentRole }

function renderBrand(nav) {
  // Dual-brand structural switch (DL-037). Exact copy PENDING-DL-037-CONFIRMATION — not invented.
  const brand = document.createElement("div")
  brand.className = "brand brand-dual"
  brand.setAttribute("data-brand-copy", BRANDS.copyStatus)
  const primary = document.createElement("span")
  primary.className = "brand-primary"
  primary.textContent = BRANDS.primary.name
  const sep = document.createElement("span")
  sep.className = "brand-sep"
  sep.textContent = " ↔ "
  const cobrand = document.createElement("span")
  cobrand.className = "brand-cobrand"
  cobrand.textContent = BRANDS.cobrand.name
  if (BRANDS.primary.tagline) {
    const small = document.createElement("small")
    small.className = "brand-tagline"
    small.textContent = " " + BRANDS.primary.tagline
    primary.appendChild(small)
  }
  brand.appendChild(primary); brand.appendChild(sep); brand.appendChild(cobrand)
  nav.appendChild(brand)
}

function renderModeChrome(nav, role) {
  // Fail-closed-visible Mode chrome: a global Mode indicator for the active role.
  const m = roleMode(role)
  const chip = document.createElement("div")
  chip.className = "mode-chip mode-" + m
  chip.setAttribute("data-mode", m)
  chip.textContent = m === "A" ? "Mode A · live" : "Mode D · disclosed-not-live"
  nav.appendChild(chip)
}

function renderRoleSwitch(nav, activeRole) {
  const wrap = document.createElement("div")
  wrap.className = "role-switch"
  ROLES.forEach((role) => {
    const a = document.createElement("a")
    a.className = "role" + (role === activeRole ? " active" : "")
    a.href = "#role/" + role
    a.textContent = role
    a.addEventListener("click", () => setRole(role))
    wrap.appendChild(a)
  })
  nav.appendChild(wrap)
}

function renderTabs(nav, role, activeKey) {
  const tabs = document.createElement("div")
  tabs.className = "tabs"
  const tree = ROLE_NAV[role] || []
  if (tree.length === 0) {
    // disclosed-not-live: role context present, in-scope surfaces forthcoming (later UI slices).
    const note = document.createElement("div")
    note.className = "tab-disclosed"
    note.setAttribute("data-state", "disclosed-not-live")
    note.textContent = `${role} surfaces — disclosed-not-live (arriving in later UI slices)`
    tabs.appendChild(note)
  } else {
    tree.forEach(({ key, label, mode }) => {
      if (isExcluded(key)) return // belt-and-suspenders: never render an excluded surface
      const a = document.createElement("a")
      a.className = "tab" + (key === activeKey ? " active" : "")
      a.href = "#" + key
      a.setAttribute("data-mode", mode)
      a.textContent = label
      if (mode === "D") {
        const d = document.createElement("span")
        d.className = "tab-mode-d"
        d.textContent = " · disclosed-not-live"
        a.appendChild(d)
      }
      tabs.appendChild(a)
    })
  }
  nav.appendChild(tabs)
}

export function renderNav(activeKey, onSignOut, onTenantChange, role) {
  if (onSignOut) _signOutCb = onSignOut
  if (onTenantChange) _tenantChangeCb = onTenantChange
  if (role && ROLES.includes(role)) _currentRole = role

  const nav = document.getElementById("nav")
  if (!nav) return
  nav.innerHTML = ""

  renderBrand(nav)
  renderModeChrome(nav, _currentRole)
  renderRoleSwitch(nav, _currentRole)
  renderTabs(nav, _currentRole, activeKey)

  // token + tenant + sign-out (preserved from prior shell)
  const right = document.createElement("div")
  right.style.display = "flex"
  right.style.gap = "8px"
  right.style.alignItems = "center"

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
