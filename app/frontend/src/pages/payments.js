import { apiGet, getTenant } from "../api.js"
import { toast } from "../components/toast.js"

function kpi(label, val, sub, cls) {
  const d = document.createElement("div")
  d.className = "kpi-card " + (cls || "")
  d.innerHTML = `<div class="kpi-label">${label}</div><div class="kpi-value">${val}</div><div class="kpi-sub">${sub}</div>`
  return d
}

function statusBadge(st) {
  const map = {
    ready:        ["verified",  "READY"],
    pending_iban: ["pending",   "PENDING IBAN"],
    processing:   ["warn",      "PROCESSING"],
    paid:         ["pass",      "PAID"],
    held:         ["fail",      "HELD"],
    staged:       ["pending",   "STAGED"],
  }
  const [cls, label] = map[st] || ["pending", st || "UNKNOWN"]
  return `<span class="ep-status ${cls}">${label}</span>`
}

function payRow(rec) {
  const net = (rec.net_salary || 0).toLocaleString()
  const basic = (rec.basic_salary || 0).toLocaleString()
  const d = document.createElement("div")
  d.className = "ep-item"
  d.style.cssText = "flex-direction:column;align-items:flex-start;gap:6px;padding:14px 16px"

  const top = document.createElement("div")
  top.style.cssText = "display:flex;align-items:center;gap:12px;width:100%"
  top.innerHTML = `
    <div style="font-weight:700;font-size:13px;flex:1">${rec.worker_id}</div>
    <div style="font-size:12px;color:var(--muted)">${rec.payment_period || "—"}</div>
    ${statusBadge(rec.wps_status)}`
  d.appendChild(top)

  const detail = document.createElement("div")
  detail.style.cssText = "display:grid;grid-template-columns:repeat(4,1fr);gap:8px;width:100%"
  detail.innerHTML = `
    <div style="font-size:12px"><span style="color:var(--muted)">Basic</span><br><strong>SAR ${basic}</strong></div>
    <div style="font-size:12px"><span style="color:var(--muted)">Net</span><br><strong style="color:var(--green)">SAR ${net}</strong></div>
    <div style="font-size:12px"><span style="color:var(--muted)">IBAN</span><br><strong style="font-family:monospace;font-size:11px">${rec.iban ? rec.iban.slice(0, 12) + "…" : "—"}</strong></div>
    <div style="font-size:12px"><span style="color:var(--muted)">Currency</span><br><strong>${rec.currency || "SAR"}</strong></div>`
  d.appendChild(detail)

  return d
}

