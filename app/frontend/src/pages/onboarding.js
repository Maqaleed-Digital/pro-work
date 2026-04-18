// S40-G5: Onboarding flow — Steps 2-4 after registration
import { apiPost, apiPatch, getToken } from "../api.js"
import { t } from "../locale.js"

const ACTIVITY_CODES = [
  { value: "construction",  en: "Construction",    ar: "\u0625\u0646\u0634\u0627\u0621\u0627\u062a" },
  { value: "tech",          en: "Technology",       ar: "\u062a\u0642\u0646\u064a\u0629" },
  { value: "healthcare",    en: "Healthcare",       ar: "\u0631\u0639\u0627\u064a\u0629 \u0635\u062d\u064a\u0629" },
  { value: "retail",        en: "Retail",           ar: "\u062a\u062c\u0632\u0626\u0629" },
  { value: "hospitality",   en: "Hospitality",      ar: "\u0636\u064a\u0627\u0641\u0629" },
  { value: "other",         en: "Other",            ar: "\u0623\u062e\u0631\u0649" },
]

const REGIONS = [
  { value: "riyadh",  en: "Riyadh",  ar: "\u0627\u0644\u0631\u064a\u0627\u0636" },
  { value: "jeddah",  en: "Jeddah",  ar: "\u062c\u062f\u0629" },
  { value: "dammam",  en: "Dammam",  ar: "\u0627\u0644\u062f\u0645\u0627\u0645" },
  { value: "other",   en: "Other KSA", ar: "\u0645\u0646\u0627\u0637\u0642 \u0623\u062e\u0631\u0649" },
]

let _step = 2

function renderStep2(el) {
  el.innerHTML = ""

  const wrap = document.createElement("div")
  wrap.className = "onboarding-screen"

  const box = document.createElement("div")
  box.className = "onboarding-box"

  const icon = document.createElement("div")
  icon.className = "onboarding-icon"
  icon.innerHTML = '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#1a8a7a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>'
  box.appendChild(icon)

  const title = document.createElement("h2")
  title.textContent = t("onboarding.verifyTitle")
  box.appendChild(title)

  const desc = document.createElement("p")
  desc.className = "onboarding-subtitle"
  desc.textContent = t("onboarding.verifyDesc")
  box.appendChild(desc)

  const msg = document.createElement("div")
  msg.className = "onboarding-msg"
  msg.setAttribute("role", "status")

  const resendBtn = document.createElement("button")
  resendBtn.className = "btn btn-secondary onboarding-btn"
  resendBtn.textContent = t("onboarding.resendEmail")
  resendBtn.addEventListener("click", async () => {
    resendBtn.disabled = true
    try {
      await apiPost("/api/auth/resend-verification", {})
      msg.textContent = t("onboarding.resendSent")
    } catch {
      msg.textContent = t("onboarding.resendFailed")
    }
    resendBtn.disabled = false
  })
  box.appendChild(resendBtn)
  box.appendChild(msg)

  const skipBtn = document.createElement("button")
  skipBtn.className = "btn btn-link onboarding-btn"
  skipBtn.textContent = t("onboarding.skipBeta")
  skipBtn.addEventListener("click", () => {
    _step = 3
    render(el)
  })
  box.appendChild(skipBtn)

  const stepLabel = document.createElement("div")
  stepLabel.className = "onboarding-step-label"
  stepLabel.textContent = t("onboarding.step") + " 2 / 4"
  box.appendChild(stepLabel)

  wrap.appendChild(box)
  el.appendChild(wrap)
}

