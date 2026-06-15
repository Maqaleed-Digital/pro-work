// WC-CB Day 5 (D-1, 2026-05-14): Compliance module per brief §3.5.
//
// Authority:
//   - brief §3.5 — Filing calendar (GOSI, Qiwa, Mudad deadlines);
//     Filing status per deadline; Reminder configuration.
//   - PROPOSAL §11.A4 NO PHANTOM FEATURES: reminder-configuration
//     persistence requires a backend endpoint that does not yet exist;
//     surface labels it "Coming later" with browser-side preview only.
//   - Sponsor stricter rule today: reusable edge-state primitives.
//
// Backend reality: /api/compliance/dashboard/summary may not return a
// structured filings array. The page derives upcoming filings from
// summary fields where available; otherwise renders empty-state.
// Synthetic GOSI / Qiwa reminders are clearly labelled as derived.

import { t, getLocale } from "../locale.js"
import { getComplianceSummary } from "../api/compliance.js"
import { renderModeStatusChip } from "../components/mode_status_chip.js"
import {
  renderLoadingState, renderEmptyState, renderErrorState,
  renderPermissionDeniedState,
} from "../components/edge_state.js"

const AUTHORITY_LABELS = {
  gosi:  { en: "GOSI",  ar: "التأمينات الاجتماعية" },
  qiwa:  { en: "Qiwa",  ar: "قِوى" },
  mudad: { en: "Mudad", ar: "مُدد" },
  zatca: { en: "ZATCA", ar: "هيئة الزكاة والضريبة" },
}

const STATUS_LABELS = {
  pending:  { en: "Pending",  ar: "قيد الانتظار",  tone: "var(--maq-semantic-warning)" },
  filed:    { en: "Filed",    ar: "تم الإيداع",     tone: "var(--maq-semantic-success)" },
  overdue:  { en: "Overdue",  ar: "متأخر",         tone: "var(--maq-semantic-danger)" },
}

function render(el) {
  el.innerHTML = ""
  const locale = getLocale()

  const wrap = document.createElement("div")
  wrap.className = "content-area"

  // Header
  const header = document.createElement("header"); header.className = "page-header"
  const ht = document.createElement("div"); ht.className = "page-header-text"
  const h1 = document.createElement("h1"); h1.textContent = t("compliance.title")
  const sub = document.createElement("p"); sub.textContent = t("compliance.subtitle")
  ht.appendChild(h1); ht.appendChild(sub); header.appendChild(ht)
  header.appendChild(renderModeStatusChip({ mode: "D", capabilityName: "WC-REC", locale }))
  wrap.appendChild(header)

  // Calendar section
  const calSection = document.createElement("section")
  calSection.setAttribute("aria-labelledby", "compliance-calendar-heading")
  calSection.style.cssText = "padding-inline:var(--maq-space-4)"

  const ch = document.createElement("h2")
  ch.id = "compliance-calendar-heading"
  ch.style.cssText = "font-size:var(--maq-text-xl);margin:0 0 var(--maq-space-1)"
  ch.textContent = t("compliance.calendarTitle")
  calSection.appendChild(ch)

  const csub = document.createElement("p")
  csub.style.cssText = "color:var(--maq-neutral-600);margin:0 0 var(--maq-space-4);font-size:var(--maq-text-sm)"
  csub.textContent = t("compliance.calendarSubtitle")
  calSection.appendChild(csub)

  const calContent = document.createElement("div")
  calContent.appendChild(renderLoadingState({ skeletonRows: 5 }))
  calSection.appendChild(calContent)
  wrap.appendChild(calSection)

  // Reminders section
  const remSection = document.createElement("section")
  remSection.setAttribute("aria-labelledby", "compliance-reminders-heading")
  remSection.style.cssText = "padding:var(--maq-space-4);margin-block-start:var(--maq-space-6)"
  const rh = document.createElement("h2")
  rh.id = "compliance-reminders-heading"
  rh.style.cssText = "font-size:var(--maq-text-xl);margin:0 0 var(--maq-space-1);display:flex;align-items:center;gap:var(--maq-space-3)"
  rh.appendChild(document.createTextNode(t("compliance.remindersTitle")))
  const badge = document.createElement("span")
  badge.textContent = t("common.comingSoon")
  badge.style.cssText = "padding:0 var(--maq-space-2);background:var(--maq-mode-d-bg);color:var(--maq-mode-d);border-radius:var(--maq-radius-sm);font-size:var(--maq-text-xs);font-weight:var(--maq-weight-medium)"
  rh.appendChild(badge)
  remSection.appendChild(rh)
  remSection.appendChild(renderRemindersStub(locale))
  wrap.appendChild(remSection)

  el.appendChild(wrap)

  // Load
  getComplianceSummary().then(summary => {
    calContent.innerHTML = ""
    renderCalendar(calContent, summary.filings || [], locale)
  }).catch(err => {
    calContent.innerHTML = ""
    if (err && (err.status === 403 || err.code === "FORBIDDEN")) {
      calContent.appendChild(renderPermissionDeniedState({ locale }))
    } else {
      calContent.appendChild(renderErrorState({ error: err, locale, retry: () => render(el) }))
    }
  })
}

