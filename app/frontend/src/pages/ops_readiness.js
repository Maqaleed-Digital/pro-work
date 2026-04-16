import { apiGet, getTenant } from "../api.js"

const SC = { LIVE: "pass", STAGED: "gold", PLANNED: "pending", PENDING: "pending" }

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-title">Enterprise Operations</div>
      <div class="page-sub">Tenant: ${getTenant()} — SLA/SLO · Monitoring · Backup/Recovery · Incident Operations</div>
      <div class="page-load" id="ops-load">Loading…</div>`

    apiGet("/api/admin/ops-readiness")
      .then(data => {
        document.getElementById("ops-load")?.remove()
        renderOps(container, data)
      })
      .catch(e => { container.innerHTML += `<div class="page-err">${e.message}</div>` })
  }
}

function renderOps(container, data) {
  // ── Readiness strip ──────────────────────────────────────────────────────────
  const strip = document.createElement("div")
  strip.className = "kpi-strip"
  const liveCount   = countState(data, "LIVE")
  const stagedCount = countState(data, "STAGED")
  const planCount   = countState(data, "PLANNED")
  ;[
    ["Controls LIVE",      liveCount],
    ["Controls STAGED",    stagedCount],
    ["Controls PLANNED",   planCount],
    ["Prod Trust",         data.buyer_readiness.production_trust],
  ].forEach(([label, val]) => {
    const k = document.createElement("div")
    k.className = "kpi-item"
    k.innerHTML = `<div class="kpi-label">${label}</div><div class="kpi-value">${val}</div>`
    strip.appendChild(k)
  })
  container.appendChild(strip)

  // ── SLA/SLO ──────────────────────────────────────────────────────────────────
  const slaCard = sectionCard("⏱ SLA / SLO Readiness")
  renderControlGroup(slaCard, data.sla_slo, {
    uptime_sla:  { label: "Uptime SLA",         icon: "⏱" },
    latency_p99: { label: "Latency p99",         icon: "⚡" },
    error_rate:  { label: "Error Rate Target",   icon: "❌" },
    rto:         { label: "RTO (Recovery Time)", icon: "🔄" },
    rpo:         { label: "RPO (Data Loss)",     icon: "💾" },
  })
  container.appendChild(slaCard)

  // ── Grid: monitoring + backup ────────────────────────────────────────────────
  const grid = document.createElement("div")
  grid.className = "cc-grid-2"
  grid.style.marginTop = "16px"

  const monCard = sectionCard("📊 Monitoring &amp; Alerting")
  renderControlGroup(monCard, data.monitoring_alerting, {
    health_endpoint:  { label: "Health Endpoint",     icon: "💚" },
    structured_logs:  { label: "Structured Logging",  icon: "📝" },
    audit_trail:      { label: "Audit Trail",         icon: "🧾" },
    apm_integration:  { label: "APM Integration",     icon: "📈" },
    uptime_monitor:   { label: "Uptime Monitor",      icon: "🔭" },
    alerting_rules:   { label: "Alerting Rules",      icon: "🔔" },
    dashboard:        { label: "Ops Dashboard",       icon: "📊" },
    error_tracking:   { label: "Error Tracking",      icon: "🐛" },
  })
  grid.appendChild(monCard)

  const backupCard = sectionCard("💾 Backup &amp; Recovery")
  renderControlGroup(backupCard, data.backup_recovery, {
    file_persistence:  { label: "File Persistence",      icon: "📁" },
    daily_backup:      { label: "Daily Backup",          icon: "📦" },
    point_in_time:     { label: "Point-in-Time Recovery",icon: "⏪" },
    restore_tested:    { label: "Restore Tested",        icon: "✅" },
    disaster_recovery: { label: "Disaster Recovery",     icon: "🌍" },
  })
  grid.appendChild(backupCard)
  container.appendChild(grid)

  // ── Incident Operations ───────────────────────────────────────────────────────
  const incCard = sectionCard("🚨 Incident Operations")
  incCard.style.marginTop = "16px"
  renderControlGroup(incCard, data.incident_operations, {
    runbook:          { label: "Runbook",              icon: "📋" },
    on_call_rotation: { label: "On-Call Rotation",     icon: "📱" },
    severity_model:   { label: "Severity Model",       icon: "🔥" },
    post_mortem:      { label: "Post-Mortem Process",  icon: "🔍" },
    war_room:         { label: "War Room",             icon: "🏠" },
    comms_template:   { label: "Comms Template",       icon: "✉️" },
  })
  container.appendChild(incCard)

  // ── Buyer Readiness ───────────────────────────────────────────────────────────
  const buyerCard = document.createElement("div")
  buyerCard.className = "card"
  buyerCard.style.marginTop = "16px"
  const br = data.buyer_readiness
  buyerCard.innerHTML = `
    <div class="card-title">💼 Enterprise Buyer Readiness</div>
    <div class="check-list">
      <div class="check-item">
        <div class="check-icon">🏢</div>
        <div class="check-text"><strong>Enterprise Deployable</strong></div>
        <div class="check-status ${br.enterprise_deployable ? "pass" : "pending"}">${br.enterprise_deployable ? "YES" : "NO"}</div>
      </div>
      <div class="check-item">
        <div class="check-icon">🛡</div>
        <div class="check-text"><strong>Production Trust</strong></div>
        <div class="check-status ${SC[br.production_trust] || "pending"}">${br.production_trust}</div>
      </div>
    </div>
    <div style="margin-top:12px;padding:12px 14px;background:var(--bg);border-radius:8px;font-size:13px;color:var(--muted);line-height:1.6">
      ${br.note}
    </div>`
  container.appendChild(buyerCard)
}

function sectionCard(title) {
  const card = document.createElement("div")
  card.className = "card"
  card.innerHTML = `<div class="card-title">${title}</div>`
  return card
}

function renderControlGroup(card, controls, labelMap) {
  const list = document.createElement("div")
  list.className = "check-list"
  Object.entries(controls).forEach(([key, ctrl]) => {
    const meta = labelMap[key] || { label: key, icon: "•" }
    const row = document.createElement("div")
    row.className = "check-item"
    row.style.alignItems = "flex-start"
    row.innerHTML = `
      <div class="check-icon">${meta.icon}</div>
      <div class="check-text" style="flex:1">
        <strong>${meta.label}</strong>
        ${ctrl.target ? `<span style="font-size:12px;color:var(--muted);margin-left:6px">Target: ${ctrl.target}</span>` : ""}
        <div style="font-size:12px;color:var(--muted);margin-top:2px">${ctrl.detail || ctrl.note || ""}</div>
      </div>
      <div class="check-status ${SC[ctrl.state] || "pending"}">${ctrl.state}</div>`
    list.appendChild(row)
  })
  card.appendChild(list)
}

function countState(data, targetState) {
  let count = 0
  const sections = ["sla_slo","monitoring_alerting","backup_recovery","incident_operations"]
  sections.forEach(sec => {
    if (data[sec]) Object.values(data[sec]).forEach(ctrl => { if (ctrl.state === targetState) count++ })
  })
  return count
}
