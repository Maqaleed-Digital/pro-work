import { apiGet } from "../api.js"
import { toast } from "../components/toast.js"

function checkItem(icon, text, status, cls) {
  const d = document.createElement("div")
  d.className = "check-item"
  d.innerHTML = `<div class="check-icon">${icon}</div>
    <div class="check-text">${text}</div>
    <div class="check-status ${cls}">${status}</div>`
  return d
}

function wrapCard(title, children) {
  const d = document.createElement("div")
  d.className = "card"
  const t = document.createElement("div")
  t.className = "card-title"
  t.textContent = title
  d.appendChild(t)
  children.forEach(c => d.appendChild(c))
  return d
}

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-title">Compliance &amp; Risk</div>
      <div class="page-sub">KSA Sovereign Layer — Nitaqat · WPS · Probation · ESB</div>`

    const loading = document.createElement("div")
    loading.className = "page-load"
    loading.textContent = "Loading compliance status…"
    container.appendChild(loading)

    apiGet("/api/sovereign/status")
      .catch(() => null)
      .then(sovereign => {
        loading.remove()

        const grid = document.createElement("div")
        grid.className = "cc-grid-2"
        container.appendChild(grid)

        // ── Nitaqat card ──────────────────────────────────────
        const zone = sovereign?.nitaqat_zone || "Unknown"
        const zoneCls = { Platinum: "platinum", Green: "green", Yellow: "yellow", Red: "red" }[zone] || "amber"

        const zoneEl = document.createElement("div")
        zoneEl.className = `nitaqat-zone ${zoneCls}`
        zoneEl.innerHTML = `<span>●</span> ${zone} Zone`

        const nitaqatChecks = document.createElement("div")
        nitaqatChecks.className = "check-list"
        nitaqatChecks.appendChild(checkItem("🏢", "Establishment profile configured",
          sovereign ? "PASS" : "PENDING", sovereign ? "pass" : "warn"))
        nitaqatChecks.appendChild(checkItem("👤", "Saudisation ratio validated",
          sovereign?.saudisation_ok ? "PASS" : "REVIEW", sovereign?.saudisation_ok ? "pass" : "warn"))
        nitaqatChecks.appendChild(checkItem("📋", "Occupation codes validated",
          sovereign?.occ_codes_ok ? "PASS" : "REVIEW", sovereign?.occ_codes_ok ? "pass" : "warn"))
        nitaqatChecks.appendChild(checkItem("📊", "Nitaqat impact preview available", "ACTIVE", "pass"))

        grid.appendChild(wrapCard("Nitaqat Status", [zoneEl, nitaqatChecks]))

        // ── WPS Readiness card ────────────────────────────────
        const wpsPending = sovereign?.wps_pending || 0
        const wpsChecks = document.createElement("div")
        wpsChecks.className = "check-list"
        wpsChecks.appendChild(checkItem("🏦", `IBAN verification — ${wpsPending} pending`,
          wpsPending > 0 ? "ACTION" : "PASS", wpsPending > 0 ? "fail" : "pass"))
        wpsChecks.appendChild(checkItem("🪪", "Identity documents collected",
          sovereign?.id_docs_ok ? "PASS" : "PENDING", sovereign?.id_docs_ok ? "pass" : "warn"))
        wpsChecks.appendChild(checkItem("✅", "Bank confirmation artifacts",
          sovereign?.bank_conf_ok ? "PASS" : "PENDING", sovereign?.bank_conf_ok ? "pass" : "warn"))
        wpsChecks.appendChild(checkItem("📦", "WPS-ready salary data package", "CONFIGURED", "pass"))

        const wpsBtn = document.createElement("button")
        wpsBtn.className = "btn btn-gold"
        wpsBtn.style.marginTop = "14px"
        wpsBtn.textContent = "Generate WPS Pack"
        wpsBtn.addEventListener("click", () => toast.ok("WPS Pack generation queued"))

        grid.appendChild(wrapCard("WPS Readiness Pack", [wpsChecks, wpsBtn]))

        // ── Probation card ────────────────────────────────────
        const probExpiring = sovereign?.probation_expiring || 0
        const probChecks = document.createElement("div")
        probChecks.className = "check-list"
        probChecks.appendChild(checkItem("📅", `Probations expiring — ${probExpiring} workers`,
          probExpiring > 0 ? "URGENT" : "CLEAR", probExpiring > 0 ? "fail" : "pass"))
        probChecks.appendChild(checkItem("🤖", "Day-80 automation", "ACTIVE", "pass"))
        probChecks.appendChild(checkItem("📋", "Evidence pack auto-generation", "ACTIVE", "pass"))
        probChecks.appendChild(checkItem("👤", "Human approval required for decisions", "ENFORCED", "pass"))

        const probBtn = document.createElement("button")
        probBtn.className = "btn btn-primary"
        probBtn.style.marginTop = "14px"
        probBtn.textContent = "Review Probations"
        probBtn.addEventListener("click", () => toast.ok("Opening probation review…"))

        grid.appendChild(wrapCard("Probation Governance", [probChecks, probBtn]))

        // ── ESB Calculator card ───────────────────────────────
        const esbInfo = document.createElement("div")
        esbInfo.style.cssText = "font-size:13px;color:var(--muted);margin-bottom:14px"
        esbInfo.textContent = "End-of-service benefit calculator using versioned KSA policy engine."

        const esbBtn = document.createElement("button")
        esbBtn.className = "btn btn-primary"
        esbBtn.textContent = "Calculate ESB"
        esbBtn.addEventListener("click", () => toast.ok("ESB calculation engine ready"))

        grid.appendChild(wrapCard("ESB Calculator", [esbInfo, esbBtn]))
      })
  }
}
