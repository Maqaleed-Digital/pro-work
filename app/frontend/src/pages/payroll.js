// WC-CB Day 5 (D-1, 2026-05-14): Payroll module per brief §3.4.
//
// Authority:
//   - brief §3.4 — "Payroll runs list, view detail (read-only acceptable
//     for v1 if backend write endpoints not yet exposed). Payment status
//     (informational; payment processing is backend / partner-mediated)."
//   - PROPOSAL §11.A4 NO PHANTOM FEATURES: no payment processing
//     surface; no "Pay now" button. Payment is partner-mediated
//     (HyperPay / Tap / WPS partner) and out-of-scope.
//   - PROPOSAL §11.A2 stricter: read-only mode all the way.
//
// Backend reality: no "payroll runs" list exists today; we surface the
// latest WPS readiness pack (set during onboarding) as the payroll
// snapshot. Pay-runs list itself is labelled "Coming later".

import { t, getLocale } from "../locale.js"
import { getLatestWpsPack } from "../api/payroll.js"
import { renderModeStatusChip } from "../components/mode_status_chip.js"
import {
  renderLoadingState, renderEmptyState, renderErrorState,
  renderPermissionDeniedState,
} from "../components/edge_state.js"

function render(el) {
  el.innerHTML = ""
  const locale = getLocale()

  const wrap = document.createElement("div")
  wrap.className = "content-area"

  // Header
  const header = document.createElement("header"); header.className = "page-header"
  const ht = document.createElement("div"); ht.className = "page-header-text"
  const h1 = document.createElement("h1"); h1.textContent = t("payroll.title")
  const sub = document.createElement("p"); sub.textContent = t("payroll.subtitle")
  ht.appendChild(h1); ht.appendChild(sub); header.appendChild(ht)
  header.appendChild(renderModeStatusChip({ mode: "D", capabilityName: "WC-PYR", locale }))
  wrap.appendChild(header)

  // Read-only banner per brief §3.4 + RM-001 §10.1
  const readBanner = document.createElement("aside")
  readBanner.setAttribute("role", "note")
  readBanner.style.cssText = "margin:var(--maq-space-4);padding:var(--maq-space-3) var(--maq-space-4);background:var(--maq-mode-d-bg);color:var(--maq-mode-d);border:1px solid var(--maq-mode-d);border-radius:var(--maq-radius-md);font-size:var(--maq-text-sm);display:flex;gap:var(--maq-space-3);align-items:start"
  const ricon = document.createElement("span"); ricon.setAttribute("aria-hidden", "true"); ricon.textContent = "ℹ"; ricon.style.fontSize = "var(--maq-text-lg)"
  readBanner.appendChild(ricon)
  const rtxt = document.createElement("div")
  rtxt.innerHTML = `<strong>${escapeHtml(t("payroll.readOnlyTitle"))}</strong><br><span style="opacity:0.9">${escapeHtml(t("payroll.readOnlyBody"))}</span>`
  readBanner.appendChild(rtxt)
  wrap.appendChild(readBanner)

  // WPS readiness section
  const wpsSection = document.createElement("section")
  wpsSection.setAttribute("aria-labelledby", "payroll-wps-heading")
  wpsSection.style.cssText = "padding-inline:var(--maq-space-4)"

  const wh = document.createElement("h2")
  wh.id = "payroll-wps-heading"
  wh.style.cssText = "font-size:var(--maq-text-xl);margin:0 0 var(--maq-space-1)"
  wh.textContent = t("payroll.wpsTitle")
  wpsSection.appendChild(wh)

  const wsub = document.createElement("p")
  wsub.style.cssText = "color:var(--maq-neutral-600);margin:0 0 var(--maq-space-4);font-size:var(--maq-text-sm)"
  wsub.textContent = t("payroll.wpsSubtitle")
  wpsSection.appendChild(wsub)

  const wpsContent = document.createElement("div")
  wpsContent.appendChild(renderLoadingState({ skeletonRows: 4 }))
  wpsSection.appendChild(wpsContent)

  wrap.appendChild(wpsSection)

  // Payroll runs section (Coming later per §11.A4)
  const runsSection = document.createElement("section")
  runsSection.setAttribute("aria-labelledby", "payroll-runs-heading")
  runsSection.style.cssText = "padding:var(--maq-space-4);margin-block-start:var(--maq-space-6)"
  const rh = document.createElement("h2")
  rh.id = "payroll-runs-heading"
  rh.style.cssText = "font-size:var(--maq-text-xl);margin:0 0 var(--maq-space-1);display:flex;align-items:center;gap:var(--maq-space-3)"
  rh.appendChild(document.createTextNode(t("payroll.runsTitle")))
  const badge = document.createElement("span")
  badge.textContent = t("common.comingSoon")
  badge.style.cssText = "padding:0 var(--maq-space-2);background:var(--maq-mode-d-bg);color:var(--maq-mode-d);border-radius:var(--maq-radius-sm);font-size:var(--maq-text-xs);font-weight:var(--maq-weight-medium)"
  rh.appendChild(badge)
  runsSection.appendChild(rh)
  runsSection.appendChild(renderEmptyState({
    icon: "🧾",
    title: { en: "Payroll runs surface ships after the controlled beta",
             ar: "واجهة دورات الرواتب تُتاح بعد المرحلة التجريبية" },
    body: { en: "Payroll execution is partner-mediated (WPS via licensed partner). Until the run-history surface ships, refer to your bank's WPS dashboard for the source-of-truth.",
            ar: "تنفيذ الرواتب يتم عبر شريك مرخّص (نظام حماية الأجور). حتى يُتاح عرض السجل، راجع لوحة تحكم نظام حماية الأجور لدى البنك للحصول على المرجع الأصلي." },
    locale,
  }))
  wrap.appendChild(runsSection)

  el.appendChild(wrap)

  // Load WPS pack
  getLatestWpsPack().then(pack => {
    wpsContent.innerHTML = ""
    if (!pack) {
      wpsContent.appendChild(renderEmptyState({
        icon: "📋",
        title: { en: "No WPS readiness pack yet", ar: "لا توجد حزمة جاهزية لنظام حماية الأجور بعد" },
        body: { en: "Once your organisation's IBAN is validated and a WPS pack is generated, it will appear here.",
                ar: "بعد التحقق من رقم الآيبان وإنشاء حزمة نظام حماية الأجور، ستظهر هنا." },
        actionLabel: { en: "Complete onboarding", ar: "إكمال الإعداد" },
        actionHref: "#onboarding",
        locale,
      }))
      return
    }
    renderPack(wpsContent, pack, locale)
  }).catch(err => {
    wpsContent.innerHTML = ""
    if (err && (err.status === 403 || err.code === "FORBIDDEN")) {
      wpsContent.appendChild(renderPermissionDeniedState({ locale }))
    } else {
      wpsContent.appendChild(renderErrorState({ error: err, locale }))
    }
  })
}

