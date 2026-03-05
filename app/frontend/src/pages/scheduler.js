import { apiGet, apiPost } from "../api.js"
import { toast } from "../components/toast.js"

const MIN_MS = 1000
const MAX_MS = 3600000

function badge(label, on, onColor = "#1a7f37", offColor = "#888") {
  const el = document.createElement("span")
  el.style.cssText = `
    display:inline-flex;align-items:center;gap:5px;
    font-size:12px;font-weight:600;padding:4px 10px;
    border-radius:20px;background:${on ? onColor + "18" : "#f3f3f3"};
    color:${on ? onColor : offColor};border:1px solid ${on ? onColor + "44" : "#ddd"};
  `
  const dot = document.createElement("span")
  dot.style.cssText = `width:7px;height:7px;border-radius:50%;background:${on ? onColor : offColor}`
  el.appendChild(dot)
  el.appendChild(document.createTextNode(label))
  return el
}

function prominentField(label, value, isError = false) {
  const wrap = document.createElement("div")
  wrap.style.cssText = "margin-bottom:10px"
  const lbl = document.createElement("div")
  lbl.style.cssText = "font-size:11px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px"
  lbl.textContent = label
  const val = document.createElement("div")
  val.style.cssText = `font-size:13px;font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;
    color:${isError && value ? "#b00020" : "#111"};word-break:break-all`
  val.textContent = value === null || value === undefined ? "—" : String(value)
  wrap.appendChild(lbl)
  wrap.appendChild(val)
  return wrap
}

function fmtLastRun(lr) {
  if (!lr) return "—"
  if (typeof lr === "object" && lr.finished_at) return lr.finished_at.slice(0, 19).replace("T", " ")
  if (typeof lr === "string") return lr.slice(0, 19).replace("T", " ")
  return JSON.stringify(lr)
}

function fmtErr(e) {
  if (!e) return null
  if (typeof e === "object" && e.message) return e.message
  return String(e)
}

