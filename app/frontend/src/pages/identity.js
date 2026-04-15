import { apiGet, getTenant } from "../api.js"
import { toast } from "../components/toast.js"

const RISK_BAR = score => {
  const pct = Math.min(score, 100)
  const col = score >= 50 ? "var(--red)" : score >= 25 ? "var(--amber)" : "var(--green)"
  return `<div style="display:flex;align-items:center;gap:8px">
    <div style="width:60px;height:6px;background:var(--border);border-radius:4px;overflow:hidden">
      <div style="height:6px;border-radius:4px;width:${pct}%;background:${col}"></div>
    </div>
    <span style="font-size:12px;font-weight:700">${score}</span>
  </div>`
}

function workerIdentityCard(worker, eriItem, consent) {
  const ibanOk    = worker.iban_verified
  const hasConsent = consent && !consent.withdrawn_at
  const eriScore  = eriItem ? eriItem.eri_score : null
  const riskLevel = eriItem ? eriItem.risk_level : "UNKNOWN"
  const riskCls   = { HIGH: "fail", MEDIUM: "warn", LOW: "", CLEAR: "pass", UNKNOWN: "pending" }

  const d = document.createElement("div")
  d.className = "ep-item"
  d.style.cssText = "flex-direction:column;align-items:flex-start;gap:8px;padding:14px 16px"

  const top = document.createElement("div")
  top.style.cssText = "display:flex;align-items:center;gap:12px;width:100%"
  top.innerHTML = `
    <div style="font-weight:700;font-size:14px;flex:1">${worker.name || worker.id}</div>
    <span style="font-size:11px;background:var(--bg);padding:2px 8px;border-radius:6px;border:1px solid var(--border)">${worker.worker_type || "—"}</span>
    <span class="ep-status ${riskCls[riskLevel] || "pending"}">${riskLevel}</span>`
  d.appendChild(top)

  const grid = document.createElement("div")
  grid.style.cssText = "display:grid;grid-template-columns:repeat(4,1fr);gap:8px;width:100%"
  grid.innerHTML = `
    <div style="font-size:12px">
      <span style="color:var(--muted)">ERI Score</span><br>
      ${eriScore !== null ? RISK_BAR(eriScore) : '<span style="color:var(--muted)">—</span>'}
    </div>
    <div style="font-size:12px">
      <span style="color:var(--muted)">IBAN</span><br>
      <span class="ep-status ${ibanOk ? "verified" : "pending"}" style="margin-top:4px;display:inline-block">${ibanOk ? "VERIFIED" : "MISSING"}</span>
    </div>
    <div style="font-size:12px">
      <span style="color:var(--muted)">PDPL Consent</span><br>
      <span class="ep-status ${hasConsent ? "verified" : "pending"}" style="margin-top:4px;display:inline-block">${hasConsent ? "ACTIVE" : "NONE"}</span>
    </div>
    <div style="font-size:12px">
      <span style="color:var(--muted)">Status</span><br>
      <span style="font-size:11px;font-weight:600;margin-top:4px;display:inline-block;padding:2px 8px;border-radius:6px;background:${worker.status === "active" ? "#E8F5E9" : "#FFF3E0"};color:${worker.status === "active" ? "var(--green)" : "var(--amber)"}">${worker.status || "—"}</span>
    </div>`
  d.appendChild(grid)

  if (eriItem && eriItem.factors && eriItem.factors.length > 0) {
    const factors = document.createElement("div")
    factors.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;width:100%"
    eriItem.factors.forEach(f => {
      const tag = document.createElement("span")
      tag.style.cssText = "font-size:11px;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:2px 8px;color:var(--amber)"
      tag.textContent = f.label
      factors.appendChild(tag)
    })
    d.appendChild(factors)
  }

  return d
}

