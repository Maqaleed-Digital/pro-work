// WC-CB Day 5 (D-1, 2026-05-14): Employees module per brief §3.2.
//
// Authority:
//   - brief §3.2 — list with search + filter; add/edit/view employee;
//     bulk import (CSV) if backend supports; stub UI otherwise; wire
//     to existing backend endpoints discovered in 0.4.
//   - PROPOSAL §11.A4 NO PHANTOM FEATURES: Add/Edit/CSV are labelled
//     "Coming later" with disabled controls because no write endpoint
//     exists in the customer-facing path today.
//   - Sponsor stricter rule today: reusable edge-state primitives, no
//     bespoke per surface.
//
// Functional: list + view detail (via /api/identity/workers + per-worker
// detail bundle). The view-detail surface composes ERI + profile +
// employer-summary into one read-only panel.
//
// Brand-neutral per §11.A5.

import { t, getLocale } from "../locale.js"
import { listWorkers, getWorker } from "../api/employees.js"
import {
  renderLoadingState, renderEmptyState, renderErrorState,
  renderPermissionDeniedState,
} from "../components/edge_state.js"
import { renderModeStatusChip } from "../components/mode_status_chip.js"

let _state = {
  workers: null,    // null = unloaded, [] = empty, [...] = list
  filter: "",
  selectedId: null,
  detail: null,
  error: null,
}

async function load() {
  try {
    const { workers } = await listWorkers()
    _state.workers = workers
    _state.error = null
  } catch (e) {
    _state.error = e
    _state.workers = []
  }
}

function render(el) {
  el.innerHTML = ""
  const locale = getLocale()

  const wrap = document.createElement("div")
  wrap.className = "content-area"

  // Page header
  const header = document.createElement("header"); header.className = "page-header"
  const ht = document.createElement("div"); ht.className = "page-header-text"
  const h1 = document.createElement("h1"); h1.textContent = t("employees.title")
  const sub = document.createElement("p"); sub.textContent = t("employees.subtitle")
  ht.appendChild(h1); ht.appendChild(sub); header.appendChild(ht)
  // Mode-D chip
  const modeChip = renderModeStatusChip({ mode: "D", capabilityName: "WC-REC", locale })
  modeChip.style.alignSelf = "flex-start"
  header.appendChild(modeChip)
  wrap.appendChild(header)

  // Toolbar
  const toolbar = document.createElement("div")
  toolbar.style.cssText = "display:flex;gap:var(--maq-space-3);align-items:center;padding-inline:var(--maq-space-4);padding-block-end:var(--maq-space-4);flex-wrap:wrap"

  const searchInput = document.createElement("input")
  searchInput.type = "search"
  searchInput.placeholder = t("employees.searchPlaceholder")
  searchInput.value = _state.filter
  searchInput.setAttribute("aria-label", t("employees.searchPlaceholder"))
  searchInput.style.cssText = "flex:1;min-inline-size:240px;padding:var(--maq-space-2) var(--maq-space-3);border:1px solid var(--maq-neutral-300);border-radius:var(--maq-radius-md);font-family:inherit;font-size:var(--maq-text-sm)"
  searchInput.addEventListener("input", e => {
    _state.filter = e.target.value
    renderList(listContainer, locale)
  })
  toolbar.appendChild(searchInput)

  // Add / Edit / CSV import — disabled per §11.A4
  for (const cfg of [
    { key: "add", labelKey: "employees.add" },
    { key: "import", labelKey: "employees.importCsv" },
  ]) {
    const b = document.createElement("button")
    b.type = "button"
    b.disabled = true
    b.setAttribute("aria-disabled", "true")
    b.title = t("common.comingSoon")
    b.style.cssText = "padding:var(--maq-space-2) var(--maq-space-4);background:transparent;color:var(--maq-neutral-500);border:1px dashed var(--maq-neutral-300);border-radius:var(--maq-radius-md);cursor:not-allowed;font-family:inherit;font-size:var(--maq-text-sm)"
    b.textContent = t(cfg.labelKey)
    const badge = document.createElement("span")
    badge.textContent = " · " + t("common.comingSoon")
    badge.style.cssText = "font-size:var(--maq-text-xs);opacity:0.8"
    b.appendChild(badge)
    toolbar.appendChild(b)
  }

  wrap.appendChild(toolbar)

  // Body: left list, right detail panel
  const body = document.createElement("div")
  body.style.cssText = "display:grid;grid-template-columns:minmax(280px, 380px) 1fr;gap:var(--maq-space-4);padding-inline:var(--maq-space-4);padding-block-end:var(--maq-space-8);align-items:start"

  const listContainer = document.createElement("section")
  listContainer.setAttribute("aria-label", t("employees.listAria"))
  listContainer.style.cssText = "background:var(--maq-neutral-0);border:1px solid var(--maq-neutral-200);border-radius:var(--maq-radius-lg);overflow:hidden"
  body.appendChild(listContainer)

  const detailContainer = document.createElement("section")
  detailContainer.setAttribute("aria-label", t("employees.detailAria"))
  detailContainer.setAttribute("aria-live", "polite")
  detailContainer.style.cssText = "background:var(--maq-neutral-0);border:1px solid var(--maq-neutral-200);border-radius:var(--maq-radius-lg);padding:var(--maq-space-4);min-block-size:300px"
  body.appendChild(detailContainer)

  wrap.appendChild(body)
  el.appendChild(wrap)

  // Initial load
  if (_state.workers === null) {
    listContainer.appendChild(renderLoadingState({ skeletonRows: 6 }))
    detailContainer.appendChild(renderEmptyState({
      icon: "👤",
      title: { en: "Select an employee", ar: "اختر موظفًا" },
      body: { en: "Pick a name from the list to view their profile, ERI score, and employer summary.",
              ar: "اختر اسمًا من القائمة لعرض الملف ودرجة ERI وملخص صاحب العمل." },
      locale,
    }))
    load().then(() => renderList(listContainer, locale))
  } else {
    renderList(listContainer, locale)
    renderDetail(detailContainer, locale)
  }

  // Save handles for re-renders triggered by selection
  _renderTargets = { listContainer, detailContainer }
}

