// WC-CB Day 6 (D-Day, 2026-05-15): Trust surfaces per brief §6.
//
// Authority:
//   - brief §6 — Audit-trail viewer, Consent ledger, Data export
//     (CSV/PDF), Data residency confirmation.
//   - PROPOSAL §11.A2 stricter rule: residency claim minimal and
//     accurate; no over-claiming certifications not held.
//   - PROPOSAL §11.A4 NO PHANTOM FEATURES: features missing a backend
//     endpoint render "Coming later" with disabled controls.
//   - Sponsor stricter rules today (2026-05-15):
//     * Residency claim minimal and accurate.
//     * Consent revoke labelled "Coming later" if no backend route.
//     * Export uses QueuedAction pattern (src/components/queued_action.js).
//
// Unified Trust hub with four tabs (mirrors Settings pattern from Day 4):
//   1. Audit trail   — AI audit log + evidence-access audit
//   2. Consent       — current grants + DSR submission + DSR history
//   3. Data export   — evidence pack list + queued export
//   4. Residency     — minimal Cloud Blueprint v2.1 statement

import { t, getLocale } from "../locale.js"
import { listAuditTrail } from "../api/audit.js"
import { getCurrentConsents, listDsrs, submitDsr, DSR_TYPES } from "../api/pdpl.js"
import { listEvidencePacks, exportEvidencePack } from "../api/evidence.js"
import { renderModeStatusChip } from "../components/mode_status_chip.js"
import { renderAgentAttributionMarker } from "../components/agent_attribution_marker.js"
import { renderConfidenceBand } from "../components/confidence_band.js"
import { createActionQueue, renderQueueIndicator } from "../components/queued_action.js"
import {
  renderLoadingState, renderEmptyState, renderErrorState,
  renderPermissionDeniedState,
} from "../components/edge_state.js"

const TABS = [
  { key: "audit",     icon: "📋" },
  { key: "consent",   icon: "🔐" },
  { key: "export",    icon: "📤" },
  { key: "residency", icon: "📍" },
]

let _activeTab = "audit"
let _queue = null
let _queueIndicator = null

function render(el) {
  el.innerHTML = ""
  const locale = getLocale()

  // Initialise queued-action queue once per page load
  if (!_queue) {
    _queue = createActionQueue()
    _queueIndicator = renderQueueIndicator(_queue)
    document.body.appendChild(_queueIndicator)
  }

  const wrap = document.createElement("div")
  wrap.className = "content-area"

  // Header
  const header = document.createElement("header"); header.className = "page-header"
  const ht = document.createElement("div"); ht.className = "page-header-text"
  const h1 = document.createElement("h1"); h1.textContent = t("trust.title")
  const sub = document.createElement("p"); sub.textContent = t("trust.subtitle")
  ht.appendChild(h1); ht.appendChild(sub); header.appendChild(ht)
  wrap.appendChild(header)

  // Tab layout
  const layout = document.createElement("div")
  layout.style.cssText = "display:grid;grid-template-columns:minmax(220px,260px) 1fr;gap:var(--maq-space-6);padding-inline:var(--maq-space-4);align-items:start"

  const tabList = document.createElement("nav")
  tabList.setAttribute("role", "tablist")
  tabList.setAttribute("aria-label", t("trust.title"))
  tabList.style.cssText = "display:flex;flex-direction:column;gap:var(--maq-space-1)"

  const panel = document.createElement("section")
  panel.setAttribute("role", "tabpanel")
  panel.setAttribute("aria-live", "polite")

  for (const tab of TABS) {
    const btn = document.createElement("button")
    btn.type = "button"
    btn.setAttribute("role", "tab")
    btn.setAttribute("data-tab", tab.key)
    btn.setAttribute("aria-selected", String(tab.key === _activeTab))
    btn.style.cssText = [
      "display:flex",
      "align-items:center",
      "gap:var(--maq-space-3)",
      "padding:var(--maq-space-3) var(--maq-space-4)",
      "background:" + (tab.key === _activeTab ? "var(--maq-brand-primary-bg)" : "transparent"),
      "color:" + (tab.key === _activeTab ? "var(--maq-brand-primary)" : "var(--maq-neutral-700)"),
      "border:1px solid " + (tab.key === _activeTab ? "var(--maq-brand-primary)" : "transparent"),
      "border-radius:var(--maq-radius-md)",
      "font-family:inherit",
      "font-size:var(--maq-text-sm)",
      "font-weight:" + (tab.key === _activeTab ? "var(--maq-weight-semibold)" : "var(--maq-weight-medium)"),
      "cursor:pointer",
      "text-align:start",
      "min-height:40px",
    ].join(";")
    const ic = document.createElement("span"); ic.setAttribute("aria-hidden", "true"); ic.textContent = tab.icon
    const lbl = document.createElement("span"); lbl.textContent = t(`trust.tab.${tab.key}`)
    btn.appendChild(ic); btn.appendChild(lbl)
    btn.addEventListener("click", () => { _activeTab = tab.key; render(el) })
    tabList.appendChild(btn)
  }

  layout.appendChild(tabList)
  layout.appendChild(panel)
  wrap.appendChild(layout)
  el.appendChild(wrap)

  switch (_activeTab) {
    case "consent":   return renderConsent(panel, locale)
    case "export":    return renderExport(panel, locale)
    case "residency": return renderResidency(panel, locale)
    case "audit":
    default:          return renderAudit(panel, locale)
  }
}

