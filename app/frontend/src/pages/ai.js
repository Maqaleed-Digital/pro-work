// S36-G2: AI Control Screen — /ai
// BRD Refs: Gold BRD A4, RT-1 §5.2, WOS §11.2
//
// Sections:
//   A. Activity feed (paginated, filterable)
//   B. Explainability panel (slide-in on row click)
//   C. Pending count badge (fetched on mount)
//   D. Export controls (date range + format + download)
//
// Constraint: AI must never auto-approve.
// All approve/reject/override actions require explicit human click.
// No inline left/right in layout — logical CSS properties for RTL safety.

import { apiGetJson, getTenant } from "../api.js"
import { toast } from "../components/toast.js"
import { createExplainabilityCard } from "../components/ai_explainability.js"
import { createConfidenceGauge } from "../components/confidence_gauge.js"

const PAGE_SIZE = 25

const DECISION_STYLES = {
  PENDING:    { text: "Pending",    bg: "#fef3c7", colour: "#92400e" },
  ACCEPTED:   { text: "Accepted",   bg: "#dcfce7", colour: "#166534" },
  REJECTED:   { text: "Rejected",   bg: "#fee2e2", colour: "#991b1b" },
  OVERRIDDEN: { text: "Overridden", bg: "#ffedd5", colour: "#9a3412" },
}

const ACTION_LABELS = {
  RECOMMENDATION: "Recommendation",
  MATCH:          "Match",
  COMPLIANCE_HINT:"Compliance",
  SUMMARY:        "Summary",
  RISK_SCORE:     "Risk Score",
}

function decisionBadge(decision) {
  const s = DECISION_STYLES[decision] || { text: decision, bg: "#f3f4f6", colour: "#374151" }
  const el = document.createElement("span")
  el.style.cssText = [
    `background:${s.bg}`,
    `color:${s.colour}`,
    "font-size:11px",
    "font-weight:600",
    "padding:2px 6px",
    "border-radius:4px",
    "white-space:nowrap",
  ].join(";")
  el.textContent = s.text
  return el
}

function actionBadge(actionType) {
  const el = document.createElement("span")
  el.style.cssText = [
    "background:#dbeafe",
    "color:#1e40af",
    "font-size:11px",
    "font-weight:600",
    "padding:2px 6px",
    "border-radius:4px",
    "white-space:nowrap",
  ].join(";")
  el.textContent = ACTION_LABELS[actionType] || actionType
  return el
}

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000)  return "just now"
  if (diff < 3600000) return Math.floor(diff / 60000) + "m ago"
  if (diff < 86400000) return Math.floor(diff / 3600000) + "h ago"
  return Math.floor(diff / 86400000) + "d ago"
}