export default {
  render(container) {
    const title = document.createElement("div")
    title.className = "page-title"
    title.textContent = "WOS Scheduler"
    container.appendChild(title)

    // ── Status card ──────────────────────────────────────────
    const statusCard = document.createElement("div")
    statusCard.style.cssText = "border:1px solid #eee;border-radius:14px;padding:16px;margin-bottom:16px;max-width:560px"
    container.appendChild(statusCard)

    const refreshBtn = document.createElement("button")
    refreshBtn.className = "btn"
    refreshBtn.textContent = "Refresh"
    refreshBtn.style.marginBottom = "18px"
    container.appendChild(refreshBtn)

    // ── S32 Start/Stop controls ───────────────────────────────
    const controlSection = document.createElement("div")
    controlSection.style.cssText = "display:flex;flex-direction:column;gap:12px;max-width:560px"
    container.appendChild(controlSection)

    const intervalRow = document.createElement("div")
    intervalRow.className = "actions-row"

    const intervalInputWrap = document.createElement("div")
    intervalInputWrap.className = "interval-input"

    const intervalLabel = document.createElement("span")
    intervalLabel.textContent = `Interval ms (${MIN_MS}–${MAX_MS})`

    const intervalInput = document.createElement("input")
    intervalInput.type = "number"
    intervalInput.value = "30000"
    intervalInput.min = String(MIN_MS)
    intervalInput.max = String(MAX_MS)

    const intervalErr = document.createElement("div")
    intervalErr.style.cssText = "font-size:11px;color:#b00020;min-height:16px;margin-top:2px"

    intervalInputWrap.appendChild(intervalLabel)
    intervalInputWrap.appendChild(intervalInput)
    intervalInputWrap.appendChild(intervalErr)

    const startBtn = document.createElement("button")
    startBtn.className = "btn btn-success"
    startBtn.textContent = "Start"

    const stopBtn = document.createElement("button")
    stopBtn.className = "btn"
    stopBtn.textContent = "Stop"

    intervalRow.appendChild(intervalInputWrap)
    intervalRow.appendChild(startBtn)
    intervalRow.appendChild(stopBtn)
    controlSection.appendChild(intervalRow)

    // ── Run-once row ─────────────────────────────────────────
    const runRow = document.createElement("div")
    runRow.className = "actions-row"

    const runBtn = document.createElement("button")
    runBtn.className = "btn btn-primary"
    runBtn.textContent = "Run Once"

    const dryBtn = document.createElement("button")
    dryBtn.className = "btn"
    dryBtn.textContent = "Run Once (dry)"

    runRow.appendChild(runBtn)
    runRow.appendChild(dryBtn)
    controlSection.appendChild(runRow)

    // ── Tenant queue table ────────────────────────────────────
    const queueSection = document.createElement("div")
    queueSection.style.marginTop = "24px"
    container.appendChild(queueSection)

    const queueTitle = document.createElement("div")
    queueTitle.style.cssText = "font-weight:600;font-size:13px;margin-bottom:10px"
    queueTitle.textContent = "Tenant Queues"
    queueSection.appendChild(queueTitle)

    const queueSlot = document.createElement("div")
    queueSection.appendChild(queueSlot)

    // ── Helpers ──────────────────────────────────────────────
    const allBtns = [startBtn, stopBtn, runBtn, dryBtn, refreshBtn]
    function setAllBusy(v) { allBtns.forEach(b => { b.disabled = v }) }

    function validateInterval() {
      const n = parseInt(intervalInput.value, 10)
      if (!Number.isFinite(n) || n < MIN_MS || n > MAX_MS) {
        intervalErr.textContent = `Must be between ${MIN_MS} and ${MAX_MS}`
        return null
      }
      intervalErr.textContent = ""
      return n
    }

    intervalInput.addEventListener("input", validateInterval)

    function renderQueueTable(tenants, onPauseResume) {
      queueSlot.innerHTML = ""
      if (!tenants || !tenants.length) {
        queueSlot.innerHTML = '<div style="color:#888;font-size:13px">No tenants tracked yet</div>'
        return
      }
      const wrap = document.createElement("div")
      wrap.className = "table-wrap"
      const table = document.createElement("table")

      const thead = document.createElement("thead")
      const hr = document.createElement("tr")
      ;["Tenant", "Status", "Last Run", "Last Error", "Actions"].forEach(label => {
        const th = document.createElement("th"); th.textContent = label; hr.appendChild(th)
      })
      thead.appendChild(hr)
      table.appendChild(thead)

      const tbody = document.createElement("tbody")
      tenants.forEach(t => {
        const tr = document.createElement("tr")

        const tdId = document.createElement("td"); tdId.className = "mono"; tdId.textContent = t.tenant_id
        const tdStatus = document.createElement("td")
        tdStatus.appendChild(badge(t.paused ? "paused" : "active", !t.paused,
          t.paused ? "#b00020" : "#1a7f37", "#888"))
        const tdRun = document.createElement("td"); tdRun.textContent = fmtLastRun(t.last_run)
        const tdErr = document.createElement("td")
        const errMsg = fmtErr(t.last_error)
        tdErr.textContent = errMsg || "—"
        if (errMsg) tdErr.style.color = "#b00020"

        const tdActions = document.createElement("td")
        const btn = document.createElement("button")
        btn.className = t.paused ? "btn btn-success" : "btn btn-danger"
        btn.textContent = t.paused ? "Resume" : "Pause"
        btn.addEventListener("click", () => onPauseResume(t.tenant_id, t.paused))
        tdActions.appendChild(btn)

        ;[tdId, tdStatus, tdRun, tdErr, tdActions].forEach(td => tr.appendChild(td))
        tbody.appendChild(tr)
      })
      table.appendChild(tbody)
      wrap.appendChild(table)
      queueSlot.appendChild(wrap)
    }

    function renderStatus(s) {
      statusCard.innerHTML = ""

      const badgeRow = document.createElement("div")
      badgeRow.style.cssText = "display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap"
      badgeRow.appendChild(badge("enabled", s.enabled))
      badgeRow.appendChild(badge("running", s.running, "#0969da"))
      if (s.last_error) badgeRow.appendChild(badge("error", true, "#b00020"))
      statusCard.appendChild(badgeRow)

      statusCard.appendChild(prominentField("interval_ms", s.interval_ms))

      const twoCol = document.createElement("div")
      twoCol.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:12px"
      twoCol.appendChild(prominentField("last_run",   fmtLastRun(s.last_run)))
      twoCol.appendChild(prominentField("last_error", fmtErr(s.last_error), true))
      statusCard.appendChild(twoCol)

      renderQueueTable(s.tenants || [], (tid, currentlyPaused) => {
        const endpoint = `/api/admin/scheduler/${tid}/${currentlyPaused ? "resume" : "pause"}`
        setAllBusy(true)
        apiPost(endpoint)
          .then(() => { toast.ok(`Tenant "${tid}" ${currentlyPaused ? "resumed" : "paused"}`); loadStatus() })
          .catch(e => toast.err(String(e && e.message ? e.message : e)))
          .finally(() => setAllBusy(false))
      })
    }

    function loadStatus() {
      apiGet("/api/admin/scheduler")
        .then(data => renderStatus(data || {}))
        .catch(e => {
          statusCard.innerHTML = `<div class="page-err">${String(e && e.message ? e.message : e)}</div>`
          toast.err(String(e && e.message ? e.message : e))
        })
    }

    async function act(fn, successMsg) {
      setAllBusy(true)
      try {
        await fn()
        toast.ok(successMsg)
        loadStatus()
      } catch (e) {
        toast.err(String(e && e.message ? e.message : e))
      } finally {
        setAllBusy(false)
      }
    }

    refreshBtn.addEventListener("click", loadStatus)

    startBtn.addEventListener("click", () => {
      const ms = validateInterval()
      if (ms === null) return
      act(() => apiPost("/api/admin/scheduler/start", { interval_ms: ms }), "Scheduler started")
    })

    stopBtn.addEventListener("click", () =>
      act(() => apiPost("/api/admin/scheduler/stop", {}), "Scheduler stopped"))

    runBtn.addEventListener("click", () =>
      act(() => apiPost("/api/admin/scheduler/run-once", { dry_run: false }), "Run-once dispatched"))

    dryBtn.addEventListener("click", () =>
      act(() => apiPost("/api/admin/scheduler/run-once", { dry_run: true }), "Dry-run completed"))

    loadStatus()
  }
}