// ── Tab: Audit trail ─────────────────────────────────────────────────
async function renderAudit(panel, locale) {
  panel.innerHTML = panelHeading(t("trust.audit.title"), t("trust.audit.subtitle"))
  const container = document.createElement("div")
  container.appendChild(renderLoadingState({ skeletonRows: 6 }))
  panel.appendChild(container)

  try {
    const { entries } = await listAuditTrail({ limit: 50 })
    container.innerHTML = ""
    if (!entries || entries.length === 0) {
      container.appendChild(renderEmptyState({
        icon: "🧾",
        title: { en: "No audit events yet", ar: "لا توجد أحداث مراجعة بعد" },
        body: { en: "Once agent recommendations or evidence-pack access occur, they will appear here with their correlation IDs.",
                ar: "بعد ظهور توصيات المستشار أو وصول حزم الأدلة، ستظهر هنا مع معرّفات الارتباط." },
        locale,
      }))
      return
    }
    const list = document.createElement("ol")
    list.setAttribute("aria-label", t("trust.audit.title"))
    list.style.cssText = "list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:var(--maq-space-2)"
    for (const e of entries) {
      list.appendChild(renderAuditRow(e, locale))
    }
    container.appendChild(list)
  } catch (err) {
    container.innerHTML = ""
    if (err && (err.status === 403 || err.code === "FORBIDDEN")) {
      container.appendChild(renderPermissionDeniedState({ locale }))
    } else {
      container.appendChild(renderErrorState({ error: err, retry: () => renderAudit(panel, locale), locale }))
    }
  }

  // "Data changes" filter — labelled Coming later (no VERITAS surface today)
  const note = document.createElement("p")
  note.setAttribute("role", "note")
  note.style.cssText = "margin-block-start:var(--maq-space-6);padding:var(--maq-space-3);background:var(--maq-neutral-50);border-radius:var(--maq-radius-md);font-size:var(--maq-text-sm);color:var(--maq-neutral-600);max-inline-size:680px"
  note.textContent = t("trust.audit.dataChangesNote")
  panel.appendChild(note)
}

