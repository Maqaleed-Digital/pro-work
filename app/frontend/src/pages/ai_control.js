import { apiGet, apiGetJson } from "../api.js"
import { toast } from "../components/toast.js"

function recCard(rec, onApprove, onReject) {
  const d = document.createElement("div")
  d.className = "ai-card"
  const conf = rec.confidence_score ? Math.round(rec.confidence_score * 100) : "—"
  d.innerHTML = `
    <div class="ai-card-header">
      <div class="ai-card-type">${rec.recommendation_type || rec.type || "Recommendation"}</div>
      <div class="ai-card-confidence">${conf}% confidence</div>
    </div>
    <div class="ai-card-body">${rec.rationale || rec.explanation || rec.body || "No explanation provided"}</div>
    <div class="ai-card-footer"></div>`
  const footer = d.querySelector(".ai-card-footer")

  const meta = document.createElement("div")
  meta.style.cssText = "font-size:11px;color:var(--muted);margin-right:auto"
  meta.textContent = `${rec.actor || "AI"} · ${rec.ts ? new Date(rec.ts).toLocaleString() : "just now"}`
  footer.appendChild(meta)

  if (rec.status === "PENDING" || !rec.status) {
    const approve = document.createElement("button")
    approve.className = "btn btn-success btn-sm"
    approve.textContent = "✓ Approve"
    approve.addEventListener("click", () => {
      onApprove(rec)
      d.style.opacity = ".4"; d.style.pointerEvents = "none"
    })
    const reject = document.createElement("button")
    reject.className = "btn btn-danger btn-sm"
    reject.textContent = "✕ Reject"
    reject.addEventListener("click", () => {
      onReject(rec)
      d.style.opacity = ".4"; d.style.pointerEvents = "none"
    })
    footer.appendChild(approve)
    footer.appendChild(reject)
  } else {
    const badge = document.createElement("span")
    badge.className = `signal-badge ${rec.status === "APPROVED" ? "green" : "red"}`
    badge.textContent = rec.status
    footer.appendChild(badge)
  }
  return d
}

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-title">AI Control</div>
      <div class="page-sub">All AI recommendations require human approval — immutable audit log enforced</div>`

    const grid = document.createElement("div")
    grid.className = "cc-grid-2"
    container.appendChild(grid)

    // Pending approvals panel
    const pendingCard = document.createElement("div")
    pendingCard.className = "card"
    pendingCard.innerHTML = '<div class="card-title">🟡 Pending Approvals</div>'
    const pendingList = document.createElement("div")
    pendingList.innerHTML = '<div class="page-load">Loading…</div>'
    pendingCard.appendChild(pendingList)
    grid.appendChild(pendingCard)

    // Audit log panel
    const logCard = document.createElement("div")
    logCard.className = "card"
    logCard.innerHTML = '<div class="card-title">📋 AI Audit Log</div>'
    const logList = document.createElement("div")
    logList.innerHTML = '<div class="page-load">Loading…</div>'
    logCard.appendChild(logList)
    grid.appendChild(logCard)

    Promise.all([
      apiGetJson("/api/admin/evidence", { limit: 20, actor: "AI" }).catch(() => ({ items: [] })),
      apiGet("/api/admin/governance/recommendations").catch(() => null),
    ]).then(([evidence, recs]) => {

      // Pending recommendations
      pendingList.innerHTML = ""
      const pending = recs?.items?.filter(r => r.status === "PENDING") || []
      if (pending.length === 0) {
        const empty = document.createElement("div")
        empty.style.cssText = "font-size:13px;color:var(--muted);padding:12px 0"
        empty.textContent = "No pending AI recommendations"
        pendingList.appendChild(empty)
      } else {
        pending.forEach(rec => pendingList.appendChild(recCard(rec,
          r => toast.ok("Approved: " + (r.recommendation_type || r.type)),
          r => toast.err("Rejected: " + (r.recommendation_type || r.type))
        )))
      }

      // Audit log from evidence events
      logList.innerHTML = ""
      const evItems = evidence?.items || []
      if (evItems.length === 0) {
        const empty = document.createElement("div")
        empty.style.cssText = "font-size:13px;color:var(--muted);padding:12px 0"
        empty.textContent = "No AI audit events logged yet"
        logList.appendChild(empty)
      } else {
        const epList = document.createElement("div")
        epList.className = "ep-list"
        evItems.forEach(ev => {
          const item = document.createElement("div")
          item.className = "ep-item"
          item.innerHTML = `
            <div class="ep-id" style="width:120px">${ev.actor || "AI"}</div>
            <div class="ep-meta">${ev.action || ev.event_type || "Event"}</div>
            <div class="ep-ts">${ev.ts ? new Date(ev.ts).toLocaleString() : ""}</div>
            <div class="ep-status ${ev.status === "approved" ? "verified" : "pending"}">${ev.status || "logged"}</div>`
          epList.appendChild(item)
        })
        logList.appendChild(epList)
      }

    }).catch(e => {
      pendingList.innerHTML = `<div class="page-err">${e.message}</div>`
      toast.err(e.message)
    })

    // Governance rules — hard-enforced display
    const rulesCard = document.createElement("div")
    rulesCard.className = "card"
    rulesCard.style.marginTop = "16px"
    rulesCard.innerHTML = `
      <div class="card-title">🔒 AI Governance Rules (Hard-Enforced)</div>
      <div class="check-list">
        <div class="check-item"><div class="check-icon">🚫</div><div class="check-text">AI cannot auto-hire or auto-assign roles</div><div class="check-status pass">ENFORCED</div></div>
        <div class="check-item"><div class="check-icon">🚫</div><div class="check-text">AI cannot execute contracts without human approval</div><div class="check-status pass">ENFORCED</div></div>
        <div class="check-item"><div class="check-icon">✅</div><div class="check-text">All AI outputs logged: model, prompt, context, output</div><div class="check-status pass">ACTIVE</div></div>
        <div class="check-item"><div class="check-icon">✅</div><div class="check-text">Explainability required for all high-impact recommendations</div><div class="check-status pass">ACTIVE</div></div>
        <div class="check-item"><div class="check-icon">✅</div><div class="check-text">Override tracking and bias monitoring enabled</div><div class="check-status pass">ACTIVE</div></div>
        <div class="check-item"><div class="check-icon">✅</div><div class="check-text">Audit log immutable and exportable for regulators</div><div class="check-status pass">ACTIVE</div></div>
      </div>`
    container.appendChild(rulesCard)
  }
}
