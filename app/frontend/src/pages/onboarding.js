import { apiGet, apiPost, getTenant } from "../api.js"
import { toast } from "../components/toast.js"

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-title">Onboarding</div>
      <div class="page-sub">Tenant: ${getTenant()} — Employer setup &amp; worker onboarding pipeline</div>`

    const tabBar = document.createElement("div")
    tabBar.className = "tab-bar"
    tabBar.style.cssText = "display:flex;gap:4px;margin:16px 0 0"
    const tabs = [
      { key: "employer", label: "🏢 Employer Setup" },
      { key: "summary",  label: "📊 Summary" },
      { key: "workers",  label: "👥 Worker Onboarding" },
    ]
    let activeTab = "employer"
    const body = document.createElement("div")
    body.id = "ob-body"

    function renderTab(key) {
      activeTab = key
      tabBar.querySelectorAll(".tab").forEach(t => {
        t.className = "tab" + (t.dataset.key === key ? " active" : "")
      })
      renderTabBody(body, key)
    }

    tabs.forEach(({ key, label }) => {
      const t = document.createElement("a")
      t.className = "tab" + (key === activeTab ? " active" : "")
      t.href = "#"
      t.textContent = label
      t.dataset.key = key
      t.addEventListener("click", e => { e.preventDefault(); renderTab(key) })
      tabBar.appendChild(t)
    })

    container.appendChild(tabBar)
    container.appendChild(body)
    renderTab("employer")
  }
}

function renderTabBody(body, tab) {
  body.innerHTML = '<div class="page-load">Loading…</div>'
  if (tab === "employer")  renderEmployerTab(body)
  else if (tab === "summary") renderSummaryTab(body)
  else if (tab === "workers") renderWorkersTab(body)
}

// ── Employer Onboarding Tab ──────────────────────────────────────────────────
function renderEmployerTab(body) {
  apiGet("/api/admin/commercial/onboarding/employer")
    .then(data => {
      body.innerHTML = ""
      const card = document.createElement("div")
      card.className = "card"
      card.style.maxWidth = "640px"

      // Step progress
      const stepWrap = document.createElement("div")
      stepWrap.style.cssText = "display:flex;gap:0;margin-bottom:24px;position:relative"
      data.steps.forEach((s, i) => {
        const dot = document.createElement("div")
        dot.style.cssText = `display:flex;flex-direction:column;align-items:center;flex:1;position:relative`
        const circle = document.createElement("div")
        const cls = s.status === "DONE" ? "pass" : s.status === "ACTIVE" ? "gold" : "pending"
        circle.className = `ep-status ${cls}`
        circle.style.cssText = "width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;margin-bottom:6px"
        circle.textContent = s.status === "DONE" ? "✓" : s.step
        const lbl = document.createElement("div")
        lbl.style.cssText = "font-size:11px;color:var(--muted);text-align:center;max-width:80px"
        lbl.textContent = s.label
        dot.appendChild(circle)
        dot.appendChild(lbl)
        stepWrap.appendChild(dot)
      })
      card.appendChild(stepWrap)

      if (data.completed) {
        const done = document.createElement("div")
        done.style.cssText = "text-align:center;padding:20px;color:var(--green);font-size:16px;font-weight:600"
        done.textContent = "✅ Employer onboarding complete"
        card.appendChild(done)
        body.appendChild(card)
        return
      }

      const currentStep = data.steps.find(s => s.status === "ACTIVE") || data.steps[0]
      const formTitle = document.createElement("div")
      formTitle.style.cssText = "font-weight:600;margin-bottom:14px;font-size:15px"
      formTitle.textContent = `Step ${currentStep.step}: ${currentStep.label}`
      card.appendChild(formTitle)

      const stepForms = {
        1: [{ name: "company_name", label: "Company Name", type: "text" }, { name: "cr_number", label: "CR Number", type: "text" }, { name: "industry", label: "Industry", type: "text" }],
        2: [{ name: "trade_license", label: "Trade License Number", type: "text" }, { name: "license_expiry", label: "License Expiry", type: "date" }],
        3: [{ name: "bank_name", label: "Bank Name", type: "text" }, { name: "iban", label: "Company IBAN", type: "text" }],
        4: [{ name: "gosi_number", label: "GOSI Establishment Number", type: "text" }, { name: "gosi_registered_at", label: "Registration Date", type: "date" }],
        5: [{ name: "package_id", label: "Package (starter/growth/enterprise)", type: "text" }],
      }
      const fields = stepForms[currentStep.step] || []
      const form = document.createElement("form")
      form.style.cssText = "display:flex;flex-direction:column;gap:12px"
      fields.forEach(f => {
        const wrap = document.createElement("div")
        wrap.style.cssText = "display:flex;flex-direction:column;gap:4px"
        const lbl = document.createElement("label")
        lbl.style.cssText = "font-size:13px;color:var(--muted)"
        lbl.textContent = f.label
        const input = document.createElement("input")
        input.type = f.type || "text"
        input.name = f.name
        input.className = "form-input"
        input.style.cssText = "background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text);font-size:13px"
        const saved = data.employer_data?.[f.name]
        if (saved) input.value = saved
        wrap.appendChild(lbl)
        wrap.appendChild(input)
        form.appendChild(wrap)
      })

      const btn = document.createElement("button")
      btn.type = "submit"
      btn.className = "btn btn-primary"
      btn.style.cssText = "margin-top:8px;align-self:flex-start"
      btn.textContent = currentStep.step === 5 ? "Activate Package →" : "Next Step →"
      form.appendChild(btn)

      form.addEventListener("submit", async e => {
        e.preventDefault()
        btn.disabled = true
        btn.textContent = "Saving…"
        const step_data = {}
        fields.forEach(f => { step_data[f.name] = form.elements[f.name]?.value })
        try {
          await apiPost("/api/admin/commercial/onboarding/employer/advance", { step_data })
          toast.ok(`Step ${currentStep.step} complete`)
          renderEmployerTab(body)
        } catch (err) {
          toast.err(err.message)
          btn.disabled = false
          btn.textContent = currentStep.step === 5 ? "Activate Package →" : "Next Step →"
        }
      })

      card.appendChild(form)
      body.appendChild(card)
    })
    .catch(e => { body.innerHTML = `<div class="page-err">${e.message}</div>` })
}

// ── Summary Tab ──────────────────────────────────────────────────────────────
function renderSummaryTab(body) {
  apiGet("/api/admin/commercial/onboarding/summary")
    .then(data => {
      body.innerHTML = ""
      const strip = document.createElement("div")
      strip.className = "kpi-strip"
      const { employer_onboarding, worker_summary, readiness } = data
      const kpis = [
        ["Employer Setup",    employer_onboarding.completed ? "COMPLETE" : `Step ${employer_onboarding.step}/5`],
        ["Workers Total",     worker_summary.total],
        ["WPS Ready",         `${worker_summary.wps_ready} (${readiness.wps_ready_pct}%)`],
        ["PDPL Consented",    `${worker_summary.pdpl_consented} (${readiness.pdpl_ready_pct}%)`],
        ["Fully Onboarded",   worker_summary.fully_onboarded],
      ]
      kpis.forEach(([label, val]) => {
        const k = document.createElement("div")
        k.className = "kpi-item"
        k.innerHTML = `<div class="kpi-label">${label}</div><div class="kpi-value">${val}</div>`
        strip.appendChild(k)
      })
      body.appendChild(strip)

      const card = document.createElement("div")
      card.className = "card"
      card.style.marginTop = "20px"
      card.innerHTML = `
        <div class="card-title">📋 Readiness Checklist</div>
        <div class="check-list">
          <div class="check-item">
            <div class="check-icon">🏢</div>
            <div class="check-text">Employer profile &amp; licensing complete</div>
            <div class="check-status ${employer_onboarding.completed ? "pass" : "pending"}">${employer_onboarding.completed ? "DONE" : "PENDING"}</div>
          </div>
          <div class="check-item">
            <div class="check-icon">💳</div>
            <div class="check-text">WPS enrollment ≥ 80% of workforce</div>
            <div class="check-status ${readiness.wps_ready_pct >= 80 ? "pass" : "gold"}">${readiness.wps_ready_pct}%</div>
          </div>
          <div class="check-item">
            <div class="check-icon">🔒</div>
            <div class="check-text">PDPL consent ≥ 80% of workforce</div>
            <div class="check-status ${readiness.pdpl_ready_pct >= 80 ? "pass" : "gold"}">${readiness.pdpl_ready_pct}%</div>
          </div>
          <div class="check-item">
            <div class="check-icon">🪪</div>
            <div class="check-text">Identity tokens issued for all workers</div>
            <div class="check-status ${worker_summary.fully_onboarded === worker_summary.total && worker_summary.total > 0 ? "pass" : "pending"}">${worker_summary.fully_onboarded}/${worker_summary.total}</div>
          </div>
        </div>`
      body.appendChild(card)
    })
    .catch(e => { body.innerHTML = `<div class="page-err">${e.message}</div>` })
}

// ── Workers Tab ──────────────────────────────────────────────────────────────
function renderWorkersTab(body) {
  apiGet("/api/admin/workers")
    .then(data => {
      body.innerHTML = ""
      const workers = data.items || []
      if (workers.length === 0) {
        body.innerHTML = '<div style="padding:20px;color:var(--muted);font-size:13px">No workers found — add workers in Workforce tab first</div>'
        return
      }
      const grid = document.createElement("div")
      grid.className = "cc-grid-2"
      workers.forEach(w => {
        const card = document.createElement("div")
        card.className = "card"
        card.style.cssText = "display:flex;flex-direction:column;gap:8px"
        card.innerHTML = `
          <div style="font-weight:600">${w.name || w.worker_id}</div>
          <div style="font-size:12px;color:var(--muted)">${w.worker_id} · ${w.worker_type || "FTE"}</div>`

        const stepsWrap = document.createElement("div")
        stepsWrap.innerHTML = '<div class="page-load" style="font-size:12px">Loading steps…</div>'
        card.appendChild(stepsWrap)
        grid.appendChild(card)

        apiGet(`/api/admin/commercial/onboarding/worker/${w.worker_id}`)
          .then(ob => {
            stepsWrap.innerHTML = ""
            ob.steps.forEach(s => {
              const row = document.createElement("div")
              row.style.cssText = "display:flex;align-items:center;gap:8px;font-size:12px;padding:3px 0"
              const statusCls = s.status === "DONE" ? "pass" : s.status === "ACTIVE" ? "gold" : "pending"
              row.innerHTML = `<span class="ep-status ${statusCls}" style="min-width:52px;text-align:center">${s.status}</span><span>${s.label}</span>`
              stepsWrap.appendChild(row)
            })
            const health = document.createElement("div")
            health.style.cssText = "margin-top:6px;font-size:12px"
            const done = ob.completed
            health.innerHTML = `<span class="ep-status ${done ? "pass" : "pending"}">${done ? "COMPLETE" : "IN PROGRESS"}</span>`
            stepsWrap.appendChild(health)
          })
          .catch(() => { stepsWrap.innerHTML = '<div style="font-size:12px;color:var(--muted)">Could not load steps</div>' })
      })
      body.appendChild(grid)
    })
    .catch(e => { body.innerHTML = `<div class="page-err">${e.message}</div>` })
}