function renderAuditRow(e, locale) {
  const li = document.createElement("li")
  li.style.cssText = "background:var(--maq-neutral-0);border:1px solid var(--maq-neutral-200);border-radius:var(--maq-radius-md);padding:var(--maq-space-3) var(--maq-space-4);display:flex;flex-direction:column;gap:var(--maq-space-2)"

  const top = document.createElement("div")
  top.style.cssText = "display:flex;gap:var(--maq-space-3);align-items:center;flex-wrap:wrap"

  // Type chip
  const typeChip = document.createElement("span")
  const typeLabel = e.type === "agent_action" ? t("trust.audit.typeAgentAction")
                  : e.type === "human_approval" ? t("trust.audit.typeHumanApproval")
                  : t("trust.audit.typeEvidenceAccess")
  typeChip.textContent = typeLabel
  const typeTone = e.type === "agent_action" ? "var(--maq-agent-attributed)"
                 : e.type === "human_approval" ? "var(--maq-semantic-success)"
                 : "var(--maq-neutral-600)"
  const typeBg   = e.type === "agent_action" ? "var(--maq-agent-attributed-bg)"
                 : e.type === "human_approval" ? "var(--maq-semantic-success-bg)"
                 : "var(--maq-neutral-100)"
  typeChip.style.cssText = `padding-inline:var(--maq-space-2);padding-block:2px;background:${typeBg};color:${typeTone};border-radius:var(--maq-radius-sm);font-size:var(--maq-text-xs);font-weight:var(--maq-weight-semibold);letter-spacing:var(--maq-tracking-wide)`
  top.appendChild(typeChip)

  // Agent attribution (when applicable)
  if (e.agentName) {
    top.appendChild(renderAgentAttributionMarker({
      agent: { name: e.agentName, class: "platform-scoped" },
      variant: "badge",
      locale,
    }))
  }

  // Timestamp
  const ts = document.createElement("span")
  ts.style.cssText = "margin-inline-start:auto;font-family:var(--maq-font-mono);font-size:var(--maq-text-xs);color:var(--maq-neutral-500)"
  ts.textContent = e.timestamp ? new Date(e.timestamp).toLocaleString(locale === "ar" ? "ar-SA" : "en-GB") : "—"
  top.appendChild(ts)

  li.appendChild(top)

  // Action / decision
  const action = document.createElement("p")
  action.style.cssText = "margin:0;font-weight:var(--maq-weight-medium);color:var(--maq-neutral-900)"
  let actionText = e.actionType || ""
  if (e.reviewerDecision && e.reviewerDecision !== "PENDING") {
    actionText += ` — ${e.reviewerDecision}`
  }
  action.textContent = actionText || "—"
  li.appendChild(action)

  if (e.rationale) {
    const r = document.createElement("p")
    r.style.cssText = "margin:0;font-size:var(--maq-text-sm);color:var(--maq-neutral-700);line-height:var(--maq-leading-relaxed)"
    r.textContent = e.rationale
    li.appendChild(r)
  }

  // Confidence (if calibrated band only)
  if (typeof e.confidence === "number") {
    const cb = renderConfidenceBand({
      band: e.confidence >= 0.8 ? "high" : e.confidence >= 0.5 ? "moderate" : "low",
      value: e.confidence,
      calibrated: false,  // Stricter: not calibrated unless backend says so
      locale,
    })
    cb.style.alignSelf = "flex-start"
    li.appendChild(cb)
  }

  // Correlation ID
  if (e.correlationId) {
    const cid = document.createElement("p")
    cid.style.cssText = "margin:0;font-family:var(--maq-font-mono);font-size:var(--maq-text-xs);color:var(--maq-neutral-500)"
    cid.textContent = `${t("trust.audit.correlationId")}: ${e.correlationId}`
    li.appendChild(cid)
  }

  return li
}

// ── Tab: Consent ledger ──────────────────────────────────────────────
async function renderConsent(panel, locale) {
  panel.innerHTML = panelHeading(t("trust.consent.title"), t("trust.consent.subtitle"))

  // Current consent state
  const consentContainer = document.createElement("div")
  consentContainer.appendChild(renderLoadingState({ skeletonRows: 2 }))
  panel.appendChild(consentContainer)

  // DSR history
  const dsrSection = document.createElement("section")
  dsrSection.style.cssText = "margin-block-start:var(--maq-space-6)"
  const dsrTitle = document.createElement("h3")
  dsrTitle.style.cssText = "font-size:var(--maq-text-lg);font-weight:var(--maq-weight-semibold);margin:0 0 var(--maq-space-2);color:var(--maq-neutral-900)"
  dsrTitle.textContent = t("trust.consent.dsrTitle")
  dsrSection.appendChild(dsrTitle)
  const dsrSub = document.createElement("p")
  dsrSub.style.cssText = "color:var(--maq-neutral-600);margin:0 0 var(--maq-space-4);font-size:var(--maq-text-sm);max-inline-size:680px"
  dsrSub.textContent = t("trust.consent.dsrSubtitle")
  dsrSection.appendChild(dsrSub)

  const dsrForm = renderDsrForm(locale)
  dsrSection.appendChild(dsrForm)

  const dsrListContainer = document.createElement("div")
  dsrListContainer.style.cssText = "margin-block-start:var(--maq-space-4)"
  dsrSection.appendChild(dsrListContainer)
  panel.appendChild(dsrSection)

  try {
    const consents = await getCurrentConsents()
    consentContainer.innerHTML = ""
    if (!consents.granted || consents.items.length === 0) {
      consentContainer.appendChild(renderEmptyState({
        icon: "🔐",
        title: { en: "No active consents recorded", ar: "لا توجد موافقات نشطة" },
        body: { en: "Complete onboarding to record your PDPL processing consent.",
                ar: "أكمل الإعداد لتسجيل موافقتك على معالجة البيانات الشخصية." },
        actionLabel: { en: "Onboarding", ar: "الإعداد" },
        actionHref: "#onboarding",
        locale,
      }))
    } else {
      const list = document.createElement("ul")
      list.setAttribute("role", "list")
      list.style.cssText = "list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:var(--maq-space-2)"
      for (const c of consents.items) {
        list.appendChild(renderConsentRow(c, locale))
      }
      consentContainer.appendChild(list)
    }
  } catch (err) {
    consentContainer.innerHTML = ""
    consentContainer.appendChild(renderErrorState({ error: err, locale }))
  }

  // Load DSR history
  refreshDsrList(dsrListContainer, locale).catch(() => {})
}

