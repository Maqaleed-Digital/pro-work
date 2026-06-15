// WC-CB Day 5 (D-1, 2026-05-14): Saudisation module per brief §3.3.
//
// Authority:
//   - brief §3.3 — Nitaqat status; Saudisation rate trend; agent-
//     attributed recommendations (advisory only) with identity chip,
//     confidence, reasoning summary, source citation, HITL approval;
//     Three Hard Guardrails enforced visually.
//   - Sponsor stricter rule today: "Saudisation Advisor confidence
//     defaults to Low/Moderate/High unless backend emits calibrated
//     values; Three Hard Guardrails visually enforced on every
//     regulated action; no 'Apply automatically' CTAs."
//
// Brand-neutral per §11.A5. Consumes the Day-4 agent-surface primitives
// (AgentAttributionMarker, ConfidenceBand, ExplainabilityBundle,
// SourceCitation, HITLPromptCard, AuditTrailLink) directly.

import { t, getLocale } from "../locale.js"
import { getNitaqatStatus, listAdvisorRecommendations } from "../api/nitaqat.js"
import { renderKpiCard } from "../components/kpi_card.js"
import { renderModeStatusChip, renderModeDAdvisory } from "../components/mode_status_chip.js"
import { renderAgentAttributionMarker } from "../components/agent_attribution_marker.js"
import { renderConfidenceBand } from "../components/confidence_band.js"
import { renderSourceCitation } from "../components/source_citation.js"
import { renderExplainabilityBundle } from "../components/explainability_bundle.js"
import { renderHITLPromptCard } from "../components/hitl_prompt_card.js"
import { renderAuditTrailLink } from "../components/audit_trail_link.js"
import {
  renderLoadingState, renderEmptyState, renderErrorState,
  renderPermissionDeniedState,
} from "../components/edge_state.js"

const ZONE_LABELS = {
  platinum:     { en: "Platinum",     ar: "بلاتيني" },
  high_green:   { en: "High Green",   ar: "أخضر مرتفع" },
  medium_green: { en: "Medium Green", ar: "أخضر متوسط" },
  low_green:    { en: "Low Green",    ar: "أخضر منخفض" },
  green:        { en: "Green",        ar: "أخضر" },
  yellow:       { en: "Yellow",       ar: "أصفر" },
  red:          { en: "Red",          ar: "أحمر" },
  unknown:      { en: "Unknown",      ar: "غير معروف" },
}

const ZONE_TONE = {
  platinum:     "var(--maq-wc-zone-platinum)",
  high_green:   "var(--maq-wc-zone-high-green)",
  medium_green: "var(--maq-wc-zone-medium-green)",
  low_green:    "var(--maq-wc-zone-low-green)",
  green:        "var(--maq-wc-zone-high-green)",
  yellow:       "var(--maq-wc-zone-yellow)",
  red:          "var(--maq-wc-zone-red)",
  unknown:      "var(--maq-neutral-400)",
}

let _state = {
  status: null,
  recommendations: null,
  error: null,
}

async function load() {
  const [status, recs] = await Promise.allSettled([
    getNitaqatStatus(),
    listAdvisorRecommendations(5),
  ])
  if (status.status === "fulfilled") _state.status = status.value
  else _state.error = status.reason
  if (recs.status === "fulfilled") _state.recommendations = recs.value.recommendations
  else _state.recommendations = []
}

