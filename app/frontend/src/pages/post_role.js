// S43-G2: Post a Role — 4-step hiring requisition form
import { apiPost, apiPatch, apiGet } from "../api.js"
import { t } from "../locale.js"

const CONTRACT_TYPES = [
  { value: "FTE",           labelKey: "postRole.step1.fte" },
  { value: "FREELANCER",    labelKey: "postRole.step1.freelancer" },
  { value: "AI_EXECUTABLE", labelKey: "postRole.step1.aiExecutable" },
]

let _step = 1
let _requisitionId = null
let _skills = []
let _contractType = "FTE"
let _occupationCode = ""
let _previewResult = null
let _previewTimestamp = null

// ── Helpers ─────────────────────────────────────────────────────────────────

function _field(id, label, type, opts) {
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
  if (opts) Object.assign(input, opts)
  group.appendChild(input)
  return { group, input }
}

function stepIndicator(current) {
  const el = document.createElement("div")
  el.className = "onboarding-step-label"
  el.textContent = t("postRole.step") + " " + current + " / 4"
  return el
}

// ── Step 1: Role Basics ─────────────────────────────────────────────────────

function renderStep1(el) {
  el.innerHTML = ""
  const content = document.createElement("div")
  content.className = "content-area"

  const header = document.createElement("div")
  header.className = "page-header"
  const hText = document.createElement("div")
  hText.className = "page-header-text"
  const h1 = document.createElement("h1")
  h1.textContent = t("postRole.step1.title")
  const sub = document.createElement("p")
  sub.textContent = t("postRole.pageSubtitle")
  hText.appendChild(h1)
  hText.appendChild(sub)
  header.appendChild(hText)
  content.appendChild(header)

  const card = document.createElement("div")
  card.className = "wc-card"

  const titleEn = _field("pr-title-en", t("postRole.step1.roleTitleEn"), "text")
  card.appendChild(titleEn.group)

  const titleAr = _field("pr-title-ar", t("postRole.step1.roleTitleAr"), "text", { dir: "rtl" })
  card.appendChild(titleAr.group)

  const deptField = _field("pr-dept", t("postRole.step1.department"), "text")
  card.appendChild(deptField.group)

  // Contract type radios
  const ctGroup = document.createElement("div")
  ctGroup.className = "field-group"
  const ctLabel = document.createElement("label")
  ctLabel.textContent = t("postRole.step1.contractType")
  ctGroup.appendChild(ctLabel)

  const ctWrap = document.createElement("div")
  ctWrap.style.cssText = "display:flex;gap:var(--maq-space-4);flex-wrap:wrap;margin-top:var(--maq-space-1)"
  CONTRACT_TYPES.forEach(ct => {
    const lbl = document.createElement("label")
    lbl.style.cssText = "display:flex;align-items:center;gap:6px;cursor:pointer;font-size:var(--maq-text-sm)"
    const radio = document.createElement("input")
    radio.type = "radio"
    radio.name = "contractType"
    radio.value = ct.value
    if (ct.value === _contractType) radio.checked = true
    radio.addEventListener("change", () => { _contractType = ct.value })
    lbl.appendChild(radio)
    lbl.appendChild(document.createTextNode(t(ct.labelKey)))
    ctWrap.appendChild(lbl)
  })
  ctGroup.appendChild(ctWrap)
  card.appendChild(ctGroup)

  const errEl = document.createElement("div")
  errEl.className = "onboarding-err"
  card.appendChild(errEl)

  const btnRow = document.createElement("div")
  btnRow.style.cssText = "display:flex;justify-content:flex-end;gap:var(--maq-space-2);margin-top:var(--maq-space-4)"
  const nextBtn = document.createElement("button")
  nextBtn.className = "btn btn-accent"
  nextBtn.textContent = t("postRole.next")
  nextBtn.addEventListener("click", async () => {
    errEl.textContent = ""
    const enTitle = titleEn.input.value.trim()
    const arTitle = titleAr.input.value.trim()
    if (!enTitle) { errEl.textContent = t("postRole.err.titleEnRequired"); return }
    if (!arTitle) { errEl.textContent = t("postRole.err.titleArRequired"); return }
    if (!_contractType) { errEl.textContent = t("postRole.err.contractRequired"); return }

    nextBtn.disabled = true
    try {
      const data = await apiPost("/api/hiring/requisitions", {
        title: enTitle,
        department: deptField.input.value.trim() || null,
        contract_type: _contractType,
        requirements: { title_ar: arTitle },
      })
      _requisitionId = data.id
      _step = 2
      render(el)
    } catch (e) {
      errEl.textContent = e.message
      nextBtn.disabled = false
    }
  })
  btnRow.appendChild(nextBtn)
  card.appendChild(btnRow)
  card.appendChild(stepIndicator(1))

  content.appendChild(card)
  el.appendChild(content)
}

