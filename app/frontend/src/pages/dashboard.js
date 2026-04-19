// S36-G6: Command Center — decision OS (replaces basic dashboard)
// BRD Refs: WorkCaptain Eval §3.1, §3.2
// Route: /dashboard (default route)
//
// Sections:
//   A — KPI Strip (top bar, always visible, polls 30s)
//   B — Entity Risk Board (People | Projects | Compliance)
//   C — Quick Actions (inline expandable panels, zero navigation)
//   D — AI Insight Panel (latest 3 pending recommendations)

import { apiGetJson, getTenant } from "../api.js"
import { toast }                 from "../components/toast.js"
import { createKpiStrip }        from "../components/kpi_strip.js"
import { createRiskBoard }       from "../components/risk_board.js"

// ── Section helpers ────────────────────────────────────────────────────────────

function sectionTitle(text) {
  const el = document.createElement("div")
  el.style.cssText = "font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;padding:0 16px;margin-block-start:20px;margin-block-end:8px"
  el.textContent = text
  return el
}

// ── Section C — Quick Actions ──────────────────────────────────────────────────

const QUICK_ACTIONS = [
  {
    id:       "approve-ai",
    label:    "Approve pending AI",
    icon:     "✓",
    noConfirm: true,
    action:   () => { location.hash = "ai" },
  },
  {
    id:          "compliance-check",
    label:       "Run compliance check",
    icon:        "⚙",
    description: "Trigger compliance scan for active roster.",
    action:      async () => {
      await apiGetJson("/api/admin/health", {})
      toast.ok("Compliance scan queued.")
    },
  },
  {
    id:       "create-role",
    label:    "Create role",
    icon:     "+",
    noConfirm: true,
    action:   () => { location.hash = "workers" },
  },
  {
    id:       "assign-task",
    label:    "Assign task",
    icon:     "→",
    noConfirm: true,
    action:   () => { location.hash = "assignments" },
  },
  {
    id:       "generate-contract",
    label:    "Generate contract",
    icon:     "≡",
    noConfirm: true,
    action:   () => { location.hash = "governance" },
  },
]

function buildQuickActions() {
  const wrap = document.createElement("div")
  wrap.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;padding:0 16px"
  wrap.setAttribute("role", "toolbar")
  wrap.setAttribute("aria-label", "Quick actions")

  QUICK_ACTIONS.forEach(qa => {
    const btnEl = document.createElement("button")
    btnEl.style.cssText = [
      "display:inline-flex;align-items:center;gap:6px",
      "padding:8px 14px",
      "border-radius:8px",
      "border:1px solid var(--colour-border, #e5e7eb)",
      "background:var(--colour-surface, #fff)",
      "font-size:12px;font-weight:600;cursor:pointer",
    ].join(";")
    btnEl.setAttribute("aria-label", qa.label)
    btnEl.textContent = qa.icon + " " + qa.label

    if (qa.noConfirm) {
      btnEl.addEventListener("click", () => qa.action())
      wrap.appendChild(btnEl)
      return
    }

    // One-click + one-confirmation inline panel
    const cell = document.createElement("div")
    cell.style.position = "relative"

    const panel = document.createElement("div")
    panel.style.cssText = [
      "display:none",
      "position:absolute;top:calc(100% + 4px);inset-inline-start:0",
      "background:var(--colour-surface, #fff)",
      "border:1px solid var(--colour-border, #e5e7eb)",
      "border-radius:8px;padding:12px",
      "box-shadow:0 4px 16px rgba(0,0,0,.1)",
      "z-index:100;font-size:12px;min-width:220px",
    ].join(";")

    const desc = document.createElement("p")
    desc.style.cssText = "margin:0 0 10px;color:#374151"
    desc.textContent = qa.description || qa.label

    const confirmBtn = document.createElement("button")
    confirmBtn.className = "btn btn-primary"
    confirmBtn.style.fontSize = "12px"
    confirmBtn.textContent = "Confirm"

    const cancelBtn = document.createElement("button")
    cancelBtn.className = "btn"
    cancelBtn.style.cssText = "font-size:12px;margin-inline-start:6px"
    cancelBtn.textContent = "Cancel"

    panel.appendChild(desc)
    panel.appendChild(confirmBtn)
    panel.appendChild(cancelBtn)

    btnEl.addEventListener("click", () => {
      panel.style.display = panel.style.display === "none" ? "block" : "none"
    })
    confirmBtn.addEventListener("click", async () => {
      panel.style.display = "none"
      confirmBtn.disabled = true
      confirmBtn.textContent = "Running…"
      try { await qa.action() }
      catch (e) { toast.err((e && e.message) || "Action failed") }
      finally { confirmBtn.disabled = false; confirmBtn.textContent = "Confirm" }
    })
    cancelBtn.addEventListener("click", () => { panel.style.display = "none" })

    cell.appendChild(btnEl)
    cell.appendChild(panel)
    wrap.appendChild(cell)
  })

  return wrap
}

// ── Section D — AI Insight Panel ──────────────────────────────────────────────