function render(el) {
  el.innerHTML = ""
  const locale = getLocale()

  const wrap = document.createElement("div")
  wrap.className = "content-area"

  // ── Page header ──────────────────────────────────────────────────
  const header = document.createElement("header"); header.className = "page-header"
  const ht = document.createElement("div"); ht.className = "page-header-text"
  const h1 = document.createElement("h1"); h1.textContent = t("saudisation.title")
  const sub = document.createElement("p"); sub.textContent = t("saudisation.subtitle")
  ht.appendChild(h1); ht.appendChild(sub); header.appendChild(ht)
  header.appendChild(renderModeStatusChip({ mode: "D", capabilityName: "WC-SAUD", locale }))
  wrap.appendChild(header)

  // ── Section A: Nitaqat status + Saudisation rate KPIs ────────────
  const grid = document.createElement("section")
  grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:var(--maq-space-4);padding-inline:var(--maq-space-4)"
  grid.setAttribute("aria-label", t("saudisation.kpiGridAria"))
  wrap.appendChild(grid)

  // ── Section B: Three Hard Guardrails banner (visual binding) ─────
  const guardrailBanner = renderGuardrailBanner(locale)
  guardrailBanner.style.margin = "var(--maq-space-6) var(--maq-space-4) 0"
  wrap.appendChild(guardrailBanner)

  // ── Section C: Advisor recommendations ───────────────────────────
  const advisorSection = document.createElement("section")
  advisorSection.setAttribute("aria-labelledby", "saudisation-advisor-heading")
  advisorSection.style.cssText = "padding:var(--maq-space-4);margin-block-start:var(--maq-space-6)"

  const advisorHeading = document.createElement("h2")
  advisorHeading.id = "saudisation-advisor-heading"
  advisorHeading.style.cssText = "font-size:var(--maq-text-xl);font-weight:var(--maq-weight-semibold);margin:0 0 var(--maq-space-1);display:flex;align-items:center;gap:var(--maq-space-3);flex-wrap:wrap"
  advisorHeading.textContent = t("saudisation.advisorTitle")
  advisorHeading.appendChild(renderAgentAttributionMarker({
    agent: { name: "WorkCaptain Saudisation Advisor", class: "platform-scoped", version: "v1.0.0" },
    variant: "badge",
    locale,
  }))
  advisorSection.appendChild(advisorHeading)

  const advisorSub = document.createElement("p")
  advisorSub.style.cssText = "margin:0 0 var(--maq-space-4);color:var(--maq-neutral-600);font-size:var(--maq-text-sm);max-inline-size:680px;line-height:var(--maq-leading-relaxed)"
  advisorSub.textContent = t("saudisation.advisorSubtitle")
  advisorSection.appendChild(advisorSub)

  const recoContainer = document.createElement("div")
  recoContainer.style.cssText = "display:flex;flex-direction:column;gap:var(--maq-space-4)"
  advisorSection.appendChild(recoContainer)
  wrap.appendChild(advisorSection)

  // Section D: Mode-D advisory banner
  const modeD = renderModeDAdvisory({ locale })
  modeD.style.cssText += ";padding-inline:var(--maq-space-4)"
  wrap.appendChild(modeD)

  el.appendChild(wrap)

  // ── Skeletons ────────────────────────────────────────────────────
  for (let i = 0; i < 3; i++) {
    const s = renderLoadingState({ variant: "skeleton", skeletonRows: 3 })
    s.style.background = "var(--maq-neutral-0)"
    s.style.border = "1px solid var(--maq-neutral-200)"
    s.style.borderRadius = "var(--maq-radius-lg)"
    grid.appendChild(s)
  }
  recoContainer.appendChild(renderLoadingState({ variant: "skeleton", skeletonRows: 4 }))

  load().then(() => {
    renderKpis(grid, locale)
    renderRecommendations(recoContainer, locale)
  })
}

