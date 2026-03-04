import { apiGet } from "../api.js"
import { renderTable } from "../components/table.js"
import { toast } from "../components/toast.js"

const COLS = [
  { key: "timestamp",   label: "Timestamp",   mono: true },
  { key: "action",      label: "Action",      mono: true },
  { key: "actor",       label: "Actor" },
  { key: "entity_type", label: "Entity Type", mono: true },
  { key: "entity_id",   label: "Entity ID",   mono: true },
  { key: "snapshot",    label: "Snapshot",    mono: true,
    render: v => v === null || v === undefined ? "" : JSON.stringify(v) },
]

export default {
  render(container) {
    const title = document.createElement("div")
    title.className = "page-title"
    title.textContent = "Evidence Events"
    container.appendChild(title)

    // filters
    const filters = document.createElement("div")
    filters.className = "filters"

    const fields = { entity_id: "", entity_type: "", action: "", actor: "", limit: "50" }
    const inputs = {}
    Object.keys(fields).forEach(k => {
      const inp = document.createElement("input")
      inp.value = fields[k]
      inp.placeholder = k === "limit" ? "50" : k
      inp.style.minWidth = k === "limit" ? "80px" : "130px"
      inputs[k] = inp

      const lbl = document.createElement("label")
      lbl.textContent = k
      lbl.appendChild(inp)
      filters.appendChild(lbl)
    })

    const applyBtn = document.createElement("button")
    applyBtn.className = "btn btn-primary"
    applyBtn.textContent = "Apply"

    const resetBtn = document.createElement("button")
    resetBtn.className = "btn"
    resetBtn.textContent = "Reset"

    filters.appendChild(applyBtn)
    filters.appendChild(resetBtn)
    container.appendChild(filters)

    // cursor info
    const cursorInfo = document.createElement("div")
    cursorInfo.style.cssText = "font-size:12px;color:#666;margin-bottom:10px"
    container.appendChild(cursorInfo)

    const tableSlot = document.createElement("div")
    container.appendChild(tableSlot)

    const pagination = document.createElement("div")
    pagination.className = "pagination"
    container.appendChild(pagination)

    let cursorStack = []
    let currentCursor = ""
    let nextCursor = null

    function load(cursor) {
      tableSlot.innerHTML = '<div class="page-load">Loading...</div>'
      pagination.innerHTML = ""

      const params = new URLSearchParams()
      Object.keys(inputs).forEach(k => {
        const v = inputs[k].value.trim()
        if (v) params.set(k, v)
      })
      if (cursor) params.set("cursor", cursor)
      const qs = params.toString()
      apiGet("/api/wos/evidence-events" + (qs ? "?" + qs : ""))
        .then(data => {
          const items = Array.isArray(data && data.items ? data.items : []) ? (data.items || []) : []
          nextCursor = (data && data.next_cursor) ? String(data.next_cursor) : null
          currentCursor = cursor || ""
          cursorInfo.textContent = `cursor: ${currentCursor || "(none)"} · next_cursor: ${nextCursor || "(none)"}`

          tableSlot.innerHTML = ""
          tableSlot.appendChild(renderTable(COLS, items))
          buildPagination()
        })
        .catch(e => {
          const msg = String(e && e.message ? e.message : e)
          tableSlot.innerHTML = `<div class="page-err">${msg}</div>`
          toast.err(msg)
        })
    }

    function buildPagination() {
      pagination.innerHTML = ""

      const prevBtn = document.createElement("button")
      prevBtn.className = "btn"
      prevBtn.textContent = "← Prev"
      prevBtn.disabled = cursorStack.length === 0
      prevBtn.addEventListener("click", () => {
        const prev = cursorStack.pop()
        load(prev || "")
      })

      const nextBtn = document.createElement("button")
      nextBtn.className = "btn btn-primary"
      nextBtn.textContent = "Next →"
      nextBtn.disabled = !nextCursor
      nextBtn.addEventListener("click", () => {
        if (!nextCursor) return
        cursorStack.push(currentCursor)
        load(nextCursor)
      })

      pagination.appendChild(prevBtn)
      pagination.appendChild(nextBtn)
    }

    applyBtn.addEventListener("click", () => { cursorStack = []; load("") })
    resetBtn.addEventListener("click", () => {
      Object.keys(inputs).forEach(k => { inputs[k].value = k === "limit" ? "50" : "" })
      cursorStack = []
      load("")
    })

    load("")
  }
}