function renderPack(container, pack, locale) {
  const list = document.createElement("dl")
  list.style.cssText = "margin:0;display:grid;grid-template-columns:auto 1fr;gap:var(--maq-space-3) var(--maq-space-6);max-inline-size:680px;background:var(--maq-neutral-0);border:1px solid var(--maq-neutral-200);border-radius:var(--maq-radius-lg);padding:var(--maq-space-4)"
  const fields = [
    { labelKey: "payroll.pack.id",        value: pack.pack_id || pack.id || "—", mono: true },
    { labelKey: "payroll.pack.iban",      value: maskIban(pack.iban || pack.establishment_iban) },
    { labelKey: "payroll.pack.generated", value: pack.created_at || pack.generated_at ? new Date(pack.created_at || pack.generated_at).toLocaleString(locale === "ar" ? "ar-SA" : "en-GB") : "—" },
    { labelKey: "payroll.pack.status",    value: (pack.status || "ready").toUpperCase() },
    { labelKey: "payroll.pack.employees", value: pack.employee_count != null ? pack.employee_count : (Array.isArray(pack.employees) ? pack.employees.length : "—") },
  ]
  for (const f of fields) {
    const dt = document.createElement("dt"); dt.style.cssText = "color:var(--maq-neutral-600);font-size:var(--maq-text-sm)"
    dt.textContent = t(f.labelKey)
    const dd = document.createElement("dd"); dd.style.cssText = "margin:0;font-weight:var(--maq-weight-medium)" + (f.mono ? ";font-family:var(--maq-font-mono)" : "")
    dd.textContent = String(f.value)
    list.appendChild(dt); list.appendChild(dd)
  }
  container.appendChild(list)
}

function maskIban(iban) {
  if (!iban) return "—"
  const s = String(iban).replace(/\s+/g, "")
  if (s.length < 8) return "—"
  return s.slice(0, 4) + " •••• " + s.slice(-4)
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]))
}

export default { render }