function renderKpis(grid, locale) {
  grid.innerHTML = ""
  const st = _state.status

  if (_state.error) {
    grid.appendChild(renderErrorOrDeny(_state.error, locale, () => { _state.status = null; _state.error = null; render(document.getElementById("page")) }))
    return
  }

  const isEmpty = !st || (st.saudiPercent === null && st.zone === "unknown")
  if (isEmpty) {
    const empty = renderEmptyState({
      icon: "🌐",
      title: { en: "Saudisation data is pending", ar: "بيانات السعودة قيد الإعداد" },
      body: { en: "Once you add employees with their nationality, your Nitaqat zone, Saudisation rate, and trend appear here.",
              ar: "بعد إضافة الموظفين مع الجنسية، ستظهر هنا منطقة نطاقات ونسبة السعودة والاتجاه." },
      actionLabel: { en: "Add employees", ar: "إضافة موظفين" },
      actionHref: "#workers",
      locale,
    })
    empty.style.gridColumn = "1 / -1"
    grid.appendChild(empty)
    return
  }

  // KPI 1: Saudisation rate (ratio)
  grid.appendChild(renderKpiCard({
    id: "saud-rate",
    label: { en: "Saudisation rate", ar: "نسبة السعودة" },
    variant: "ratio",
    value: st.saudiPercent,
    mode: "D",
    capabilityName: "WC-SAUD",
    citation: st.lastUpdated ? { sourceType: "nitaqat", sourceAuthority: locale === "ar" ? "نظام نطاقات" : "Nitaqat", timestamp: st.lastUpdated } : null,
    locale,
  }))

  // KPI 2: Nitaqat zone (status — uses zone-specific colour)
  const zoneCard = document.createElement("article")
  zoneCard.setAttribute("data-component", "kpi-card")
  zoneCard.setAttribute("data-kpi-id", "nitaqat-zone")
  zoneCard.style.cssText = "background:var(--maq-neutral-0);border:1px solid var(--maq-neutral-200);border-radius:var(--maq-radius-lg);padding:var(--maq-space-4);box-shadow:var(--maq-elevation-sm);display:flex;flex-direction:column;gap:var(--maq-space-3);min-block-size:140px"
  const zhdr = document.createElement("div"); zhdr.style.cssText = "display:flex;align-items:start;justify-content:space-between;gap:var(--maq-space-2)"
  const zlbl = document.createElement("h3"); zlbl.style.cssText = "font-size:var(--maq-text-sm);font-weight:var(--maq-weight-medium);color:var(--maq-neutral-600);margin:0"
  zlbl.textContent = locale === "ar" ? "منطقة نطاقات" : "Nitaqat zone"
  zhdr.appendChild(zlbl)
  zhdr.appendChild(renderModeStatusChip({ mode: "D", capabilityName: "WC-SAUD", locale }))
  zoneCard.appendChild(zhdr)
  const zPill = document.createElement("span")
  const zoneKey = st.zone || "unknown"
  const zoneLabel = (ZONE_LABELS[zoneKey] || ZONE_LABELS.unknown)[locale]
  zPill.textContent = zoneLabel
  zPill.style.cssText = `display:inline-flex;align-items:center;align-self:flex-start;padding:var(--maq-space-2) var(--maq-space-4);background:${ZONE_TONE[zoneKey]};color:var(--maq-neutral-0);border-radius:var(--maq-radius-md);font-size:var(--maq-text-lg);font-weight:var(--maq-weight-semibold)`
  zoneCard.appendChild(zPill)
  const zNote = document.createElement("p"); zNote.setAttribute("role", "note"); zNote.style.cssText = "font-size:var(--maq-text-xs);color:var(--maq-mode-d);margin:0;line-height:var(--maq-leading-tight)"
  zNote.textContent = locale === "ar"
    ? "القدرة متاحة; لم يُفعَّل بعد لأحداث الإيرادات."
    : "Capability available; not yet activated for revenue events."
  zoneCard.appendChild(zNote)
  grid.appendChild(zoneCard)

  // KPI 3: Saudi vs total headcount (count)
  grid.appendChild(renderKpiCard({
    id: "saud-headcount",
    label: { en: "Saudi / Total employees", ar: "السعوديون / الإجمالي" },
    variant: "count",
    value: st.saudiEmployees != null && st.totalEmployees != null
      ? `${st.saudiEmployees} / ${st.totalEmployees}`
      : null,
    mode: "D",
    capabilityName: "WC-SAUD",
    locale,
  }))
}

