// S43-G5: Candidate Pipeline — Kanban board with AI ranking drawer
import { apiGet, apiPost, apiPatch } from "../api.js"
import { t } from "../locale.js"
import { renderModeStatusChip } from "../components/mode_status_chip.js"
import { renderAgentAttributionMarker } from "../components/agent_attribution_marker.js"

const COLUMNS = [
  { key: "APPLIED",      labelKey: "candidates.col.applied",      color: "var(--maq-semantic-info)" },
  { key: "SCREENING",    labelKey: "candidates.col.screening",    color: "var(--maq-semantic-warning)" },
  { key: "SHORTLISTED",  labelKey: "candidates.col.shortlisted",  color: "var(--maq-brand-accent)" },
  { key: "INTERVIEWED",  labelKey: "candidates.col.interviewed",  color: "var(--maq-wc-zone-medium-green)" },
  { key: "OFFERED",      labelKey: "candidates.col.offered",      color: "var(--maq-wc-zone-platinum)" },
  { key: "HIRED",        labelKey: "candidates.col.hired",        color: "var(--maq-semantic-success)" },
  { key: "REJECTED",     labelKey: "candidates.col.rejected",     color: "var(--maq-semantic-danger)" },
  { key: "WITHDRAWN",    labelKey: "candidates.col.withdrawn",    color: "var(--maq-neutral-400)" },
]

const TRANSITIONS = {
  APPLIED:     ["SCREENING", "REJECTED", "WITHDRAWN"],
  SCREENING:   ["SHORTLISTED", "REJECTED", "WITHDRAWN"],
  SHORTLISTED: ["INTERVIEWED", "REJECTED", "WITHDRAWN"],
  INTERVIEWED: ["OFFERED", "REJECTED", "WITHDRAWN"],
  OFFERED:     ["HIRED", "REJECTED", "WITHDRAWN"],
  HIRED: [], REJECTED: [], WITHDRAWN: [],
}

let _requisitionId = null
let _applications = []

