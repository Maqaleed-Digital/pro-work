import { apiGetJson } from "../api.js"

// WC-W4-UI-001 · UI-5 — Evidence-pack export. INTERNAL (Front B), route /admin/evidence-export.
// CLASSIFICATION: read + CLIENT-SIDE export only (GET /api/admin/evidence → in-browser download).
// It triggers NO server-side action → Behaviour = Display, Mode = D. (If a future version posts to
// a server-side export/generate endpoint, it becomes Execution/Mode A + executing-tag per Addendum B.)
// Guard-walled from Front A (added to INTERNAL_ONLY_ROUTES).

export default {
  async render(container) {
    const title = document.createElement("div")
    title.className = "page-title"
    title.textContent = "Evidence Pack Export"
    container.appendChild(title)

    const note = document.createElement("p")
    note.setAttribute("data-mode", "D")
    note.textContent = "Read-only export of the audit/evidence trail (client-side download; no server-side action)."
    container.appendChild(note)

    const btn = document.createElement("button")
    btn.className = "export-btn"
    btn.textContent = "Download evidence pack (JSON)"
    btn.addEventListener("click", async () => {
      btn.disabled = true
      try {
        // read-only fetch of the existing internal evidence endpoint
        const data = await apiGetJson("/api/admin/evidence", { limit: 1000 })
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = "evidence-pack.json"
        a.click()
        URL.revokeObjectURL(url)
      } finally {
        btn.disabled = false
      }
    })
    container.appendChild(btn)
  },
}