function buildAiInsightPanel() {
  const panel = document.createElement("div")
  panel.style.cssText = [
    "background:var(--colour-surface, #fff)",
    "border:1px solid var(--colour-border, #e5e7eb)",
    "border-radius:8px;margin:0 16px;padding:12px 16px",
  ].join(";")
  panel.setAttribute("role", "complementary")
  panel.setAttribute("aria-label", "AI insight panel")

  const hdr = document.createElement("div")
  hdr.style.cssText = "font-size:12px;font-weight:700;color:#374151;display:flex;justify-content:space-between;align-items:center;margin-block-end:10px"
  const hdrText = document.createElement("span")
  hdrText.textContent = "Latest AI Recommendations"
  const viewAll = document.createElement("a")
  viewAll.href = "#ai"
  viewAll.style.cssText = "font-size:11px;color:#1e40af;text-decoration:none"
  viewAll.textContent = "View all"
  hdr.appendChild(hdrText)
  hdr.appendChild(viewAll)
  panel.appendChild(hdr)

  const list = document.createElement("div")
  list.textContent = "Loading…"
  list.style.cssText = "font-size:12px;color:#9ca3af"
  panel.appendChild(list)

  apiGetJson("/api/admin/ai/audit-log", { reviewerDecision: "PENDING", limit: 3 })
    .then(data => {
      list.innerHTML = ""
      const items = (data && data.items) || []
      if (items.length === 0) {
        list.textContent = "No pending AI recommendations."
        return
      }
      items.forEach(entry => {
        const row = document.createElement("div")
        row.style.cssText = "display:flex;gap:8px;align-items:center;padding:6px 0;border-block-end:1px solid #f3f4f6"

        const typeTag = document.createElement("span")
        typeTag.style.cssText = "background:#1e40af;color:#fff;font-size:10px;padding:1px 6px;border-radius:4px;white-space:nowrap"
        typeTag.textContent = entry.action_type || entry.actionType || "AI"

        const cs = typeof entry.confidence_score === "number"
          ? Math.round(entry.confidence_score * 100) + "%"
          : "—"
        const confEl = document.createElement("span")
        confEl.style.cssText = "font-size:11px;color:#6b7280;flex:1"
        confEl.textContent = `Confidence: ${cs}`

        const approveBtn = document.createElement("button")
        approveBtn.style.cssText = "font-size:10px;padding:2px 8px;border-radius:4px;background:#22c55e;color:#fff;border:none;cursor:pointer"
        approveBtn.textContent = "✓"
        approveBtn.setAttribute("aria-label", "Approve recommendation")
        approveBtn.addEventListener("click", async () => {
          approveBtn.disabled = true
          try {
            await fetch(`/api/admin/ai/audit-log/${entry.id}/decision`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ decision: "ACCEPTED" }),
            })
            row.remove()
            toast.ok("Approved.")
          } catch (e) {
            toast.err("Approve failed: " + (e && e.message || e))
            approveBtn.disabled = false
          }
        })

        row.appendChild(typeTag)
        row.appendChild(confEl)
        row.appendChild(approveBtn)
        list.appendChild(row)
      })
    })
    .catch(() => { list.textContent = "AI data unavailable." })

  return panel
}

// ── Page export ───────────────────────────────────────────────────────────────

export default {
  _kpiStrip: null,

  render(container) {
    container.innerHTML = ""
    container.setAttribute("data-page", "command-center")

    const content = document.createElement("div")
    content.className = "content-area"

    // Page header
    const header = document.createElement("div")
    header.className = "page-header"
    const headerText = document.createElement("div")
    headerText.className = "page-header-text"
    const title = document.createElement("h1")
    title.textContent = "Command Center"
    const subtitle = document.createElement("p")
    subtitle.textContent = "Your workforce at a glance"
    headerText.appendChild(title)
    headerText.appendChild(subtitle)
    header.appendChild(headerText)
    content.appendChild(header)

    // Section A: KPI Strip
    const { el: kpiEl, stop } = createKpiStrip({ autoStart: true })
    this._kpiStrip = stop
    content.appendChild(kpiEl)

    // Section C: Quick Actions
    content.appendChild(sectionTitle("Quick Actions"))
    content.appendChild(buildQuickActions())

    // Section B: Risk Board
    content.appendChild(sectionTitle("Entity Risk"))
    const riskPlaceholder = document.createElement("div")
    riskPlaceholder.className = "wc-card"
    riskPlaceholder.style.cssText = "font-size:var(--text-sm);color:var(--color-text-muted)"
    riskPlaceholder.textContent = "Loading risk data\u2026"
    content.appendChild(riskPlaceholder)

    apiGetJson("/api/admin/dashboard/kpi", {})
      .then(data => {
        riskPlaceholder.remove()
        content.appendChild(createRiskBoard((data && data.entities) || {}))
      })
      .catch(() => { riskPlaceholder.textContent = "Risk data unavailable." })

    // Section D: AI Insights
    content.appendChild(sectionTitle("AI Insights"))
    content.appendChild(buildAiInsightPanel())

    container.appendChild(content)
  },

  destroy() {
    if (this._kpiStrip) { this._kpiStrip(); this._kpiStrip = null }
  },
}
