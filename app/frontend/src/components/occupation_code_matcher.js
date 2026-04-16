// S36-G4: Occupation Code Matcher component
// Embedded in candidate evaluation screen.
// Vanilla JS, no framework — consistent with platform frontend pattern.
// No hardcoded left/right — logical CSS properties for RTL safety.

import { apiGetJson } from "../api.js"
import { toast }      from "./toast.js"

const FLAG_STYLES = {
  PROHIBITED_TITLE:    { bg: "#ef4444", text: "Prohibited Title"    },
  MISSING_CREDENTIALS: { bg: "#f59e0b", text: "Missing Credentials" },
  LOW_CONFIDENCE:      { bg: "#6b7280", text: "Low Confidence"      },
  UNKNOWN_CODE:        { bg: "#ef4444", text: "Unknown Code"        },
}

function flagBadge(flag) {
  const meta = FLAG_STYLES[flag] || { bg: "#6b7280", text: flag }
  const el   = document.createElement("span")
  el.style.cssText = [
    `background:${meta.bg}`,
    "color:#fff",
    "font-size:10px",
    "font-weight:700",
    "border-radius:4px",
    "padding:1px 6px",
    "margin-inline-end:4px",
    "display:inline-block",
  ].join(";")
  el.textContent = meta.text
  return el
}

function confidenceBar(score) {
  const pct     = Math.round(score * 100)
  const colour  = pct >= 75 ? "#22c55e" : pct >= 50 ? "#f59e0b" : "#ef4444"
  const wrap    = document.createElement("div")
  wrap.style.cssText = "display:flex;align-items:center;gap:8px;min-width:140px"
  const track   = document.createElement("div")
  track.style.cssText = "flex:1;height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden"
  const fill    = document.createElement("div")
  fill.style.cssText  = `width:${pct}%;height:100%;background:${colour};border-radius:3px`
  const label   = document.createElement("span")
  label.style.cssText = `font-size:11px;font-weight:700;color:${colour};min-width:32px`
  label.textContent   = pct + "%"
  track.appendChild(fill)
  wrap.appendChild(track)
  wrap.appendChild(label)
  return wrap
}

/**
 * Create the Occupation Code Matcher component.
 *
 * @param {Object} opts
 * @param {string[]} opts.skills             - candidate skills
 * @param {string}   opts.requisitionTitle   - role title
 * @param {string}   opts.candidateId
 * @param {string}   opts.roleId
 * @param {string}   [opts.tenantId]
 * @param {Function} [opts.onSelect]         - (suggestion) => void — called on HR selection
 * @returns {HTMLElement}
 */
