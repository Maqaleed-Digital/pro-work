import { apiGet, apiPost } from "../api.js"
import { toast } from "../components/toast.js"

function kv(label, value) {
  return `<tr><td>${label}</td><td>${value === null || value === undefined ? "—" : String(value)}</td></tr>`
}

export default {
  render(container) {
    const title = document.createElement("div")
    title.className = "page-title"
    title.textContent = "WOS Scheduler"
    container.appendChild(title)

    // status card
    const kvWrap = document.createElement("div")
    kvWrap.className = "kv-table"
    kvWrap.innerHTML = '<table><tbody><tr><td colspan="2" style="color:#666;font-size:12px">Loading...</td></tr></tbody></table>'
    container.appendChild(kvWrap)

    const refreshBtn = document.createElement("button")
    refreshBtn.className = "btn"
    refreshBtn.textContent = "Refresh status"
    refreshBtn.style.marginBottom = "16px"
    container.appendChild(refreshBtn)

    // actions
    const actionsWrap = document.createElement("div")
    actionsWrap.style.display = "flex"
    actionsWrap.style.flexDirection = "column"
    actionsWrap.style.gap = "12px"
    container.appendChild(actionsWrap)

    // interval row
    const intervalRow = document.createElement("div")
    intervalRow.className = "actions-row"

    const intervalInputWrap = document.createElement("div")
    intervalInputWrap.className = "interval-input"
    const intervalLabel = document.createElement("span")
    intervalLabel.textContent = "Interval (ms)"
    const intervalInput = document.createElement("input")
    intervalInput.type = "number"
    intervalInput.value = "60000"
    intervalInput.min = "1000"
    intervalInputWrap.appendChild(intervalLabel)
    intervalInputWrap.appendChild(intervalInput)

    const startBtn = document.createElement("button")
    startBtn.className = "btn btn-success"
    startBtn.textContent = "Start Interval"

    const stopBtn = document.createElement("button")
    stopBtn.className = "btn"
    stopBtn.textContent = "Stop Interval"

    intervalRow.appendChild(intervalInputWrap)
    intervalRow.appendChild(startBtn)
    intervalRow.appendChild(stopBtn)
    actionsWrap.appendChild(intervalRow)

    // run-once row
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
    actionsWrap.appendChild(runRow)

    // helpers
    function setAllBusy(v) {
      [startBtn, stopBtn, runBtn, dryBtn, refreshBtn].forEach(b => { b.disabled = v })
    }

    function loadStatus() {
      apiGet("/api/admin/scheduler/status")
        .then(s => {
          kvWrap.innerHTML = `<table><tbody>
            ${kv("enabled",     String(s.enabled))}
            ${kv("interval_ms", s.interval_ms)}
            ${kv("running",     String(s.running))}
            ${kv("last_run",    s.last_run)}
            ${kv("last_error",  s.last_error)}
          </tbody></table>`
        })
        .catch(e => {
          const msg = String(e && e.message ? e.message : e)
          kvWrap.innerHTML = `<div class="page-err" style="padding:12px">${msg}</div>`
          toast.err(msg)
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

    refreshBtn.addEventListener("click",  loadStatus)
    startBtn.addEventListener("click", () =>
      act(() => apiPost("/api/admin/scheduler/interval/start", { interval_ms: parseInt(intervalInput.value, 10) || 60000 }),
          "Interval started"))
    stopBtn.addEventListener("click", () =>
      act(() => apiPost("/api/admin/scheduler/interval/stop", {}), "Interval stopped"))
    runBtn.addEventListener("click", () =>
      act(() => apiPost("/api/admin/scheduler/run-once", { dry_run: false }), "Run-once dispatched"))
    dryBtn.addEventListener("click", () =>
      act(() => apiPost("/api/admin/scheduler/run-once", { dry_run: true }), "Dry-run completed"))

    loadStatus()
  }
}