// ── Step 2: Requirements ────────────────────────────────────────────────────

function renderStep2(el) {
  el.innerHTML = ""
  const content = document.createElement("div")
  content.className = "content-area"

  const header = document.createElement("div")
  header.className = "page-header"
  const hText = document.createElement("div")
  hText.className = "page-header-text"
  const h1 = document.createElement("h1")
  h1.textContent = t("postRole.step2.title")
  hText.appendChild(h1)
  header.appendChild(hText)
  content.appendChild(header)

  const card = document.createElement("div")
  card.className = "wc-card"

  // Skills tag input
  const skillGroup = document.createElement("div")
  skillGroup.className = "field-group"
  const skillLabel = document.createElement("label")
  skillLabel.textContent = t("postRole.step2.skills")
  skillGroup.appendChild(skillLabel)

  const tagsEl = document.createElement("div")
  tagsEl.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;margin-bottom:var(--maq-space-1)"
  function renderTags() {
    tagsEl.innerHTML = ""
    _skills.forEach((s, i) => {
      const tag = document.createElement("span")
      tag.className = "badge badge-info"
      tag.style.cssText = "cursor:pointer"
      tag.textContent = s + " \u00d7"
      tag.addEventListener("click", () => { _skills.splice(i, 1); renderTags() })
      tagsEl.appendChild(tag)
    })
  }
  renderTags()
  skillGroup.appendChild(tagsEl)

  const skillInput = document.createElement("input")
  skillInput.type = "text"
  skillInput.placeholder = t("postRole.step2.skillPlaceholder")
  skillInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && skillInput.value.trim()) {
      e.preventDefault()
      _skills.push(skillInput.value.trim())
      skillInput.value = ""
      renderTags()
    }
  })
  skillGroup.appendChild(skillInput)
  card.appendChild(skillGroup)

  // Experience
  const expField = _field("pr-exp", t("postRole.step2.experience"), "number", { min: 0, max: 40 })
  card.appendChild(expField.group)

  // Occupation code + AI suggestion
  const codeField = _field("pr-occ-code", t("postRole.step2.occupationCode"), "text")
  if (_occupationCode) codeField.input.value = _occupationCode
  card.appendChild(codeField.group)

  const suggestBox = document.createElement("div")
  suggestBox.id = "occ-suggest-box"

  const suggestBtn = document.createElement("button")
  suggestBtn.className = "btn btn-secondary btn-sm"
  suggestBtn.textContent = t("postRole.step2.suggestCode")
  suggestBtn.addEventListener("click", async () => {
    suggestBtn.disabled = true
    suggestBtn.textContent = t("postRole.step2.suggesting")
    suggestBox.innerHTML = ""
    try {
      const data = await apiPost("/api/admin/compliance/occupation-code/suggest", {
        skills: _skills,
        requisitionTitle: document.getElementById("pr-title-en") ? "" : "",
      })
      const suggestion = data.suggestions ? data.suggestions[0] : data
      if (suggestion) {
        const sCard = document.createElement("div")
        sCard.className = "wc-card"
        sCard.style.cssText = "margin-top:var(--maq-space-2);padding:var(--maq-space-4)"
        sCard.innerHTML = `<div style="font-size:var(--maq-text-sm)"><strong>${t("postRole.step2.suggested")}:</strong> ${suggestion.code || suggestion.occupationCode || "—"}</div>
          <div style="font-size:var(--maq-text-xs);color:var(--maq-neutral-400)">${t("postRole.step2.confidence")}: ${suggestion.confidence || suggestion.confidenceScore || "—"}%</div>`

        const useBtn = document.createElement("button")
        useBtn.className = "btn btn-accent btn-sm"
        useBtn.textContent = t("postRole.step2.useThis")
        useBtn.style.cssText = "margin-top:var(--maq-space-1);margin-right:var(--maq-space-1)"
        useBtn.addEventListener("click", () => {
          _occupationCode = suggestion.code || suggestion.occupationCode || ""
          codeField.input.value = _occupationCode
          suggestBox.innerHTML = ""
        })

        const overrideBtn = document.createElement("button")
        overrideBtn.className = "btn btn-secondary btn-sm"
        overrideBtn.textContent = t("postRole.step2.override")
        overrideBtn.style.cssText = "margin-top:var(--maq-space-1)"
        overrideBtn.addEventListener("click", () => {
          suggestBox.innerHTML = ""
          // Override logged via audit service on server side
        })

        sCard.appendChild(useBtn)
        sCard.appendChild(overrideBtn)
        suggestBox.appendChild(sCard)
      }
    } catch { suggestBox.textContent = "Suggestion unavailable" }
    suggestBtn.disabled = false
    suggestBtn.textContent = t("postRole.step2.suggestCode")
  })
  card.appendChild(suggestBtn)
  card.appendChild(suggestBox)

  const errEl = document.createElement("div")
  errEl.className = "onboarding-err"
  card.appendChild(errEl)

  const btnRow = document.createElement("div")
  btnRow.style.cssText = "display:flex;justify-content:space-between;margin-top:var(--maq-space-4)"
  const backBtn = document.createElement("button")
  backBtn.className = "btn btn-secondary"
  backBtn.textContent = t("postRole.back")
  backBtn.addEventListener("click", () => { _step = 1; render(el) })
  const nextBtn = document.createElement("button")
  nextBtn.className = "btn btn-accent"
  nextBtn.textContent = t("postRole.next")
  nextBtn.addEventListener("click", async () => {
    if (_skills.length < 3) { errEl.textContent = t("postRole.err.skillsMin"); return }
    _occupationCode = codeField.input.value.trim()
    try {
      await apiPatch("/api/hiring/requisitions/" + _requisitionId, {
        occupation_code: _occupationCode || null,
        requirements: { skills: _skills, experience_years: parseInt(expField.input.value, 10) || 0 },
      })
      _step = 3
      render(el)
    } catch (e) { errEl.textContent = e.message }
  })
  btnRow.appendChild(backBtn)
  btnRow.appendChild(nextBtn)
  card.appendChild(btnRow)
  card.appendChild(stepIndicator(2))

  content.appendChild(card)
  el.appendChild(content)
}