let _renderTargets = null

function renderList(container, locale) {
  container.innerHTML = ""

  if (_state.error) {
    container.appendChild(renderErrorOrDeny(_state.error, locale, () => {
      _state.workers = null; _state.error = null; load().then(() => renderList(container, locale))
    }))
    return
  }

  if (!_state.workers || _state.workers.length === 0) {
    container.appendChild(renderEmptyState({
      icon: "👥",
      title: { en: "No employees yet", ar: "لا يوجد موظفون بعد" },
      body: { en: "Once you connect your HR data source or backend adds an employee write API, your team will appear here.",
              ar: "بعد ربط مصدر بيانات الموارد البشرية أو إضافة واجهة الكتابة من الخادم، سيظهر فريقك هنا." },
      actionLabel: { en: "Edit profile", ar: "تعديل الملف" },
      actionHref: "#onboarding",
      locale,
    }))
    return
  }

  const q = _state.filter.trim().toLowerCase()
  const items = _state.workers.filter(w => !q || (w.display_name || "").toLowerCase().includes(q) || (w.worker_id || "").toLowerCase().includes(q))

  if (items.length === 0) {
    container.appendChild(renderEmptyState({
      icon: "🔎",
      title: { en: "No matches", ar: "لا توجد نتائج" },
      body: { en: "Try a different search term.", ar: "جرّب كلمة بحث مختلفة." },
      locale,
    }))
    return
  }

  const ul = document.createElement("ul")
  ul.setAttribute("role", "list")
  ul.style.cssText = "list-style:none;margin:0;padding:0;max-block-size:60vh;overflow:auto"
  for (const w of items) {
    const li = document.createElement("li")
    const btn = document.createElement("button")
    btn.type = "button"
    btn.setAttribute("data-worker-id", w.worker_id)
    btn.style.cssText = [
      "inline-size:100%",
      "text-align:start",
      "padding:var(--maq-space-3) var(--maq-space-4)",
      "background:" + (w.worker_id === _state.selectedId ? "var(--maq-brand-primary-bg)" : "transparent"),
      "color:" + (w.worker_id === _state.selectedId ? "var(--maq-brand-primary)" : "var(--maq-neutral-800)"),
      "border:none",
      "border-block-end:1px solid var(--maq-neutral-200)",
      "cursor:pointer",
      "font-family:inherit",
      "font-size:var(--maq-text-sm)",
      "display:flex",
      "flex-direction:column",
      "gap:2px",
    ].join(";")
    const name = document.createElement("span")
    name.style.cssText = "font-weight:var(--maq-weight-semibold)"
    name.textContent = w.display_name || w.worker_id
    btn.appendChild(name)
    const meta = document.createElement("span")
    meta.style.cssText = "font-size:var(--maq-text-xs);color:var(--maq-neutral-500);font-family:var(--maq-font-mono)"
    meta.textContent = w.worker_id
    btn.appendChild(meta)
    btn.addEventListener("click", () => selectWorker(w.worker_id, locale))
    li.appendChild(btn)
    ul.appendChild(li)
  }
  container.appendChild(ul)
}

