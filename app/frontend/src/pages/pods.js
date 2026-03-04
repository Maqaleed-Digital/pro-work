import { apiGet } from "../api.js"
import { renderTable } from "../components/table.js"
import { toast } from "../components/toast.js"

const COLS = [
  { key: "id",         label: "ID",     mono: true },
  { key: "name",       label: "Name" },
  { key: "status",     label: "Status" },
  { key: "lead_id",    label: "Lead ID",    mono: true },
  { key: "created_at", label: "Created At", mono: true },
]

export default {
  render(container) {
    const title = document.createElement("div")
    title.className = "page-title"
    title.textContent = "Pods"
    container.appendChild(title)

    const refreshBtn = document.createElement("button")
    refreshBtn.className = "btn"
    refreshBtn.textContent = "Refresh"
    refreshBtn.style.marginBottom = "14px"
    container.appendChild(refreshBtn)

    const tableSlot = document.createElement("div")
    container.appendChild(tableSlot)

    function load() {
      tableSlot.innerHTML = '<div class="page-load">Loading...</div>'
      apiGet("/api/admin/pods")
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

    refreshBtn.addEventListener("click", load)
    load()
  }
}