// ── Step 3: Compensation ────────────────────────────────────────────────────

function renderStep3(el) {
  el.innerHTML = ""
  const content = document.createElement("div")
  content.className = "content-area"

  const header = document.createElement("div")
  header.className = "page-header"
  const hText = document.createElement("div")
  hText.className = "page-header-text"
  const h1 = document.createElement("h1")
  h1.textContent = t("postRole.step3.title")
  hText.appendChild(h1)
  header.appendChild(hText)
  content.appendChild(header)

  const card = document.createElement("div")
  card.className = "wc-card"

  const salMinField = _field("pr-sal-min", t("postRole.step3.salaryMin"), "number", { min: 0 })
  card.appendChild(salMinField.group)

  const salMaxField = _field("pr-sal-max", t("postRole.step3.salaryMax"), "number", { min: 0 })
  card.appendChild(salMaxField.group)

  // Allowances
  const allowGroup = document.createElement("div")
  allowGroup.className = "field-group"
  const allowLabel = document.createElement("label")
  allowLabel.textContent = t("postRole.step3.allowances")
  allowGroup.appendChild(allowLabel)
  const allowances = [
    { id: "allow-housing",   label: t("postRole.step3.housing") },
    { id: "allow-transport", label: t("postRole.step3.transport") },
  ]
  allowances.forEach(a => {
    const wrap = document.createElement("label")
    wrap.style.cssText = "display:flex;align-items:center;gap:6px;font-size:var(--maq-text-sm);cursor:pointer"
    const cb = document.createElement("input")
    cb.type = "checkbox"
    cb.id = a.id
    wrap.appendChild(cb)
    wrap.appendChild(document.createTextNode(a.label))
    allowGroup.appendChild(wrap)
  })
  card.appendChild(allowGroup)

  // GOSI estimate display
  const gosiEl = document.createElement("div")
  gosiEl.className = "wc-card"
  gosiEl.style.cssText = "margin-top:var(--maq-space-2);padding:var(--maq-space-4);background:var(--maq-neutral-50)"
  gosiEl.innerHTML = `<div style="font-size:var(--maq-text-xs);color:var(--maq-neutral-400)">${t("postRole.step3.gosiEstimate")}</div>
    <div id="gosi-value" style="font-family:var(--maq-font-latin);font-size:var(--maq-text-xl);font-weight:700">—</div>
    <div style="font-size:var(--maq-text-xs);color:var(--maq-neutral-400);margin-top:var(--maq-space-1)">${t("postRole.step3.totalCost")}: <span id="total-cost" style="font-weight:600">—</span></div>`
  card.appendChild(gosiEl)

  // Live GOSI calculation on salary change
  function updateGosi() {
    const min = parseFloat(salMinField.input.value) || 0
    const gosiRate = 0.1175  // 11.75% employer GOSI
    const gosi = Math.round(min * gosiRate)
    const gosiValEl = document.getElementById("gosi-value")
    const totalEl = document.getElementById("total-cost")
    if (gosiValEl) gosiValEl.textContent = gosi > 0 ? gosi.toLocaleString() + " SAR" : "—"
    if (totalEl) totalEl.textContent = min > 0 ? (min + gosi).toLocaleString() + " SAR" : "—"
  }
  salMinField.input.addEventListener("input", updateGosi)

  const errEl = document.createElement("div")
  errEl.className = "onboarding-err"
  card.appendChild(errEl)

  const btnRow = document.createElement("div")
  btnRow.style.cssText = "display:flex;justify-content:space-between;margin-top:var(--maq-space-4)"
  const backBtn = document.createElement("button")
  backBtn.className = "btn btn-secondary"
  backBtn.textContent = t("postRole.back")
  backBtn.addEventListener("click", () => { _step = 2; render(el) })
  const nextBtn = document.createElement("button")
  nextBtn.className = "btn btn-accent"
  nextBtn.textContent = t("postRole.next")
  nextBtn.addEventListener("click", async () => {
    const salMin = parseFloat(salMinField.input.value) || 0
    const salMax = parseFloat(salMaxField.input.value) || 0
    if (salMin > 0 && salMax > 0 && salMin > salMax) {
      errEl.textContent = t("postRole.err.salaryInvalid"); return
    }
    try {
      await apiPatch("/api/hiring/requisitions/" + _requisitionId, {
        salary_min: salMin || null,
        salary_max: salMax || null,
      })
      _step = 4
      render(el)
    } catch (e) { errEl.textContent = e.message }
  })
  btnRow.appendChild(backBtn)
  btnRow.appendChild(nextBtn)
  card.appendChild(btnRow)
  card.appendChild(stepIndicator(3))

  content.appendChild(card)
  el.appendChild(content)
}

