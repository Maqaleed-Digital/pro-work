// WC-CB Day 4 (D-2, 2026-05-14): Customer-facing dashboard per brief §3.1.
//
// Authority:
//   - brief §3.1 — "KPI cards per UX-001 §5.4 canonical grammar (count,
//     currency, ratio, status, trend taxonomy). Initial KPIs: Saudisation
//     rate, employee count, pending filings, compliance status.
//     Capability-deferred indicators for any Mode-D KPI (UX-G2-INV-001
//     N-02 obligation). Empty state for new orgs: explain what data will
//     appear and how to populate it. Not a dead screen."
//   - PROPOSAL §11.A2 stricter rule: every KPI defaults to Mode-D unless
//     backend supplies explicit Mode-A activation evidence (none expected
//     in the controlled-beta window).
//   - PROPOSAL §11.A4 NO PHANTOM FEATURES: each KPI maps to a real
//     backend route (or shows the empty state with action CTA).
//
// REPLACES the prior S36-G6 "Command Center" surface. The Command Center
// was admin-oriented (Quick Actions routing to /ai etc.). The controlled-
// beta cohort gets the simpler customer-side dashboard mandated by brief
// §3.1. The admin Command Center remains available via admin-console/
// (the separate Next.js operator surface).
//
// Brand-neutral per PROPOSAL §11.A5: copy from t(); brand wordmark
// implicit from header above this page.

import { t, getLocale } from "../locale.js"
import { renderKpiCard } from "../components/kpi_card.js"
import { renderModeDAdvisory } from "../components/mode_status_chip.js"
import { renderComplianceHealthHeader } from "../components/compliance_health_header.js"
import { getDashboardSummary } from "../api/dashboard.js"
import { getOnboardingStatus } from "../api/onboarding.js"
import { getNitaqatStatus } from "../api/nitaqat.js"

let _refreshTimer = null

function render(el) {
  el.innerHTML = ""

  const locale = getLocale()

  const wrap = document.createElement("div")
  wrap.className = "content-area"

  // ── Page header ─────────────────────────────────────────────────────
  const header = document.createElement("header")
  header.className = "page-header"
  const headerText = document.createElement("div")
  headerText.className = "page-header-text"

  const title = document.createElement("h1")
  title.textContent = t("dashboard.title")
  headerText.appendChild(title)

  const subtitle = document.createElement("p")
  subtitle.textContent = t("dashboard.subtitle")
  headerText.appendChild(subtitle)

  header.appendChild(headerText)
  wrap.appendChild(header)

  // ── D-U1 Compliance Health Header (WC-IMPL-001 §T-1) ────────────────
  // First hierarchical element per WC-OPSDASH-001 §D: the cohort user
  // grasps compliance posture (ratio + state colour + click affordance)
  // before reading any other element. 30-second test gate.
  const du1Slot = document.createElement("div")
  du1Slot.setAttribute("data-component", "du1-slot")
  du1Slot.setAttribute("aria-busy", "true")
  wrap.appendChild(du1Slot)

  // ── KPI grid (renders skeletons immediately; updates with data) ────
  const grid = document.createElement("section")
  grid.setAttribute("aria-label", t("dashboard.kpiGrid"))
  grid.setAttribute("data-component", "kpi-grid")
  grid.style.cssText = [
    "display: grid",
    "grid-template-columns: repeat(auto-fit, minmax(260px, 1fr))",
    "gap: var(--maq-space-4)",
    "padding-inline: var(--maq-space-4)",
    "padding-block-end: var(--maq-space-6)",
  ].join(";")

  // Loading skeletons — 4 placeholder cards while we fetch.
  for (let i = 0; i < 4; i++) {
    grid.appendChild(renderSkeleton(locale))
  }
  wrap.appendChild(grid)

  // ── Mode-D banner (transverse — brief §4) ─────────────────────────
  // Rendered once at section level rather than per-card to avoid noise.
  const advisoryBanner = renderModeDAdvisory({ locale })
  advisoryBanner.style.cssText += ";padding-inline:var(--maq-space-4);margin-block:0"
  wrap.appendChild(advisoryBanner)

  el.appendChild(wrap)

  // ── Fetch + render ─────────────────────────────────────────────────
  fetchAndRender(grid, locale)
  fetchAndRenderDU1(du1Slot, locale)

  // Auto-refresh every 60s while page is visible.
  if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null }
  _refreshTimer = setInterval(() => {
    if (document.visibilityState === "visible") {
      fetchAndRender(grid, locale, /* silent */ true)
      fetchAndRenderDU1(du1Slot, locale, /* silent */ true)
    }
  }, 60_000)
}

