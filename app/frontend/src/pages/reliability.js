import { apiGet, getTenant } from "../api.js"

const SC = { LIVE: "pass", STAGED: "gold", PLANNED: "pending", PENDING: "pending" }

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-title">Scale & Reliability</div>
      <div class="page-sub">Tenant: ${getTenant()} — Runtime · Workload · Retry/Idempotency · Failure Posture</div>
      <div class="page-load" id="rel-load">Loading…</div>`

    apiGet("/api/admin/reliability/config")
      .then(data => {
        document.getElementById("rel-load")?.remove()
        renderReliability(container, data)
      })
      .catch(e => { container.innerHTML += `<div class="page-err">${e.message}</div>` })
  }
}

function renderReliability(container, data) {
  const rt = data.runtime

  // ── Runtime KPI strip ────────────────────────────────────────────────────────
  const strip = document.createElement("div")
  strip.className = "kpi-strip"
  ;[
    ["Uptime",          rt.uptime_human],
    ["Memory",          `${rt.memory_used_mb}/${rt.memory_total_mb} MB`],
    ["Node.js",         rt.node_version],
    ["Active Tenants",  data.tenant_state.active_tenants + "/" + data.tenant_state.total_tenants],
  ].forEach(([label, val]) => {
    const k = document.createElement("div")
    k.className = "kpi-item"
    k.innerHTML = `<div class="kpi-label">${label}</div><div class="kpi-value">${val}</div>`
    strip.appendChild(k)
  })
  container.appendChild(strip)

  const grid = document.createElement("div")
  grid.className = "cc-grid-2"
  grid.style.marginTop = "20px"

  // ── Workload Separation ───────────────────────────────────────────────────────
  const wsCard = document.createElement("div")
  wsCard.className = "card"
  wsCard.innerHTML = `<div class="card-title">⚙️ Workload Separation</div>`
  const wsList = document.createElement("div")
  wsList.className = "check-list"
  Object.entries(data.workload_separation).forEach(([key, val]) => {
    const parts = val.split(" — ")
    const state = parts[0]; const detail = parts[1] || ""
    const row = document.createElement("div")
    row.className = "check-item"
    row.style.alignItems = "flex-start"
    row.innerHTML = `
      <div class="check-icon">${state === "LIVE" ? "✅" : state === "STAGED" ? "🔄" : "⏳"}</div>
      <div class="check-text" style="flex:1">
        <strong>${key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</strong>
        ${detail ? `<div style="font-size:12px;color:var(--muted);margin-top:2px">${detail}</div>` : ""}
      </div>
      <div class="check-status ${SC[state] || "pending"}">${state}</div>`
    wsList.appendChild(row)
  })
  wsCard.appendChild(wsList)
  grid.appendChild(wsCard)

  // ── Retry / Idempotency ───────────────────────────────────────────────────────
  const retryCard = document.createElement("div")
  retryCard.className = "card"
  retryCard.innerHTML = `<div class="card-title">🔁 Retry &amp; Idempotency</div>`
  const retryList = document.createElement("div")
  retryList.className = "check-list"
  Object.entries(data.retry_idempotency).forEach(([key, val]) => {
    const parts = val.split(" — ")
    const state = parts[0]; const detail = parts[1] || ""
    const row = document.createElement("div")
    row.className = "check-item"
    row.style.alignItems = "flex-start"
    row.innerHTML = `
      <div class="check-icon">${state === "LIVE" ? "✅" : state === "STAGED" ? "🔄" : "⏳"}</div>
      <div class="check-text" style="flex:1">
        <strong>${key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</strong>
        ${detail ? `<div style="font-size:12px;color:var(--muted);margin-top:2px">${detail}</div>` : ""}
      </div>
      <div class="check-status ${SC[state] || "pending"}">${state}</div>`
    retryList.appendChild(row)
  })
  retryCard.appendChild(retryList)
  grid.appendChild(retryCard)
  container.appendChild(grid)

  // ── Failure Posture ───────────────────────────────────────────────────────────
  const failCard = document.createElement("div")
  failCard.className = "card"
  failCard.style.marginTop = "16px"
  failCard.innerHTML = `<div class="card-title">🛡 Failure Posture</div>`
  const failList = document.createElement("div")
  failList.className = "check-list"
  const FAIL_LABELS = {
    unhandled_errors:    "Unhandled Errors",
    persist_failures:    "Persistence Failures",
    auth_failures:       "Auth Failures",
    unknown_routes:      "Unknown Routes",
    circuit_breaker:     "Circuit Breaker",
    health_check_probe:  "Health Check Probe",
  }
  Object.entries(data.failure_posture).forEach(([key, val]) => {
    const parts = val.split(" — ")
    const state = parts[0]; const detail = parts[1] || ""
    const row = document.createElement("div")
    row.className = "check-item"
    row.style.alignItems = "flex-start"
    row.innerHTML = `
      <div class="check-icon">${state === "LIVE" ? "✅" : state === "STAGED" ? "🔄" : "⏳"}</div>
      <div class="check-text" style="flex:1">
        <strong>${FAIL_LABELS[key] || key}</strong>
        ${detail ? `<div style="font-size:12px;color:var(--muted);margin-top:2px">${detail}</div>` : ""}
      </div>
      <div class="check-status ${SC[state] || "pending"}">${state}</div>`
    failList.appendChild(row)
  })
  failCard.appendChild(failList)
  container.appendChild(failCard)

  // ── Reliability Targets ───────────────────────────────────────────────────────
  const targCard = document.createElement("div")
  targCard.className = "card"
  targCard.style.marginTop = "16px"
  targCard.innerHTML = `<div class="card-title">📊 Reliability Targets &amp; Limits</div>`
  const targGrid = document.createElement("div")
  targGrid.style.cssText = "display:grid;grid-template-columns:repeat(3,1fr);gap:12px;font-size:13px"
  const targets = [
    ...Object.entries(data.reliability_targets),
    ...Object.entries(data.limits),
  ]
  targets.forEach(([key, val]) => {
    const cell = document.createElement("div")
    cell.style.cssText = "background:var(--bg);border-radius:8px;padding:10px 12px"
    cell.innerHTML = `
      <div style="color:var(--muted);font-size:12px;margin-bottom:4px">${key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</div>
      <div style="font-weight:600">${val}</div>`
    targGrid.appendChild(cell)
  })
  targCard.appendChild(targGrid)
  container.appendChild(targCard)
}
