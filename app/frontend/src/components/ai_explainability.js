// S36-G2: AI Explainability Card component
// Reusable — used in ai.js and embeddable in other pages.
// No hardcoded left/right in layout — logical CSS properties for RTL safety.

import { createConfidenceGauge } from "./confidence_gauge.js"
import { toast } from "./toast.js"

const DECISION_LABELS = {
  PENDING:    { text: "Pending",    cls: "badge-amber"  },
  ACCEPTED:   { text: "Accepted",   cls: "badge-green"  },
  REJECTED:   { text: "Rejected",   cls: "badge-red"    },
  OVERRIDDEN: { text: "Overridden", cls: "badge-orange" },
}

const ACTION_LABELS = {
  RECOMMENDATION: "Recommendation",
  MATCH:          "Match",
  COMPLIANCE_HINT:"Compliance",
  SUMMARY:        "Summary",
  RISK_SCORE:     "Risk Score",
}

function badge(text, cls) {
  const el = document.createElement("span")
  el.className = "badge " + (cls || "")
  el.textContent = text
  return el
}

function fieldRow(label, valueEl) {
  const row = document.createElement("div")
  row.style.cssText = "display:flex;gap:8px;margin-block-end:6px;align-items:flex-start"
  const lbl = document.createElement("span")
  lbl.style.cssText = "font-size:11px;color:#888;min-width:120px;padding-block-start:2px"
  lbl.textContent = label
  row.appendChild(lbl)
  if (typeof valueEl === "string") {
    const v = document.createElement("span")
    v.style.cssText = "font-size:12px;word-break:break-all"
    v.textContent = valueEl
    row.appendChild(v)
  } else {
    row.appendChild(valueEl)
  }
  return row
}

/**
 * Create a full explainability card for an audit log entry.
 *
 * @param {Object} entry       - RecommendationAuditLog entry
 * @param {Object} callbacks   - { onApprove(entry), onReject(entry, reason), onOverride(entry, reason) }
 * @param {boolean} readonly   - if true, hide action buttons
 * @returns {HTMLElement}
 */
export function createExplainabilityCard(entry, callbacks = {}, readonly = false) {
  const { onApprove, onReject, onOverride } = callbacks

  const card = document.createElement("div")
  card.className = "explainability-card"
  card.style.cssText = [
    "background:var(--colour-surface, #fff)",
    "border:1px solid var(--colour-border, #e5e7eb)",
    "border-radius:8px",
    "padding:16px",
    "font-size:13px",
  ].join(";")

  // ── Header ──────────────────────────────────────────────────────────────
  const header = document.createElement("div")
  header.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-block-end:12px"

  const actionBadge = badge(
    ACTION_LABELS[entry.action_type] || entry.action_type,
    "badge-blue"
  )
  header.appendChild(actionBadge)

  const decisionInfo = DECISION_LABELS[entry.reviewer_decision] || { text: entry.reviewer_decision, cls: "" }
  header.appendChild(badge(decisionInfo.text, decisionInfo.cls))

  const ts = document.createElement("span")
  ts.style.cssText = "font-size:11px;color:#888;margin-inline-start:auto"
  ts.textContent = new Date(entry.timestamp).toLocaleString()
  header.appendChild(ts)

  card.appendChild(header)

  // ── Confidence gauge ─────────────────────────────────────────────────────
  card.appendChild(fieldRow("Confidence", createConfidenceGauge(entry.confidence_score)))

  // ── Core fields ─────────────────────────────────────────────────────────
  card.appendChild(fieldRow("Actor", String(entry.actor || "—")))
  card.appendChild(fieldRow("Model", String(entry.model_version || "—")))
  card.appendChild(fieldRow("Prompt hash", String((entry.prompt_hash || "").slice(0, 16) + "…")))

  if (entry.rationale) {
    card.appendChild(fieldRow("Rationale", entry.rationale))
  }

  // ── Input signals ────────────────────────────────────────────────────────
  if (entry.input_signals && Object.keys(entry.input_signals).length > 0) {
    const signalsWrap = document.createElement("div")
    signalsWrap.style.cssText = [
      "background:var(--colour-surface-muted, #f9fafb)",
      "border-radius:4px",
      "padding:8px",
      "font-size:11px",
      "font-family:monospace",
      "white-space:pre-wrap",
      "word-break:break-all",
      "margin-block-end:6px",
    ].join(";")
    signalsWrap.textContent = JSON.stringify(entry.input_signals, null, 2)

    card.appendChild(fieldRow("Input signals", signalsWrap))
  }

  // ── Bias score indicator ─────────────────────────────────────────────────
  if (entry.bias_score !== null && entry.bias_score !== undefined) {
    const biasVal = typeof entry.bias_score === "number" ? entry.bias_score : 0
    const biasPct = Math.round(biasVal * 100)
    const biasColour = biasPct === 0 ? "#22c55e" : biasPct < 30 ? "#f59e0b" : "#ef4444"
    const biasEl = document.createElement("span")
    biasEl.style.cssText = `font-size:12px;font-weight:600;color:${biasColour}`
    biasEl.textContent = biasPct + "%"
    if (entry.bias_flagged && entry.bias_sensitive_signals && entry.bias_sensitive_signals.length > 0) {
      biasEl.title = "Sensitive signals: " + entry.bias_sensitive_signals.join(", ")
    }
    card.appendChild(fieldRow("Bias score", biasEl))
  }

  if (readonly || entry.reviewer_decision !== "PENDING") {
    if (entry.reviewer_id) {
      card.appendChild(fieldRow("Reviewed by", String(entry.reviewer_id)))
    }
    if (entry.reviewed_at) {
      card.appendChild(fieldRow("Reviewed at", new Date(entry.reviewed_at).toLocaleString()))
    }
    if (entry.override_reason) {
      card.appendChild(fieldRow("Override reason", entry.override_reason))
    }
    return card
  }

  // ── Action buttons (PENDING only) ────────────────────────────────────────
  const actions = document.createElement("div")
  actions.style.cssText = "display:flex;flex-direction:column;gap:8px;margin-block-start:12px"

  // APPROVE
  if (onApprove) {
    const approveBtn = document.createElement("button")
    approveBtn.className = "btn btn-success"
    approveBtn.textContent = "Approve"
    approveBtn.addEventListener("click", () => {
      approveBtn.disabled = true
      approveBtn.textContent = "Approving…"
      Promise.resolve(onApprove(entry))
        .catch(e => { toast.err("Approve failed: " + (e.message || e)); approveBtn.disabled = false; approveBtn.textContent = "Approve" })
    })
    actions.appendChild(approveBtn)
  }

  // REJECT — requires reason
  if (onReject) {
    const rejectWrap = _buildReasonAction("Reject", "badge-red", "Reason for rejection (required, min 10 chars)", (reason) => onReject(entry, reason), actions)
    actions.appendChild(rejectWrap)
  }

  // OVERRIDE — requires reason
  if (onOverride) {
    const overrideWrap = _buildReasonAction("Override", "badge-orange", "Override reason (required, min 10 chars)", (reason) => onOverride(entry, reason), actions)
    actions.appendChild(overrideWrap)
  }

  card.appendChild(actions)
  return card
}

