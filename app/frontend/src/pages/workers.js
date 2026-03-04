import { apiGet } from "../api.js"
import { renderTable } from "../components/table.js"
import { toast } from "../components/toast.js"

const COLS = [
  { key: "id",          label: "ID",          mono: true },
  { key: "name",        label: "Name" },
  { key: "worker_type", label: "Type" },
  { key: "status",      label: "Status" },
  { key: "email",       label: "Email" },
]

export default {
  render(container) {
    const title = document.createElement("div")
    title.className = "page-title"
    title.textContent = "Workers"
    container.appendChild(title)

    // filters
    const filters = document.createElement("div")
    filters.className = "filters"

    const statusInput = document.createElement("input")
    statusInput.placeholder = "status (active…)"

    const typeSelect = document.createElement("select")
    ;[["", "(any type)"], ["FTE", "FTE"], ["FREELANCER", "FREELANCER"]].forEach(([v, t]) => {
      const o = document.createElement("option")
      o.value = v; o.textContent = t
      typeSelect.appendChild(o)
    })

    const applyBtn = document.createElement("button")
    applyBtn.className = "btn btn-primary"
    applyBtn.textContent = "Apply"

    const lStatus = document.createElement("label")
    lStatus.textContent = "Status"
    lStatus.appendChild(statusInput)

    const lType = document.createElement("label")
    lType.textContent = "Worker Type"
    lType.appendChild(typeSelect)

    filters.appendChild(lStatus)
    filters.appendChild(lType)
    filters.appendChild(applyBtn)
    container.appendChild(filters)

    const tableSlot = document.createElement("div")
    container.appendChild(tableSlot)

    function load() {
      tableSlot.innerHTML = '<div class="page-load">Loading...</div>'
      const params = new URLSearchParams()
      const s = statusInput.value.trim()
      const t = typeSelect.value
      if (s) params.set("status", s)
      if (t) params.set("worker_type", t)
      const qs = params.toString()
      apiGet("/api/admin/workers" + (qs ? "?" + qs : ""))
        .then(data => {
          tableSlot.innerHTML = ""
          tableSlot.appendChild(renderTable(COLS, Array.isArray(data) ? data : []))
        })
        .catch(e => {
          const msg = String(e && e.message ? e.message : e)
          tableSlot.innerHTML = `<div class="page-err">${msg}</div>`
          toast.err(msg)
        })
    }

    applyBtn.addEventListener("click", load)
    load()
  }
}
