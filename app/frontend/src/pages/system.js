import { apiGet } from "../api.js"
import { toast } from "../components/toast.js"

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(v)       { return v == null ? "—" : String(v) }
function fmtBool(v)   { return v ? "yes" : "no" }
function fmtDate(iso) { return iso ? String(iso).slice(0, 19).replace("T", " ") : "—" }

function uptimeStr(s) {
  if (!Number.isFinite(s) || s < 0) return "—"
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sc = s % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${sc}s`
  if (m > 0) return `${m}m ${sc}s`
  return `${sc}s`
}

function statusDot(on) {
  const span = document.createElement("span")
  span.style.cssText = `display:inline-block;width:8px;height:8px;border-radius:50%;
    background:${on ? "#1a7f37" : "#888"};margin-right:6px`
  return span
}

function card(title) {
  const wrap = document.createElement("div")
  wrap.style.cssText =
    "border:1px solid #eee;border-radius:12px;padding:16px;margin-bottom:16px;max-width:700px"
  const hdr = document.createElement("div")
  hdr.style.cssText = "font-weight:600;font-size:13px;margin-bottom:12px;color:#444"
  hdr.textContent = title
  wrap.appendChild(hdr)
  return { wrap, body: wrap }
}

function kvRow(label, value, valueEl) {
  const row = document.createElement("div")
  row.style.cssText = "display:flex;align-items:center;padding:5px 0;border-bottom:1px solid #f5f5f5;font-size:13px"
  const lbl = document.createElement("div")
  lbl.style.cssText = "width:180px;color:#888;flex-shrink:0"
  lbl.textContent = label
  const val = document.createElement("div")
  val.style.cssText = "font-family:ui-monospace,Menlo,Consolas,monospace;color:#111;word-break:break-all"
  if (valueEl) { val.appendChild(valueEl) }
  else { val.textContent = fmt(value) }
  row.appendChild(lbl)
  row.appendChild(val)
  return row
}

// ── page ──────────────────────────────────────────────────────────────────────

export default {
  render(container) {
    const title = document.createElement("div")
    title.className = "page-title"
    title.textContent = "System"
    container.appendChild(title)

    const refreshBtn = document.createElement("button")
    refreshBtn.className = "btn"
    refreshBtn.textContent = "Refresh"
    refreshBtn.style.marginBottom = "16px"
    container.appendChild(refreshBtn)

    const slot = document.createElement("div")
    container.appendChild(slot)

    function renderSystem(health, ready, scheduler) {
      slot.innerHTML = ""

      // ── Server ────────────────────────────────────────────────────────────
      const { body: serverCard } = card("Server")
      if (health) {
        serverCard.appendChild(kvRow("Status",   null, (() => {
          const wrap = document.createElement("span")
          wrap.style.display = "flex"
          wrap.style.alignItems = "center"
          wrap.appendChild(statusDot(health.status === "healthy"))
          wrap.appendChild(document.createTextNode(health.status || "—"))
          return wrap
        })()))
        serverCard.appendChild(kvRow("Version",  health.version))
        serverCard.appendChild(kvRow("Uptime",   uptimeStr(health.uptime_s)))
        serverCard.appendChild(kvRow("Time",     fmtDate(health.time)))
      } else {
        serverCard.appendChild(kvRow("Status", "unavailable"))
      }
      if (ready) {
        serverCard.appendChild(kvRow("Readiness",    ready.status))
        serverCard.appendChild(kvRow("Tenant count", ready.tenant_count))
      }
      slot.appendChild(serverCard)

      // ── Scheduler ─────────────────────────────────────────────────────────
      const { body: schedCard } = card("Scheduler")
      if (scheduler) {
        schedCard.appendChild(kvRow("Enabled", null, (() => {
          const wrap = document.createElement("span")
          wrap.style.display = "flex"
          wrap.style.alignItems = "center"
          wrap.appendChild(statusDot(scheduler.enabled))
          wrap.appendChild(document.createTextNode(scheduler.enabled ? "running" : "stopped"))
          return wrap
        })()))
        schedCard.appendChild(kvRow("Interval",   scheduler.interval_ms != null ? `${scheduler.interval_ms} ms` : "—"))
        schedCard.appendChild(kvRow("Started at", fmtDate(scheduler.started_at)))
        schedCard.appendChild(kvRow("Stopped at", fmtDate(scheduler.stopped_at)))
        if (scheduler.last_run) {
          const lr = scheduler.last_run
          schedCard.appendChild(kvRow("Last run finished",   fmtDate(lr.finished_at)))
          schedCard.appendChild(kvRow("Tenants processed",   fmt(lr.tenants_processed)))
        } else {
          schedCard.appendChild(kvRow("Last run", "none"))
        }
        if (scheduler.last_error) {
          const errEl = document.createElement("span")
          errEl.style.color = "#b00020"
          errEl.textContent = scheduler.last_error.message || JSON.stringify(scheduler.last_error)
          schedCard.appendChild(kvRow("Last error", null, errEl))
        }

        // tenant queue table
        if (Array.isArray(scheduler.tenants) && scheduler.tenants.length > 0) {
          const tbl = document.createElement("table")
          tbl.style.cssText = "width:100%;margin-top:12px;font-size:12px;border-collapse:collapse"
          const thead = document.createElement("thead")
          const hr = document.createElement("tr")
          ;["Tenant", "Queue", "Last Run", "Last Error"].forEach(h => {
            const th = document.createElement("th")
            th.style.cssText = "text-align:left;padding:4px 8px;border-bottom:1px solid #eee;color:#888;font-weight:600"
            th.textContent = h; hr.appendChild(th)
          })
          thead.appendChild(hr); tbl.appendChild(thead)
          const tbody = document.createElement("tbody")
          scheduler.tenants.forEach(t => {
            const tr = document.createElement("tr")
            const cells = [
              t.tenant_id,
              t.paused ? "paused" : "active",
              fmtDate(t.last_run),
              t.last_error ? (t.last_error.message || "error") : ""
            ]
            cells.forEach((text, i) => {
              const td = document.createElement("td")
              td.style.cssText = "padding:4px 8px;border-bottom:1px solid #f5f5f5"
              if (i === 0) td.style.fontFamily = "ui-monospace,Menlo,Consolas,monospace"
              if (i === 3 && text) td.style.color = "#b00020"
              td.textContent = text
              tr.appendChild(td)
            })
            tbody.appendChild(tr)
          })
          tbl.appendChild(tbody)
          schedCard.appendChild(tbl)
        }
      } else {
        schedCard.appendChild(kvRow("Scheduler", "unavailable"))
      }
      slot.appendChild(schedCard)
    }

    function loadAll() {
      slot.innerHTML = '<div class="page-load">Loading…</div>'
      const healthP    = apiGet("/api/health").catch(() => null)
      const readyP     = apiGet("/api/ready").catch(() => null)
      const schedulerP = apiGet("/api/admin/scheduler").catch(() => null)
      Promise.all([healthP, readyP, schedulerP])
        .then(([health, ready, scheduler]) => {
          renderSystem(health, ready, scheduler)
        })
        .catch(e => {
          const msg = String(e && e.message ? e.message : e)
          slot.innerHTML = `<div class="page-err">${msg}</div>`
          toast.err(msg)
        })
    }

    refreshBtn.addEventListener("click", loadAll)
    loadAll()
  }
}
