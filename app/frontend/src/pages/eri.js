import { apiGet, getTenant } from "../api.js"
import { toast } from "../components/toast.js"

const RISK_CLS  = { HIGH: "fail", MEDIUM: "warn", LOW: "", CLEAR: "pass" }
const RISK_ICON = { HIGH: "🔴", MEDIUM: "🟡", LOW: "🟢", CLEAR: "✅" }

function summaryCard(label, value, cls) {
  const d = document.createElement("div")
  d.className = "kpi-card " + (cls || "")
  d.style.flex = "1"
  d.innerHTML = `<div class="kpi-label">${label}</div><div class="kpi-value">${value}</div>`
  return d
}

function eriRow(item) {
  const tr = document.createElement("tr")
  const factors = item.factors || []
  const factorHtml = factors.length
    ? factors.map(f => `<span style="font-size:11px;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:2px 8px;margin:2px">${f.label}</span>`).join(" ")
    : "<span style='color:var(--muted);font-size:12px'>No risk factors</span>"

  tr.innerHTML = `
    <td>
      <div style="font-weight:600;font-size:13px">${item.name || item.worker_id}</div>
      <div style="font-size:11px;color:var(--muted);font-family:ui-monospace,monospace">${item.worker_id}</div>
    </td>
    <td><span style="font-size:11px;background:var(--bg);padding:2px 8px;border-radius:6px;border:1px solid var(--border)">${item.worker_type || "—"}</span></td>
    <td>
      <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;background:${item.status === "active" ? "#E8F5E9" : "#FFF3E0"};color:${item.status === "active" ? "var(--green)" : "var(--amber)"}">${item.status}</span>
    </td>
    <td>
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:80px;height:8px;background:var(--border);border-radius:4px;overflow:hidden">
          <div style="height:8px;border-radius:4px;width:${Math.min(item.eri_score, 100)}%;background:${item.eri_score>=50?"var(--red)":item.eri_score>=25?"var(--amber)":"var(--green)"}"></div>
        </div>
        <strong>${item.eri_score}</strong>
      </div>
    </td>
    <td>
      <span class="check-status ${RISK_CLS[item.risk_level] || ""}" style="padding:3px 10px">
        ${RISK_ICON[item.risk_level] || ""} ${item.risk_level}
      </span>
    </td>
    <td style="max-width:340px"><div style="display:flex;flex-wrap:wrap;gap:4px">${factorHtml}</div></td>`
  return tr
}

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-title">Employee Risk Index</div>
      <div class="page-sub">Tenant: ${getTenant()} — Composite risk scoring: WPS · Probation · Assignments · Pod utilisation</div>`

    // Summary strip
    const strip = document.createElement("div")
    strip.style.cssText = "display:flex;gap:14px;margin-bottom:22px;flex-wrap:wrap"
    strip.innerHTML = '<div class="page-load" style="flex:1">Loading ERI…</div>'
    container.appendChild(strip)

    // Filter row
    const filters = document.createElement("div")
    filters.className = "filters"
    filters.style.marginBottom = "12px"
    filters.innerHTML = `
      <label>Risk Level <select id="eri-risk">
        <option value="">All</option>
        <option value="HIGH">High</option>
        <option value="MEDIUM">Medium</option>
        <option value="LOW">Low</option>
        <option value="CLEAR">Clear</option>
      </select></label>
      <label>Worker Type <select id="eri-type">
        <option value="">All</option>
        <option value="FTE">FTE</option>
        <option value="Contractor">Contractor</option>
        <option value="Freelancer">Freelancer</option>
      </select></label>`
    container.appendChild(filters)

    const refreshBtn = document.createElement("button")
    refreshBtn.className = "btn btn-primary"
    refreshBtn.style.marginBottom = "14px"
    refreshBtn.textContent = "Refresh ERI"
    container.appendChild(refreshBtn)

    // Table
    const tableWrap = document.createElement("div")
    tableWrap.className = "table-wrap"
    const table = document.createElement("table")
    table.innerHTML = `<thead><tr>
      <th>Worker</th><th>Type</th><th>Status</th><th>ERI Score</th><th>Risk Level</th><th>Risk Factors</th>
    </tr></thead>`
    const tbody = document.createElement("tbody")
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6" style="text-align:center">Loading…</td></tr>`
    table.appendChild(tbody)
    tableWrap.appendChild(table)
    container.appendChild(tableWrap)

    function load() {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="6" style="text-align:center">Loading…</td></tr>`
      strip.innerHTML = '<div class="page-load" style="flex:1">Loading ERI…</div>'

      apiGet("/api/admin/eri")
        .then(data => {
          const riskFilter = document.getElementById("eri-risk")?.value || ""
          const typeFilter = document.getElementById("eri-type")?.value || ""

          // Summary
          const s = data.summary || {}
          strip.innerHTML = ""
          strip.appendChild(summaryCard("Total Workers", s.total ?? "—", ""))
          strip.appendChild(summaryCard("High Risk",     s.high  ?? "—", "red"))
          strip.appendChild(summaryCard("Medium Risk",   s.medium ?? "—", "amber"))
          strip.appendChild(summaryCard("Clear",         s.clear ?? "—", "green"))

          // Filter + render
          tbody.innerHTML = ""
          let items = data.items || []
          if (riskFilter) items = items.filter(e => e.risk_level === riskFilter)
          if (typeFilter) items = items.filter(e => e.worker_type === typeFilter)

          if (items.length === 0) {
            tbody.innerHTML = `<tr class="empty-row"><td colspan="6" style="text-align:center;color:var(--muted)">No workers match filters</td></tr>`
          } else {
            items.forEach(item => tbody.appendChild(eriRow(item)))
          }
        })
        .catch(e => {
          strip.innerHTML = `<div class="page-err">${e.message}</div>`
          tbody.innerHTML = `<tr class="empty-row"><td colspan="6"><div class="page-err">${e.message}</div></td></tr>`
          toast.err(e.message)
        })
    }

    refreshBtn.addEventListener("click", load)
    document.getElementById("eri-risk")?.addEventListener("change", load)
    document.getElementById("eri-type")?.addEventListener("change", load)

    load()
  }
}
