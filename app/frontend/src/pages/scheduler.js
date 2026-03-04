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

    // ── Interval controls ────────────────────────────────────
    const intervalSection = document.createElement("div")
    intervalSection.style.cssText = "display:flex;flex-direction:column;gap:12px;max-width:560px"
    container.appendChild(intervalSection)

    const intervalRow = document.createElement("div")
    intervalRow.className = "actions-row"

    const intervalInputWrap = document.createElement("div")
    intervalInputWrap.className = "interval-input"

    const intervalLabel = document.createElement("span")
    intervalLabel.textContent = `Interval ms (${MIN_MS}–${MAX_MS})`

    const intervalInput = document.createElement("input")
    intervalInput.type = "number"
    intervalInput.value = "60000"
    intervalInput.min = String(MIN_MS)
    intervalInput.max = String(MAX_MS)

    const intervalErr = document.createElement("div")
    intervalErr.style.cssText = "font-size:11px;color:#b00020;min-height:16px;margin-top:2px"

    intervalInputWrap.appendChild(intervalLabel)
    intervalInputWrap.appendChild(intervalInput)
    intervalInputWrap.appendChild(intervalErr)

    const startBtn = document.createElement("button")
    startBtn.className = "btn btn-success"
    startBtn.textContent = "Start Interval"

    const stopBtn = document.createElement("button")
    stopBtn.className = "btn"
    stopBtn.textContent = "Stop Interval"

    intervalRow.appendChild(intervalInputWrap)
    intervalRow.appendChild(startBtn)
    intervalRow.appendChild(stopBtn)
    intervalSection.appendChild(intervalRow)

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
    intervalSection.appendChild(runRow)

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

    function renderStatus(s) {
      statusCard.innerHTML = ""

      // badges row
      const badgeRow = document.createElement("div")
      badgeRow.style.cssText = "display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap"
      badgeRow.appendChild(badge("enabled", s.enabled))
      badgeRow.appendChild(badge("running", s.running, "#0969da"))
      if (s.last_error) badgeRow.appendChild(badge("error", true, "#b00020"))
      statusCard.appendChild(badgeRow)

      // interval_ms
      statusCard.appendChild(prominentField("interval_ms", s.interval_ms))

      // last_run + last_error side by side
      const twoCol = document.createElement("div")
      twoCol.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:12px"
      twoCol.appendChild(prominentField("last_run",   s.last_run))
      twoCol.appendChild(prominentField("last_error", s.last_error, true))
      statusCard.appendChild(twoCol)
    }

    function loadStatus() {
      apiGet("/api/admin/scheduler/status")
        .then(resp => renderStatus(resp.scheduler || resp))
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
      act(() => apiPost("/api/admin/scheduler/interval/start", { interval_ms: ms }), "Interval started")
    })

    stopBtn.addEventListener("click", () =>
      act(() => apiPost("/api/admin/scheduler/interval/stop", {}), "Interval stopped"))

    runBtn.addEventListener("click", () =>
      act(() => apiPost("/api/admin/scheduler/run-once", { dry_run: false }), "Run-once dispatched"))

    dryBtn.addEventListener("click", () =>
      act(() => apiPost("/api/admin/scheduler/run-once", { dry_run: true }), "Dry-run completed"))

    loadStatus()
  }
}
