import { apiGet, apiGetJson, downloadJson, getTenant } from "../api.js"
import { toast } from "../components/toast.js"

function card(label, value, sub) {
  const c = document.createElement("div")
  c.className = "stat-card"
  c.innerHTML = `<div class="sc-label">${label}</div>
    <div class="sc-value">${value}</div>
    ${sub ? `<div class="sc-sub">${sub}</div>` : ""}`
  return c
}

function kvTable(pairs) {
  const wrap = document.createElement("div")
  wrap.className = "kv-table"
  wrap.style.marginBottom = "14px"
  const table = document.createElement("table")
  const tbody = document.createElement("tbody")
  pairs.forEach(([k, v]) => {
    const tr = document.createElement("tr")
    const tdK = document.createElement("td"); tdK.textContent = k
    const tdV = document.createElement("td"); tdV.textContent = v === null || v === undefined ? "—" : String(v)
    tr.appendChild(tdK); tr.appendChild(tdV)
    tbody.appendChild(tr)
  })
  table.appendChild(tbody)
  wrap.appendChild(table)
  return wrap
}

function sectionLabel(text) {
  const el = document.createElement("div")
  el.style.cssText = "font-size:12px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.04em;margin:18px 0 8px"
  el.textContent = text
  return el
}

export default {
  render(container) {
    const header = document.createElement("div")
    header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"

    const titleWrap = document.createElement("div")
    titleWrap.style.cssText = "display:flex;align-items:baseline;gap:10px"

    const title = document.createElement("div")
    title.className = "page-title"
    title.style.margin = "0"
    title.textContent = "Dashboard"

    const tenantBadge = document.createElement("span")
    tenantBadge.style.cssText = "font-size:12px;color:#888;font-weight:500"
    tenantBadge.textContent = "Tenant: " + getTenant()
    titleWrap.appendChild(title)
    titleWrap.appendChild(tenantBadge)

    const exportBtn = document.createElement("button")
    exportBtn.className = "btn"
    exportBtn.textContent = "Export snapshot"
    exportBtn.disabled = true

    header.appendChild(titleWrap)
    header.appendChild(exportBtn)
    container.appendChild(header)

    const loading = document.createElement("div")
    loading.className = "page-load"
    loading.textContent = "Loading..."
    container.appendChild(loading)

    Promise.all([
      apiGet("/api/admin/version"),
      apiGet("/api/admin/health"),
      apiGet("/api/admin/scheduler/status"),
      apiGetJson("/api/admin/evidence", { limit: 25 }),
    ])
      .then(([version, health, schedulerResp, evidence]) => {
        loading.remove()

        const scheduler = schedulerResp.scheduler || schedulerResp

        // ── Counts grid ──────────────────────────────────────
        container.appendChild(sectionLabel("Counts"))
        const counts = health.counts || {}
        const grid = document.createElement("div")
        grid.className = "stat-grid"
        grid.appendChild(card("Workers",         counts.workers        ?? "—", null))
        grid.appendChild(card("Pods",            counts.pods           ?? "—", null))
        grid.appendChild(card("Assignments",     counts.assignments    ?? "—", null))
        grid.appendChild(card("Evidence Events", counts.evidence_events ?? "—", null))
        container.appendChild(grid)

        // ── System ───────────────────────────────────────────
        container.appendChild(sectionLabel("System"))
        const sys = health.system || {}
        container.appendChild(kvTable([
          ["version",    sys.version    ?? version.version],
          ["commit",     sys.commit     ?? version.commit],
          ["started_at", sys.started_at ?? version.started_at],
          ["uptime_s",   sys.uptime_s],
        ]))

        // ── Scheduler ────────────────────────────────────────
        container.appendChild(sectionLabel("Scheduler"))
        container.appendChild(kvTable([
          ["enabled",     String(scheduler.enabled)],
          ["interval_ms", scheduler.interval_ms],
          ["running",     String(scheduler.running)],
          ["last_run",    scheduler.last_run],
          ["last_error",  scheduler.last_error],
        ]))

        // ── Recent evidence ──────────────────────────────────
        const evItems = (evidence && evidence.items) ? evidence.items : []
        container.appendChild(sectionLabel(`Recent Evidence (${evItems.length})`))
        if (evItems.length === 0) {
          const empty = document.createElement("div")
          empty.style.cssText = "font-size:13px;color:#888;margin-bottom:12px"
          empty.textContent = "No evidence events yet"
          container.appendChild(empty)
        } else {
          const pre = document.createElement("pre")
          pre.style.cssText = "font-size:12px;white-space:pre-wrap;border:1px solid #eee;border-radius:12px;padding:12px;margin-bottom:12px"
          pre.textContent = JSON.stringify(evItems, null, 2)
          container.appendChild(pre)
        }

        // ── Export ───────────────────────────────────────────
        exportBtn.disabled = false
        exportBtn.addEventListener("click", () => {
          downloadJson("prowork-snapshot.json", {
            ts:                  new Date().toISOString(),
            version,
            health,
            scheduler,
            evidence_first_page: evidence,
          })
          toast.ok("Snapshot downloaded")
        })
      })
      .catch(e => {
        loading.remove()
        const msg = String(e && e.message ? e.message : e)
        const errEl = document.createElement("div")
        errEl.className = "page-err"
        errEl.textContent = msg
        container.appendChild(errEl)
        toast.err(msg)
      })
  }
}