/**
 * D-U1 Compliance Health Header — fetch + render.
 * Uses getNitaqatStatus() so state colour is driven by real backend
 * zone authority (Nitaqat policy), not invented thresholds (§11.A4).
 * Empty state (CTA → #employees) when no workforce data yet.
 */
async function fetchAndRenderDU1(slot, locale, silent = false) {
  let snapshot = null
  try {
    const nitaqat = await getNitaqatStatus()
    if (nitaqat && typeof nitaqat.saudiPercent === "number" && typeof nitaqat.totalEmployees === "number" && nitaqat.totalEmployees > 0) {
      snapshot = {
        totalHeadcount: nitaqat.totalEmployees,
        saudiCount:     nitaqat.saudiEmployees ?? Math.round(nitaqat.totalEmployees * nitaqat.saudiPercent),
        nonSaudiCount:  (nitaqat.totalEmployees) - (nitaqat.saudiEmployees ?? Math.round(nitaqat.totalEmployees * nitaqat.saudiPercent)),
        ratio:          nitaqat.saudiPercent,
        zone:           nitaqat.zone,
        lastUpdated:    nitaqat.lastUpdated,
      }
    }
  } catch (e) {
    if (!silent) {
      // Surface error inline; D-U1's empty state covers genuine no-data.
      // A backend error renders a small inline message; the rest of the
      // dashboard remains functional.
      slot.innerHTML = ""
      const errMsg = document.createElement("p")
      errMsg.setAttribute("role", "alert")
      errMsg.style.cssText = "margin:0;padding:var(--maq-space-3) var(--maq-space-4);color:var(--maq-semantic-danger);font-size:var(--maq-text-sm)"
      errMsg.textContent = locale === "ar"
        ? "تعذّر تحميل مؤشر السعودة. حاول التحديث."
        : "Couldn't load the Saudisation indicator. Try refreshing."
      slot.appendChild(errMsg)
      slot.setAttribute("aria-busy", "false")
      return
    }
    // Silent refresh: keep previous render on transient error.
    return
  }

  slot.innerHTML = ""
  slot.appendChild(renderComplianceHealthHeader({
    snapshot,
    locale,
    onAddData: () => { location.hash = "#employees" },
  }))
  slot.setAttribute("aria-busy", "false")
}

function renderSkeleton(locale) {
  const card = document.createElement("article")
  card.setAttribute("aria-busy", "true")
  card.style.cssText = [
    "background: var(--maq-neutral-0)",
    "border: 1px solid var(--maq-neutral-200)",
    "border-radius: var(--maq-radius-lg)",
    "padding: var(--maq-space-4)",
    "min-block-size: 140px",
    "display: flex",
    "flex-direction: column",
    "gap: var(--maq-space-3)",
  ].join(";")
  const bar1 = document.createElement("div")
  bar1.style.cssText = "block-size:14px;inline-size:60%;background:var(--maq-neutral-100);border-radius:var(--maq-radius-sm)"
  const bar2 = document.createElement("div")
  bar2.style.cssText = "block-size:36px;inline-size:40%;background:var(--maq-neutral-100);border-radius:var(--maq-radius-sm)"
  card.appendChild(bar1)
  card.appendChild(bar2)
  const srOnly = document.createElement("span")
  srOnly.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden"
  srOnly.textContent = locale === "ar" ? "جارٍ التحميل" : "Loading"
  card.appendChild(srOnly)
  return card
}

