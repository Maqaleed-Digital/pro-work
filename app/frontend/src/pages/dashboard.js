import { apiGet } from "../api.js"
import { toast } from "../components/toast.js"

export default {
  render(container) {
    const title = document.createElement("div")
    title.className = "page-title"
    title.textContent = "Dashboard"
    container.appendChild(title)

    const loading = document.createElement("div")
    loading.className = "page-load"
    loading.textContent = "Loading..."
    container.appendChild(loading)

    apiGet("/api/admin/stats")
      .then(d => {
        loading.remove()
        const workers  = d.workers  || { total: 0, fte: 0, freelancer: 0 }
        const evidence = d.evidence || { total: 0 }

        const grid = document.createElement("div")
        grid.className = "stat-grid"

        function card(label, value, sub) {
          const c = document.createElement("div")
          c.className = "stat-card"
          c.innerHTML = `<div class="sc-label">${label}</div>
            <div class="sc-value">${value}</div>
            ${sub ? `<div class="sc-sub">${sub}</div>` : ""}`
          return c
        }

        grid.appendChild(card("Workers",        workers.total,  `FTE: ${workers.fte} · Freelancers: ${workers.freelancer}`))
        grid.appendChild(card("Evidence Events", evidence.total, "in-memory store"))
        container.appendChild(grid)

        // raw JSON fallback
        const pre = document.createElement("pre")
        pre.style.cssText = "font-size:12px;white-space:pre-wrap;border:1px solid #eee;border-radius:12px;padding:12px;margin-top:8px"
        pre.textContent = JSON.stringify(d, null, 2)
        container.appendChild(pre)
      })
      .catch(e => {
        loading.remove()
        const err = document.createElement("div")
        err.className = "page-err"
        err.textContent = String(e && e.message ? e.message : e)
        container.appendChild(err)
        toast.err(err.textContent)
      })
  }
}
