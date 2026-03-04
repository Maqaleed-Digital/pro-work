import { apiGetJson } from "../api.js"
import { renderTable } from "../components/table.js"
import { toast } from "../components/toast.js"

const COLS = [
  { key: "timestamp",   label: "Timestamp",   mono: true },
  { key: "action",      label: "Type",         mono: true },
  { key: "actor",       label: "Actor" },
  { key: "entity_type", label: "Entity Type",  mono: true },
  { key: "entity_id",   label: "Entity ID",    mono: true },
  { key: "snapshot",    label: "Snapshot",     mono: true,
    render: v => v === null || v === undefined ? "" : JSON.stringify(v) },
]

export default {
  render(container) {
    const title = document.createElement("div")
    title.className = "page-title"
    title.textContent = "Evidence Events"
    container.appendChild(title)

    // ── Filters bar ──────────────────────────────────────────
    const filters = document.createElement("div")
    filters.className = "filters"

    const typeInput = document.createElement("input")
    typeInput.placeholder = "type (action)"

    const actorInput = document.createElement("input")
    actorInput.placeholder = "actor"

    const limitSelect = document.createElement("select")
    ;[25, 50, 100].forEach(n => {
      const o = document.createElement("option")
      o.value = String(n); o.textContent = String(n)
      if (n === 50) o.selected = true
      limitSelect.appendChild(o)
    })

    const applyBtn = document.createElement("button")
    applyBtn.className = "btn btn-primary"
    applyBtn.textContent = "Apply"

    const resetBtn = document.createElement("button")
    resetBtn.className = "btn"
    resetBtn.textContent = "Reset"

    const lType = document.createElement("label")
    lType.textContent = "Type"
    lType.appendChild(typeInput)

    const lActor = document.createElement("label")
    lActor.textContent = "Actor"
    lActor.appendChild(actorInput)

    const lLimit = document.createElement("label")
    lLimit.textContent = "Limit"
    lLimit.appendChild(limitSelect)

    filters.appendChild(lType)
    filters.appendChild(lActor)
    filters.appendChild(lLimit)
    filters.appendChild(applyBtn)
    filters.appendChild(resetBtn)
    container.appendChild(filters)

    // ── Table slot ───────────────────────────────────────────
    const tableSlot = document.createElement("div")
    container.appendChild(tableSlot)

    // ── Load-more button ─────────────────────────────────────
    const loadMoreBtn = document.createElement("button")
    loadMoreBtn.className = "btn btn-primary"
    loadMoreBtn.textContent = "Load more"
    loadMoreBtn.style.marginTop = "12px"
    loadMoreBtn.style.display = "none"
    container.appendChild(loadMoreBtn)

    // ── State ────────────────────────────────────────────────
    let allItems   = []
    let nextCursor = null
    let hasMore    = false
    let loading    = false

    function params(cursor) {
      return {
        type:   typeInput.value.trim(),
        actor:  actorInput.value.trim(),
        limit:  limitSelect.value,
        cursor: cursor || undefined,
      }
    }

    function setLoading(v) {
      loading = v
      applyBtn.disabled = v
      resetBtn.disabled = v
      loadMoreBtn.disabled = v
      loadMoreBtn.textContent = v ? "Loading…" : "Load more"
    }

    function rebuildTable() {
      tableSlot.innerHTML = ""
      tableSlot.appendChild(renderTable(COLS, allItems))
      loadMoreBtn.style.display = hasMore ? "inline-block" : "none"
    }

    function fetchPage(cursor, append) {
      if (loading) return
      setLoading(true)
      if (!append) {
        tableSlot.innerHTML = '<div class="page-load">Loading...</div>'
        loadMoreBtn.style.display = "none"
      }

      apiGetJson("/api/admin/evidence", params(cursor))
        .then(data => {
          const page = Array.isArray(data.items) ? data.items : []
          nextCursor = data.next_cursor || null
          hasMore    = Boolean(data.has_more)
          allItems   = append ? allItems.concat(page) : page
          rebuildTable()
        })
        .catch(e => {
          const msg = String(e && e.message ? e.message : e)
          if (!append) tableSlot.innerHTML = `<div class="page-err">${msg}</div>`
          toast.err(msg)
        })
        .finally(() => setLoading(false))
    }

    applyBtn.addEventListener("click", () => { allItems = []; fetchPage(null, false) })
    resetBtn.addEventListener("click", () => {
      typeInput.value  = ""
      actorInput.value = ""
      limitSelect.value = "50"
      allItems = []
      fetchPage(null, false)
    })
    loadMoreBtn.addEventListener("click", () => fetchPage(nextCursor, true))

    fetchPage(null, false)
  }
}