async function selectWorker(workerId, locale) {
  _state.selectedId = workerId
  _state.detail = null
  if (_renderTargets) {
    renderList(_renderTargets.listContainer, locale)
    _renderTargets.detailContainer.innerHTML = ""
    _renderTargets.detailContainer.appendChild(renderLoadingState({ skeletonRows: 4 }))
  }
  try {
    _state.detail = await getWorker(workerId)
  } catch (e) {
    _state.detail = { error: e }
  }
  if (_renderTargets) renderDetail(_renderTargets.detailContainer, locale)
}

function renderDetail(container, locale) {
  container.innerHTML = ""
  if (!_state.selectedId) {
    container.appendChild(renderEmptyState({
      icon: "👤",
      title: { en: "Select an employee", ar: "اختر موظفًا" },
      body: { en: "Pick a name from the list to view their profile, ERI score, and employer summary.",
              ar: "اختر اسمًا من القائمة لعرض الملف ودرجة ERI وملخص صاحب العمل." },
      locale,
    }))
    return
  }
  const d = _state.detail
  if (d && d.error) {
    container.appendChild(renderErrorOrDeny(d.error, locale, () => selectWorker(_state.selectedId, locale)))
    return
  }
  if (!d) return

  const p = d.profile || {}
  const eri = d.eri || {}
  const summary = d.summary || {}

  // Header
  const h = document.createElement("h2")
  h.style.cssText = "margin:0 0 var(--maq-space-2);font-size:var(--maq-text-xl);font-weight:var(--maq-weight-semibold);color:var(--maq-neutral-900)"
  h.textContent = p.display_name || p.name || _state.selectedId
  container.appendChild(h)

  const cid = document.createElement("p")
  cid.style.cssText = "margin:0 0 var(--maq-space-4);font-family:var(--maq-font-mono);font-size:var(--maq-text-xs);color:var(--maq-neutral-500)"
  cid.textContent = _state.selectedId
  container.appendChild(cid)

  // Profile fields
  const fields = [
    { key: "role",        labelKey: "employees.role",        value: p.role },
    { key: "department",  labelKey: "employees.department",  value: p.department },
    { key: "nationality", labelKey: "employees.nationality", value: p.nationality },
    { key: "status",      labelKey: "employees.status",      value: p.status },
    { key: "eri-score",   labelKey: "employees.eriScore",    value: typeof eri.score === "number" ? eri.score.toFixed(2) : null, mono: true },
    { key: "eri-band",    labelKey: "employees.eriBand",     value: eri.band || null },
    { key: "tenure",      labelKey: "employees.tenure",      value: summary.tenure || null },
  ]
  const list = document.createElement("dl")
  list.style.cssText = "margin:0;display:grid;grid-template-columns:1fr 1fr;gap:var(--maq-space-3);max-inline-size:600px"
  for (const f of fields) {
    const dt = document.createElement("dt")
    dt.style.cssText = "color:var(--maq-neutral-600);font-size:var(--maq-text-sm)"
    dt.textContent = t(f.labelKey)
    const dd = document.createElement("dd")
    dd.style.cssText = "margin:0;font-weight:var(--maq-weight-medium)" + (f.mono ? ";font-family:var(--maq-font-mono)" : "")
    dd.textContent = (f.value == null || f.value === "") ? "—" : String(f.value)
    list.appendChild(dt); list.appendChild(dd)
  }
  container.appendChild(list)

  // Edit (disabled)
  const editRow = document.createElement("div")
  editRow.style.cssText = "margin-block-start:var(--maq-space-6);display:flex;gap:var(--maq-space-2);flex-wrap:wrap"
  const editBtn = document.createElement("button")
  editBtn.type = "button"; editBtn.disabled = true; editBtn.setAttribute("aria-disabled", "true")
  editBtn.title = t("common.comingSoon")
  editBtn.style.cssText = "padding:var(--maq-space-2) var(--maq-space-4);background:transparent;color:var(--maq-neutral-500);border:1px dashed var(--maq-neutral-300);border-radius:var(--maq-radius-md);cursor:not-allowed;font-family:inherit;font-size:var(--maq-text-sm)"
  editBtn.textContent = t("employees.edit") + " · " + t("common.comingSoon")
  editRow.appendChild(editBtn)
  container.appendChild(editRow)
}

function renderErrorOrDeny(e, locale, retry) {
  if (e && (e.status === 403 || e.code === "FORBIDDEN")) {
    return renderPermissionDeniedState({ locale })
  }
  return renderErrorState({ error: e, retry, locale })
}

export default { render, destroy() { _state.workers = null; _state.selectedId = null; _state.detail = null } }
