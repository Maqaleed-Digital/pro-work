// S43-G6: Offer Builder — three-path decision UI
import { apiGet, apiPost, apiPatch } from "../api.js"
import { t } from "../locale.js"

let _applicationId = null
let _application = null
let _offerId = null
let _offerType = null
let _complianceResult = null

function renderFresh(el) {
  _applicationId = null; _application = null; _offerId = null; _offerType = null; _complianceResult = null
  const hashParams = new URLSearchParams(location.hash.replace(/^#[^?]*\??/, ""))
  _applicationId = hashParams.get("application")
  render(el)
}

async function render(el) {
  el.innerHTML = ""
  const content = document.createElement("div")
  content.className = "content-area"

  const header = document.createElement("div")
  header.className = "page-header"
  const hText = document.createElement("div")
  hText.className = "page-header-text"
  const h1 = document.createElement("h1")
  h1.textContent = t("offer.pageTitle")
  const sub = document.createElement("p")
  sub.textContent = t("offer.pageSubtitle")
  hText.appendChild(h1)
  hText.appendChild(sub)
  header.appendChild(hText)
  content.appendChild(header)

  if (!_applicationId) {
    content.appendChild(emptyState("Select a candidate from the pipeline"))
    el.appendChild(content)
    return
  }

  // Path selector
  const pathRow = document.createElement("div")
  pathRow.className = "quick-actions"
  pathRow.style.cssText = "margin-bottom:var(--space-3)"
  const paths = [
    { key: "FTE", label: t("offer.pathFTE") },
    { key: "FREELANCER", label: t("offer.pathFreelancer") },
    { key: "AI_EXECUTABLE", label: t("offer.pathAI") },
  ]
  paths.forEach(p => {
    const btn = document.createElement("button")
    btn.className = "quick-action-btn" + (_offerType === p.key ? " active" : "")
    btn.style.cssText += _offerType === p.key ? ";border-color:var(--color-accent);color:var(--color-accent);font-weight:600" : ""
    btn.textContent = p.label
    btn.addEventListener("click", () => { _offerType = p.key; _complianceResult = null; render(el) })
    pathRow.appendChild(btn)
  })
  content.appendChild(pathRow)

  if (!_offerType) {
    content.appendChild(emptyState(t("offer.selectPath")))
    el.appendChild(content)
    return
  }

  const formCard = document.createElement("div")
  formCard.className = "wc-card"
  formCard.style.cssText = "margin-bottom:var(--space-2)"

  if (_offerType === "FTE") renderFTEPath(formCard)
  else if (_offerType === "FREELANCER") renderFreelancerPath(formCard)
  else if (_offerType === "AI_EXECUTABLE") renderAIPath(formCard)

  content.appendChild(formCard)

  // Compliance preview section
  const compCard = document.createElement("div")
  compCard.className = "wc-card"
  compCard.style.cssText = "margin-bottom:var(--space-2)"
  renderComplianceSection(compCard, content, el)
  content.appendChild(compCard)

  el.appendChild(content)
}

// ── Path A: FTE ─────────────────────────────────────────────────────────────

function renderFTEPath(card) {
  card.innerHTML = ""
  const title = document.createElement("h3")
  title.textContent = t("offer.pathFTE")
  title.style.cssText = "margin-bottom:var(--space-2)"
  card.appendChild(title)

  const salaryField = field("offer-salary", t("offer.baseSalary"), "number")
  card.appendChild(salaryField.group)

  // Allowances
  const allowLabel = document.createElement("label")
  allowLabel.textContent = t("offer.allowances")
  allowLabel.style.cssText = "display:block;font-size:var(--text-sm);font-weight:500;color:var(--color-text-secondary);margin-bottom:6px"
  card.appendChild(allowLabel)
  const allowances = ["housing", "transport", "food", "communication"]
  allowances.forEach(a => {
    const wrap = document.createElement("label")
    wrap.style.cssText = "display:flex;align-items:center;gap:6px;font-size:var(--text-sm);cursor:pointer;margin-bottom:4px"
    const cb = document.createElement("input")
    cb.type = "checkbox"
    cb.id = "allow-" + a
    wrap.appendChild(cb)
    wrap.appendChild(document.createTextNode(t("offer." + a)))
    card.appendChild(wrap)
  })

  // GOSI estimate
  const gosiEl = document.createElement("div")
  gosiEl.style.cssText = "margin-top:var(--space-2);padding:var(--space-2);background:var(--color-surface);border-radius:var(--radius-md)"
  gosiEl.innerHTML = `<div style="font-size:var(--text-xs);color:var(--color-text-muted)">${t("offer.gosiEstimate")}</div>
    <div id="offer-gosi" style="font-family:var(--font-display);font-size:var(--text-xl);font-weight:700">—</div>
    <div style="font-size:var(--text-xs);color:var(--color-text-muted);margin-top:4px">${t("offer.totalCost")}: <span id="offer-total" style="font-weight:600">—</span></div>`
  card.appendChild(gosiEl)

  salaryField.input.addEventListener("input", () => {
    const sal = parseFloat(salaryField.input.value) || 0
    const gosi = Math.round(sal * 0.1175)
    document.getElementById("offer-gosi").textContent = gosi > 0 ? gosi.toLocaleString() + " SAR" : "—"
    document.getElementById("offer-total").textContent = sal > 0 ? (sal + gosi).toLocaleString() + " SAR" : "—"
  })

  // Qiwa badge
  const qiwa = document.createElement("div")
  qiwa.style.cssText = "margin-top:var(--space-2);font-size:var(--text-sm);color:var(--color-text-muted)"
  qiwa.textContent = t("offer.qiwaBadge") + ": 60%"
  card.appendChild(qiwa)

  // Probation
  const probField = field("offer-probation", t("offer.probation"), "number")
  probField.input.value = "90"
  probField.input.min = "0"
  probField.input.max = "180"
  card.appendChild(probField.group)

  // Notice period
  const noticeField = field("offer-notice", t("offer.noticePeriod"), "number")
  noticeField.input.value = "30"
  card.appendChild(noticeField.group)
}

// ── Path B: FREELANCER ──────────────────────────────────────────────────────

function renderFreelancerPath(card) {
  card.innerHTML = ""

  // 0% COMMISSION BADGE — structural, non-dismissible, non-collapsible
  const badge = document.createElement("div")
  badge.className = "commission-badge"
  badge.style.cssText = "background:rgba(196,146,42,0.1);border:2px solid var(--color-accent);border-radius:var(--radius-lg);padding:var(--space-2);margin-bottom:var(--space-3);text-align:center"
  const badgeIcon = document.createElement("div")
  badgeIcon.style.cssText = "font-size:var(--text-2xl);margin-bottom:var(--space-0)"
  badgeIcon.textContent = "\u{1F4B0}"
  badge.appendChild(badgeIcon)
  const badgeText = document.createElement("div")
  badgeText.style.cssText = "font-size:var(--text-base);font-weight:700;color:var(--color-accent)"
  badgeText.textContent = t("offer.commissionBadge")
  badge.appendChild(badgeText)
  card.appendChild(badge)

  const title = document.createElement("h3")
  title.textContent = t("offer.pathFreelancer")
  title.style.cssText = "margin-bottom:var(--space-2)"
  card.appendChild(title)

  // Milestones
  const msLabel = document.createElement("label")
  msLabel.textContent = t("offer.milestones")
  msLabel.style.cssText = "display:block;font-size:var(--text-sm);font-weight:500;margin-bottom:6px"
  card.appendChild(msLabel)

  const msContainer = document.createElement("div")
  msContainer.id = "milestones-container"
  card.appendChild(msContainer)

  addMilestoneRow(msContainer)

  const addBtn = document.createElement("button")
  addBtn.className = "btn btn-secondary btn-sm"
  addBtn.textContent = t("offer.addMilestone")
  addBtn.style.cssText = "margin-top:var(--space-1)"
  addBtn.addEventListener("click", () => addMilestoneRow(msContainer))
  card.appendChild(addBtn)

  // Escrow terms
  const escrowField = field("offer-escrow", t("offer.escrowTerms"), "text")
  escrowField.group.style.cssText += ";margin-top:var(--space-2)"
  card.appendChild(escrowField.group)

  // Fee breakdown
  const feeCard = document.createElement("div")
  feeCard.style.cssText = "margin-top:var(--space-2);padding:var(--space-2);background:var(--color-surface);border-radius:var(--radius-md)"
  feeCard.innerHTML = `<div style="font-size:var(--text-sm);font-weight:600;margin-bottom:var(--space-0)">${t("offer.platformFee")}</div>
    <div style="font-size:var(--text-xs);color:var(--color-text-muted)">5% employer-side platform fee</div>
    <div style="font-size:var(--text-sm);font-weight:700;margin-top:var(--space-1)">${t("offer.totalClientPays")}: <span id="total-client-pays">—</span></div>`
  card.appendChild(feeCard)
}

function addMilestoneRow(container) {
  const row = document.createElement("div")
  row.style.cssText = "display:flex;gap:var(--space-1);margin-bottom:var(--space-0)"
  const nameInput = document.createElement("input")
  nameInput.type = "text"
  nameInput.placeholder = t("offer.milestoneName")
  nameInput.style.cssText = "flex:2;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);font-size:var(--text-sm)"
  const amtInput = document.createElement("input")
  amtInput.type = "number"
  amtInput.placeholder = t("offer.milestoneAmount")
  amtInput.style.cssText = "flex:1;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);font-size:var(--text-sm)"
  row.appendChild(nameInput)
  row.appendChild(amtInput)
  container.appendChild(row)
}

// ── Path C: AI_EXECUTABLE ───────────────────────────────────────────────────

function renderAIPath(card) {
  card.innerHTML = ""
  const title = document.createElement("h3")
  title.textContent = t("offer.pathAI")
  title.style.cssText = "margin-bottom:var(--space-2)"
  card.appendChild(title)

  // Delivery window
  const startField = field("offer-start", t("offer.startDate"), "date")
  card.appendChild(startField.group)
  const endField = field("offer-end", t("offer.endDate"), "date")
  card.appendChild(endField.group)

  // Window type
  const wtGroup = document.createElement("div")
  wtGroup.className = "field-group"
  const wtLabel = document.createElement("label")
  wtLabel.textContent = t("offer.windowType")
  wtGroup.appendChild(wtLabel)
  const wtSelect = document.createElement("select")
  wtSelect.style.cssText = "width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);font-size:var(--text-sm)"
  ;[
    { value: "recurring_daily", label: t("offer.recurring") },
    { value: "weekly_milestones", label: t("offer.weeklyMilestones") },
    { value: "single", label: t("offer.single") },
  ].forEach(o => {
    const opt = document.createElement("option")
    opt.value = o.value
    opt.textContent = o.label
    wtSelect.appendChild(opt)
  })
  wtGroup.appendChild(wtSelect)
  card.appendChild(wtGroup)

  // Outcome criteria
  const ocLabel = document.createElement("label")
  ocLabel.textContent = t("offer.outcomeCriteria")
  ocLabel.style.cssText = "display:block;font-size:var(--text-sm);font-weight:500;margin-bottom:6px;margin-top:var(--space-2)"
  card.appendChild(ocLabel)

  const ocContainer = document.createElement("div")
  ocContainer.id = "criteria-container"
  const ocInput = document.createElement("input")
  ocInput.type = "text"
  ocInput.placeholder = t("offer.addCriterion")
  ocInput.style.cssText = "width:100%;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-md);font-size:var(--text-sm);margin-bottom:var(--space-0)"
  ocInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && ocInput.value.trim()) {
      e.preventDefault()
      const item = document.createElement("div")
      item.className = "badge badge-info"
      item.style.cssText = "margin-bottom:4px;cursor:pointer"
      item.textContent = ocInput.value.trim() + " \u00d7"
      item.addEventListener("click", () => item.remove())
      ocContainer.appendChild(item)
      ocInput.value = ""
    }
  })
  card.appendChild(ocInput)
  card.appendChild(ocContainer)

  // Model binding
  const modelField = field("offer-model", t("offer.modelVersion"), "text")
  card.appendChild(modelField.group)
  const capField = field("offer-caps", t("offer.capabilities"), "text")
  card.appendChild(capField.group)
  const escField = field("offer-escalation", t("offer.escalationThreshold"), "number")
  escField.input.value = "15"
  escField.input.min = "0"
  escField.input.max = "100"
  card.appendChild(escField.group)

  // Audit statement
  const audit = document.createElement("div")
  audit.style.cssText = "margin-top:var(--space-2);padding:var(--space-2);background:rgba(37,99,235,0.05);border:1px solid var(--color-info);border-radius:var(--radius-md);font-size:var(--text-sm);color:var(--color-info)"
  audit.textContent = t("offer.auditStatement")
  card.appendChild(audit)
}

