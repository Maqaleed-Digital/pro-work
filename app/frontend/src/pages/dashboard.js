import { apiGet, apiGetJson, downloadJson, getTenant } from "../api.js"
import { toast } from "../components/toast.js"

function kpiCard(label, value, sub, cls) {
  const c = document.createElement("div")
  c.className = "kpi-card " + (cls || "")
  c.innerHTML = `<div class="kpi-label">${label}</div>
    <div class="kpi-value">${value}</div>
    <div class="kpi-sub">${sub || ""}</div>`
  return c
}

function signalItem(text, level, badge) {
  const d = document.createElement("div")
  d.className = "signal-item"
  d.innerHTML = `<div class="signal-dot ${level}"></div>
    <div class="signal-text">${text}</div>
    <div class="signal-badge ${level}">${badge}</div>`
  return d
}

function aiCard(type, body, confidence, onApprove, onReject) {
  const d = document.createElement("div")
  d.className = "ai-card"
  d.innerHTML = `
    <div class="ai-card-header">
      <div class="ai-card-type">${type}</div>
      <div class="ai-card-confidence">${confidence}% confidence</div>
    </div>
    <div class="ai-card-body">${body}</div>
    <div class="ai-card-footer"></div>`
  const footer = d.querySelector(".ai-card-footer")
  const approve = document.createElement("button")
  approve.className = "btn btn-success btn-sm"
  approve.textContent = "✓ Approve"
  approve.addEventListener("click", () => {
    toast.ok("Approved: " + type)
    d.style.opacity = ".4"; d.style.pointerEvents = "none"
  })
  const reject = document.createElement("button")
  reject.className = "btn btn-danger btn-sm"
  reject.textContent = "✕ Reject"
  reject.addEventListener("click", () => {
    toast.err("Rejected: " + type)
    d.style.opacity = ".4"; d.style.pointerEvents = "none"
  })
  footer.appendChild(approve)
  footer.appendChild(reject)
  return d
}

