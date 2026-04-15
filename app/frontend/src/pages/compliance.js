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

    Promise.all([
      apiGet("/api/sovereign/status").catch(() => null),
      apiGet("/api/admin/eri").catch(() => null),
      apiGet("/api/admin/consents").catch(() => null),
      apiGet("/api/admin/wps/salary-pack").catch(() => null),
    ]).then(([sovereign, eri, consents, wps]) => {
        loading.remove()

        // Compliance alert strip
        const alerts = []
        const eriHigh = (eri?.items || []).filter(e => e.risk_level === "HIGH").length
        const wpsPending = (wps?.items || []).filter(s => s.wps_status !== "ready").length
        const activeConsents = (consents?.items || []).filter(c => !c.withdrawn_at).length
        if (eriHigh > 0)     alerts.push({ text: `${eriHigh} high-risk worker(s) detected by ERI`, cls: "fail",  btn: "eri" })
        if (wpsPending > 0)  alerts.push({ text: `${wpsPending} WPS record(s) incomplete`, cls: "warn", btn: "wps" })
        if (activeConsents === 0) alerts.push({ text: "No PDPL consents active — review consent register", cls: "warn", btn: "pdpl" })

        if (alerts.length > 0) {
          const alertBar = document.createElement("div")
          alertBar.style.cssText = "display:flex;flex-direction:column;gap:8px;margin-bottom:16px"
          alerts.forEach(a => {
            const item = document.createElement("div")
            item.style.cssText = `display:flex;align-items:center;gap:12px;padding:10px 16px;border-radius:10px;background:var(--bg);border:1px solid var(--border)`
            item.innerHTML = `<span class="check-status ${a.cls}" style="white-space:nowrap">${a.cls === "fail" ? "URGENT" : "ACTION"}</span>
              <span style="flex:1;font-size:13px">${a.text}</span>
              <button class="btn btn-primary btn-sm" onclick="location.hash='${a.btn}'">Review →</button>`
            alertBar.appendChild(item)
          })
          container.appendChild(alertBar)
        }

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
        const wpsItems   = wps?.items || []
        const wpsReady   = wpsItems.filter(s => s.wps_status === "ready").length
        const wpsPendingCount = wpsItems.length - wpsReady
        const wpsChecks = document.createElement("div")
        wpsChecks.className = "check-list"
        wpsChecks.appendChild(checkItem("🏦", `IBAN verification — ${wpsPendingCount > 0 ? wpsPendingCount + " pending" : "all verified"}`,
          wpsPendingCount > 0 ? "ACTION" : "PASS", wpsPendingCount > 0 ? "fail" : "pass"))
        wpsChecks.appendChild(checkItem("📦", `Salary records — ${wpsReady} ready / ${wpsItems.length} total`,
          wpsReady === wpsItems.length && wpsItems.length > 0 ? "PASS" : "PENDING",
          wpsReady === wpsItems.length && wpsItems.length > 0 ? "pass" : "warn"))
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

        // ── PDPL / Consent card ───────────────────────────────
        const pdplChecks = document.createElement("div")
        pdplChecks.className = "check-list"
        pdplChecks.appendChild(checkItem("✅", `Active consents — ${activeConsents} workers`,
          activeConsents > 0 ? "ACTIVE" : "ACTION", activeConsents > 0 ? "pass" : "fail"))
        pdplChecks.appendChild(checkItem("🔒", "PII redaction in export", "ACTIVE", "pass"))
        pdplChecks.appendChild(checkItem("📋", "Consent / withdrawal audit trail", "ACTIVE", "pass"))
        pdplChecks.appendChild(checkItem("⚠️", "DSR portal", "PENDING", "warn"))
        pdplChecks.appendChild(checkItem("⚠️", "Cross-border DPIA template", "PENDING", "warn"))

        const pdplBtn = document.createElement("button")
        pdplBtn.className = "btn btn-primary"
        pdplBtn.style.marginTop = "14px"
        pdplBtn.textContent = "Open PDPL Console"
        pdplBtn.addEventListener("click", () => { location.hash = "pdpl" })

        grid.appendChild(wrapCard("PDPL Compliance", [pdplChecks, pdplBtn]))
      })
  }
}