async function fetchAndRender(grid, locale, silent = false) {
  let summary
  let onboarding
  try {
    const [s, o] = await Promise.all([
      getDashboardSummary(),
      getOnboardingStatus().catch(() => ({ completedAt: null, profile: {} })),
    ])
    summary = s
    onboarding = o
  } catch (e) {
    if (!silent) renderError(grid, e, locale)
    return
  }

  // Determine if this is a brand-new tenant with no data yet.
  const isNewOrg = !summary ||
    (summary.saudiPercent === null && summary.employeeCount === null && summary.pendingFilings === null)

  grid.innerHTML = ""

  // ── KPI 1: Saudisation rate (ratio) ────────────────────────────────
  grid.appendChild(renderKpiCard({
    id: "saudisation-rate",
    label: { en: "Saudisation rate", ar: "نسبة السعودة" },
    variant: "ratio",
    value: summary?.saudiPercent ?? null,
    mode: "D",
    capabilityName: "WC-SAUD",
    citation: summary?.lastUpdated ? {
      sourceType: "nitaqat",
      sourceAuthority: locale === "ar" ? "نظام نطاقات" : "Nitaqat",
      timestamp: summary.lastUpdated,
    } : null,
    emptyState: isNewOrg ? {
      title: { en: "No employees added yet", ar: "لم تتم إضافة موظفين بعد" },
      body:  { en: "Once you add employees with their nationality, your Nitaqat-aligned Saudisation rate will appear here.",
               ar: "بعد إضافة الموظفين مع الجنسية، ستظهر هنا نسبة السعودة وفقًا لنطاقات." },
      actionLabel: { en: "Add employees", ar: "إضافة موظفين" },
      actionHref: "#workers",
    } : null,
    locale,
  }))

  // ── KPI 2: Employee count (count) ──────────────────────────────────
  grid.appendChild(renderKpiCard({
    id: "employee-count",
    label: { en: "Employees", ar: "الموظفون" },
    variant: "count",
    value: summary?.employeeCount ?? null,
    unit: { en: "total", ar: "الإجمالي" },
    mode: "D",
    capabilityName: "WC-REC",
    emptyState: isNewOrg ? {
      title: { en: "No employees yet", ar: "لا يوجد موظفون بعد" },
      body:  { en: "Add your first employees to see headcount here.", ar: "أضف أول الموظفين لعرض العدد هنا." },
      actionLabel: { en: "Add employees", ar: "إضافة موظفين" },
      actionHref: "#workers",
    } : null,
    locale,
  }))

  // ── KPI 3: Pending filings (count) ─────────────────────────────────
  grid.appendChild(renderKpiCard({
    id: "pending-filings",
    label: { en: "Pending filings", ar: "الإيداعات المعلَّقة" },
    variant: "count",
    value: summary?.pendingFilings ?? null,
    unit: { en: "this month", ar: "هذا الشهر" },
    mode: "D",
    capabilityName: "WC-REC",
    emptyState: isNewOrg ? {
      title: { en: "No filings yet", ar: "لا توجد إيداعات بعد" },
      body:  { en: "Your GOSI / Qiwa / Mudad filing calendar appears here once your profile is connected.",
               ar: "سيظهر تقويم الإيداعات (التأمينات / قِوى / مُدد) هنا بعد ربط ملف المؤسسة." },
      actionLabel: { en: "View compliance", ar: "عرض الامتثال" },
      actionHref: "#compliance",
    } : null,
    locale,
  }))

  // ── KPI 4: Compliance status (status) ──────────────────────────────
  grid.appendChild(renderKpiCard({
    id: "compliance-status",
    label: { en: "Compliance status", ar: "حالة الامتثال" },
    variant: "status",
    value: summary?.complianceStatus || "unknown",
    mode: "D",
    capabilityName: "WC-REC",
    emptyState: isNewOrg ? {
      title: { en: "Status pending", ar: "الحالة قيد التحديد" },
      body:  { en: "Once data flows in, your overall compliance status (green / amber / red) will appear here.",
               ar: "بعد تدفق البيانات، ستظهر هنا حالة الامتثال الإجمالية (سليم / مراقبة / عرضة للخطر)." },
      actionLabel: { en: "Complete onboarding", ar: "إكمال إعداد الحساب" },
      actionHref: onboarding?.completedAt ? "#compliance" : "#onboarding",
    } : null,
    locale,
  }))
}

function renderError(grid, e, locale) {
  grid.innerHTML = ""
  const card = document.createElement("article")
  card.setAttribute("role", "alert")
  card.style.cssText = [
    "background: var(--maq-semantic-danger-bg)",
    "color: var(--maq-semantic-danger)",
    "border: 1px solid var(--maq-semantic-danger)",
    "border-radius: var(--maq-radius-md)",
    "padding: var(--maq-space-4)",
    "grid-column: 1 / -1",
  ].join(";")
  const h = document.createElement("p")
  h.style.cssText = "margin:0 0 var(--maq-space-2);font-weight:var(--maq-weight-semibold)"
  h.textContent = locale === "ar" ? "تعذّر تحميل لوحة البيانات" : "Couldn't load the dashboard"
  card.appendChild(h)
  const body = document.createElement("p")
  body.style.cssText = "margin:0;font-size:var(--maq-text-sm)"
  body.textContent = (e && e.code === "FORBIDDEN")
    ? (locale === "ar" ? "ليس لديك صلاحية لعرض هذه البيانات. تواصل مع مسؤول مؤسستك." : "You don't have permission to view this data. Contact your organisation admin.")
    : (locale === "ar" ? "حدث خطأ في الخادم. حاول التحديث، أو راجع الحالة لاحقًا." : "A server error occurred. Try refreshing, or check status later.")
  card.appendChild(body)
  if (e && e.code) {
    const code = document.createElement("p")
    code.style.cssText = "margin:var(--maq-space-2) 0 0;font-family:var(--maq-font-mono);font-size:var(--maq-text-xs);opacity:0.7"
    code.textContent = `${locale === "ar" ? "رمز الخطأ" : "Error code"}: ${e.code}`
    card.appendChild(code)
  }
  grid.appendChild(card)
}

export default {
  render,
  destroy() {
    if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null }
  },
}
