import { getToken, setToken, getTenant, setTenant } from "../api.js"
import { FRONTS, FRONT_IDS, FRONT_NAV, canAccessRoute, isExcluded } from "./nav-model.js"

// WC-W4-UI-001 · UI-1.1 shell — Two-Front Product Architecture over ONE backend.
// Front A = WorkCaptain (customer) · Front B = Maqaleed Workforce Console (internal).
// The active front is set by host/auth context (setFront) — NOT a user-facing toggle (that would
// defeat the boundary). Surface-access guard is enforced at the router; nav only renders the
// front's in-scope, guard-permitted surfaces. 3 stacks NOT consolidated (flagged).

let _tenantOptions = null
export function setTenantOptions(options) { _tenantOptions = Array.isArray(options) ? options : null }
export function clearTenantOptions() { _tenantOptions = null }

let _signOutCb = null
let _tenantChangeCb = null
// Default front = B (internal console) — preserves the existing ops-console behavior. The customer
// front (A) is selected by context. Front is NOT switchable from the UI.
let _front = "B"
export function setFront(front) { if (FRONT_IDS.includes(front)) _front = front }
export function getFront() { return _front }

function renderBrand(nav, front) {
  const f = FRONTS[front]
  const brand = document.createElement("div")
  brand.className = "brand front-" + front.toLowerCase()
  brand.setAttribute("data-front", f.id)
  brand.setAttribute("data-brand-copy", f.brand.copyStatus) // PENDING-DL-037-CONFIRMATION on Front A
  brand.textContent = f.brand.name
  nav.appendChild(brand)
}

function renderModeChrome(nav, front) {
  // Fail-closed-visible: show the front + a live/disclosed indicator.
  const chip = document.createElement("div")
  chip.className = "front-chip front-" + front.toLowerCase()
  chip.setAttribute("data-front", front)
  chip.textContent = front === "A" ? "WorkCaptain · customer" : "Maqaleed Workforce Console · internal"
  nav.appendChild(chip)
}

function renderTabs(nav, front, activeKey) {
  const tabs = document.createElement("div")
  tabs.className = "tabs"
  ;(FRONT_NAV[front] || []).forEach(({ key, label, mode }) => {
    // belt-and-suspenders: never render an excluded surface, nor one the front can't reach.
    if (isExcluded(key)) return
    if (!canAccessRoute(front, key)) return
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
  nav.appendChild(tabs)
}

export function renderNav(activeKey, onSignOut, onTenantChange, front) {
  if (onSignOut) _signOutCb = onSignOut
  if (onTenantChange) _tenantChangeCb = onTenantChange
  if (front && FRONT_IDS.includes(front)) _front = front

  const nav = document.getElementById("nav")
  if (!nav) return
  nav.innerHTML = ""

  renderBrand(nav, _front)
  renderModeChrome(nav, _front)
  renderTabs(nav, _front, activeKey)

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