function renderConsentRow(c, locale) {
  const li = document.createElement("li")
  li.style.cssText = "background:var(--maq-neutral-0);border:1px solid var(--maq-neutral-200);border-radius:var(--maq-radius-md);padding:var(--maq-space-3) var(--maq-space-4);display:flex;align-items:center;gap:var(--maq-space-3);flex-wrap:wrap"

  const body = document.createElement("div"); body.style.cssText = "flex:1;min-inline-size:0"
  const lbl = document.createElement("p")
  lbl.style.cssText = "margin:0;font-weight:var(--maq-weight-medium);color:var(--maq-neutral-900)"
  lbl.textContent = (c.label && c.label[locale]) || (c.label && c.label.en) || c.id
  body.appendChild(lbl)
  const meta = document.createElement("p")
  meta.style.cssText = "margin:var(--maq-space-1) 0 0;font-size:var(--maq-text-xs);color:var(--maq-neutral-500)"
  const grantedAt = c.grantedAt ? new Date(c.grantedAt).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-GB") : "—"
  meta.textContent = `${locale === "ar" ? "النسخة" : "Version"}: ${c.version || "v1"} · ${locale === "ar" ? "ممنوحة" : "Granted"}: ${grantedAt}`
  body.appendChild(meta)
  li.appendChild(body)

  // Revoke (Coming later per Sponsor stricter today)
  const revoke = document.createElement("button")
  revoke.type = "button"
  revoke.disabled = true
  revoke.setAttribute("aria-disabled", "true")
  revoke.title = t("trust.consent.revokeComingSoon")
  revoke.style.cssText = "padding:var(--maq-space-1) var(--maq-space-3);background:transparent;color:var(--maq-neutral-500);border:1px dashed var(--maq-neutral-300);border-radius:var(--maq-radius-sm);cursor:not-allowed;font-family:inherit;font-size:var(--maq-text-xs)"
  revoke.textContent = `${t("trust.consent.revoke")} · ${t("common.comingSoon")}`
  li.appendChild(revoke)

  return li
}