// ── Step 4: Nitaqat Impact Preview ──────────────────────────────────────────

function renderStep4(el) {
  el.innerHTML = ""
  const content = document.createElement("div")
  content.className = "content-area"

  const header = document.createElement("div")
  header.className = "page-header"
  const hText = document.createElement("div")
  hText.className = "page-header-text"
  const h1 = document.createElement("h1")
  h1.textContent = t("postRole.step4.title")
  hText.appendChild(h1)
  header.appendChild(hText)
  content.appendChild(header)

  const card = document.createElement("div")
  card.className = "wc-card"

  const previewEl = document.createElement("div")
  previewEl.id = "nitaqat-result"
  previewEl.style.cssText = "min-height:120px"
  previewEl.textContent = "Loading Nitaqat preview..."
  card.appendChild(previewEl)

  const errEl = document.createElement("div")
  errEl.className = "onboarding-err"
  card.appendChild(errEl)

  async function runPreview() {
    previewEl.innerHTML = ""
    previewEl.textContent = "Running Nitaqat preview..."
    errEl.textContent = ""
    try {
      const data = await apiPost("/api/hiring/requisitions/" + _requisitionId + "/nitaqat-preview", {})
      _previewResult = data.previewResult || data
      _previewTimestamp = new Date()

      previewEl.innerHTML = ""
      const grid = document.createElement("div")
      grid.className = "kpi-grid"
      grid.style.cssText = "grid-template-columns:1fr 1fr"

      const curCard = document.createElement("div")
      curCard.className = "kpi-card"
      curCard.innerHTML = `<div class="kpi-card-label">${t("postRole.step4.currentZone")}</div>
        <div class="kpi-card-value">${_previewResult.currentZone || "—"}</div>`
      grid.appendChild(curCard)

      const projCard = document.createElement("div")
      projCard.className = "kpi-card"
      projCard.innerHTML = `<div class="kpi-card-label">${t("postRole.step4.projectedZone")}</div>
        <div class="kpi-card-value">${_previewResult.projectedZone || "—"}</div>`
      grid.appendChild(projCard)

      previewEl.appendChild(grid)

      if (_previewResult.confidenceBand) {
        const band = document.createElement("div")
        band.style.cssText = "font-size:var(--maq-text-sm);color:var(--maq-neutral-400);margin-top:var(--maq-space-2)"
        band.textContent = `${t("postRole.step4.confidenceBand")}: ${_previewResult.confidenceBand.lower}% – ${_previewResult.confidenceBand.upper}%`
        previewEl.appendChild(band)
      }

      publishBtn.disabled = false
    } catch (e) {
      errEl.textContent = t("postRole.step4.previewFailed")
      _previewResult = null
      publishBtn.disabled = true
    }
  }

  const btnRow = document.createElement("div")
  btnRow.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-top:var(--maq-space-4);gap:var(--maq-space-2)"

  const backBtn = document.createElement("button")
  backBtn.className = "btn btn-secondary"
  backBtn.textContent = t("postRole.back")
  backBtn.addEventListener("click", () => { _step = 3; render(el) })

  const rerunBtn = document.createElement("button")
  rerunBtn.className = "btn btn-secondary"
  rerunBtn.textContent = t("postRole.step4.rerun")
  rerunBtn.addEventListener("click", runPreview)

  const publishBtn = document.createElement("button")
  publishBtn.className = "btn btn-accent"
  publishBtn.textContent = t("postRole.step4.publish")
  publishBtn.disabled = true
  publishBtn.addEventListener("click", async () => {
    publishBtn.disabled = true
    publishBtn.textContent = t("postRole.step4.publishing")
    errEl.textContent = ""
    try {
      await apiPost("/api/hiring/requisitions/" + _requisitionId + "/publish", {})
      card.innerHTML = ""
      const success = document.createElement("div")
      success.className = "empty-state"
      success.innerHTML = `<div class="empty-state-icon">\u2705</div>
        <div class="empty-state-title">${t("postRole.step4.published")}</div>`
      card.appendChild(success)
    } catch (e) {
      errEl.textContent = e.message
      publishBtn.disabled = false
      publishBtn.textContent = t("postRole.step4.publish")
    }
  })

  btnRow.appendChild(backBtn)
  btnRow.appendChild(rerunBtn)
  btnRow.appendChild(publishBtn)
  card.appendChild(btnRow)
  card.appendChild(stepIndicator(4))

  content.appendChild(card)
  el.appendChild(content)

  // Auto-fire preview on step entry
  runPreview()
}

// ── Main render ─────────────────────────────────────────────────────────────

function render(el) {
  if (_step === 1) return renderStep1(el)
  if (_step === 2) return renderStep2(el)
  if (_step === 3) return renderStep3(el)
  if (_step === 4) return renderStep4(el)
  renderStep1(el)
}

// Reset state when entering the page
function renderFresh(el) {
  _step = 1
  _requisitionId = null
  _skills = []
  _contractType = "FTE"
  _occupationCode = ""
  _previewResult = null
  _previewTimestamp = null
  render(el)
}

export default { render: renderFresh }
