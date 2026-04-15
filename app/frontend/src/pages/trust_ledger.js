import { apiGetJson, apiGet, getTenant } from "../api.js"
import { toast } from "../components/toast.js"

const RISK_CLS = { HIGH: "fail", MEDIUM: "warn", LOW: "", CLEAR: "pass" }
const ACT_ICONS = {
  "evidence_pack.created":  "📦",
  "worker.created":         "👤",
  "worker.updated":         "✏️",
  "assignment.created":     "📋",
  "pod.created":            "🔷",
}

function ledgerRow(ev, seq) {
  const tr = document.createElement("tr")
  const ts  = ev.timestamp || ev.ts || ""
  const icon = ACT_ICONS[ev.action] || "📝"
  tr.innerHTML = `
    <td class="mono" style="color:var(--muted);font-size:11px">#${seq}</td>
    <td class="mono" style="font-size:11px;color:var(--teal)">${ev.id || ev.entity_id || "—"}</td>
    <td style="font-size:16px;text-align:center">${icon}</td>
    <td>${ev.actor || "system"}</td>
    <td>${ev.action || "—"}</td>
    <td style="color:var(--muted);font-size:11px">${ev.entity_type || "—"} ${ev.entity_id ? "· " + ev.entity_id : ""}</td>
    <td class="mono" style="font-size:11px;color:var(--muted)">${ts ? new Date(ts).toLocaleString() : "—"}</td>`
  return tr
}

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-title">Trust Ledger</div>
      <div class="page-sub">Tenant: ${getTenant()} — Immutable append-only audit log of all workforce events</div>`

    // Filters
    const filters = document.createElement("div")
    filters.className = "filters"
    filters.innerHTML = `
      <label>Actor <input id="fl-actor"  placeholder="e.g. adm_…" style="min-width:160px"></label>
      <label>Action <input id="fl-action" placeholder="e.g. worker.created"></label>
      <label>Limit <select id="fl-limit">
        <option value="50">50</option>
        <option value="100" selected>100</option>
        <option value="250">250</option>
        <option value="500">500</option>
      </select></label>`
    container.appendChild(filters)

    const actionsRow = document.createElement("div")
    actionsRow.className = "actions-row"

    const searchBtn = document.createElement("button")
    searchBtn.className = "btn btn-primary"
    searchBtn.textContent = "Search"

    const exportBtn = document.createElement("button")
    exportBtn.className = "btn btn-gold"
    exportBtn.textContent = "⬇ Export ZIP"

    actionsRow.appendChild(searchBtn)
    actionsRow.appendChild(exportBtn)
    container.appendChild(actionsRow)

    // Summary strip
    const summary = document.createElement("div")
    summary.style.cssText = "display:flex;gap:12px;margin:14px 0;flex-wrap:wrap"
    container.appendChild(summary)

    // Table
    const tableWrap = document.createElement("div")
    tableWrap.className = "table-wrap"
    tableWrap.style.marginTop = "4px"
    const table = document.createElement("table")
    table.innerHTML = `<thead><tr>
      <th>#</th><th>ID</th><th></th><th>Actor</th><th>Action</th><th>Entity</th><th>Timestamp</th>
    </tr></thead>`
    const tbody = document.createElement("tbody")
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7" style="text-align:center">Loading…</td></tr>`
    table.appendChild(tbody)
    tableWrap.appendChild(table)
    container.appendChild(tableWrap)

    const pagination = document.createElement("div")
    pagination.className = "pagination"
    container.appendChild(pagination)

    let currentOffset = 0

    function load(offset = 0) {
      currentOffset = offset
      tbody.innerHTML = `<tr class="empty-row"><td colspan="7" style="text-align:center">Loading…</td></tr>`
      const actor  = document.getElementById("fl-actor")?.value.trim()  || ""
      const action = document.getElementById("fl-action")?.value.trim() || ""
      const limit  = Number(document.getElementById("fl-limit")?.value  || 100)

      apiGetJson("/api/admin/trust-ledger", { limit, offset, actor: actor || undefined, action: action || undefined })
        .then(data => {
          tbody.innerHTML = ""
          const items = data.items || []
          if (items.length === 0) {
            tbody.innerHTML = `<tr class="empty-row"><td colspan="7" style="text-align:center;color:var(--muted)">No events found</td></tr>`
          } else {
            items.forEach(ev => tbody.appendChild(ledgerRow(ev, ev._seq || "—")))
          }

          // Summary
          summary.innerHTML = ""
          const total = data.total || items.length
          ;[
            [`Total events`, total],
            [`Showing`,      `${offset + 1}–${Math.min(offset + limit, total)}`],
          ].forEach(([l, v]) => {
            const pill = document.createElement("div")
            pill.style.cssText = "font-size:12px;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:6px 12px"
            pill.innerHTML = `<span style="color:var(--muted)">${l}: </span><strong>${v}</strong>`
            summary.appendChild(pill)
          })

          // Pagination
          pagination.innerHTML = ""
          if (offset > 0) {
            const prev = document.createElement("button")
            prev.className = "btn btn-sm"
            prev.textContent = "← Prev"
            prev.addEventListener("click", () => load(Math.max(0, offset - limit)))
            pagination.appendChild(prev)
          }
          if (offset + limit < total) {
            const next = document.createElement("button")
            next.className = "btn btn-primary btn-sm"
            next.textContent = "Next →"
            next.addEventListener("click", () => load(offset + limit))
            pagination.appendChild(next)
          }
        })
        .catch(e => {
          tbody.innerHTML = `<tr class="empty-row"><td colspan="7"><div class="page-err">${e.message}</div></td></tr>`
          toast.err(e.message)
        })
    }

    searchBtn.addEventListener("click", () => load(0))

    exportBtn.addEventListener("click", async () => {
      exportBtn.disabled = true
      exportBtn.textContent = "Preparing…"
      try {
        const token  = localStorage.getItem("pw_token") || ""
        const tenant = localStorage.getItem("pw_tenant") || "default"
        const resp   = await fetch("/api/admin/export/evidence-packs", {
          headers: { Authorization: "Bearer " + token, "x-tenant-id": tenant }
        })
        if (!resp.ok) throw new Error("Export failed: " + resp.status)
        const blob   = await resp.blob()
        const url    = URL.createObjectURL(blob)
        const a      = document.createElement("a")
        a.href       = url
        a.download   = `evidence-export-${tenant}-${Date.now()}.zip`
        a.click()
        URL.revokeObjectURL(url)
        toast.ok("Export downloaded")
      } catch (e) {
        toast.err(e.message)
      } finally {
        exportBtn.disabled = false
        exportBtn.textContent = "⬇ Export ZIP"
      }
    })

    load(0)
  }
}
