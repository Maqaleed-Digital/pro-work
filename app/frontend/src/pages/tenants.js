import { apiGet, apiPost } from "../api.js"
import { toast } from "../components/toast.js"

function statusBadge(status) {
  const el = document.createElement("span")
  el.textContent = status
  el.style.cssText = status === "active"
    ? "color:#1a7f37;font-weight:600;font-size:12px"
    : "color:#b00020;font-weight:600;font-size:12px"
  return el
}

function kvRow(label, value) {
  const tr = document.createElement("tr")
  const tdL = document.createElement("td"); tdL.textContent = label
  const tdV = document.createElement("td"); tdV.textContent = value ?? ""
  tr.appendChild(tdL); tr.appendChild(tdV)
  return tr
}

function renderDetail(container, tenant) {
  container.innerHTML = ""

  const heading = document.createElement("div")
  heading.style.cssText = "font-weight:600;font-size:13px;margin-bottom:10px"
  heading.textContent = tenant.name || tenant.tenant_id
  container.appendChild(heading)

  const wrap = document.createElement("div")
  wrap.className = "kv-table"
  const table = document.createElement("table")
  ;[
    ["Tenant ID",   tenant.tenant_id],
    ["Name",        tenant.name],
    ["Status",      tenant.status],
    ["Created",     tenant.created_at ? tenant.created_at.slice(0, 19).replace("T", " ") : ""],
    ["Notes",       tenant.notes || ""],
    ["Workers",     (tenant.stats || {}).workers ?? 0],
    ["Pods",        (tenant.stats || {}).pods ?? 0],
    ["Assignments", (tenant.stats || {}).assignments ?? 0],
    ["Evidence",    (tenant.stats || {}).evidence ?? 0],
  ].forEach(([k, v]) => table.appendChild(kvRow(k, v)))
  wrap.appendChild(table)
  container.appendChild(wrap)
}

function buildTable(tenants, onAction) {
  const wrap = document.createElement("div")
  wrap.className = "table-wrap"

  const table = document.createElement("table")

  const thead = document.createElement("thead")
  const hr = document.createElement("tr")
  ;["Tenant ID", "Name", "Status", "Workers", "Pods", "Assignments", "Actions"].forEach(label => {
    const th = document.createElement("th"); th.textContent = label; hr.appendChild(th)
  })
  thead.appendChild(hr)
  table.appendChild(thead)

  const tbody = document.createElement("tbody")

  if (!tenants.length) {
    const tr = document.createElement("tr")
    tr.className = "empty-row"
    const td = document.createElement("td")
    td.colSpan = 7; td.textContent = "No tenants found"
    tr.appendChild(td); tbody.appendChild(tr)
  } else {
    tenants.forEach(t => {
      const tr = document.createElement("tr")
      const stats = t.stats || {}

      const tdId = document.createElement("td")
      tdId.className = "mono"; tdId.textContent = t.tenant_id

      const tdName = document.createElement("td"); tdName.textContent = t.name || ""
      const tdStatus = document.createElement("td"); tdStatus.appendChild(statusBadge(t.status))
      const tdW = document.createElement("td"); tdW.textContent = stats.workers ?? 0
      const tdP = document.createElement("td"); tdP.textContent = stats.pods ?? 0
      const tdA = document.createElement("td"); tdA.textContent = stats.assignments ?? 0

      const tdActions = document.createElement("td")
      tdActions.style.cssText = "display:flex;gap:6px;flex-wrap:wrap"

      const viewBtn = document.createElement("button")
      viewBtn.className = "btn"; viewBtn.textContent = "View"
      viewBtn.addEventListener("click", () => onAction("view", t))

      const toggleBtn = document.createElement("button")
      toggleBtn.className = t.status === "active" ? "btn btn-danger" : "btn btn-success"
      toggleBtn.textContent = t.status === "active" ? "Disable" : "Enable"
      toggleBtn.addEventListener("click", () => onAction(t.status === "active" ? "disable" : "enable", t))

      tdActions.appendChild(viewBtn)
      tdActions.appendChild(toggleBtn)

      ;[tdId, tdName, tdStatus, tdW, tdP, tdA, tdActions].forEach(td => tr.appendChild(td))
      tbody.appendChild(tr)
    })
  }

  table.appendChild(tbody)
  wrap.appendChild(table)
  return wrap
}

export default {
  render(container) {
    const title = document.createElement("div")
    title.className = "page-title"
    title.textContent = "Tenants"
    container.appendChild(title)

    const layout = document.createElement("div")
    layout.style.cssText = "display:flex;gap:20px;align-items:flex-start"
    container.appendChild(layout)

    const tableSlot = document.createElement("div")
    tableSlot.style.flex = "1"
    layout.appendChild(tableSlot)

    const detailPanel = document.createElement("div")
    detailPanel.style.cssText =
      "width:300px;flex-shrink:0;border:1px solid #eee;border-radius:14px;padding:14px;min-height:120px"
    detailPanel.innerHTML = '<div style="color:#888;font-size:13px">Select a tenant to view details</div>'
    layout.appendChild(detailPanel)

    function load() {
      tableSlot.innerHTML = '<div class="page-load">Loading…</div>'
      apiGet("/api/admin/tenants")
        .then(data => {
          const tenants = Array.isArray(data && data.tenants) ? data.tenants : []
          tableSlot.innerHTML = ""
          tableSlot.appendChild(buildTable(tenants, (action, tenant) => {
            if (action === "view") {
              renderDetail(detailPanel, tenant)
              return
            }
            const endpoint = `/api/admin/tenants/${tenant.tenant_id}/${action}`
            apiPost(endpoint)
              .then(() => {
                toast.ok(`Tenant "${tenant.tenant_id}" ${action}d`)
                detailPanel.innerHTML =
                  '<div style="color:#888;font-size:13px">Select a tenant to view details</div>'
                load()
              })
              .catch(e => toast.err(String(e && e.message ? e.message : e)))
          }))
        })
        .catch(e => {
          const msg = String(e && e.message ? e.message : e)
          tableSlot.innerHTML = `<div class="page-err">${msg}</div>`
          toast.err(msg)
        })
    }

    load()
  }
}
