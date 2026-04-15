import { apiGet, getTenant } from "../api.js"
import { toast } from "../components/toast.js"

function kpi(label, val, sub, cls) {
  const d = document.createElement("div")
  d.className = "kpi-card " + (cls || "")
  d.innerHTML = `<div class="kpi-label">${label}</div><div class="kpi-value">${val}</div><div class="kpi-sub">${sub}</div>`
  return d
}

function statusBadge(st) {
  const map = {
    ready:        ["verified",  "READY"],
    pending_iban: ["pending",   "PENDING IBAN"],
    processing:   ["warn",      "PROCESSING"],
    paid:         ["pass",      "PAID"],
    held:         ["fail",      "HELD"],
    staged:       ["pending",   "STAGED"],
  }
  const [cls, label] = map[st] || ["pending", st || "UNKNOWN"]
  return `<span class="ep-status ${cls}">${label}</span>`
}

function payRow(rec) {
  const net = (rec.net_salary || 0).toLocaleString()
  const basic = (rec.basic_salary || 0).toLocaleString()
  const d = document.createElement("div")
  d.className = "ep-item"
  d.style.cssText = "flex-direction:column;align-items:flex-start;gap:6px;padding:14px 16px"

  const top = document.createElement("div")
  top.style.cssText = "display:flex;align-items:center;gap:12px;width:100%"
  top.innerHTML = `
    <div style="font-weight:700;font-size:13px;flex:1">${rec.worker_id}</div>
    <div style="font-size:12px;color:var(--muted)">${rec.payment_period || "—"}</div>
    ${statusBadge(rec.wps_status)}`
  d.appendChild(top)

  const detail = document.createElement("div")
  detail.style.cssText = "display:grid;grid-template-columns:repeat(4,1fr);gap:8px;width:100%"
  detail.innerHTML = `
    <div style="font-size:12px"><span style="color:var(--muted)">Basic</span><br><strong>SAR ${basic}</strong></div>
    <div style="font-size:12px"><span style="color:var(--muted)">Net</span><br><strong style="color:var(--green)">SAR ${net}</strong></div>
    <div style="font-size:12px"><span style="color:var(--muted)">IBAN</span><br><strong style="font-family:monospace;font-size:11px">${rec.iban ? rec.iban.slice(0, 12) + "…" : "—"}</strong></div>
    <div style="font-size:12px"><span style="color:var(--muted)">Currency</span><br><strong>${rec.currency || "SAR"}</strong></div>`
  d.appendChild(detail)

  return d
}

