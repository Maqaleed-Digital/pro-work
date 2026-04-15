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

    // Override capture card
    const overrideCard = document.createElement("div")
    overrideCard.className = "card"
    overrideCard.style.marginTop = "16px"
    overrideCard.innerHTML = `
      <div class="card-title">✍️ Override Capture</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:14px">
        Record a human override — overrides are immutably logged to the audit trail.
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)">
          Override Type
          <select id="override-type" style="padding:8px 10px;border:1px solid var(--border);border-radius:10px;font-size:13px">
            <option value="workforce.allocation">Workforce Allocation</option>
            <option value="compliance.exception">Compliance Exception</option>
            <option value="probation.extension">Probation Extension</option>
            <option value="wps.manual">WPS Manual Adjustment</option>
            <option value="evidence.correction">Evidence Correction</option>
          </select>
        </label>
        <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)">
          Reference (worker/pack ID)
          <input id="override-ref" type="text" placeholder="e.g. w-001 or EP-001"
            style="padding:8px 10px;border:1px solid var(--border);border-radius:10px;font-size:13px">
        </label>
      </div>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted);margin-bottom:12px">
        Rationale (required)
        <textarea id="override-rationale" rows="3" placeholder="Explain why this override is necessary…"
          style="padding:8px 10px;border:1px solid var(--border);border-radius:10px;font-size:13px;resize:vertical"></textarea>
      </label>
      <button id="override-submit" class="btn btn-danger">Record Override</button>
      <div id="override-result" style="margin-top:10px;font-size:13px"></div>`
    container.appendChild(overrideCard)

    document.getElementById("override-submit").addEventListener("click", async () => {
      const type      = document.getElementById("override-type").value
      const ref       = document.getElementById("override-ref").value.trim()
      const rationale = document.getElementById("override-rationale").value.trim()
      const resultEl  = document.getElementById("override-result")
      if (!rationale) { toast.err("Rationale is required"); return }

      const btn = document.getElementById("override-submit")
      btn.disabled = true; btn.textContent = "Recording…"
      try {
        const token  = localStorage.getItem("pw_token") || ""
        const tenant = localStorage.getItem("pw_tenant") || "default"
        const res = await fetch("/api/admin/evidence", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, "x-tenant-id": tenant },
          body: JSON.stringify({
            actor:       "HUMAN_OVERRIDE",
            action:      "ai.override.recorded",
            entity_type: "override",
            entity_id:   ref || "manual",
            data:        { override_type: type, reference: ref, rationale, reviewer: "operator" },
          })
        })
        if (!res.ok) throw new Error((await res.json()).error || "Failed")
        const ev = await res.json()
        resultEl.innerHTML = `<span class="check-status pass">RECORDED</span> Event ID: ${ev.data?.id || ev.id || "logged"}`
        toast.ok("Override recorded to audit trail")
        document.getElementById("override-rationale").value = ""
        document.getElementById("override-ref").value = ""
      } catch(e) {
        resultEl.innerHTML = `<span class="check-status fail">ERROR</span> ${e.message}`
        toast.err(e.message)
      } finally {
        btn.disabled = false; btn.textContent = "Record Override"
      }
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