function renderDsrForm(locale) {
  const form = document.createElement("form")
  form.addEventListener("submit", e => e.preventDefault())
  form.style.cssText = "background:var(--maq-neutral-50);padding:var(--maq-space-4);border-radius:var(--maq-radius-md);display:flex;flex-direction:column;gap:var(--maq-space-3);max-inline-size:680px"

  const typeLabel = document.createElement("label")
  typeLabel.htmlFor = "dsr-type"
  typeLabel.style.cssText = "font-size:var(--maq-text-sm);font-weight:var(--maq-weight-medium)"
  typeLabel.textContent = t("trust.consent.dsrTypeLabel")
  const typeSelect = document.createElement("select")
  typeSelect.id = "dsr-type"
  typeSelect.style.cssText = "padding:var(--maq-space-2) var(--maq-space-3);border:1px solid var(--maq-neutral-300);border-radius:var(--maq-radius-md);font-family:inherit;font-size:var(--maq-text-sm)"
  for (const tp of DSR_TYPES) {
    const opt = document.createElement("option"); opt.value = tp; opt.textContent = t(`trust.consent.dsr.${tp}`)
    typeSelect.appendChild(opt)
  }
  form.appendChild(typeLabel); form.appendChild(typeSelect)

  const descLabel = document.createElement("label")
  descLabel.htmlFor = "dsr-desc"
  descLabel.style.cssText = "font-size:var(--maq-text-sm);font-weight:var(--maq-weight-medium)"
  descLabel.textContent = t("trust.consent.dsrDescLabel")
  const desc = document.createElement("textarea")
  desc.id = "dsr-desc"
  desc.rows = 3
  desc.placeholder = t("trust.consent.dsrDescPlaceholder")
  desc.style.cssText = "padding:var(--maq-space-2) var(--maq-space-3);border:1px solid var(--maq-neutral-300);border-radius:var(--maq-radius-md);font-family:inherit;font-size:var(--maq-text-sm);resize:vertical"
  form.appendChild(descLabel); form.appendChild(desc)

  const err = document.createElement("p")
  err.setAttribute("role", "alert"); err.setAttribute("aria-live", "polite")
  err.style.cssText = "margin:0;min-height:1em;color:var(--maq-semantic-danger);font-size:var(--maq-text-sm)"
  form.appendChild(err)

  const submit = document.createElement("button")
  submit.type = "submit"
  submit.style.cssText = "align-self:flex-start;padding:var(--maq-space-2) var(--maq-space-4);background:var(--maq-brand-primary);color:var(--maq-brand-on-primary);border:none;border-radius:var(--maq-radius-md);cursor:pointer;font-family:inherit;font-weight:var(--maq-weight-semibold);min-height:38px"
  submit.textContent = t("trust.consent.dsrSubmit")
  submit.addEventListener("click", async () => {
    err.textContent = ""
    const description = desc.value.trim()
    if (description.length < 5) {
      err.textContent = t("trust.consent.dsrDescErr")
      return
    }
    submit.disabled = true
    submit.textContent = t("common.loading")
    try {
      await submitDsr({ type: typeSelect.value, description })
      desc.value = ""
      err.style.color = "var(--maq-semantic-success)"
      err.textContent = t("trust.consent.dsrSubmitted")
      const dsrListContainer = form.parentElement && form.parentElement.querySelector("[data-component=dsr-list]")
      if (dsrListContainer) refreshDsrList(dsrListContainer, locale).catch(() => {})
    } catch (e) {
      err.style.color = "var(--maq-semantic-danger)"
      err.textContent = e.message || t("trust.consent.dsrErr")
    } finally {
      submit.disabled = false
      submit.textContent = t("trust.consent.dsrSubmit")
    }
  })
  form.appendChild(submit)
  return form
}

async function refreshDsrList(container, locale) {
  container.setAttribute("data-component", "dsr-list")
  container.innerHTML = ""
  container.appendChild(renderLoadingState({ skeletonRows: 2 }))
  try {
    const { dsrs } = await listDsrs()
    container.innerHTML = ""
    container.setAttribute("data-component", "dsr-list")
    if (!dsrs || dsrs.length === 0) {
      const empty = document.createElement("p")
      empty.style.cssText = "color:var(--maq-neutral-500);font-size:var(--maq-text-sm);padding-inline:var(--maq-space-3)"
      empty.textContent = t("trust.consent.dsrEmpty")
      container.appendChild(empty)
      return
    }
    const list = document.createElement("ul")
    list.setAttribute("role", "list")
    list.style.cssText = "list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:var(--maq-space-2)"
    for (const r of dsrs) list.appendChild(renderDsrRow(r, locale))
    container.appendChild(list)
  } catch (e) {
    container.innerHTML = ""
    container.appendChild(renderErrorState({ error: e, locale }))
  }
}

function renderDsrRow(r, locale) {
  const li = document.createElement("li")
  li.style.cssText = "background:var(--maq-neutral-0);border:1px solid var(--maq-neutral-200);border-radius:var(--maq-radius-md);padding:var(--maq-space-3);display:flex;align-items:center;gap:var(--maq-space-3);flex-wrap:wrap"
  const typeBadge = document.createElement("span")
  typeBadge.style.cssText = "padding-inline:var(--maq-space-2);padding-block:2px;background:var(--maq-neutral-100);color:var(--maq-neutral-700);border-radius:var(--maq-radius-sm);font-size:var(--maq-text-xs);font-weight:var(--maq-weight-semibold)"
  typeBadge.textContent = r.type || "—"
  li.appendChild(typeBadge)
  const desc = document.createElement("span")
  desc.style.cssText = "flex:1;font-size:var(--maq-text-sm);min-inline-size:160px"
  desc.textContent = r.description || ""
  li.appendChild(desc)
  const stPill = document.createElement("span")
  const isClosed = String(r.status || "").toUpperCase() === "COMPLETED" || String(r.status || "").toUpperCase() === "REJECTED"
  stPill.style.cssText = `padding-inline:var(--maq-space-2);padding-block:2px;background:${isClosed ? "var(--maq-semantic-success-bg)" : "var(--maq-semantic-warning-bg)"};color:${isClosed ? "var(--maq-semantic-success)" : "var(--maq-semantic-warning)"};border-radius:var(--maq-radius-sm);font-size:var(--maq-text-xs);font-weight:var(--maq-weight-medium)`
  stPill.textContent = r.status || "PENDING"
  li.appendChild(stPill)
  return li
}