function renderFresh(el) {
  _requisitionId = null
  _applications = []

  // Check deep-link
  const hashParams = new URLSearchParams(location.hash.replace(/^#[^?]*\??/, ""))
  const linked = hashParams.get("requisition")
  if (linked) _requisitionId = linked

  render(el)
}

async function render(el) {
  el.innerHTML = ""
  const content = document.createElement("div")
  content.className = "content-area"

  // Page header
  const header = document.createElement("div")
  header.className = "page-header"
  const hText = document.createElement("div")
  hText.className = "page-header-text"
  const h1 = document.createElement("h1")
  h1.textContent = t("candidates.pageTitle")
  const sub = document.createElement("p")
  sub.textContent = t("candidates.pageSubtitle")
  hText.appendChild(h1)
  hText.appendChild(sub)
  header.appendChild(hText)
  // UX-001 (Addendum B Rule 2, mode per SURFACE): hiring is a Mode-D capability —
  // advisory only. Same chip + capability code as compliance/employees (WC-REC).
  header.appendChild(renderModeStatusChip({ mode: "D", capabilityName: "WC-REC" }))

  // Actions: requisition selector + rank button
  const actions = document.createElement("div")
  actions.className = "page-header-actions"

  const reqSelect = document.createElement("select")
  reqSelect.className = "field-group"
  reqSelect.style.cssText = "padding:8px 12px;border:1px solid var(--maq-neutral-200);border-radius:var(--maq-radius-md);font-size:var(--maq-text-sm);min-width:200px"
  const emptyOpt = document.createElement("option")
  emptyOpt.value = ""
  emptyOpt.textContent = "— " + t("candidates.selectRequisition") + " —"
  reqSelect.appendChild(emptyOpt)

  // Load requisitions
  try {
    const data = await apiGet("/api/hiring/requisitions?status=PUBLISHED")
    const reqs = data.requisitions || []
    reqs.forEach(r => {
      const opt = document.createElement("option")
      opt.value = r.id
      opt.textContent = r.title + " (" + r.status + ")"
      if (r.id === _requisitionId) opt.selected = true
      reqSelect.appendChild(opt)
    })
  } catch { /* no requisitions */ }

  reqSelect.addEventListener("change", () => {
    _requisitionId = reqSelect.value || null
    loadPipeline(content)
  })
  actions.appendChild(reqSelect)

  const rankBtn = document.createElement("button")
  rankBtn.className = "btn btn-accent btn-sm"
  rankBtn.textContent = t("candidates.rankAI")
  rankBtn.addEventListener("click", async () => {
    if (!_requisitionId) return
    rankBtn.disabled = true
    rankBtn.textContent = t("candidates.ranking")
    try {
      const data = await apiPost("/api/hiring/requisitions/" + _requisitionId + "/rank-candidates", {})
      renderDrawer(content, data)
    } catch { /* ranking failed */ }
    rankBtn.disabled = false
    rankBtn.textContent = t("candidates.rankAI")
  })
  actions.appendChild(rankBtn)

  header.appendChild(actions)
  content.appendChild(header)

  // Kanban board
  const board = document.createElement("div")
  board.id = "kanban-board"
  board.className = "kanban-board"
  board.style.cssText = "display:flex;gap:var(--maq-space-2);overflow-x:auto;padding-bottom:var(--maq-space-4);min-height:400px"

  COLUMNS.forEach(col => {
    const column = document.createElement("div")
    column.className = "kanban-column"
    column.dataset.status = col.key
    column.style.cssText = "min-width:180px;flex:1;background:var(--maq-neutral-50);border-radius:var(--maq-radius-md);padding:var(--maq-space-2)"

    const colHeader = document.createElement("div")
    colHeader.style.cssText = "font-size:var(--maq-text-xs);font-weight:600;text-transform:uppercase;letter-spacing:0.5px;padding:var(--maq-space-1) var(--maq-space-2);margin-bottom:var(--maq-space-2);display:flex;align-items:center;gap:6px"
    const dot = document.createElement("span")
    dot.style.cssText = "width:8px;height:8px;border-radius:50%;background:" + col.color
    colHeader.appendChild(dot)
    colHeader.appendChild(document.createTextNode(t(col.labelKey)))

    const countBadge = document.createElement("span")
    countBadge.className = "kanban-count"
    countBadge.dataset.status = col.key
    countBadge.style.cssText = "font-size:10px;color:var(--maq-neutral-400);margin-left:auto"
    colHeader.appendChild(countBadge)

    column.appendChild(colHeader)

    const cardContainer = document.createElement("div")
    cardContainer.className = "kanban-cards"
    cardContainer.dataset.status = col.key
    cardContainer.style.cssText = "display:flex;flex-direction:column;gap:var(--maq-space-1);min-height:60px"

    // Drop target
    cardContainer.addEventListener("dragover", e => {
      e.preventDefault()
      cardContainer.style.background = "rgba(196,146,42,0.05)"
    })
    cardContainer.addEventListener("dragleave", () => {
      cardContainer.style.background = ""
    })
    cardContainer.addEventListener("drop", async e => {
      e.preventDefault()
      cardContainer.style.background = ""
      const appId = e.dataTransfer.getData("text/plain")
      const app = _applications.find(a => a.id === appId)
      if (!app) return
      const newStatus = col.key
      const allowed = TRANSITIONS[app.status] || []
      if (!allowed.includes(newStatus)) return

      if (newStatus === "REJECTED") {
        showRejectModal(content, appId)
        return
      }

      try {
        await apiPatch("/api/hiring/applications/" + appId + "/status", { status: newStatus })
        app.status = newStatus
        loadPipeline(content)
      } catch { /* transition failed */ }
    })

    column.appendChild(cardContainer)
    board.appendChild(column)
  })

  content.appendChild(board)
  el.appendChild(content)

  if (_requisitionId) loadPipeline(content)
}

async function loadPipeline(content) {
  if (!_requisitionId) return
  try {
    const data = await apiGet("/api/hiring/requisitions/" + _requisitionId + "/applications")
    _applications = data.applications || []
  } catch { _applications = [] }

  // Clear all card containers
  content.querySelectorAll(".kanban-cards").forEach(c => { c.innerHTML = "" })
  content.querySelectorAll(".kanban-count").forEach(c => { c.textContent = "" })

  // Group by status
  const groups = {}
  COLUMNS.forEach(c => { groups[c.key] = [] })
  _applications.forEach(app => {
    if (groups[app.status]) groups[app.status].push(app)
  })

  COLUMNS.forEach(col => {
    const container = content.querySelector(`.kanban-cards[data-status="${col.key}"]`)
    const count = content.querySelector(`.kanban-count[data-status="${col.key}"]`)
    if (count) count.textContent = groups[col.key].length || ""

    groups[col.key].forEach(app => {
      const card = renderCard(app, content)
      if (container) container.appendChild(card)
    })
  })

  if (_applications.length === 0) {
    const board = content.querySelector("#kanban-board")
    if (board) {
      const empty = document.createElement("div")
      empty.className = "empty-state"
      empty.style.cssText = "grid-column:1/-1;text-align:center;padding:var(--maq-space-12)"
      empty.textContent = t("candidates.noApplications")
      board.appendChild(empty)
    }
  }
}

function renderCard(app, content) {
  const card = document.createElement("div")
  card.className = "wc-card kanban-card"
  card.style.cssText = "padding:var(--maq-space-2);cursor:grab;font-size:var(--maq-text-sm)"
  card.draggable = true
  card.dataset.appId = app.id

  card.addEventListener("dragstart", e => {
    e.dataTransfer.setData("text/plain", app.id)
    card.style.opacity = "0.5"
  })
  card.addEventListener("dragend", () => { card.style.opacity = "1" })

  // Name
  const name = document.createElement("div")
  name.style.cssText = "font-weight:600;margin-bottom:2px"
  name.textContent = (app.first_name || "") + " " + (app.last_name || "")
  card.appendChild(name)

  // Badges row
  const badges = document.createElement("div")
  badges.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;margin-bottom:4px"

  if (app.match_score != null) {
    const matchBadge = document.createElement("span")
    matchBadge.className = "badge badge-info"
    matchBadge.textContent = t("candidates.matchScore") + " " + Math.round(app.match_score) + "%"
    badges.appendChild(matchBadge)
    // UX-002 (UX-G2 §6): match_score is AI-PRODUCED — it must never render unattributed.
    // HITL pending: no human has confirmed this score at render time.
    badges.appendChild(renderAgentAttributionMarker({
      agent: { name: "WorkCaptain Candidate Match", class: "platform-scoped", version: "v1.0.0", hitlStatus: "pending" },
      variant: "badge",
    }))
  }

  if (app.eri_score != null) {
    const eriBadge = document.createElement("span")
    eriBadge.className = "badge " + (app.eri_score >= 70 ? "badge-success" : app.eri_score >= 40 ? "badge-warning" : "badge-danger")
    eriBadge.textContent = t("candidates.eriScore") + " " + Math.round(app.eri_score)
    badges.appendChild(eriBadge)
  }

  if (app.ai_recommendation_log_id) {
    const aiChip = document.createElement("span")
    aiChip.className = "badge badge-zone-platinum"
    aiChip.textContent = t("candidates.aiChip")
    badges.appendChild(aiChip)
  }

  card.appendChild(badges)

  // Click to expand
  card.addEventListener("click", e => {
    if (e.target.closest(".kanban-card-detail")) return
    toggleDetail(card, app, content)
  })

  return card
}

async function toggleDetail(card, app, content) {
  const existing = card.querySelector(".kanban-card-detail")
  if (existing) { existing.remove(); return }

  const detail = document.createElement("div")
  detail.className = "kanban-card-detail"
  detail.style.cssText = "margin-top:var(--maq-space-2);padding-top:var(--maq-space-2);border-top:1px solid var(--maq-neutral-200);font-size:var(--maq-text-xs)"

  // Load recommendation detail if AI-matched
  if (app.ai_recommendation_log_id) {
    try {
      const rec = await apiGet("/api/hiring/recommendations/" + app.ai_recommendation_log_id)
      const snapshot = typeof rec.output_snapshot === "string" ? JSON.parse(rec.output_snapshot) : rec.output_snapshot || {}
      const rationale = snapshot.rationale || {}

      const sigTitle = document.createElement("div")
      sigTitle.style.cssText = "font-weight:600;margin-bottom:2px;color:var(--maq-neutral-600)"
      sigTitle.textContent = t("candidates.signals")
      detail.appendChild(sigTitle)

      if (rationale.top_contributing_signals) {
        rationale.top_contributing_signals.forEach(s => {
          const sig = document.createElement("div")
          sig.style.cssText = "color:var(--maq-neutral-400);padding-left:var(--maq-space-2)"
          sig.textContent = s.signal + ": " + s.value + " (w=" + s.weight + ")"
          detail.appendChild(sig)
        })
      }

      const confLine = document.createElement("div")
      confLine.style.cssText = "margin-top:4px;color:var(--maq-neutral-400)"
      confLine.textContent = t("candidates.confidence") + ": " + rec.confidence_score + " | " + t("candidates.biasScore") + ": " + rec.bias_score
      detail.appendChild(confLine)

      if (rationale.concerns && rationale.concerns.length) {
        const cTitle = document.createElement("div")
        cTitle.style.cssText = "font-weight:600;margin-top:4px;color:var(--maq-semantic-warning)"
        cTitle.textContent = t("candidates.concerns")
        detail.appendChild(cTitle)
        rationale.concerns.forEach(c => {
          const cl = document.createElement("div")
          cl.style.cssText = "color:var(--maq-neutral-400);padding-left:var(--maq-space-2)"
          cl.textContent = c
          detail.appendChild(cl)
        })
      }
    } catch { /* no recommendation detail */ }
  }

  // Timeline (last 3 events)
  try {
    const tl = await apiGet("/api/hiring/applications/" + app.id + "/timeline")
    const events = (tl.events || []).slice(-3)
    if (events.length) {
      const tlTitle = document.createElement("div")
      tlTitle.style.cssText = "font-weight:600;margin-top:6px;color:var(--maq-neutral-600)"
      tlTitle.textContent = t("candidates.timeline")
      detail.appendChild(tlTitle)
      events.forEach(ev => {
        const evLine = document.createElement("div")
        evLine.style.cssText = "color:var(--maq-neutral-400);padding-left:var(--maq-space-2)"
        evLine.textContent = (ev.previous_status || "—") + " → " + ev.new_status + " (" + ev.actor_type + ")"
        detail.appendChild(evLine)
      })
    }
  } catch { /* no timeline */ }

  card.appendChild(detail)
}

function showRejectModal(content, appId) {
  const overlay = document.createElement("div")
  overlay.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);z-index:200;display:flex;align-items:center;justify-content:center"

  const modal = document.createElement("div")
  modal.className = "wc-card"
  modal.style.cssText = "width:400px;max-width:90vw;padding:var(--maq-space-6)"

  const title = document.createElement("h3")
  title.style.cssText = "margin-bottom:var(--maq-space-4)"
  title.textContent = t("candidates.rejectReason")
  modal.appendChild(title)

  const textarea = document.createElement("textarea")
  textarea.style.cssText = "width:100%;min-height:80px;padding:8px;border:1px solid var(--maq-neutral-200);border-radius:var(--maq-radius-md);font-family:inherit;font-size:var(--maq-text-sm);resize:vertical"
  modal.appendChild(textarea)

  const errEl = document.createElement("div")
  errEl.className = "onboarding-err"
  modal.appendChild(errEl)

  const btnRow = document.createElement("div")
  btnRow.style.cssText = "display:flex;gap:var(--maq-space-2);justify-content:flex-end;margin-top:var(--maq-space-4)"

  const cancelBtn = document.createElement("button")
  cancelBtn.className = "btn btn-secondary btn-sm"
  cancelBtn.textContent = t("candidates.rejectCancel")
  cancelBtn.addEventListener("click", () => overlay.remove())

  const submitBtn = document.createElement("button")
  submitBtn.className = "btn btn-danger btn-sm"
  submitBtn.textContent = t("candidates.rejectSubmit")
  submitBtn.addEventListener("click", async () => {
    const reason = textarea.value.trim()
    if (!reason) { errEl.textContent = t("candidates.rejectReason"); return }
    try {
      await apiPatch("/api/hiring/applications/" + appId + "/status", { status: "REJECTED", reason })
      const app = _applications.find(a => a.id === appId)
      if (app) app.status = "REJECTED"
      overlay.remove()
      loadPipeline(content)
    } catch (e) { errEl.textContent = e.message }
  })

  btnRow.appendChild(cancelBtn)
  btnRow.appendChild(submitBtn)
  modal.appendChild(btnRow)
  overlay.appendChild(modal)
  document.body.appendChild(overlay)
}

function renderDrawer(content, rankData) {
  // Remove existing drawer
  const existing = document.getElementById("ai-drawer")
  if (existing) existing.remove()

  const drawer = document.createElement("div")
  drawer.id = "ai-drawer"
  drawer.style.cssText = "position:fixed;top:0;right:0;bottom:0;width:400px;max-width:90vw;background:var(--maq-neutral-0);box-shadow:var(--maq-elevation-xl);z-index:100;overflow-y:auto;padding:var(--maq-space-6)"

  const closeBtn = document.createElement("button")
  closeBtn.className = "btn btn-secondary btn-sm"
  closeBtn.textContent = "\u2715"
  closeBtn.style.cssText = "position:absolute;top:var(--maq-space-4);right:var(--maq-space-4)"
  closeBtn.addEventListener("click", () => drawer.remove())
  drawer.appendChild(closeBtn)

  const title = document.createElement("h3")
  title.textContent = t("candidates.drawerTitle")
  title.style.cssText = "margin-bottom:var(--maq-space-4)"
  drawer.appendChild(title)

  const candidates = rankData.ranked_candidates || []
  if (candidates.length === 0) {
    drawer.appendChild(document.createTextNode(t("candidates.noRanked")))
  }

  candidates.forEach(c => {
    const item = document.createElement("div")
    item.className = "wc-card"
    item.style.cssText = "margin-bottom:var(--maq-space-2);padding:var(--maq-space-4)"

    const nameEl = document.createElement("div")
    nameEl.style.cssText = "font-weight:600"
    nameEl.textContent = c.candidate_name
    item.appendChild(nameEl)

    const scoreEl = document.createElement("div")
    scoreEl.style.cssText = "font-size:var(--maq-text-sm);color:var(--maq-neutral-400)"
    scoreEl.textContent = t("candidates.matchScore") + ": " + c.match_score + "% | " + t("candidates.confidence") + ": " + c.match_confidence
    item.appendChild(scoreEl)

    const recBadge = document.createElement("span")
    recBadge.className = "badge " + (c.recommended ? "badge-success" : "badge-warning")
    recBadge.textContent = c.recommended ? "Recommended" : "Below threshold"
    recBadge.style.cssText = "margin-top:4px;display:inline-block"
    item.appendChild(recBadge)

    const btnRow = document.createElement("div")
    btnRow.style.cssText = "display:flex;gap:var(--maq-space-1);margin-top:var(--maq-space-2)"

    const approveBtn = document.createElement("button")
    approveBtn.className = "btn btn-accent btn-sm"
    approveBtn.textContent = t("candidates.approve")
    approveBtn.addEventListener("click", async () => {
      approveBtn.disabled = true
      try {
        await apiPost("/api/hiring/recommendations/" + c.recommendation_audit_log_id + "/review", {
          decision: "ACCEPTED"
        })
        item.style.opacity = "0.5"
        approveBtn.textContent = "\u2713"
        loadPipeline(content)
      } catch (e) { approveBtn.textContent = e.message }
    })

    const rejectBtn = document.createElement("button")
    rejectBtn.className = "btn btn-secondary btn-sm"
    rejectBtn.textContent = t("candidates.reject")
    rejectBtn.addEventListener("click", async () => {
      const reason = prompt(t("candidates.overrideReason"))
      if (!reason) return
      try {
        await apiPost("/api/hiring/recommendations/" + c.recommendation_audit_log_id + "/review", {
          decision: "REJECTED", override_reason: reason
        })
        item.style.opacity = "0.3"
        rejectBtn.textContent = "\u2717"
      } catch (e) { rejectBtn.textContent = e.message }
    })

    btnRow.appendChild(approveBtn)
    btnRow.appendChild(rejectBtn)
    item.appendChild(btnRow)
    drawer.appendChild(item)
  })

  document.body.appendChild(drawer)
}

export default { render: renderFresh }