function escrowCard() {
  const d = document.createElement("div")
  d.className = "card"
  d.innerHTML = `
    <div class="card-title">🏦 Escrow &amp; Fee Disclosure</div>
    <div style="font-size:13px;color:var(--muted);margin-bottom:14px">
      WorkCaptain escrow model — funds held per assignment cycle, released on milestone completion.
    </div>
    <div class="check-list">
      <div class="check-item">
        <div class="check-icon">🔒</div>
        <div class="check-text">Escrow gateway integration</div>
        <div class="check-status warn">STAGED</div>
      </div>
      <div class="check-item">
        <div class="check-icon">💳</div>
        <div class="check-text">Platform fee: 3% per transaction (disclosed)</div>
        <div class="check-status pass">ACTIVE</div>
      </div>
      <div class="check-item">
        <div class="check-icon">⏱</div>
        <div class="check-text">Release timing: 72h after milestone sign-off</div>
        <div class="check-status pass">CONFIGURED</div>
      </div>
      <div class="check-item">
        <div class="check-icon">⚠️</div>
        <div class="check-text">Dispute / hold workflow</div>
        <div class="check-status warn">STAGED</div>
      </div>
      <div class="check-item">
        <div class="check-icon">📋</div>
        <div class="check-text">Payout audit trail (immutable)</div>
        <div class="check-status pass">ACTIVE</div>
      </div>
      <div class="check-item">
        <div class="check-icon">🏛</div>
        <div class="check-text">SAMA compliance review</div>
        <div class="check-status warn">PENDING</div>
      </div>
    </div>
    <div style="margin-top:16px;font-size:12px;color:var(--muted);background:var(--bg);border-radius:10px;padding:10px 14px">
      <strong>Note:</strong> PSP integration is staged for production. WPS salary records below
      reflect the live KSA-compliant data. Escrow gateway connects in a future sprint.
    </div>`
  return d
}

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-title">Payments &amp; Escrow</div>
      <div class="page-sub">Tenant: ${getTenant()} — WPS salary records · Escrow state · Fee disclosure · Payout visibility</div>`

    const strip = document.createElement("div")
    strip.className = "kpi-strip"
    strip.style.gridTemplateColumns = "repeat(4,1fr)"
    strip.innerHTML = '<div class="page-load" style="grid-column:1/-1">Loading…</div>'
    container.appendChild(strip)

    const grid = document.createElement("div")
    grid.className = "cc-grid-2"
    container.appendChild(grid)

    // Left: WPS salary pack list
    const wpsCard = document.createElement("div")
    wpsCard.className = "card"
    wpsCard.innerHTML = '<div class="card-title">💳 WPS Salary Records</div>'
    const wpsBody = document.createElement("div")
    wpsBody.innerHTML = '<div class="page-load">Loading WPS records…</div>'
    wpsCard.appendChild(wpsBody)

    const wpsBtn = document.createElement("button")
    wpsBtn.className = "btn btn-gold"
    wpsBtn.style.marginTop = "14px"
    wpsBtn.textContent = "Open WPS Builder"
    wpsBtn.addEventListener("click", () => { location.hash = "wps" })
    wpsCard.appendChild(wpsBtn)
    grid.appendChild(wpsCard)

    // Right: escrow / fee card
    grid.appendChild(escrowCard())

    // Payout pipeline card (full width)
    const pipeCard = document.createElement("div")
    pipeCard.className = "card"
    pipeCard.style.marginTop = "16px"
    pipeCard.innerHTML = `
      <div class="card-title">📊 Payout Pipeline</div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:0;border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-top:8px">
        ${["Salary Record Created","IBAN Verified","WPS Pack Ready","Escrow Funded","Payout Released"].map((step, i) => `
          <div style="padding:14px 12px;text-align:center;${i < 4 ? "border-right:1px solid var(--border)" : ""}">
            <div style="font-size:20px">${["📝","🏦","📦","🔒","✅"][i]}</div>
            <div style="font-size:11px;font-weight:600;margin-top:6px">${step}</div>
            <div style="font-size:10px;color:var(--muted);margin-top:4px">${i < 2 ? "ACTIVE" : i < 3 ? "READY" : "STAGED"}</div>
          </div>`).join("")}
      </div>`
    container.appendChild(pipeCard)

    // PSP Readiness Matrix card (full width)
    const pspCard = document.createElement("div")
    pspCard.className = "card"
    pspCard.style.marginTop = "16px"
    pspCard.innerHTML = '<div class="card-title">💳 PSP Readiness</div><div class="page-load">Loading PSP matrix…</div>'
    container.appendChild(pspCard)
    apiGet("/api/admin/commercial/config")
      .then(cfg => {
        pspCard.innerHTML = '<div class="card-title">💳 PSP Readiness Matrix</div>'
        const tbl = document.createElement("table")
        tbl.style.cssText = "width:100%;border-collapse:collapse;font-size:13px"
        tbl.innerHTML = `<thead><tr style="border-bottom:1px solid var(--border)">
          <th style="text-align:left;padding:6px 4px;color:var(--muted)">Provider</th>
          <th style="text-align:left;padding:6px 4px;color:var(--muted)">Region</th>
          <th style="text-align:left;padding:6px 4px;color:var(--muted)">Features</th>
          <th style="text-align:left;padding:6px 4px;color:var(--muted)">State</th>
        </tr></thead>`
        const tbody = document.createElement("tbody")
        const CLS = { STAGED: "gold", READY_FOR_INTEGRATION: "pass", LIVE: "pass", PLANNED: "pending" }
        cfg.psp_matrix.forEach(p => {
          const tr = document.createElement("tr")
          tr.style.borderBottom = "1px solid var(--border)"
          tr.innerHTML = `
            <td style="padding:7px 4px;font-weight:600">${p.provider}</td>
            <td style="padding:7px 4px;color:var(--muted)">${p.region}</td>
            <td style="padding:7px 4px;color:var(--muted)">${p.features.join(", ")}</td>
            <td style="padding:7px 4px"><span class="ep-status ${CLS[p.state] || "pending"}">${p.state}</span></td>`
          tbody.appendChild(tr)
        })
        tbl.appendChild(tbody)
        pspCard.appendChild(tbl)
        const note = document.createElement("div")
        note.style.cssText = "margin-top:12px;font-size:12px;color:var(--muted)"
        note.textContent = "SAMA licensing PENDING — no provider transitions to LIVE without regulatory proof."
        pspCard.appendChild(note)
      })
      .catch(() => { pspCard.innerHTML = '<div class="card-title">💳 PSP Readiness Matrix</div><div style="font-size:13px;color:var(--muted)">Unavailable</div>' })

    apiGet("/api/admin/wps/salary-pack")
      .then(data => {
        const items = data.items || []
        const ready = items.filter(s => s.wps_status === "ready").length
        const pending = items.length - ready
        const totalNet = items.reduce((s, r) => s + (r.net_salary || 0), 0)

        strip.innerHTML = ""
        strip.appendChild(kpi("Salary Records",   items.length, "total WPS records",          "gold"))
        strip.appendChild(kpi("Ready for Payout", ready,        "IBAN verified",               "green"))
        strip.appendChild(kpi("Pending IBAN",     pending,      "need verification",           pending > 0 ? "amber" : ""))
        strip.appendChild(kpi("Total Net (SAR)",  totalNet.toLocaleString(), "this pay period", ""))

        wpsBody.innerHTML = ""
        if (items.length === 0) {
          wpsBody.innerHTML = '<div style="font-size:13px;color:var(--muted)">No WPS records — open WPS Builder to add salary data</div>'
        } else {
          items.forEach(r => wpsBody.appendChild(payRow(r)))
        }
      })
      .catch(e => {
        strip.innerHTML = `<div class="page-err" style="grid-column:1/-1">${e.message}</div>`
        wpsBody.innerHTML = `<div class="page-err">${e.message}</div>`
        toast.err(e.message)
      })
  }
}