function renderCalendar(container, filings, locale) {
  if (!filings || filings.length === 0) {
    container.appendChild(renderEmptyState({
      icon: "📅",
      title: { en: "No filings scheduled yet", ar: "لا توجد إيداعات مجدولة بعد" },
      body: { en: "Once you complete onboarding and connect your tenant profile, your GOSI, Qiwa, and Mudad deadlines will appear here.",
              ar: "بعد إكمال الإعداد وربط ملف مؤسستك، ستظهر هنا مواعيد التأمينات وقِوى ومُدد." },
      actionLabel: { en: "Complete onboarding", ar: "إكمال الإعداد" },
      actionHref: "#onboarding",
      locale,
    }))
    return
  }

  const list = document.createElement("ul")
  list.setAttribute("role", "list")
  list.style.cssText = "list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:var(--maq-space-2)"
  for (const f of filings) {
    if (!f) continue
    const li = document.createElement("li")
    li.style.cssText = "background:var(--maq-neutral-0);border:1px solid var(--maq-neutral-200);border-radius:var(--maq-radius-md);padding:var(--maq-space-3) var(--maq-space-4);display:flex;align-items:center;gap:var(--maq-space-3);flex-wrap:wrap"

    const auth = AUTHORITY_LABELS[f.authority] || { en: (f.authority || "Other").toUpperCase(), ar: "أخرى" }
    const authBadge = document.createElement("span")
    authBadge.style.cssText = "padding-inline:var(--maq-space-3);padding-block:2px;background:var(--maq-neutral-100);color:var(--maq-neutral-700);border-radius:var(--maq-radius-sm);font-size:var(--maq-text-xs);font-weight:var(--maq-weight-semibold);letter-spacing:var(--maq-tracking-wide)"
    authBadge.textContent = auth[locale]
    li.appendChild(authBadge)

    const titleEl = document.createElement("span")
    titleEl.style.cssText = "flex:1;font-weight:var(--maq-weight-medium);min-inline-size:160px"
    titleEl.textContent = f.title || auth[locale]
    li.appendChild(titleEl)

    const due = document.createElement("span")
    due.style.cssText = "font-size:var(--maq-text-sm);color:var(--maq-neutral-600);font-family:var(--maq-font-mono)"
    due.textContent = f.dueAt ? new Date(f.dueAt).toLocaleDateString(locale === "ar" ? "ar-SA" : "en-GB", { year: "numeric", month: "short", day: "2-digit" }) : "—"
    li.appendChild(due)

    const st = STATUS_LABELS[f.status] || STATUS_LABELS.pending
    const stPill = document.createElement("span")
    stPill.style.cssText = `padding-inline:var(--maq-space-2);padding-block:2px;background:${st.tone === "var(--maq-semantic-success)" ? "var(--maq-semantic-success-bg)" : st.tone === "var(--maq-semantic-danger)" ? "var(--maq-semantic-danger-bg)" : "var(--maq-semantic-warning-bg)"};color:${st.tone};border-radius:var(--maq-radius-sm);font-size:var(--maq-text-xs);font-weight:var(--maq-weight-medium)`
    stPill.textContent = st[locale]
    li.appendChild(stPill)

    if (f.synthetic) {
      const synth = document.createElement("span")
      synth.setAttribute("aria-label", locale === "ar" ? "هذا تذكير تلقائي مشتق" : "Auto-derived reminder")
      synth.title = locale === "ar" ? "تذكير مشتق — البيانات الأصلية تأتي من نطاق الواجهة المصدرية" : "Derived reminder — source-of-truth lives in the upstream authority's portal"
      synth.textContent = "⚙"
      synth.style.cssText = "color:var(--maq-neutral-400);font-size:var(--maq-text-base)"
      li.appendChild(synth)
    }

    list.appendChild(li)
  }
  container.appendChild(list)
}

function renderRemindersStub(locale) {
  const wrap = document.createElement("article")
  wrap.style.cssText = "padding:var(--maq-space-4);background:var(--maq-neutral-50);border:1px dashed var(--maq-neutral-300);border-radius:var(--maq-radius-md);max-inline-size:680px;display:flex;gap:var(--maq-space-3);align-items:start"
  const icon = document.createElement("span"); icon.setAttribute("aria-hidden", "true"); icon.textContent = "🔔"; icon.style.cssText = "font-size:var(--maq-text-2xl);flex-shrink:0;color:var(--maq-neutral-500)"
  wrap.appendChild(icon)
  const body = document.createElement("div")
  body.style.cssText = "flex:1"
  const h = document.createElement("p"); h.style.cssText = "margin:0 0 var(--maq-space-2);font-weight:var(--maq-weight-semibold);color:var(--maq-neutral-800)"
  h.textContent = locale === "ar" ? "تكوين التذكيرات يُتاح بعد المرحلة التجريبية" : "Reminder configuration ships after the controlled beta"
  body.appendChild(h)
  const p = document.createElement("p"); p.style.cssText = "margin:0;font-size:var(--maq-text-sm);color:var(--maq-neutral-600);line-height:var(--maq-leading-relaxed)"
  p.textContent = locale === "ar"
    ? "خلال المرحلة التجريبية، تظهر التذكيرات داخل التطبيق فقط (تقويم أعلاه). ستتاح تذكيرات البريد الإلكتروني والرسائل القصيرة وقنوات أخرى بعد إكمال نافذة الإطلاق المُدارة."
    : "During the controlled beta, reminders appear in-app only (calendar above). Email, SMS, and channel-specific reminders ship after the controlled-launch window."
  body.appendChild(p)
  wrap.appendChild(body)
  return wrap
}

export default { render }