export function createOccupationCodeMatcher({ skills, requisitionTitle, candidateId, roleId, tenantId, onSelect } = {}) {
  const container = document.createElement("div")
  container.className = "occupation-code-matcher"
  container.style.cssText = [
    "background:var(--colour-surface, #fff)",
    "border:1px solid var(--colour-border, #e5e7eb)",
    "border-radius:8px",
    "padding:16px",
    "font-size:13px",
  ].join(";")

  // ── Header ────────────────────────────────────────────────────────────────
  const header = document.createElement("div")
  header.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-block-end:14px"
  const title = document.createElement("span")
  title.style.cssText = "font-weight:700;font-size:14px"
  title.textContent = "Occupation Code Matching"
  const version = document.createElement("span")
  version.style.cssText = "font-size:10px;color:#9ca3af"
  version.id = "occ-policy-version"
  header.appendChild(title)
  header.appendChild(version)
  container.appendChild(header)

  // ── Suggestion list ───────────────────────────────────────────────────────
  const listEl = document.createElement("div")
  listEl.id = "occ-list"
  container.appendChild(listEl)

  // ── Actions ───────────────────────────────────────────────────────────────
  const actions = document.createElement("div")
  actions.style.cssText = "display:flex;gap:8px;margin-block-start:14px;flex-wrap:wrap"
  container.appendChild(actions)

  // State
  let _selected    = null
  let _suggestions = []

  function renderSuggestions(suggestions) {
    _suggestions = suggestions
    listEl.innerHTML = ""

    if (!suggestions.length) {
      listEl.textContent = "No matching occupation codes found for the provided skills."
      listEl.style.color = "#9ca3af"
      return
    }

    suggestions.forEach((s, idx) => {
      const row = document.createElement("div")
      row.style.cssText = [
        "display:flex",
        "align-items:center",
        "gap:10px",
        "padding:10px 12px",
        "border-radius:6px",
        "cursor:" + (s.isProhibited ? "not-allowed" : "pointer"),
        "background:" + (s.isProhibited ? "#fef2f2" : idx === 0 ? "#f0fdf4" : "transparent"),
        "border:1px solid " + (s.isProhibited ? "#fecaca" : "#e5e7eb"),
        "margin-block-end:6px",
        "opacity:" + (s.isProhibited ? "0.7" : "1"),
      ].join(";")

      // Code + titles
      const codeInfo = document.createElement("div")
      codeInfo.style.cssText = "flex:1;min-width:0"
      const codeLine = document.createElement("div")
      codeLine.style.cssText = "font-weight:700;font-size:12px;display:flex;gap:6px;align-items:center"
      const codeTag = document.createElement("span")
      codeTag.style.cssText = "background:#1e40af;color:#fff;padding:1px 6px;border-radius:4px;font-size:10px"
      codeTag.textContent = s.code
      codeLine.appendChild(codeTag)
      const enTitle = document.createElement("span")
      enTitle.textContent = s.titleEN
      codeLine.appendChild(enTitle)
      const arTitle = document.createElement("div")
      arTitle.style.cssText = "font-size:11px;color:#6b7280;direction:rtl"
      arTitle.textContent = s.titleAR
      codeInfo.appendChild(codeLine)
      codeInfo.appendChild(arTitle)
      row.appendChild(codeInfo)

      // Confidence bar
      row.appendChild(confidenceBar(s.confidenceScore))

      // Flags
      const flagsEl = document.createElement("div")
      flagsEl.style.cssText = "display:flex;flex-wrap:wrap;gap:2px"
      if (s.validationFlags.length === 0) {
        const ok = document.createElement("span")
        ok.style.cssText = "font-size:10px;color:#22c55e;font-weight:700"
        ok.textContent = "✓ Clear"
        flagsEl.appendChild(ok)
      } else {
        s.validationFlags.forEach(f => flagsEl.appendChild(flagBadge(f)))
      }
      row.appendChild(flagsEl)

      // Select button — blocked for prohibited
      if (!s.isProhibited) {
        const selectBtn = document.createElement("button")
        selectBtn.style.cssText = [
          "font-size:11px",
          "padding:4px 10px",
          "border-radius:4px",
          "border:1px solid #1e40af",
          "background:#fff",
          "color:#1e40af",
          "cursor:pointer",
          "white-space:nowrap",
        ].join(";")
        selectBtn.textContent = "Select"
        selectBtn.addEventListener("click", () => {
          _selected = s
          // Highlight selected
          listEl.querySelectorAll("div[data-occ-row]").forEach(r => {
            r.style.background = "transparent"
            r.style.border     = "1px solid #e5e7eb"
          })
          row.style.background = "#eff6ff"
          row.style.border     = "1px solid #1e40af"
          // Log HR selection
          _logSelection(s)
          if (onSelect) onSelect(s)
          // Enable report button
          _updateActions()
        })
        row.appendChild(selectBtn)
        row.setAttribute("data-occ-row", s.code)
      } else {
        const blockedTag = document.createElement("span")
        blockedTag.style.cssText = "font-size:10px;color:#ef4444;font-weight:700;white-space:nowrap"
        blockedTag.textContent = "BLOCKED"
        row.appendChild(blockedTag)
      }

      listEl.appendChild(row)
    })
  }

  function _logSelection(suggestion) {
    // Log to audit endpoint (fire-and-forget — non-blocking)
    const token = typeof getToken === "function" ? getToken() : ""
    fetch("/api/admin/compliance/occupation-code/validate", {
      method:  "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + token },
      body:    JSON.stringify({ candidateId, roleId, occupationCode: suggestion.code }),
    }).catch(() => {})
  }

  function _updateActions() {
    actions.innerHTML = ""
    if (_selected) {
      const exportBtn = document.createElement("button")
      exportBtn.className = "btn btn-primary"
      exportBtn.style.fontSize = "12px"
      exportBtn.textContent = "Export Compliance Report"
      exportBtn.addEventListener("click", () => _exportReport())
      actions.appendChild(exportBtn)
    }
  }

  async function _exportReport() {
    if (!_selected) return
    try {
      const token = typeof getToken === "function" ? getToken() : ""
      const res = await fetch("/api/admin/compliance/occupation-code/report", {
        method:  "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer " + token },
        body:    JSON.stringify({
          candidateId,
          roleId,
          occupationCode: _selected.code,
          hrDecision:     "APPROVED",
          tenantId,
        }),
      })
      if (!res.ok) throw new Error("Report generation failed: " + res.status)
      const html     = await res.text()
      const filename = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] || "compliance-report.html"
      const blob     = new Blob([html], { type: "text/html" })
      const url      = URL.createObjectURL(blob)
      const a        = document.createElement("a")
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
      toast.ok("Compliance report downloaded.")
    } catch (err) {
      toast.err("Export failed: " + (err.message || err))
    }
  }

  // ── Initial load ──────────────────────────────────────────────────────────
  ;(async () => {
    listEl.textContent = "Loading occupation code suggestions…"
    listEl.style.color = "#9ca3af"
    try {
      const token = typeof getToken === "function" ? getToken() : ""
      const res = await fetch("/api/admin/compliance/occupation-code/suggest", {
        method:  "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer " + token },
        body:    JSON.stringify({ skills, requisitionTitle, tenantId }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error?.message || "Suggestion failed")
      const versionEl = container.querySelector("#occ-policy-version")
      if (versionEl) versionEl.textContent = "Policy: " + (json.data.policyVersion || "")
      renderSuggestions(json.data.suggestions || [])
    } catch (err) {
      listEl.textContent = "Failed to load suggestions: " + (err.message || err)
      listEl.style.color = "#ef4444"
    }
  })()

  return container
}