function renderRecommendations(container, locale) {
  container.innerHTML = ""
  const recs = _state.recommendations || []
  if (recs.length === 0) {
    container.appendChild(renderEmptyState({
      icon: "🧠",
      title: { en: "No active recommendations", ar: "لا توجد توصيات نشطة" },
      body: { en: "The Saudisation Advisor surfaces suggestions when data signals an actionable change. None pending right now.",
              ar: "يقدّم مستشار السعودة اقتراحات عند رصد إشارات تستوجب إجراءً. لا يوجد طلب معلّق حاليًا." },
      locale,
    }))
    return
  }

  for (const r of recs) {
    if (!r) continue

    // Body / explainability content goes inside the HITLPromptCard via
    // the `children` slot.
    const explainability = renderExplainabilityBundle({
      factors: (r.inputSignals || []).slice(0, 6).map(s => ({
        label: typeof s === "string" ? s : (s.label || s.name || ""),
        value: typeof s === "object" ? (s.value || "") : "",
        magnitude: s && s.magnitude,
        direction: s && s.direction,
      })),
      auditTrailHref: "",  // Day 6 brief §6 will route to evidence pack
      locale,
    })
    explainability.style.marginBlock = "var(--maq-space-2)"

    const confidenceRow = document.createElement("div")
    confidenceRow.style.cssText = "display:flex;gap:var(--maq-space-2);align-items:center;flex-wrap:wrap;margin-block:var(--maq-space-2)"
    confidenceRow.appendChild(renderConfidenceBand({
      band: r.confidence.band,
      value: r.confidence.value,
      calibrated: r.confidence.calibrated,
      locale,
    }))
    // Source citation if backend emits provenance info
    if (r.createdAt) {
      confidenceRow.appendChild(renderSourceCitation({
        sourceType: "tenant-data",
        sourceAuthority: locale === "ar" ? "بياناتك" : "Your data",
        timestamp: r.createdAt,
        locale,
      }))
    }
    confidenceRow.appendChild(renderAuditTrailLink({ correlationId: r.correlationId, locale }))

    const card = renderHITLPromptCard({
      prompt: {
        title: { en: r.rationale ? r.rationale.split(".")[0] : "Review recommendation",
                 ar: r.rationale ? r.rationale.split(".")[0] : "مراجعة التوصية" },
        body: { en: r.rationale || "",
                ar: r.rationale || "" },  // Backend rationale typically en; localisation happens upstream when AR data lands.
      },
      agent: r.agent,
      onDecision: ({ decision, rationale }) => {
        // STRICTER: no "Apply automatically" path. Approve here means the
        // human approves; downstream effects (if any) are scheduled by
        // the backend audit-log decision endpoint. NO surface-level
        // policy-state mutation.
        submitAdvisorDecision(r.id, decision, rationale).catch(() => {})
      },
      requireRationale: { approve: false, reject: true, modify: true },
      children: [confidenceRow, explainability],
      locale,
    })

    // Three Hard Guardrails — explicit visual disclaimer below the card.
    const guardrails = document.createElement("p")
    guardrails.setAttribute("role", "note")
    guardrails.style.cssText = "margin:var(--maq-space-2) 0 var(--maq-space-4);font-size:var(--maq-text-xs);color:var(--maq-neutral-500);font-style:italic"
    guardrails.textContent = t("saudisation.guardrailsNote")

    container.appendChild(card)
    container.appendChild(guardrails)
  }
}

async function submitAdvisorDecision(id, decision, rationale) {
  // POST to the existing AI audit-log decision endpoint. Per brief §5
  // + Three Hard Guardrails: backend decides whether (and when) any
  // downstream effect runs; this UI never auto-applies regulated state.
  const { apiPost } = await import("../api.js")
  return apiPost(`/api/admin/ai/audit-log/${encodeURIComponent(id)}/decision`, {
    decision: decision === "approve" ? "ACCEPTED" : decision === "reject" ? "REJECTED" : "OVERRIDDEN",
    rationale: rationale || null,
  })
}

function renderGuardrailBanner(locale) {
  const wrap = document.createElement("section")
  wrap.setAttribute("role", "note")
  wrap.setAttribute("aria-labelledby", "saudisation-guardrails-heading")
  wrap.style.cssText = "padding:var(--maq-space-3) var(--maq-space-4);background:var(--maq-semantic-info-bg);color:var(--maq-semantic-info);border:1px solid var(--maq-semantic-info);border-radius:var(--maq-radius-md);display:flex;gap:var(--maq-space-3);align-items:start"
  const icon = document.createElement("span"); icon.setAttribute("aria-hidden", "true"); icon.textContent = "🛡"; icon.style.cssText = "font-size:var(--maq-text-xl);flex-shrink:0"
  wrap.appendChild(icon)
  const body = document.createElement("div"); body.style.cssText = "flex:1"
  const h = document.createElement("p"); h.id = "saudisation-guardrails-heading"; h.style.cssText = "margin:0 0 var(--maq-space-1);font-weight:var(--maq-weight-semibold)"
  h.textContent = locale === "ar" ? "الضمانات الثلاث الصارمة" : "Three Hard Guardrails"
  body.appendChild(h)
  const ul = document.createElement("ul")
  ul.style.cssText = "margin:0;padding-inline-start:var(--maq-space-5);font-size:var(--maq-text-sm);line-height:var(--maq-leading-relaxed);display:flex;flex-direction:column;gap:var(--maq-space-1)"
  for (const k of ["saudisation.guardrail1", "saudisation.guardrail2", "saudisation.guardrail3"]) {
    const li = document.createElement("li"); li.textContent = t(k)
    ul.appendChild(li)
  }
  body.appendChild(ul)
  wrap.appendChild(body)
  return wrap
}

function renderErrorOrDeny(e, locale, retry) {
  if (e && (e.status === 403 || e.code === "FORBIDDEN")) {
    return renderPermissionDeniedState({ locale })
  }
  return renderErrorState({ error: e, retry, locale })
}

export default { render, destroy() { _state.status = null; _state.recommendations = null; _state.error = null } }
