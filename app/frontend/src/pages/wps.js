import { apiGet } from "../api.js"
import { toast } from "../components/toast.js"

function salaryForm(worker, existing, onSave) {
  const d = document.createElement("div")
  d.className = "card"
  d.style.marginBottom = "12px"
  const sal = existing || {}
  d.innerHTML = `
    <div class="card-title" style="display:flex;justify-content:space-between">
      <span>${worker.name}</span>
      <span class="ep-status ${sal.wps_status === "ready" ? "verified" : "pending"}">${sal.wps_status || "PENDING"}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)">
        IBAN
        <input class="f-iban" type="text" placeholder="SA00 0000 0000 0000 0000 0000"
          value="${sal.iban || worker.iban || ""}"
          style="padding:8px 10px;border:1px solid var(--border);border-radius:10px;font-size:13px">
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)">
        Basic Salary (SAR)
        <input class="f-basic" type="number" placeholder="0"
          value="${sal.basic_salary || ""}"
          style="padding:8px 10px;border:1px solid var(--border);border-radius:10px;font-size:13px">
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)">
        Housing Allowance (SAR)
        <input class="f-housing" type="number" placeholder="0"
          value="${sal.allowances?.find(a=>a.type==="housing")?.amount || ""}"
          style="padding:8px 10px;border:1px solid var(--border);border-radius:10px;font-size:13px">
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)">
        Transport Allowance (SAR)
        <input class="f-transport" type="number" placeholder="0"
          value="${sal.allowances?.find(a=>a.type==="transport")?.amount || ""}"
          style="padding:8px 10px;border:1px solid var(--border);border-radius:10px;font-size:13px">
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)">
        GOSI Deduction (SAR)
        <input class="f-gosi" type="number" placeholder="0"
          value="${sal.deductions?.find(d=>d.type==="gosi")?.amount || ""}"
          style="padding:8px 10px;border:1px solid var(--border);border-radius:10px;font-size:13px">
      </label>
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--muted)">
        Payment Period (YYYY-MM)
        <input class="f-period" type="text" placeholder="${new Date().toISOString().slice(0,7)}"
          value="${sal.payment_period || new Date().toISOString().slice(0,7)}"
          style="padding:8px 10px;border:1px solid var(--border);border-radius:10px;font-size:13px">
      </label>
    </div>
    <div class="f-net" style="font-size:13px;color:var(--muted);margin-bottom:12px">Net salary: —</div>
    <button class="btn btn-gold f-save">Save WPS Record</button>`

  // Live net calc
  const inputs = d.querySelectorAll("input")
  const netEl  = d.querySelector(".f-net")
  function calcNet() {
    const basic    = parseFloat(d.querySelector(".f-basic").value)    || 0
    const housing  = parseFloat(d.querySelector(".f-housing").value)  || 0
    const transport= parseFloat(d.querySelector(".f-transport").value)|| 0
    const gosi     = parseFloat(d.querySelector(".f-gosi").value)     || 0
    const net      = basic + housing + transport - gosi
    netEl.textContent = `Net salary: SAR ${net.toLocaleString()}`
    netEl.style.color = net > 0 ? "var(--green)" : "var(--muted)"
  }
  inputs.forEach(i => i.addEventListener("input", calcNet))
  calcNet()

  d.querySelector(".f-save").addEventListener("click", () => {
    const payload = {
      worker_id:      worker.id,
      iban:           d.querySelector(".f-iban").value.trim(),
      basic_salary:   parseFloat(d.querySelector(".f-basic").value)    || 0,
      payment_period: d.querySelector(".f-period").value.trim(),
      allowances: [
        { type: "housing",   label: "Housing Allowance",   amount: parseFloat(d.querySelector(".f-housing").value)  || 0 },
        { type: "transport", label: "Transport Allowance", amount: parseFloat(d.querySelector(".f-transport").value) || 0 },
      ].filter(a => a.amount > 0),
      deductions: [
        { type: "gosi", label: "GOSI Contribution", amount: parseFloat(d.querySelector(".f-gosi").value) || 0 },
      ].filter(x => x.amount > 0),
    }
    onSave(worker, payload)
  })
  return d
}

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-title">WPS Salary Pack Builder</div>
      <div class="page-sub">Wage Protection System — build and validate KSA-compliant salary records</div>`

    // Summary strip
    const summary = document.createElement("div")
    summary.className = "kpi-strip"
    summary.style.gridTemplateColumns = "repeat(3,1fr)"
    container.appendChild(summary)

    const formsWrap = document.createElement("div")
    container.appendChild(formsWrap)

    async function save(worker, payload) {
      try {
        const token  = localStorage.getItem("pw_token") || ""
        const tenant = localStorage.getItem("pw_tenant") || "default"
        const res = await fetch("/api/admin/wps/salary-pack", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token, "x-tenant-id": tenant },
          body: JSON.stringify(payload)
        })
        if (!res.ok) throw new Error((await res.json()).error || "Failed")
        toast.ok(`WPS record saved: ${worker.name}`)
        load()
      } catch(e) { toast.err(e.message) }
    }

    function load() {
      Promise.all([
        apiGet("/api/admin/workers"),
        apiGet("/api/admin/wps/salary-pack"),
      ]).then(([workersData, wpsData]) => {
        const workers  = (workersData.workers || workersData.items || []).filter(w => w.worker_type === "FTE")
        const salaries = wpsData.items || []
        const salMap   = {}
        salaries.forEach(s => { salMap[s.worker_id] = s })

        const ready   = salaries.filter(s => s.wps_status === "ready").length
        const pending = workers.length - ready

        summary.innerHTML = ""
        const kpi = (label, val, sub, cls) => {
          const c = document.createElement("div")
          c.className = "kpi-card " + (cls||"")
          c.innerHTML = `<div class="kpi-label">${label}</div><div class="kpi-value">${val}</div><div class="kpi-sub">${sub}</div>`
          return c
        }
        summary.appendChild(kpi("FTE Workers",    workers.length, "requiring WPS records",  ""))
        summary.appendChild(kpi("WPS Ready",      ready,          "IBAN verified + salary",  "green"))
        summary.appendChild(kpi("Pending",        pending,        "records incomplete",       pending > 0 ? "amber" : ""))

        formsWrap.innerHTML = ""
        if (workers.length === 0) {
          formsWrap.innerHTML = '<div style="font-size:13px;color:var(--muted);padding:20px 0">No FTE workers found</div>'
          return
        }
        workers.forEach(w => formsWrap.appendChild(salaryForm(w, salMap[w.id], save)))
      }).catch(e => {
        formsWrap.innerHTML = `<div class="page-err">${e.message}</div>`
      })
    }
    load()
  }
}