function renderStep3(el) {
  el.innerHTML = ""

  const wrap = document.createElement("div")
  wrap.className = "onboarding-screen"

  const box = document.createElement("div")
  box.className = "onboarding-box onboarding-wide"

  const title = document.createElement("h2")
  title.textContent = t("onboarding.profileTitle")
  box.appendChild(title)

  const subtitle = document.createElement("p")
  subtitle.className = "onboarding-subtitle"
  subtitle.textContent = t("onboarding.profileDesc")
  box.appendChild(subtitle)

  const form = document.createElement("form")
  form.addEventListener("submit", e => e.preventDefault())

  const errEl = document.createElement("div")
  errEl.className = "onboarding-err"
  errEl.setAttribute("role", "alert")

  // Establishment name
  const nameGroup = _field("profile-name", t("onboarding.establishmentName"), "text")
  form.appendChild(nameGroup.group)

  // Activity code
  const actGroup = _select("profile-activity", t("onboarding.activityCode"), ACTIVITY_CODES)
  form.appendChild(actGroup.group)

  // Region
  const regGroup = _select("profile-region", t("onboarding.region"), REGIONS)
  form.appendChild(regGroup.group)

  // Total employees
  const totalGroup = _field("profile-total", t("onboarding.totalEmployees"), "number")
  totalGroup.input.min = "1"
  form.appendChild(totalGroup.group)

  // Saudi employees
  const saudiGroup = _field("profile-saudi", t("onboarding.saudiEmployees"), "number")
  saudiGroup.input.min = "0"
  form.appendChild(saudiGroup.group)

  form.appendChild(errEl)

  // Nitaqat preview area
  const previewEl = document.createElement("div")
  previewEl.className = "nitaqat-preview"
  previewEl.id = "nitaqat-preview"

  const btn = document.createElement("button")
  btn.type = "submit"
  btn.className = "btn btn-primary onboarding-btn"
  btn.textContent = t("onboarding.saveProfile")

  btn.addEventListener("click", async () => {
    errEl.textContent = ""
    const name     = (nameGroup.input.value || "").trim()
    const activity = actGroup.select.value
    const region   = regGroup.select.value
    const total    = parseInt(totalGroup.input.value, 10)
    const saudi    = parseInt(saudiGroup.input.value, 10)

    if (!name)             { errEl.textContent = t("onboarding.err.nameRequired"); return }
    if (!activity)         { errEl.textContent = t("onboarding.err.activityRequired"); return }
    if (!region)           { errEl.textContent = t("onboarding.err.regionRequired"); return }
    if (!total || total < 1) { errEl.textContent = t("onboarding.err.totalRequired"); return }
    if (isNaN(saudi) || saudi < 0) { errEl.textContent = t("onboarding.err.saudiRequired"); return }
    if (saudi > total)     { errEl.textContent = t("onboarding.err.saudiExceedsTotal"); return }

    btn.disabled = true
    btn.textContent = t("onboarding.saving")

    try {
      await apiPatch("/api/onboarding/profile", {
        establishment_name: name,
        activity_code: activity,
        region: region,
        total_employees: total,
        saudi_employees: saudi,
      })

      // S40-G5: call real Nitaqat service for zone preview
      try {
        const nitaqat = await apiPost("/api/admin/compliance/nitaqat/preview", {
          establishmentProfile: {
            saudiCount: saudi,
            totalCount: total,
            activityCode: activity,
            region: region,
          },
          candidateNationality: null,
          roleCategory: null,
          contractType: "FTE",
          proposedSalary: 0,
        })

        const zone = (nitaqat.currentZone || "").toLowerCase()
        const pct = nitaqat.saudiPercentageBefore
        const zoneLabel = { platinum: t("onboarding.nitaqat.platinum"), green: t("onboarding.nitaqat.green"), yellow: t("onboarding.nitaqat.yellow"), "low-green": t("onboarding.nitaqat.lowGreen"), red: t("onboarding.nitaqat.red") }

        previewEl.innerHTML = ""
        previewEl.className = "nitaqat-preview nitaqat-" + zone

        const previewTitle = document.createElement("h3")
        previewTitle.textContent = t("onboarding.nitaqat.title")
        previewEl.appendChild(previewTitle)

        const zoneText = document.createElement("div")
        zoneText.className = "nitaqat-zone"
        zoneText.textContent = (zoneLabel[zone] || zone) + " — " + pct + "% " + t("onboarding.nitaqat.saudiPct")
        previewEl.appendChild(zoneText)

        const hint = document.createElement("p")
        hint.className = "nitaqat-hint"
        hint.textContent = t("onboarding.nitaqat.hint")
        previewEl.appendChild(hint)
      } catch {
        // Preview is informational — failure does not block step advancement
        previewEl.innerHTML = ""
        const unavail = document.createElement("p")
        unavail.className = "nitaqat-hint"
        unavail.textContent = t("onboarding.nitaqat.unavailable")
        previewEl.appendChild(unavail)
      }

      // Always show Continue — preview is not a blocker
      btn.textContent = t("onboarding.continue")
      btn.disabled = false
      btn.onclick = () => { _step = 4; render(el) }
    } catch (e) {
      errEl.textContent = e.message || t("onboarding.err.saveFailed")
      btn.disabled = false
      btn.textContent = t("onboarding.saveProfile")
    }
  })

  form.appendChild(btn)
  form.appendChild(previewEl)

  const stepLabel = document.createElement("div")
  stepLabel.className = "onboarding-step-label"
  stepLabel.textContent = t("onboarding.step") + " 3 / 4"
  form.appendChild(stepLabel)

  box.appendChild(form)
  wrap.appendChild(box)
  el.appendChild(wrap)
}

