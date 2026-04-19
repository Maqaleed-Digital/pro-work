// S45-G2: Seeker home stub page
import { t } from "../locale.js"

function render(el) {
  el.innerHTML = ""

  const wrap = document.createElement("div")
  wrap.className = "onboarding-screen"

  const box = document.createElement("div")
  box.className = "onboarding-box"
  box.style.cssText = "text-align:center;padding:var(--space-6)"

  // Brand wordmark
  const brandRow = document.createElement("div")
  brandRow.style.cssText = "display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:var(--space-3)"
  const brandMark = document.createElement("div")
  brandMark.className = "sidebar-brand-mark"
  brandMark.textContent = "W"
  const brandName = document.createElement("span")
  brandName.style.cssText = "font-family:var(--font-display);font-size:var(--text-xl);font-weight:700;color:var(--color-text-primary)"
  brandName.textContent = "WorkCaptain"
  brandRow.appendChild(brandMark)
  brandRow.appendChild(brandName)
  box.appendChild(brandRow)

  const title = document.createElement("h1")
  title.textContent = t("seekerHome.welcome")
  box.appendChild(title)

  const desc = document.createElement("p")
  desc.className = "onboarding-subtitle"
  desc.textContent = t("seekerHome.comingSoon")
  box.appendChild(desc)

  wrap.appendChild(box)
  el.appendChild(wrap)
}

export default { render }
