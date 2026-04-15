import { apiGet, getTenant } from "../api.js"
import { toast } from "../components/toast.js"

const PSP_STATE_CLASS = { STAGED: "gold", READY_FOR_INTEGRATION: "pass", LIVE: "pass", PLANNED: "pending" }
const PSP_STATE_LABEL = { STAGED: "STAGED", READY_FOR_INTEGRATION: "READY", LIVE: "LIVE", PLANNED: "PLANNED" }

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-title">Revenue Activation</div>
      <div class="page-sub">Tenant: ${getTenant()} — Commercial packages, PSP readiness, and activation pipeline</div>
      <div class="page-load" id="rev-loading">Loading…</div>`

    apiGet("/api/admin/commercial/config")
      .then(cfg => {
        document.getElementById("rev-loading")?.remove()
        renderRevenue(container, cfg)
      })
      .catch(e => {
        container.innerHTML += `<div class="page-err">${e.message}</div>`
      })
  }
}

function renderRevenue(container, cfg) {
  // ── Commercial Readiness Strip ───────────────────────────────────────────────
  const strip = document.createElement("div")
  strip.className = "kpi-strip"
  const stripItems = [
    ["Commercial", cfg.commercial_readiness],
    ["WPS Integration", cfg.wps_integration_state],
    ["SAMA Licensing", cfg.sama_licensing_state],
    ["PSP Active", cfg.psp_matrix.filter(p => p.state === "STAGED" || p.state === "LIVE").length + " providers"],
  ]
  stripItems.forEach(([label, val]) => {
    const k = document.createElement("div")
    k.className = "kpi-item"
    k.innerHTML = `<div class="kpi-label">${label}</div><div class="kpi-value">${val}</div>`
    strip.appendChild(k)
  })
  container.appendChild(strip)

  // ── Pricing Packages ─────────────────────────────────────────────────────────
  const grid = document.createElement("div")
  grid.className = "cc-grid-3"
  grid.style.marginTop = "20px"
  cfg.packages.forEach(pkg => {
    const card = document.createElement("div")
    card.className = "card"
    card.style.cssText = "display:flex;flex-direction:column;gap:10px"
    const priceStr = pkg.price_sar ? `SAR ${pkg.price_sar.toLocaleString()} / mo` : "Custom Pricing"
    const capStr   = pkg.workers_cap ? `Up to ${pkg.workers_cap} workers` : "Unlimited workers"
    card.innerHTML = `
      <div class="card-title" style="font-size:18px">${pkg.name}</div>
      <div style="font-size:26px;font-weight:700;color:var(--gold)">${priceStr}</div>
      <div style="font-size:13px;color:var(--muted)">${capStr}</div>
      <div style="font-size:13px;color:var(--text);line-height:1.5">${pkg.description}</div>
      <button class="btn btn-gold" style="margin-top:auto" data-pkg="${pkg.id}">
        ${pkg.id === "enterprise" ? "Contact Sales" : "Activate " + pkg.name}
      </button>`
    card.querySelector("button").addEventListener("click", () => {
      if (pkg.id === "enterprise") {
        toast.ok("Enterprise inquiry noted — sales team will contact you")
      } else {
        toast.ok(`${pkg.name} package activation initiated (STAGED — pending SAMA)`)
      }
    })
    grid.appendChild(card)
  })
  container.appendChild(grid)

  // ── PSP Readiness Matrix ─────────────────────────────────────────────────────
  const pspCard = document.createElement("div")
  pspCard.className = "card"
  pspCard.style.marginTop = "20px"
  pspCard.innerHTML = `
    <div class="card-title">💳 PSP Readiness Matrix</div>
    <div style="font-size:13px;color:var(--muted);margin-bottom:14px">
      Payment Service Providers — integration state and regional coverage. No provider goes LIVE without regulatory proof.
    </div>`
  const table = document.createElement("table")
  table.style.cssText = "width:100%;border-collapse:collapse;font-size:13px"
  table.innerHTML = `<thead>
    <tr style="border-bottom:1px solid var(--border)">
      <th style="text-align:left;padding:8px 4px;color:var(--muted)">Provider</th>
      <th style="text-align:left;padding:8px 4px;color:var(--muted)">Region</th>
      <th style="text-align:left;padding:8px 4px;color:var(--muted)">Features</th>
      <th style="text-align:left;padding:8px 4px;color:var(--muted)">State</th>
    </tr>
  </thead>`
  const tbody = document.createElement("tbody")
  cfg.psp_matrix.forEach(p => {
    const tr = document.createElement("tr")
    tr.style.borderBottom = "1px solid var(--border)"
    tr.innerHTML = `
      <td style="padding:8px 4px;font-weight:600">${p.provider}</td>
      <td style="padding:8px 4px;color:var(--muted)">${p.region}</td>
      <td style="padding:8px 4px;color:var(--muted)">${p.features.join(", ")}</td>
      <td style="padding:8px 4px"><span class="ep-status ${PSP_STATE_CLASS[p.state] || "pending"}">${PSP_STATE_LABEL[p.state] || p.state}</span></td>`
    tbody.appendChild(tr)
  })
  table.appendChild(tbody)
  pspCard.appendChild(table)
  container.appendChild(pspCard)

  // ── Activation Pipeline ──────────────────────────────────────────────────────
  const pipeCard = document.createElement("div")
  pipeCard.className = "card"
  pipeCard.style.marginTop = "20px"
  pipeCard.innerHTML = `<div class="card-title">🚀 Activation Pipeline</div>`
  const steps = [
    { label: "PSP STAGED",           desc: "Stripe, Tap, HyperPay credentials obtained and test mode active",     status: "pass" },
    { label: "Employer Onboarding",  desc: "Company profile, CR, bank IBAN, GOSI enrollment, package selection",  status: "gold" },
    { label: "Worker Onboarding",    desc: "Identity, PDPL consent, WPS enrollment, identity token issuance",      status: "gold" },
    { label: "SAMA Pre-approval",    desc: "Payment facilitation license application submitted",                    status: "pending" },
    { label: "WPS Integration",      desc: "Live salary disbursement through SAMA-approved channel",               status: "pending" },
    { label: "GO LIVE",              desc: "Full commercial activation — all proofs verified",                     status: "pending" },
  ]
  const pipeList = document.createElement("div")
  pipeList.className = "check-list"
  steps.forEach(s => {
    const row = document.createElement("div")
    row.className = "check-item"
    row.innerHTML = `
      <div class="check-icon">${s.status === "pass" ? "✅" : s.status === "gold" ? "🔄" : "⏳"}</div>
      <div class="check-text"><strong>${s.label}</strong><br><span style="font-size:12px;color:var(--muted)">${s.desc}</span></div>
      <div class="check-status ${s.status}">${s.status === "pass" ? "DONE" : s.status === "gold" ? "IN PROGRESS" : "PENDING"}</div>`
    pipeList.appendChild(row)
  })
  pipeCard.appendChild(pipeList)
  container.appendChild(pipeCard)
}