async function apiPatch(path, body) {
  const { getToken, getTenant } = await import("../api.js")
  const resp = await fetch(path, {
    method: "PATCH",
    headers: {
      "Authorization": "Bearer " + getToken(),
      "X-Tenant-Id":   getTenant(),
      "content-type":  "application/json",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
  })
  const text = await resp.text()
  const json = text ? JSON.parse(text) : null
  if (!json || json.ok !== true) {
    const e = new Error((json && json.error && json.error.message) || "Request failed")
    e.status = resp.status
    throw e
  }
  return json.data
}

export default {
  render(container) {
    let currentOffset  = 0
    let currentFilters = {}
    let panelEntry     = null
    let allTotal       = 0

    // ── Page title ───────────────────────────────────────────────────────────
    const title = document.createElement("div")
    title.className = "page-title"
    title.textContent = "AI Control"
    container.appendChild(title)

    // ── Layout: feed (left) + panel (right) ──────────────────────────────────
    const layout = document.createElement("div")
    layout.style.cssText = [
      "display:grid",
      "grid-template-columns:1fr",
      "gap:16px",
    ].join(";")
    container.appendChild(layout)

    // ── SECTION A: Filters bar ───────────────────────────────────────────────
    const filters = document.createElement("div")
    filters.className = "filters"
    filters.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-block-end:12px"

    function filterLabel(text, child) {
      const lbl = document.createElement("label")
      lbl.style.cssText = "display:flex;flex-direction:column;gap:3px;font-size:11px;color:#888"
      lbl.textContent = text
      lbl.appendChild(child)
      return lbl
    }

    const actionSel = document.createElement("select")
    ;["", "RECOMMENDATION", "MATCH", "COMPLIANCE_HINT", "SUMMARY", "RISK_SCORE"].forEach(v => {
      const o = document.createElement("option"); o.value = v
      o.textContent = v ? ACTION_LABELS[v] : "All types"
      actionSel.appendChild(o)
    })

    const decisionSel = document.createElement("select")
    ;["", "PENDING", "ACCEPTED", "REJECTED", "OVERRIDDEN"].forEach(v => {
      const o = document.createElement("option"); o.value = v
      o.textContent = v || "All decisions"
      decisionSel.appendChild(o)
    })

    const applyBtn = document.createElement("button")
    applyBtn.className = "btn btn-primary"
    applyBtn.textContent = "Apply"

    const resetBtn = document.createElement("button")
    resetBtn.className = "btn"
    resetBtn.textContent = "Reset"

    filters.appendChild(filterLabel("Action type", actionSel))
    filters.appendChild(filterLabel("Decision", decisionSel))
    filters.appendChild(applyBtn)
    filters.appendChild(resetBtn)
    layout.appendChild(filters)

    // ── SECTION A: Activity feed table ───────────────────────────────────────
    const feedWrap = document.createElement("div")
    layout.appendChild(feedWrap)

    const tableWrap = document.createElement("div")
    tableWrap.className = "table-wrap"
    feedWrap.appendChild(tableWrap)

    // Pagination bar
    const pagBar = document.createElement("div")
    pagBar.style.cssText = "display:flex;gap:8px;align-items:center;margin-block-start:8px;font-size:12px"
    const prevBtn = document.createElement("button")
    prevBtn.className = "btn"; prevBtn.textContent = "← Prev"
    const nextBtn = document.createElement("button")
    nextBtn.className = "btn"; nextBtn.textContent = "Next →"
    const pageInfo = document.createElement("span")
    pageInfo.style.color = "#888"
    pagBar.appendChild(prevBtn)
    pagBar.appendChild(pageInfo)
    pagBar.appendChild(nextBtn)
    feedWrap.appendChild(pagBar)

    // ── SECTION B: Explainability panel ──────────────────────────────────────
    const panel = document.createElement("div")
    panel.className = "explainability-panel"
    panel.style.cssText = [
      "display:none",
      "border:1px solid var(--colour-border, #e5e7eb)",
      "border-radius:8px",
      "padding:16px",
      "background:var(--colour-surface, #fff)",
      "margin-block-start:12px",
    ].join(";")
    layout.appendChild(panel)

    // ── SECTION D: Export controls ───────────────────────────────────────────
    const exportBar = document.createElement("div")
    exportBar.style.cssText = [
      "display:flex",
      "flex-wrap:wrap",
      "gap:8px",
      "align-items:flex-end",
      "padding-block-start:12px",
      "border-block-start:1px solid var(--colour-border, #e5e7eb)",
      "margin-block-start:16px",
    ].join(";")

    function exportLabel(text, child) {
      const lbl = document.createElement("label")
      lbl.style.cssText = "display:flex;flex-direction:column;gap:3px;font-size:11px;color:#888"
      lbl.textContent = text
      lbl.appendChild(child)
      return lbl
    }

    const formatSel = document.createElement("select")
    ;["json", "csv"].forEach(v => {
      const o = document.createElement("option"); o.value = v
      o.textContent = v.toUpperCase()
      formatSel.appendChild(o)
    })

    const exportBtn = document.createElement("button")
    exportBtn.className = "btn btn-primary"
    exportBtn.textContent = "Export audit log"

    exportBar.appendChild(exportLabel("Format", formatSel))
    exportBar.appendChild(exportBtn)
    layout.appendChild(exportBar)

    // ── Helpers ──────────────────────────────────────────────────────────────
    function setLoading(v) {
      applyBtn.disabled = v
      resetBtn.disabled = v
      prevBtn.disabled  = v
      nextBtn.disabled  = v
    }

    function openPanel(entry) {
      panelEntry = entry
      panel.innerHTML = ""

      const closeRow = document.createElement("div")
      closeRow.style.cssText = "display:flex;justify-content:flex-end;margin-block-end:8px"
      const closeBtn = document.createElement("button")
      closeBtn.className = "btn"; closeBtn.textContent = "✕ Close"
      closeBtn.addEventListener("click", () => { panel.style.display = "none"; panelEntry = null })
      closeRow.appendChild(closeBtn)
      panel.appendChild(closeRow)

      const card = createExplainabilityCard(entry, {
        onApprove: async (e) => {
          await apiPatch(`/api/admin/ai/audit-log/${e.id}/decision`, {
            decision: "ACCEPTED", reviewerId: getTenant() + "-admin",
          })
          toast.ok("Approved")
          panel.style.display = "none"
          fetchPage()
        },
        onReject: async (e, reason) => {
          await apiPatch(`/api/admin/ai/audit-log/${e.id}/decision`, {
            decision: "REJECTED", reason, reviewerId: getTenant() + "-admin",
          })
          toast.ok("Rejected")
          panel.style.display = "none"
          fetchPage()
        },
        onOverride: async (e, reason) => {
          await apiPatch(`/api/admin/ai/audit-log/${e.id}/decision`, {
            decision: "OVERRIDDEN", reason, reviewerId: getTenant() + "-admin",
          })
          toast.ok("Overridden")
          panel.style.display = "none"
          fetchPage()
        },
      })

      panel.appendChild(card)
      panel.style.display = "block"
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }

    function buildTable(entries) {
      tableWrap.innerHTML = ""

      if (!entries || entries.length === 0) {
        const empty = document.createElement("div")
        empty.style.cssText = "padding:24px;text-align:center;color:#888;font-size:13px"
        empty.textContent = "No audit log entries found."
        tableWrap.appendChild(empty)
        return
      }

      const table = document.createElement("table")
      const thead = document.createElement("thead")
      const hr = document.createElement("tr")
      ;["Type", "Confidence", "Decision", "When", "Actor", ""].forEach(h => {
        const th = document.createElement("th"); th.textContent = h; hr.appendChild(th)
      })
      thead.appendChild(hr); table.appendChild(thead)

      const tbody = document.createElement("tbody")
      entries.forEach(entry => {
        const tr = document.createElement("tr")
        tr.style.cursor = "pointer"
        tr.setAttribute("tabindex", "0")
        tr.setAttribute("aria-label", `${ACTION_LABELS[entry.action_type] || entry.action_type} — ${entry.reviewer_decision}`)

        // Action type
        const tdType = document.createElement("td")
        tdType.appendChild(actionBadge(entry.action_type))
        tr.appendChild(tdType)

        // Confidence bar
        const tdConf = document.createElement("td")
        tdConf.appendChild(createConfidenceGauge(entry.confidence_score))
        tr.appendChild(tdConf)

        // Decision badge
        const tdDec = document.createElement("td")
        tdDec.appendChild(decisionBadge(entry.reviewer_decision))
        tr.appendChild(tdDec)

        // Timestamp
        const tdTs = document.createElement("td")
        tdTs.className = "mono"
        tdTs.title = new Date(entry.timestamp).toISOString()
        tdTs.textContent = relativeTime(entry.timestamp)
        tr.appendChild(tdTs)

        // Actor
        const tdActor = document.createElement("td")
        tdActor.style.cssText = "font-size:11px;color:#888;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
        tdActor.textContent = String(entry.actor || "—")
        tr.appendChild(tdActor)

        // Expand chevron
        const tdChev = document.createElement("td")
        tdChev.style.cssText = "text-align:end;color:#888;font-size:14px"
        tdChev.textContent = "›"
        tr.appendChild(tdChev)

        function expand() { openPanel(entry) }
        tr.addEventListener("click", expand)
        tr.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); expand() } })

        tbody.appendChild(tr)
      })

      table.appendChild(tbody)
      tableWrap.appendChild(table)
    }

    function fetchPage() {
      setLoading(true)
      tableWrap.innerHTML = '<div style="padding:16px;color:#888;font-size:13px">Loading…</div>'

      const params = {
        limit:  PAGE_SIZE,
        offset: currentOffset,
        ...currentFilters,
      }

      apiGetJson("/api/admin/ai/audit-log", params)
        .then(data => {
          allTotal = data.total || 0
          buildTable(data.entries || [])

          const page = Math.floor(currentOffset / PAGE_SIZE) + 1
          const pages = Math.max(1, Math.ceil(allTotal / PAGE_SIZE))
          pageInfo.textContent = `Page ${page} of ${pages} (${allTotal} total)`

          prevBtn.disabled = currentOffset === 0
          nextBtn.disabled = currentOffset + PAGE_SIZE >= allTotal
        })
        .catch(e => {
          tableWrap.innerHTML = `<div style="padding:16px;color:#ef4444;font-size:13px">${e.message || "Failed to load"}</div>`
          toast.err("Load failed: " + (e.message || e))
        })
        .finally(() => setLoading(false))
    }

    // ── Section C: Pending count ─────────────────────────────────────────────
    // Fetched on mount — result is used by the pending filter shortcut
    function fetchPendingCount() {
      apiGetJson("/api/admin/ai/audit-log/pending/count", {})
        .then(data => {
          if (data && data.count > 0) {
            const notice = document.createElement("div")
            notice.style.cssText = [
              "background:#fef3c7",
              "color:#92400e",
              "font-size:12px",
              "font-weight:600",
              "padding:6px 12px",
              "border-radius:6px",
              "margin-block-end:8px",
              "cursor:pointer",
            ].join(";")
            notice.textContent = `${data.count} recommendation${data.count === 1 ? "" : "s"} pending review — click to filter`
            notice.addEventListener("click", () => {
              decisionSel.value = "PENDING"
              currentFilters = { reviewerDecision: "PENDING" }
              currentOffset = 0
              fetchPage()
            })
            // Insert before filters
            layout.insertBefore(notice, filters)
          }
        })
        .catch(() => {})
    }

    // ── Wire events ──────────────────────────────────────────────────────────
    applyBtn.addEventListener("click", () => {
      currentFilters = {}
      if (actionSel.value)   currentFilters.actionType       = actionSel.value
      if (decisionSel.value) currentFilters.reviewerDecision = decisionSel.value
      currentOffset = 0
      fetchPage()
    })

    resetBtn.addEventListener("click", () => {
      actionSel.value   = ""
      decisionSel.value = ""
      currentFilters    = {}
      currentOffset     = 0
      fetchPage()
    })

    prevBtn.addEventListener("click", () => {
      if (currentOffset === 0) return
      currentOffset = Math.max(0, currentOffset - PAGE_SIZE)
      fetchPage()
    })

    nextBtn.addEventListener("click", () => {
      if (currentOffset + PAGE_SIZE >= allTotal) return
      currentOffset += PAGE_SIZE
      fetchPage()
    })

    exportBtn.addEventListener("click", () => {
      const format = formatSel.value
      exportBtn.disabled = true
      exportBtn.textContent = "Exporting…"

      const tenant = getTenant()
      const url    = `/api/admin/ai/audit-log/export?format=${format}&tenantId=${encodeURIComponent(tenant)}`

      fetch(url, {
        headers: {
          "Authorization": "Bearer " + (typeof getToken === "function" ? getToken() : ""),
          "X-Tenant-Id":   tenant,
          "cache-control": "no-store",
        },
      })
        .then(async resp => {
          if (!resp.ok) throw new Error("Export failed: " + resp.status)
          const blob = await resp.blob()
          const dlUrl = URL.createObjectURL(blob)
          const a = document.createElement("a")
          a.href = dlUrl
          a.download = `ai-audit-log-${tenant}-${Date.now()}.${format}`
          a.click()
          URL.revokeObjectURL(dlUrl)
          toast.ok("Export downloaded")
        })
        .catch(e => toast.err("Export failed: " + (e.message || e)))
        .finally(() => { exportBtn.disabled = false; exportBtn.textContent = "Export audit log" })
    })

    // ── Initial load ─────────────────────────────────────────────────────────
    fetchPendingCount()
    fetchPage()
  },
}