function qaBtn(icon, label, route) {
  const b = document.createElement("button")
  b.className = "qa-btn"
  b.innerHTML = `<span class="qa-icon">${icon}</span>${label}`
  b.addEventListener("click", () => { location.hash = route })
  return b
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
      <div class="page-title">Command Center</div>
      <div class="page-sub">Tenant: ${getTenant()} — Real-time workforce &amp; compliance overview</div>`

    // Quick actions row
    const qa = document.createElement("div")
    qa.className = "quick-actions"
    qa.appendChild(qaBtn("＋", "Create Role",       "workers"))
    qa.appendChild(qaBtn("⚡", "Assign Worker",     "assignments"))
    qa.appendChild(qaBtn("📄", "Generate Contract", "governance"))
    qa.appendChild(qaBtn("🔍", "Evidence Pack",     "evidence"))
    qa.appendChild(qaBtn("⚖️", "Compliance Check",  "compliance"))
    qa.appendChild(qaBtn("🤖", "AI Control",        "ai_control"))
    container.appendChild(qa)

    // KPI strip — placeholder until data loads
    const kpiStrip = document.createElement("div")
    kpiStrip.className = "kpi-strip"
    kpiStrip.innerHTML = '<div class="page-load" style="grid-column:1/-1">Loading metrics…</div>'
    container.appendChild(kpiStrip)

    // 3-col grid with placeholders
    const grid = document.createElement("div")
    grid.className = "cc-grid"
    container.appendChild(grid)

    const signalsPlaceholder = document.createElement("div")
    signalsPlaceholder.className = "card"
    signalsPlaceholder.innerHTML = '<div class="page-load">Loading signals…</div>'

    const aiPlaceholder = document.createElement("div")
    aiPlaceholder.className = "card"
    aiPlaceholder.innerHTML = '<div class="page-load">Loading AI…</div>'

    const activityPlaceholder = document.createElement("div")
    activityPlaceholder.className = "card"
    activityPlaceholder.innerHTML = '<div class="page-load">Loading activity…</div>'

    grid.appendChild(signalsPlaceholder)
    grid.appendChild(aiPlaceholder)
    grid.appendChild(activityPlaceholder)

    Promise.all([
      apiGet("/api/admin/health"),
      apiGetJson("/api/admin/evidence", { limit: 10 }),
      apiGet("/api/admin/governance/closure").catch(() => null),
      apiGet("/api/sovereign/status").catch(() => null),
    ]).then(([health, evidence, closure, sovereign]) => {
      const counts = health.counts || {}

      // KPI strip
      kpiStrip.innerHTML = ""
      kpiStrip.appendChild(kpiCard("Workforce",       counts.workers           ?? "—", "Active workers",       "gold"))
      kpiStrip.appendChild(kpiCard("Pods",            counts.pods              ?? "—", "Delivery pods",        "green"))
      kpiStrip.appendChild(kpiCard("Assignments",     counts.assignments       ?? "—", "Active assignments",   ""))
      kpiStrip.appendChild(kpiCard("Evidence Events", counts.evidence_events   ?? "—", "Audit events logged",  "amber"))

      // Live signals
      const signals = []
      if (counts.workers === 0)
        signals.push(["No workers onboarded yet",              "amber", "ACTION"])
      if (counts.pods === 0)
        signals.push(["No delivery pods configured",           "amber", "ACTION"])
      if (counts.assignments === 0)
        signals.push(["No active assignments",                 "amber", "INFO"])
      if (!sovereign)
        signals.push(["Sovereign compliance layer offline",    "red",   "CRITICAL"])
      if (sovereign && sovereign.wps_pending > 0)
        signals.push([`WPS: ${sovereign.wps_pending} pending`, "amber", "REVIEW"])
      if (sovereign && sovereign.probation_expiring > 0)
        signals.push([`${sovereign.probation_expiring} probations expiring`, "red", "URGENT"])
      if (closure && closure.open_gates > 0)
        signals.push([`${closure.open_gates} governance gates open`, "amber", "REVIEW"])
      if (signals.length === 0)
        signals.push(["All systems operating normally",        "green", "OK"])

      const sigList = document.createElement("div")
      sigList.className = "signal-list"
      signals.forEach(([t, l, b]) => sigList.appendChild(signalItem(t, l, b)))
      const sigCard = wrapCard("⚠ Live Signals", [sigList])
      signalsPlaceholder.replaceWith(sigCard)

      // AI recommendations panel
      const aiList = document.createElement("div")
      const recs = [
        ["Workforce Allocation", "Review worker capacity — 3 pods have utilisation below 40%",      87],
        ["Compliance",           "2 WPS records require IBAN verification before payroll cycle",    94],
        ["Evidence",             "Probation evidence pack EP-PROB-001 is due for review",           91],
      ]
      recs.forEach(([type, body, conf]) => aiList.appendChild(aiCard(type, body, conf)))
      const aiCard2 = wrapCard("🤖 AI Recommendations", [aiList])
      aiPlaceholder.replaceWith(aiCard2)

      // Recent activity
      const evItems = (evidence && evidence.items) ? evidence.items.slice(0, 6) : []
      const actList = document.createElement("div")
      actList.className = "ep-list"
      if (evItems.length === 0) {
        const empty = document.createElement("div")
        empty.style.cssText = "font-size:13px;color:var(--muted);padding:12px 0"
        empty.textContent = "No evidence events yet"
        actList.appendChild(empty)
      } else {
        evItems.forEach(ev => {
          const item = document.createElement("div")
          item.className = "ep-item"
          item.innerHTML = `
            <div class="ep-id">${ev.id || ev.event_id || "—"}</div>
            <div class="ep-meta">${ev.action || ev.event_type || "Event"}</div>
            <div class="ep-ts">${ev.ts ? new Date(ev.ts).toLocaleTimeString() : ""}</div>`
          actList.appendChild(item)
        })
      }
      activityPlaceholder.replaceWith(wrapCard("🧾 Recent Evidence", [actList]))

    }).catch(e => {
      kpiStrip.innerHTML = `<div class="page-err" style="grid-column:1/-1">${e.message}</div>`
      toast.err(e.message)
    })
  }
}