// ── Compliance preview ──────────────────────────────────────────────────────

function renderComplianceSection(card, content, el) {
  card.innerHTML = ""
  const title = document.createElement("h3")
  title.textContent = t("offer.compliancePreview")
  title.style.cssText = "margin-bottom:var(--space-2)"
  card.appendChild(title)

  const checksEl = document.createElement("div")
  checksEl.id = "compliance-checks"

  if (_complianceResult) {
    const checks = _complianceResult.checks || {}
    Object.entries(checks).forEach(([key, check]) => {
      const row = document.createElement("div")
      row.style.cssText = "display:flex;align-items:center;gap:var(--space-1);margin-bottom:var(--space-0);font-size:var(--text-sm)"
      const dot = document.createElement("span")
      dot.style.cssText = "width:10px;height:10px;border-radius:50%;flex-shrink:0;background:" +
        (check.status === "GREEN" ? "var(--color-success)" : check.status === "AMBER" ? "var(--color-warning)" : "var(--color-danger)")
      const label = document.createElement("span")
      label.textContent = t("offer.check" + key.charAt(0).toUpperCase() + key.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase())) + ": " + check.message
      row.appendChild(dot)
      row.appendChild(label)
      checksEl.appendChild(row)
    })
  } else {
    checksEl.textContent = t("offer.runPreview")
    checksEl.style.cssText = "color:var(--color-text-muted);font-size:var(--text-sm)"
  }
  card.appendChild(checksEl)

  const errEl = document.createElement("div")
  errEl.className = "onboarding-err"
  card.appendChild(errEl)

  const btnRow = document.createElement("div")
  btnRow.style.cssText = "display:flex;gap:var(--space-1);margin-top:var(--space-2);flex-wrap:wrap"

  // Run preview button
  const previewBtn = document.createElement("button")
  previewBtn.className = "btn btn-secondary"
  previewBtn.textContent = t("offer.runPreview")
  previewBtn.addEventListener("click", async () => {
    if (!_offerId) {
      // Create offer first
      try {
        const payload = collectPayload()
        const data = await apiPost("/api/hiring/offers", {
          application_id: _applicationId, offer_type: _offerType, payload,
        })
        _offerId = data.id
      } catch (e) { errEl.textContent = e.message; return }
    }
    try {
      _complianceResult = await apiPost("/api/hiring/offers/" + _offerId + "/compliance-preview", {})
      render(el)
    } catch (e) { errEl.textContent = e.message }
  })
  btnRow.appendChild(previewBtn)

  // Send offer button
  const sendBtn = document.createElement("button")
  sendBtn.className = "btn btn-accent"
  sendBtn.textContent = t("offer.sendOffer")
  sendBtn.disabled = !_complianceResult || _complianceResult.has_red
  sendBtn.addEventListener("click", async () => {
    if (!_offerId) { errEl.textContent = "Run compliance check first"; return }

    let overrideReason = null
    if (_complianceResult && _complianceResult.has_red) {
      overrideReason = prompt(t("offer.overrideReason"))
      if (!overrideReason) return
    }

    sendBtn.disabled = true
    sendBtn.textContent = t("offer.sending")
    try {
      await apiPost("/api/hiring/offers/" + _offerId + "/send", { override_reason: overrideReason })
      card.innerHTML = ""
      const success = document.createElement("div")
      success.className = "empty-state"
      success.innerHTML = `<div class="empty-state-icon">\u2705</div><div class="empty-state-title">${t("offer.sent")}</div>`
      card.appendChild(success)
    } catch (e) {
      errEl.textContent = e.message
      sendBtn.disabled = false
      sendBtn.textContent = t("offer.sendOffer")
    }
  })
  btnRow.appendChild(sendBtn)

  // Override button (when RED checks exist)
  if (_complianceResult && _complianceResult.has_red) {
    const overrideBtn = document.createElement("button")
    overrideBtn.className = "btn btn-secondary"
    overrideBtn.textContent = t("offer.overrideBtn")
    overrideBtn.addEventListener("click", () => { sendBtn.disabled = false })
    btnRow.appendChild(overrideBtn)
  }

  card.appendChild(btnRow)
}