function renderStep4(el) {
  el.innerHTML = ""

  const wrap = document.createElement("div")
  wrap.className = "onboarding-screen"

  const box = document.createElement("div")
  box.className = "onboarding-box onboarding-wide"

  const title = document.createElement("h2")
  title.textContent = t("onboarding.actionTitle")
  box.appendChild(title)

  const subtitle = document.createElement("p")
  subtitle.className = "onboarding-subtitle"
  subtitle.textContent = t("onboarding.actionDesc")
  box.appendChild(subtitle)

  const cards = document.createElement("div")
  cards.className = "action-cards"

  const actions = [
    { icon: "\u{1F4CB}", label: t("onboarding.action.postRole"),    href: "#workers",   desc: t("onboarding.action.postRoleDesc") },
    { icon: "\u{1F465}", label: t("onboarding.action.inviteTeam"),  href: "#tenants",   desc: t("onboarding.action.inviteTeamDesc") },
    { icon: "\u{1F4CA}", label: t("onboarding.action.explore"),     href: "#dashboard", desc: t("onboarding.action.exploreDesc") },
  ]

  actions.forEach(a => {
    const card = document.createElement("a")
    card.className = "action-card"
    card.href = a.href

    const iconEl = document.createElement("div")
    iconEl.className = "action-icon"
    iconEl.textContent = a.icon

    const labelEl = document.createElement("h3")
    labelEl.textContent = a.label

    const descEl = document.createElement("p")
    descEl.textContent = a.desc

    card.appendChild(iconEl)
    card.appendChild(labelEl)
    card.appendChild(descEl)
    cards.appendChild(card)
  })

  box.appendChild(cards)

  const stepLabel = document.createElement("div")
  stepLabel.className = "onboarding-step-label"
  stepLabel.textContent = t("onboarding.step") + " 4 / 4"
  box.appendChild(stepLabel)

  wrap.appendChild(box)
  el.appendChild(wrap)
}

function _field(id, label, type) {
  const group = document.createElement("div")
  group.className = "field-group"
  const lbl = document.createElement("label")
  lbl.htmlFor = id
  lbl.textContent = label
  group.appendChild(lbl)
  const input = document.createElement("input")
  input.type = type
  input.id = id
  input.placeholder = label
  group.appendChild(input)
  return { group, input }
}

function _select(id, label, options) {
  const group = document.createElement("div")
  group.className = "field-group"
  const lbl = document.createElement("label")
  lbl.htmlFor = id
  lbl.textContent = label
  group.appendChild(lbl)
  const select = document.createElement("select")
  select.id = id
  const empty = document.createElement("option")
  empty.value = ""
  empty.textContent = "— " + label + " —"
  select.appendChild(empty)
  options.forEach(o => {
    const opt = document.createElement("option")
    opt.value = o.value
    opt.textContent = o.en
    select.appendChild(opt)
  })
  group.appendChild(select)
  return { group, select }
}

function render(el) {
  if (_step === 2) return renderStep2(el)
  if (_step === 3) return renderStep3(el)
  if (_step === 4) return renderStep4(el)
  renderStep2(el)
}

export default { render }
