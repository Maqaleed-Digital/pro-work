import { apiGet, getTenant } from "../api.js"

const SC = { LIVE: "pass", STAGED: "gold", PLANNED: "pending", PENDING: "pending", READY_FOR_INTEGRATION: "pass" }

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-title">Production Trust</div>
      <div class="page-sub">Tenant: ${getTenant()} — Secrets · Policy · Release Integrity · Runtime Assurance</div>
      <div class="page-load" id="trust-load">Loading…</div>`

    apiGet("/api/admin/trust/config")
      .then(data => {
        document.getElementById("trust-load")?.remove()
        renderTrust(container, data)
      })
      .catch(e => { container.innerHTML += `<div class="page-err">${e.message}</div>` })
  }
}

function renderTrust(container, data) {
  // ── Runtime Strip ────────────────────────────────────────────────────────────
  const strip = document.createElement("div")
  strip.className = "kpi-strip"
  const ts = data.trust_summary
  ;[
    ["Environment",       data.environment],
    ["Auth Gate",         ts.auth_gate],
    ["Tenant Isolation",  ts.tenant_isolation],
    ["Audit Trail",       ts.audit_trail],
  ].forEach(([label, val]) => {
    const k = document.createElement("div")
    k.className = "kpi-item"
    k.innerHTML = `<div class="kpi-label">${label}</div><div class="kpi-value ${SC[val] || ""}">${val}</div>`
    strip.appendChild(k)
  })
  container.appendChild(strip)

  // ── Two-col grid ─────────────────────────────────────────────────────────────
  const grid = document.createElement("div")
  grid.className = "cc-grid-2"
  grid.style.marginTop = "20px"

  // Trust summary card
  const trustCard = document.createElement("div")
  trustCard.className = "card"
  trustCard.innerHTML = `<div class="card-title">🛡 Runtime Trust Summary</div>`
  const trustList = document.createElement("div")
  trustList.className = "check-list"
  const TRUST_LABELS = {
    runtime_env:         "Runtime Environment",
    tls_enabled:         "TLS Enabled",
    secrets_discipline:  "Secrets Discipline",
    secret_store_state:  "Secret Store",
    config_validation:   "Config Validation",
    auth_gate:           "Auth Gate (RBAC)",
    tenant_isolation:    "Tenant Isolation",
    audit_trail:         "Audit Trail",
    cors_policy:         "CORS Policy",
    rate_limiting:       "Rate Limiting",
    ddos_protection:     "DDoS Protection",
  }
  Object.entries(ts).forEach(([key, val]) => {
    const row = document.createElement("div")
    row.className = "check-item"
    const statusCls = SC[val] || (val === "LIVE" ? "pass" : "pending")
    row.innerHTML = `
      <div class="check-icon">${val === "LIVE" || val === "pass" ? "✅" : val === "STAGED" ? "🔄" : val === "PLANNED" ? "⏳" : "ℹ️"}</div>
      <div class="check-text">${TRUST_LABELS[key] || key}</div>
      <div class="check-status ${statusCls}">${val}</div>`
    trustList.appendChild(row)
  })
  trustCard.appendChild(trustList)
  grid.appendChild(trustCard)

  // Policy enforcement card
  const policyCard = document.createElement("div")
  policyCard.className = "card"
  policyCard.innerHTML = `<div class="card-title">⚖️ Policy Enforcement</div>`
  const policyList = document.createElement("div")
  policyList.className = "check-list"
  const POLICY_LABELS = {
    rbac_enforced:       "RBAC Enforced",
    perm_deny_logged:    "Permission Denials Logged",
    fail_closed_default: "Fail-Closed Default",
    input_validation:    "Input Validation",
    output_sanitisation: "Output Sanitisation",
    injection_guards:    "Injection Guards",
  }
  Object.entries(data.policy_enforcement).forEach(([key, val]) => {
    const row = document.createElement("div")
    row.className = "check-item"
    row.innerHTML = `
      <div class="check-icon">${val === "LIVE" ? "✅" : val === "STAGED" ? "🔄" : "⏳"}</div>
      <div class="check-text">${POLICY_LABELS[key] || key}</div>
      <div class="check-status ${SC[val] || "pending"}">${val}</div>`
    policyList.appendChild(row)
  })
  policyCard.appendChild(policyList)
  grid.appendChild(policyCard)
  container.appendChild(grid)

  // ── Release integrity card ────────────────────────────────────────────────────
  const rel = data.release_integrity
  const relCard = document.createElement("div")
  relCard.className = "card"
  relCard.style.marginTop = "16px"
  relCard.innerHTML = `
    <div class="card-title">🚀 Release Integrity</div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px">
      <div style="font-size:13px">
        <div style="color:var(--muted);margin-bottom:4px">Git Commit</div>
        <code style="font-size:12px">${rel.git_commit}</code>
      </div>
      <div style="font-size:13px">
        <div style="color:var(--muted);margin-bottom:4px">Build Verified</div>
        <span class="ep-status ${rel.build_verified ? "pass" : "pending"}">${rel.build_verified ? "YES" : "NO"}</span>
      </div>
      <div style="font-size:13px">
        <div style="color:var(--muted);margin-bottom:4px">Deployment Mode</div>
        <span class="ep-status ${rel.deployment_mode === "production" ? "pass" : "gold"}">${rel.deployment_mode.toUpperCase()}</span>
      </div>
    </div>`
  const relList = document.createElement("div")
  relList.className = "check-list"
  const REL_LABELS = {
    immutable_artifact: "Immutable Artifact",
    rollback_path:      "Rollback Path",
    blue_green:         "Blue/Green Deployment",
    canary_deploy:      "Canary Deployment",
  }
  Object.entries(REL_LABELS).forEach(([key, label]) => {
    const val = rel[key]
    const row = document.createElement("div")
    row.className = "check-item"
    row.innerHTML = `
      <div class="check-icon">${val === "LIVE" ? "✅" : val === "STAGED" ? "🔄" : "⏳"}</div>
      <div class="check-text">${label}</div>
      <div class="check-status ${SC[val] || "pending"}">${val}</div>`
    relList.appendChild(row)
  })
  relCard.appendChild(relList)
  container.appendChild(relCard)

  // ── Secrets card ─────────────────────────────────────────────────────────────
  const secCard = document.createElement("div")
  secCard.className = "card"
  secCard.style.marginTop = "16px"
  secCard.innerHTML = `<div class="card-title">🔑 Secrets / Config</div>`
  const tbl = document.createElement("table")
  tbl.style.cssText = "width:100%;border-collapse:collapse;font-size:13px"
  tbl.innerHTML = `<thead><tr style="border-bottom:1px solid var(--border)">
    <th style="text-align:left;padding:6px 4px;color:var(--muted)">Config Key</th>
    <th style="text-align:left;padding:6px 4px;color:var(--muted)">Present</th>
    <th style="text-align:left;padding:6px 4px;color:var(--muted)">State</th>
  </tr></thead>`
  const tbody = document.createElement("tbody")
  data.secrets.forEach(s => {
    const tr = document.createElement("tr")
    tr.style.borderBottom = "1px solid var(--border)"
    tr.innerHTML = `
      <td style="padding:7px 4px;font-family:monospace;font-size:12px">${s.name}</td>
      <td style="padding:7px 4px">${s.present ? "✅" : "—"}</td>
      <td style="padding:7px 4px"><span class="ep-status ${SC[s.state] || "pending"}">${s.state}</span></td>`
    tbody.appendChild(tr)
  })
  tbl.appendChild(tbody)
  secCard.appendChild(tbl)
  container.appendChild(secCard)

  // ── Next actions ─────────────────────────────────────────────────────────────
  const nextCard = document.createElement("div")
  nextCard.className = "card"
  nextCard.style.marginTop = "16px"
  nextCard.innerHTML = `<div class="card-title">📋 Next Trust Actions</div>`
  const nextList = document.createElement("ol")
  nextList.style.cssText = "padding-left:20px;font-size:13px;color:var(--text);line-height:2"
  data.next_actions.forEach(a => {
    const li = document.createElement("li"); li.textContent = a
    nextList.appendChild(li)
  })
  nextCard.appendChild(nextList)
  container.appendChild(nextCard)
}