function collectPayload() {
  const payload = {}
  if (_offerType === "FTE") {
    payload.base_salary = parseFloat(document.getElementById("offer-salary")?.value) || 0
    payload.probation_days = parseInt(document.getElementById("offer-probation")?.value) || 90
    payload.notice_period_days = parseInt(document.getElementById("offer-notice")?.value) || 30
  }
  if (_offerType === "FREELANCER") {
    payload.milestones = []
    document.querySelectorAll("#milestones-container > div").forEach(row => {
      const inputs = row.querySelectorAll("input")
      if (inputs[0]?.value) payload.milestones.push({ name: inputs[0].value, amount: parseFloat(inputs[1]?.value) || 0 })
    })
  }
  if (_offerType === "AI_EXECUTABLE") {
    payload.delivery_window = {
      start_date: document.getElementById("offer-start")?.value,
      end_date: document.getElementById("offer-end")?.value,
    }
  }
  return payload
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function field(id, label, type) {
  const group = document.createElement("div")
  group.className = "field-group"
  const lbl = document.createElement("label")
  lbl.htmlFor = id
  lbl.textContent = label
  group.appendChild(lbl)
  const input = document.createElement("input")
  input.type = type || "text"
  input.id = id
  input.placeholder = label
  group.appendChild(input)
  return { group, input }
}

function emptyState(text) {
  const el = document.createElement("div")
  el.className = "empty-state"
  el.innerHTML = `<div class="empty-state-title">${text}</div>`
  return el
}

export default { render: renderFresh }