function escrowCard() {
  const d = document.createElement("div")
  d.className = "card"
  d.innerHTML = `
    <div class="card-title">🏦 Escrow &amp; Fee Disclosure</div>
    <div style="font-size:13px;color:var(--muted);margin-bottom:14px">
      WorkCaptain escrow model — funds held per assignment cycle, released on milestone completion.
    </div>
    <div class="check-list">
      <div class="check-item">
        <div class="check-icon">🔒</div>
        <div class="check-text">Escrow gateway integration</div>
        <div class="check-status warn">STAGED</div>
      </div>
      <div class="check-item">
        <div class="check-icon">💳</div>
        <div class="check-text">Platform fee: 3% per transaction (disclosed)</div>
        <div class="check-status pass">ACTIVE</div>
      </div>
      <div class="check-item">
        <div class="check-icon">⏱</div>
        <div class="check-text">Release timing: 72h after milestone sign-off</div>
        <div class="check-status pass">CONFIGURED</div>
      </div>
      <div class="check-item">
        <div class="check-icon">⚠️</div>
        <div class="check-text">Dispute / hold workflow</div>
        <div class="check-status warn">STAGED</div>
      </div>
      <div class="check-item">
        <div class="check-icon">📋</div>
        <div class="check-text">Payout audit trail (immutable)</div>
        <div class="check-status pass">ACTIVE</div>
      </div>
      <div class="check-item">
        <div class="check-icon">🏛</div>
        <div class="check-text">SAMA compliance review</div>
        <div class="check-status warn">PENDING</div>
      </div>
    </div>
    <div style="margin-top:16px;font-size:12px;color:var(--muted);background:var(--bg);border-radius:10px;padding:10px 14px">
      <strong>Note:</strong> PSP integration is staged for production. WPS salary records below
      reflect the live KSA-compliant data. Escrow gateway connects in a future sprint.
    </div>`
  return d
}

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-title">Payments &amp; Escrow</div>
      <div class="page-sub">Tenant: ${getTenant()} — WPS salary records · Escrow state · Fee disclosure · Payout visibility</div>`

    const strip = document.createElement("div")
    strip.className = "kpi-strip"
    strip.style.gridTemplateColumns = "repeat(4,1fr)"
    strip.innerHTML = '<div class="page-load" style="grid-column:1/-1">Loading…</div>'
    container.appendChild(strip)

    const grid = document.createElement("div")
    grid.className = "cc-grid-2"
    container.appendChild(grid)

    // Left: WPS salary pack list
    const wpsCard = document.createElement("div")
    wpsCard.className = "card"
    wpsCard.innerHTML = '<div class="card-title">💳 WPS Salary Records</div>'
    const wpsBody = document.createElement("div")
    wpsBody.innerHTML = '<div class="page-load">Loading WPS records…</div>'
    wpsCard.appendChild(wpsBody)

    const wpsBtn = document.createElement("button")
    wpsBtn.className = "btn btn-gold"
    wpsBtn.style.marginTop = "14px"
    wpsBtn.textContent = "Open WPS Builder"
    wpsBtn.addEventListener("click", () => { location.hash = "wps" })
    wpsCard.appendChild(wpsBtn)
    grid.appendChild(wpsCard)

    // Right: escrow / fee card
    grid.appendChild(escrowCard())

    // Payout pipeline card (full width)
    const pipeCard = document.createElement("div")
    pipeCard.className = "card"
    pipeCard.style.marginTop = "16px"
    pipeCard.innerHTML = `
      <div class="card-title">📊 Payout Pipeline</div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:0;border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-top:8px">
        ${["Salary Record Created","IBAN Verified","WPS Pack Ready","Escrow Funded","Payout Released"].map((step, i) => `
          <div style="padding:14px 12px;text-align:center;${i < 4 ? "border-right:1px solid var(--border)" : ""}">
            <div style="font-size:20px">${["📝","🏦","📦","🔒","✅"][i]}</div>
            <div style="font-size:11px;font-weight:600;margin-top:6px">${step}</div>
            <div style="font-size:10px;color:var(--muted);margin-top:4px">${i < 2 ? "ACTIVE" : i < 3 ? "READY" : "STAGED"}</div>
          </div>`).join("")}
      </div>`
    container.appendChild(pipeCard)

    // PSP Readiness Matrix card (full width)
    const pspCard = document.createElement("div")
    pspCard.className = "card"
    pspCard.style.marginTop = "16px"
    pspCard.innerHTML = '<div class="card-title">💳 PSP Readiness</div><div class="page-load">Loading PSP matrix…</div>'
    container.appendChild(pspCard)
    apiGet("/api/admin/commercial/config")
      .then(cfg => {
        pspCard.innerHTML = '<div class="card-title">💳 PSP Readiness Matrix</div>'
        const tbl = document.createElement("table")
        tbl.style.cssText = "width:100%;border-collapse:collapse;font-size:13px"
        tbl.innerHTML = `<thead><tr style="border-bottom:1px solid var(--border)">
          <th style="text-align:left;padding:6px 4px;color:var(--muted)">Provider</th>
          <th style="text-align:left;padding:6px 4px;color:var(--muted)">Region</th>
          <th style="text-align:left;padding:6px 4px;color:var(--muted)">Features</th>
          <th style="text-align:left;padding:6px 4px;color:var(--muted)">State</th>
        </tr></thead>`
        const tbody = document.createElement("tbody")
        const CLS = { STAGED: "gold", READY_FOR_INTEGRATION: "pass", LIVE: "pass", PLANNED: "pending" }
        cfg.psp_matrix.forEach(p => {
          const tr = document.createElement("tr")
          tr.style.borderBottom = "1px solid var(--border)"
          tr.innerHTML = `
            <td style="padding:7px 4px;font-weight:600">${p.provider}</td>
            <td style="padding:7px 4px;color:var(--muted)">${p.region}</td>
            <td style="padding:7px 4px;color:var(--muted)">${p.features.join(", ")}</td>
            <td style="padding:7px 4px"><span class="ep-status ${CLS[p.state] || "pending"}">${p.state}</span></td>`
          tbody.appendChild(tr)
        })
        tbl.appendChild(tbody)
        pspCard.appendChild(tbl)
        const note = document.createElement("div")
        note.style.cssText = "margin-top:12px;font-size:12px;color:var(--muted)"
        note.textContent = "SAMA licensing PENDING — no provider transitions to LIVE without regulatory proof."
        pspCard.appendChild(note)
      })
      .catch(() => { pspCard.innerHTML = '<div class="card-title">💳 PSP Readiness Matrix</div><div style="font-size:13px;color:var(--muted)">Unavailable</div>' })

    apiGet("/api/admin/wps/salary-pack")
      .then(data => {
        const items = data.items || []
        const ready = items.filter(s => s.wps_status === "ready").length
        const pending = items.length - ready
        const totalNet = items.reduce((s, r) => s + (r.net_salary || 0), 0)

        strip.innerHTML = ""
        strip.appendChild(kpi("Salary Records",   items.length, "total WPS records",          "gold"))
        strip.appendChild(kpi("Ready for Payout", ready,        "IBAN verified",               "green"))
        strip.appendChild(kpi("Pending IBAN",     pending,      "need verification",           pending > 0 ? "amber" : ""))
        strip.appendChild(kpi("Total Net (SAR)",  totalNet.toLocaleString(), "this pay period", ""))

        wpsBody.innerHTML = ""
        if (items.length === 0) {
          wpsBody.innerHTML = '<div style="font-size:13px;color:var(--muted)">No WPS records — open WPS Builder to add salary data</div>'
        } else {
          items.forEach(r => wpsBody.appendChild(payRow(r)))
        }
      })
      .catch(e => {
        strip.innerHTML = `<div class="page-err" style="grid-column:1/-1">${e.message}</div>`
        wpsBody.innerHTML = `<div class="page-err">${e.message}</div>`
        toast.err(e.message)
      })

    // ── S33: Payment Execution + Reconciliation ──────────────────────────────────
    const execCard = document.createElement("div")
    execCard.className = "card"
    execCard.style.marginTop = "16px"
    execCard.innerHTML = '<div class="card-title">🚀 Payment Execution Path</div><div class="page-load">Loading execution state…</div>'
    container.appendChild(execCard)

    const reconCard = document.createElement("div")
    reconCard.className = "card"
    reconCard.style.marginTop = "16px"
    reconCard.innerHTML = '<div class="card-title">🔁 Reconciliation &amp; Failure Handling</div><div class="page-load">Loading reconciliation…</div>'
    container.appendChild(reconCard)

    apiGet("/api/admin/payments/execution")
      .then(exec => {
        execCard.innerHTML = '<div class="card-title">🚀 Payment Execution Path</div>'

        // Execution path steps
        const steps = document.createElement("div")
        steps.style.cssText = "display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px"
        exec.execution_path.forEach(s => {
          const cell = document.createElement("div")
          const cls = s.state === "LIVE" ? "pass" : s.state === "STAGED" ? "gold" : "pending"
          cell.style.cssText = "background:var(--bg);border-radius:8px;padding:10px;text-align:center"
          cell.innerHTML = `
            <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Step ${s.step}</div>
            <div style="font-size:12px;font-weight:600;margin-bottom:6px">${s.label}</div>
            <span class="ep-status ${cls}">${s.state}</span>
            <div style="font-size:11px;color:var(--muted);margin-top:4px">${s.detail}</div>`
          steps.appendChild(cell)
        })
        execCard.appendChild(steps)

        // Webhook path
        const wh = exec.webhook_path
        const whCard = document.createElement("div")
        whCard.style.cssText = "background:var(--bg);border-radius:8px;padding:12px 14px;font-size:13px"
        whCard.innerHTML = `
          <div style="font-weight:600;margin-bottom:8px">🔗 Webhook / Event Path <span class="ep-status gold">STAGED</span></div>
          <div style="color:var(--muted);font-size:12px;line-height:1.6">
            <div>Endpoint: <code>${wh.endpoint}</code></div>
            <div>Idempotency: <code>${wh.idempotency_key}</code></div>
            <div>Retry: ${wh.retry_policy}</div>
            <div>Events: ${wh.event_types.join(" · ")}</div>
          </div>`
        execCard.appendChild(whCard)

        // Simulate webhook
        const simWrap = document.createElement("div")
        simWrap.style.cssText = "margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"
        const eventSel = document.createElement("select")
        eventSel.style.cssText = "background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:6px 8px;color:var(--text);font-size:12px"
        wh.event_types.forEach(ev => {
          const opt = document.createElement("option"); opt.value = ev; opt.textContent = ev
          eventSel.appendChild(opt)
        })
        const simBtn = document.createElement("button")
        simBtn.className = "btn btn-gold"
        simBtn.style.cssText = "font-size:12px;padding:6px 12px"
        simBtn.textContent = "⚡ Simulate Webhook (Dev Only)"
        simBtn.addEventListener("click", async () => {
          simBtn.disabled = true; simBtn.textContent = "Simulating…"
          try {
            const resp = await fetch("/api/admin/payments/webhook/simulate", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + (localStorage.getItem("pw_token") || ""),
                "x-tenant-id": localStorage.getItem("pw_tenant") || "default",
              },
              body: JSON.stringify({ event_type: eventSel.value, worker_id: "w-sim-001", amount: 5000 }),
            })
            const result = await resp.json()
            if (result.ok) toast.ok("Webhook simulated: " + result.data?.entry?.id)
            else toast.err(result.error?.message || "Simulation failed")
          } catch (err) { toast.err(err.message) }
          finally { simBtn.disabled = false; simBtn.textContent = "⚡ Simulate Webhook (Dev Only)" }
        })
        simWrap.appendChild(eventSel)
        simWrap.appendChild(simBtn)
        execCard.appendChild(simWrap)
      })
      .catch(() => { execCard.innerHTML = '<div class="card-title">🚀 Payment Execution Path</div><div style="font-size:13px;color:var(--muted)">Unavailable</div>' })

    apiGet("/api/admin/payments/reconciliation")
      .then(recon => {
        reconCard.innerHTML = '<div class="card-title">🔁 Reconciliation &amp; Failure Handling</div>'
        const ls = recon.ledger_summary
        const reconStrip = document.createElement("div")
        reconStrip.style.cssText = "display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px"
        ;[
          ["Ledger Entries", ls.total_entries],
          ["Total Payable",  `SAR ${(ls.total_payable || 0).toLocaleString()}`],
          ["Total Settled",  `SAR ${(ls.total_settled || 0).toLocaleString()}`],
          ["Outstanding",    `SAR ${(ls.outstanding || 0).toLocaleString()}`],
        ].forEach(([label, val]) => {
          const cell = document.createElement("div")
          cell.style.cssText = "background:var(--bg);border-radius:8px;padding:10px;text-align:center"
          cell.innerHTML = `<div style="font-size:11px;color:var(--muted)">${label}</div><div style="font-weight:600;font-size:14px;margin-top:4px">${val}</div>`
          reconStrip.appendChild(cell)
        })
        reconCard.appendChild(reconStrip)

        // Dispute + failure posture
        const dh = recon.dispute_handling
        const posture = document.createElement("div")
        posture.style.cssText = "font-size:13px;display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px"
        ;[
          ["Dispute Handling", dh.state],
          ["Resolution SLA",   dh.resolution_sla],
          ["Audit Trail",      dh.audit_trail],
          ["Failure Retry",    recon.failure_handling.state],
        ].forEach(([label, val]) => {
          const chip = document.createElement("div")
          chip.style.cssText = "background:var(--bg);border-radius:6px;padding:4px 10px;font-size:12px"
          chip.innerHTML = `<span style="color:var(--muted)">${label}: </span><span class="ep-status ${val === "LIVE" ? "pass" : val === "STAGED" ? "gold" : "pending"}">${val}</span>`
          posture.appendChild(chip)
        })
        reconCard.appendChild(posture)

        // Recent ledger
        if (recon.recent_ledger && recon.recent_ledger.length > 0) {
          const heading = document.createElement("div")
          heading.style.cssText = "font-size:12px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px"
          heading.textContent = "Recent Payment Ledger"
          reconCard.appendChild(heading)
          recon.recent_ledger.forEach(entry => {
            const row = document.createElement("div")
            row.style.cssText = "display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;align-items:center"
            const SC = { settled: "pass", failed: "fail", disputed: "warn", refunded: "pending" }
            row.innerHTML = `
              <span class="ep-status ${SC[entry.status] || "pending"}" style="min-width:60px;text-align:center">${entry.status}</span>
              <span style="font-family:monospace;color:var(--muted)">${entry.id}</span>
              <span style="flex:1;color:var(--muted)">${entry.event_type}</span>
              <span style="color:var(--text)">SAR ${(entry.amount || 0).toLocaleString()}</span>
              <span style="color:var(--muted)">${entry.ts ? new Date(entry.ts).toLocaleTimeString() : ""}</span>`
            reconCard.appendChild(row)
          })
        } else {
          const empty = document.createElement("div")
          empty.style.cssText = "font-size:13px;color:var(--muted)"
          empty.textContent = "No ledger entries yet — use Simulate Webhook above to create test entries"
          reconCard.appendChild(empty)
        }
      })
      .catch(() => { reconCard.innerHTML = '<div class="card-title">🔁 Reconciliation</div><div style="font-size:13px;color:var(--muted)">Unavailable</div>' })
  }
}