function tokenCard() {
  const d = document.createElement("div")
  d.className = "card"
  d.innerHTML = `
    <div class="card-title">🪙 Identity Token Pipeline</div>
    <div style="font-size:13px;color:var(--muted);margin-bottom:14px">
      Workforce identity tokens for enterprise verification — planned for future sprint.
    </div>
    <div class="check-list">
      <div class="check-item">
        <div class="check-icon">✅</div>
        <div class="check-text">Worker identity records (name, type, status)</div>
        <div class="check-status pass">ACTIVE</div>
      </div>
      <div class="check-item">
        <div class="check-icon">✅</div>
        <div class="check-text">IBAN verification state (WPS-linked)</div>
        <div class="check-status pass">ACTIVE</div>
      </div>
      <div class="check-item">
        <div class="check-icon">✅</div>
        <div class="check-text">ERI risk scoring (probation / compliance / WPS)</div>
        <div class="check-status pass">ACTIVE</div>
      </div>
      <div class="check-item">
        <div class="check-icon">✅</div>
        <div class="check-text">PDPL consent state per worker</div>
        <div class="check-status pass">ACTIVE</div>
      </div>
      <div class="check-item">
        <div class="check-icon">⚠️</div>
        <div class="check-text">National ID / Iqama document capture</div>
        <div class="check-status warn">PENDING</div>
      </div>
      <div class="check-item">
        <div class="check-icon">⚠️</div>
        <div class="check-text">Verified credential token issuance</div>
        <div class="check-status warn">PLANNED</div>
      </div>
      <div class="check-item">
        <div class="check-icon">⚠️</div>
        <div class="check-text">Cross-entity portability</div>
        <div class="check-status warn">PLANNED</div>
      </div>
    </div>`
  return d
}

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-title">Identity &amp; Verification</div>
      <div class="page-sub">Tenant: ${getTenant()} — Worker identity state · ERI scoring · PDPL consent · Token pipeline</div>`

    const strip = document.createElement("div")
    strip.className = "kpi-strip"
    strip.style.gridTemplateColumns = "repeat(4,1fr)"
    strip.innerHTML = '<div class="page-load" style="grid-column:1/-1">Loading…</div>'
    container.appendChild(strip)

    const grid = document.createElement("div")
    grid.className = "cc-grid-2"
    container.appendChild(grid)

    // Worker identity matrix
    const matrixCard = document.createElement("div")
    matrixCard.className = "card"
    matrixCard.innerHTML = '<div class="card-title">👤 Worker Identity Matrix</div>'
    const matrixBody = document.createElement("div")
    matrixBody.innerHTML = '<div class="page-load">Loading…</div>'
    matrixCard.appendChild(matrixBody)
    grid.appendChild(matrixCard)

    grid.appendChild(tokenCard())

    Promise.all([
      apiGet("/api/admin/workers"),
      apiGet("/api/admin/eri"),
      apiGet("/api/admin/consents"),
    ])
      .then(([workersData, eriData, consentsData]) => {
        const workers  = workersData.workers || workersData.items || []
        const eriMap   = {}
        ;(eriData.items || []).forEach(e => { eriMap[e.worker_id] = e })
        const consentMap = {}
        ;(consentsData.items || []).forEach(c => { if (!c.withdrawn_at) consentMap[c.worker_id] = c })

        const ibanVerified  = workers.filter(w => w.iban_verified).length
        const consented     = Object.keys(consentMap).length
        const highRisk      = (eriData.items || []).filter(e => e.risk_level === "HIGH").length
        const atRisk        = (eriData.items || []).filter(e => e.risk_level !== "CLEAR").length

        strip.innerHTML = ""
        ;[
          ["Total Workers", workers.length, "registered",              ""],
          ["IBAN Verified", ibanVerified,   "WPS-ready",               "green"],
          ["PDPL Consents", consented,      "active consents",         ""],
          ["At-Risk Workers", atRisk,       "ERI non-clear",           atRisk > 0 ? "amber" : ""],
        ].forEach(([l, v, s, c]) => {
          const d = document.createElement("div")
          d.className = "kpi-card " + c
          d.innerHTML = `<div class="kpi-label">${l}</div><div class="kpi-value">${v}</div><div class="kpi-sub">${s}</div>`
          strip.appendChild(d)
        })

        matrixBody.innerHTML = ""
        if (workers.length === 0) {
          matrixBody.innerHTML = '<div style="font-size:13px;color:var(--muted)">No workers found</div>'
        } else {
          workers.forEach(w => matrixBody.appendChild(
            workerIdentityCard(w, eriMap[w.id], consentMap[w.id])
          ))
        }
      })
      .catch(e => {
        strip.innerHTML = `<div class="page-err" style="grid-column:1/-1">${e.message}</div>`
        matrixBody.innerHTML = `<div class="page-err">${e.message}</div>`
        toast.err(e.message)
      })
  }
}