/**
 * Build an expandable reason-required action block (Reject / Override).
 * Clicking the button reveals a textarea; submission requires >= 10 chars.
 */
function _buildReasonAction(label, btnCls, placeholder, onSubmit) {
  const wrap = document.createElement("div")

  const trigger = document.createElement("button")
  trigger.className = "btn " + btnCls
  trigger.textContent = label
  wrap.appendChild(trigger)

  const form = document.createElement("div")
  form.style.display = "none"
  form.style.cssText = "display:none;flex-direction:column;gap:6px;margin-block-start:4px"

  const textarea = document.createElement("textarea")
  textarea.placeholder = placeholder
  textarea.rows = 3
  textarea.style.cssText = "width:100%;font-size:12px;border:1px solid #d1d5db;border-radius:4px;padding:6px;resize:vertical;box-sizing:border-box"

  const hint = document.createElement("span")
  hint.style.cssText = "font-size:11px;color:#ef4444;display:none"
  hint.textContent = "Reason must be at least 10 characters."

  const submitBtn = document.createElement("button")
  submitBtn.className = "btn btn-primary"
  submitBtn.textContent = "Confirm " + label

  const cancelBtn = document.createElement("button")
  cancelBtn.className = "btn"
  cancelBtn.textContent = "Cancel"

  const btnRow = document.createElement("div")
  btnRow.style.cssText = "display:flex;gap:6px"
  btnRow.appendChild(submitBtn)
  btnRow.appendChild(cancelBtn)

  form.appendChild(textarea)
  form.appendChild(hint)
  form.appendChild(btnRow)
  wrap.appendChild(form)

  trigger.addEventListener("click", () => {
    form.style.display = "flex"
    trigger.style.display = "none"
    textarea.focus()
  })

  cancelBtn.addEventListener("click", () => {
    form.style.display = "none"
    trigger.style.display = ""
    textarea.value = ""
    hint.style.display = "none"
  })

  submitBtn.addEventListener("click", () => {
    const reason = textarea.value.trim()
    if (reason.length < 10) {
      hint.style.display = "block"
      textarea.focus()
      return
    }
    hint.style.display = "none"
    submitBtn.disabled = true
    submitBtn.textContent = "Submitting…"
    Promise.resolve(onSubmit(reason))
      .catch(e => {
        toast.err(label + " failed: " + (e.message || e))
        submitBtn.disabled = false
        submitBtn.textContent = "Confirm " + label
      })
  })

  return wrap
}