// ── Tab: Data export ─────────────────────────────────────────────────
async function renderExport(panel, locale) {
  panel.innerHTML = panelHeading(t("trust.export.title"), t("trust.export.subtitle"))

  // Note about queued-action pattern
  const note = document.createElement("p")
  note.setAttribute("role", "note")
  note.style.cssText = "padding:var(--maq-space-3) var(--maq-space-4);background:var(--maq-semantic-info-bg);color:var(--maq-semantic-info);border-radius:var(--maq-radius-md);font-size:var(--maq-text-sm);margin-block-end:var(--maq-space-4)"
  note.textContent = t("trust.export.queueNote")
  panel.appendChild(note)

  const container = document.createElement("div")
  container.appendChild(renderLoadingState({ skeletonRows: 4 }))
  panel.appendChild(container)

  try {
    const { packs } = await listEvidencePacks()
    container.innerHTML = ""
    if (!packs || packs.length === 0) {
      container.appendChild(renderEmptyState({
        icon: "📦",
        title: { en: "No evidence packs yet", ar: "لا توجد حزم أدلة بعد" },
        body: { en: "As your team uses WorkCaptain, signed evidence packs accrue here. Each carries hash-integrity verification and 60-second export SLA.",
                ar: "مع استخدام فريقك لـ وورك كابتن، تتراكم حزم الأدلة الموقَّعة هنا. كل حزمة تحمل تحقق سلامة بالبصمة وزمن تصدير لا يتجاوز 60 ثانية." },
        locale,
      }))
      return
    }
    const list = document.createElement("ul")
    list.setAttribute("role", "list")
    list.style.cssText = "list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:var(--maq-space-2)"
    for (const p of packs) list.appendChild(renderPackRow(p, locale))
    container.appendChild(list)
  } catch (err) {
    container.innerHTML = ""
    if (err && (err.status === 403 || err.code === "FORBIDDEN")) {
      container.appendChild(renderPermissionDeniedState({ locale }))
    } else {
      container.appendChild(renderErrorState({ error: err, locale }))
    }
  }
}

function renderPackRow(p, locale) {
  const li = document.createElement("li")
  li.style.cssText = "background:var(--maq-neutral-0);border:1px solid var(--maq-neutral-200);border-radius:var(--maq-radius-md);padding:var(--maq-space-3) var(--maq-space-4);display:flex;align-items:center;gap:var(--maq-space-3);flex-wrap:wrap"

  const body = document.createElement("div")
  body.style.cssText = "flex:1;min-inline-size:0"
  const lbl = document.createElement("p"); lbl.style.cssText = "margin:0;font-weight:var(--maq-weight-medium)"
  lbl.textContent = `${p.type || "pack"} · ${p.id}`
  body.appendChild(lbl)
  const meta = document.createElement("p"); meta.style.cssText = "margin:var(--maq-space-1) 0 0;font-size:var(--maq-text-xs);color:var(--maq-neutral-500);font-family:var(--maq-font-mono)"
  meta.textContent = `${p.createdAt ? new Date(p.createdAt).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-GB") : "—"}${p.sha256 ? ` · ${p.sha256.slice(0, 10)}…` : ""}`
  body.appendChild(meta)
  li.appendChild(body)

  // Export button — uses QueuedAction pattern
  const exportBtn = document.createElement("button")
  exportBtn.type = "button"
  exportBtn.textContent = t("trust.export.download")
  exportBtn.style.cssText = "padding:var(--maq-space-2) var(--maq-space-4);background:var(--maq-brand-primary);color:var(--maq-brand-on-primary);border:none;border-radius:var(--maq-radius-md);cursor:pointer;font-family:inherit;font-size:var(--maq-text-sm);font-weight:var(--maq-weight-medium);min-height:38px"
  exportBtn.addEventListener("click", async () => {
    if (!_queue) return
    const label = `${t("trust.export.exporting")}: ${p.id}`
    _queue.enqueue(`export-${p.id}-${Date.now()}`, label, () => exportEvidencePack(p.id, "zip")).catch(() => {})
  })
  li.appendChild(exportBtn)
  return li
}

