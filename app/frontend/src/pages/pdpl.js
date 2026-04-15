import { apiGet, apiGetJson } from "../api.js"
import { toast } from "../components/toast.js"

function workerRow(worker, consent, onGrant, onWithdraw) {
  const hasConsent = consent && !consent.withdrawn_at
  const d = document.createElement("div")
  d.className = "ep-item"
  d.style.cssText = "align-items:flex-start;flex-direction:column;gap:8px;padding:14px 16px"

  const top = document.createElement("div")
  top.style.cssText = "display:flex;align-items:center;gap:12px;width:100%"
  top.innerHTML = `
    <div style="font-weight:700;font-size:14px;flex:1">${worker.name}</div>
    <div style="font-size:12px;color:var(--muted)">${worker.worker_type}</div>
    <div class="ep-status ${hasConsent ? "verified" : "pending"}">${hasConsent ? "CONSENTED" : "NO CONSENT"}</div>`
  d.appendChild(top)

  if (hasConsent) {
    const meta = document.createElement("div")
    meta.style.cssText = "font-size:12px;color:var(--muted)"
    meta.textContent = `Scope: ${consent.scope.join(", ")} · Granted: ${new Date(consent.consented_at).toLocaleDateString()}`
    d.appendChild(meta)
  }

  const btns = document.createElement("div")
  btns.style.cssText = "display:flex;gap:8px"
  if (!hasConsent) {
    const grant = document.createElement("button")
    grant.className = "btn btn-success btn-sm"
    grant.textContent = "Grant Consent"
    grant.addEventListener("click", () => onGrant(worker))
    btns.appendChild(grant)
  } else {
    const withdraw = document.createElement("button")
    withdraw.className = "btn btn-danger btn-sm"
    withdraw.textContent = "Withdraw"
    withdraw.addEventListener("click", () => onWithdraw(consent))
    btns.appendChild(withdraw)
  }
  d.appendChild(btns)
  return d
}

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-title">PDPL Consent Register</div>
      <div class="page-sub">KSA Personal Data Protection Law — worker consent management & export redaction</div>`

    const grid = document.createElement("div")
    grid.className = "cc-grid-2"
    container.appendChild(grid)

    // Consent register card
    const regCard = document.createElement("div")
    regCard.className = "card"
    regCard.innerHTML = `<div class="card-title">👤 Worker Consent Register</div>`
    const regList = document.createElement("div")
    regList.innerHTML = '<div class="page-load">Loading…</div>'
    regCard.appendChild(regList)
    grid.appendChild(regCard)

    // PDPL rules card
    const rulesCard = document.createElement("div")
    rulesCard.className = "card"
    rulesCard.innerHTML = `
      <div class="card-title">🔒 PDPL Enforcement Rules</div>
      <div class="check-list">
        <div class="check-item"><div class="check-icon">✅</div><div class="check-text">PII redacted in export when no consent</div><div class="check-status pass">ACTIVE</div></div>
        <div class="check-item"><div class="check-icon">✅</div><div class="check-text">Consent granted/withdrawn logged to audit trail</div><div class="check-status pass">ACTIVE</div></div>
        <div class="check-item"><div class="check-icon">✅</div><div class="check-text">Withdrawal is soft-delete — audit trail preserved</div><div class="check-status pass">ACTIVE</div></div>
        <div class="check-item"><div class="check-icon">✅</div><div class="check-text">Export manifest shows redacted_events count</div><div class="check-status pass">ACTIVE</div></div>
        <div class="check-item"><div class="check-icon">⚠️</div><div class="check-text">Cross-border transfer DPIA template</div><div class="check-status warn">PENDING</div></div>
        <div class="check-item"><div class="check-icon">⚠️</div><div class="check-text">DSR (data subject request) portal</div><div class="check-status warn">PENDING</div></div>
      </div>`
    grid.appendChild(rulesCard)

    function load() {
      Promise.all([
        apiGet("/api/admin/workers"),
        apiGet("/api/admin/consents"),
      ]).then(([workersData, consentsData]) => {
        regList.innerHTML = ""
        const workers  = workersData.workers || workersData.items || []
        const consents = consentsData.items || []
        const consentMap = {}
        consents.forEach(c => { if (!c.withdrawn_at) consentMap[c.worker_id] = c })

        if (workers.length === 0) {
          regList.innerHTML = '<div style="font-size:13px;color:var(--muted)">No workers found</div>'
          return
        }

        workers.forEach(w => {
          regList.appendChild(workerRow(w, consentMap[w.id],
            async (worker) => {
              try {
                const token  = localStorage.getItem("pw_token") || ""
                const tenant = localStorage.getItem("pw_tenant") || "default"
                const res = await fetch("/api/admin/consents", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, "x-tenant-id": tenant },
                  body: JSON.stringify({ worker_id: worker.id, scope: ["export", "wps", "pdpl"] })
                })
                if (!res.ok) throw new Error((await res.json()).error || "Failed")
                toast.ok(`Consent granted: ${worker.name}`)
                load()
              } catch(e) { toast.err(e.message) }
            },
            async (consent) => {
              try {
                const token  = localStorage.getItem("pw_token") || ""
                const tenant = localStorage.getItem("pw_tenant") || "default"
                const res = await fetch(`/api/admin/consents/${consent.id}`, {
                  method: "DELETE",
                  headers: { Authorization: "Bearer " + token, "x-tenant-id": tenant }
                })
                if (!res.ok) throw new Error((await res.json()).error || "Failed")
                toast.ok("Consent withdrawn")
                load()
              } catch(e) { toast.err(e.message) }
            }
          ))
        })
      }).catch(e => {
        regList.innerHTML = `<div class="page-err">${e.message}</div>`
      })
    }
    load()
  }
}
