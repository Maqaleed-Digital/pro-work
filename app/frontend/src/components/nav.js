import { getToken, setToken } from "../api.js"

const TABS = [
  { key: "dashboard",   label: "Dashboard"   },
  { key: "workers",     label: "Workers"      },
  { key: "pods",        label: "Pods"         },
  { key: "assignments", label: "Assignments"  },
  { key: "evidence",    label: "Evidence"     },
  { key: "scheduler",   label: "Scheduler"    },
]

let _signOutCb = null

export function renderNav(activeKey, onSignOut) {
  if (onSignOut) _signOutCb = onSignOut

  const nav = document.getElementById("nav")
  if (!nav) return
  nav.innerHTML = ""

  // brand
  const brand = document.createElement("div")
  brand.className = "brand"
  brand.textContent = "ProWork Admin"
  nav.appendChild(brand)

  // tabs
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

  // token + sign-out
  const right = document.createElement("div")
  right.style.display = "flex"
  right.style.gap = "8px"
  right.style.alignItems = "center"

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
    if (_signOutCb) _signOutCb()
  })
  right.appendChild(btn)
  nav.appendChild(right)
}