// ── Tab: Residency ───────────────────────────────────────────────────
function renderResidency(panel, locale) {
  panel.innerHTML = panelHeading(t("trust.residency.title"), t("trust.residency.subtitle"))

  const card = document.createElement("article")
  card.style.cssText = "background:var(--maq-brand-primary-bg);border:1px solid var(--maq-brand-primary);border-radius:var(--maq-radius-lg);padding:var(--maq-space-6);display:flex;gap:var(--maq-space-4);align-items:start;max-inline-size:720px"

  const icon = document.createElement("span")
  icon.setAttribute("aria-hidden", "true")
  icon.textContent = "📍"
  icon.style.cssText = "font-size:var(--maq-text-3xl);flex-shrink:0"
  card.appendChild(icon)

  const body = document.createElement("div"); body.style.cssText = "flex:1"
  const title = document.createElement("h3")
  title.style.cssText = "font-size:var(--maq-text-xl);font-weight:var(--maq-weight-semibold);margin:0 0 var(--maq-space-2);color:var(--maq-brand-primary)"
  title.textContent = t("trust.residency.cardTitle")
  body.appendChild(title)

  const region = document.createElement("p")
  region.style.cssText = "margin:0 0 var(--maq-space-3);font-size:var(--maq-text-lg);color:var(--maq-neutral-900);line-height:var(--maq-leading-relaxed)"
  region.textContent = t("trust.residency.regionStatement")
  body.appendChild(region)

  const detail = document.createElement("p")
  detail.style.cssText = "margin:0;font-size:var(--maq-text-sm);color:var(--maq-neutral-700);line-height:var(--maq-leading-relaxed)"
  detail.textContent = t("trust.residency.detail")
  body.appendChild(detail)

  card.appendChild(body)
  panel.appendChild(card)

  // What we do NOT claim — explicit honesty per Sponsor stricter today
  const limits = document.createElement("section")
  limits.style.cssText = "margin-block-start:var(--maq-space-6);padding:var(--maq-space-4);background:var(--maq-neutral-50);border:1px dashed var(--maq-neutral-300);border-radius:var(--maq-radius-md);max-inline-size:720px"
  const lh = document.createElement("h4")
  lh.style.cssText = "margin:0 0 var(--maq-space-2);font-size:var(--maq-text-base);font-weight:var(--maq-weight-semibold);color:var(--maq-neutral-800)"
  lh.textContent = t("trust.residency.limitsTitle")
  limits.appendChild(lh)

  const ul = document.createElement("ul")
  ul.style.cssText = "margin:0;padding-inline-start:var(--maq-space-5);font-size:var(--maq-text-sm);color:var(--maq-neutral-700);line-height:var(--maq-leading-relaxed);display:flex;flex-direction:column;gap:var(--maq-space-2)"
  for (const k of ["trust.residency.limit1", "trust.residency.limit2", "trust.residency.limit3"]) {
    const li = document.createElement("li"); li.textContent = t(k); ul.appendChild(li)
  }
  limits.appendChild(ul)
  panel.appendChild(limits)
}

// ── Helpers ──────────────────────────────────────────────────────────
function panelHeading(title, subtitle) {
  return `
    <header style="margin-block-end:var(--maq-space-5)">
      <h2 style="font-size:var(--maq-text-xl);font-weight:var(--maq-weight-semibold);margin:0 0 var(--maq-space-1);color:var(--maq-neutral-900)">${escapeHtml(title)}</h2>
      <p style="margin:0;color:var(--maq-neutral-600);font-size:var(--maq-text-sm);max-inline-size:680px;line-height:var(--maq-leading-relaxed)">${escapeHtml(subtitle)}</p>
    </header>
  `
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))
}

export default {
  render,
  destroy() {
    if (_queueIndicator && _queueIndicator.parentElement) {
      _queueIndicator.parentElement.removeChild(_queueIndicator)
    }
    _queueIndicator = null
    _queue = null
  },
}
