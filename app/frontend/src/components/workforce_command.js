/**
 * Workforce Command Screen — unified FTE + Freelancer table.
 * Worker type indicator (FTE vs FREELANCER) always visible.
 * Allocation conflict alerts shown as red badges.
 * Arabic RTL layout (logical CSS throughout).
 *
 * Route: /workforce
 */

const LABELS_AR = {
  title:           'مركز القوى العاملة',
  colName:         'الاسم',
  colType:         'النوع',
  colSkillMatch:   'تطابق المهارات',
  colAvailability: 'التوفر',
  colAllocation:   'نسبة الإشغال',
  colCompliance:   'الامتثال',
  typeFte:         'موظف دائم',
  typeFreelancer:  'مستقل',
  filterType:      'تصفية حسب النوع',
  filterAll:       'الكل',
  filterAvail:     'تصفية حسب التوفر',
  availAll:        'الكل',
  availFree:       'متاح',
  availBusy:       'مشغول',
  conflictBadge:   'تعارض التخصيص',
  aiTitle:         'أفضل التطابقات (AI)',
  noResults:       'لا يوجد موظفون',
  loadingText:     'جارٍ التحميل...',
  complianceOk:    'ممتثل',
  complianceWarn:  'تحذير',
  complianceRed:   'مخالفة',
}

const LABELS_EN = {
  title:           'Workforce Command',
  colName:         'Name',
  colType:         'Type',
  colSkillMatch:   'Skill Match',
  colAvailability: 'Availability',
  colAllocation:   'Allocation',
  colCompliance:   'Compliance',
  typeFte:         'FTE',
  typeFreelancer:  'Freelancer',
  filterType:      'Filter by Type',
  filterAll:       'All',
  filterAvail:     'Filter by Availability',
  availAll:        'All',
  availFree:       'Available',
  availBusy:       'Busy',
  conflictBadge:   'Allocation Conflict',
  aiTitle:         'AI Top Matches',
  noResults:       'No workers found',
  loadingText:     'Loading...',
  complianceOk:    'OK',
  complianceWarn:  'Warning',
  complianceRed:   'Violation',
}

const TYPE_COLORS = { FTE: '#0066cc', FREELANCER: '#5f2a82' }
const COMPLIANCE_COLORS = { OK: '#1a7f37', WARNING: '#b08000', VIOLATION: '#b00020' }

// ── style helpers (logical CSS) ───────────────────────────────────────────────

function typeBadge(type, label) {
  const c = TYPE_COLORS[type] || '#888'
  const el = document.createElement('span')
  el.style.cssText = `
    display:inline-block; padding:2px 7px; border-radius:8px; font-size:10px;
    font-weight:700; text-transform:uppercase; letter-spacing:.03em;
    background:${c}22; color:${c};
  `
  el.textContent = label
  return el
}

function conflictBadge(label) {
  const el = document.createElement('span')
  el.style.cssText = `
    display:inline-block; padding:2px 6px; border-radius:6px; font-size:10px;
    font-weight:700; background:#b0002022; color:#b00020;
    margin-inline-start:6px;
  `
  el.textContent = '⚠ ' + label
  return el
}

function pctBar(pct, color) {
  const wrap = document.createElement('div')
  wrap.style.cssText = `display:flex; align-items:center; gap:6px`
  const bar = document.createElement('div')
  bar.style.cssText = `width:60px; height:6px; background:#eee; border-radius:3px; overflow:hidden; flex-shrink:0`
  const fill = document.createElement('div')
  fill.style.cssText = `height:100%; width:${Math.min(100, pct)}%; background:${color}; border-radius:3px`
  bar.appendChild(fill)
  const num = document.createElement('span')
  num.style.cssText = `font-size:11px; color:#555; font-family:monospace`
  num.textContent = `${pct}%`
  wrap.appendChild(bar); wrap.appendChild(num)
  return wrap
}

function selectEl(options, id) {
  const el = document.createElement('select')
  el.id = id
  el.style.cssText = `padding:5px 8px; border:1px solid #ddd; border-radius:6px; font-size:12px; margin-inline-end:8px`
  options.forEach(([value, label]) => {
    const opt = document.createElement('option'); opt.value = value; opt.textContent = label; el.appendChild(opt)
  })
  return el
}

function sectionHead(text) {
  const el = document.createElement('div')
  el.style.cssText = `font-size:11px; font-weight:700; text-transform:uppercase; color:#888;
    letter-spacing:.04em; margin:14px 0 6px; text-align:start`
  el.textContent = text
  return el
}

// ── component factory ─────────────────────────────────────────────────────────

/**
 * createWorkforceCommand({ container, dir, workers, aiMatches, onSelect })
 *
 * @param container  — DOM element
 * @param dir        — 'rtl' | 'ltr'
 * @param workers    — array of worker profiles from buildWorkerProfile()
 * @param aiMatches  — optional array of top-3 AI suggestions [{ worker_id, confidence, rationale }]
 * @param onSelect   — (worker) => void — called on row click
 */
export function createWorkforceCommand({ container, dir = 'ltr', workers = [], aiMatches = [], onSelect }) {
  const isRtl = dir === 'rtl'
  const L     = isRtl ? LABELS_AR : LABELS_EN

  container.dir = dir
  container.style.cssText = `font-size:13px; font-family:system-ui,sans-serif`

  // ── Title ────────────────────────────────────────────────────────────────────
  const titleEl = document.createElement('div')
  titleEl.style.cssText = `font-size:16px; font-weight:700; color:#111; margin-bottom:14px; text-align:start`
  titleEl.textContent = L.title
  container.appendChild(titleEl)

  // ── Filters ──────────────────────────────────────────────────────────────────
  const filterRow = document.createElement('div')
  filterRow.style.cssText = `display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:12px`

  const typeFilter = selectEl([
    ['ALL', L.filterAll], ['FTE', L.typeFte], ['FREELANCER', L.typeFreelancer]
  ], 'wc-type-filter')

  const availFilter = selectEl([
    ['ALL', L.availAll], ['FREE', L.availFree], ['BUSY', L.availBusy]
  ], 'wc-avail-filter')

  filterRow.appendChild(typeFilter)
  filterRow.appendChild(availFilter)
  container.appendChild(filterRow)

  // ── Layout: table + AI panel ─────────────────────────────────────────────────
  const layout = document.createElement('div')
  layout.style.cssText = `display:flex; gap:16px; align-items:flex-start`

  const tableWrap = document.createElement('div')
  tableWrap.style.cssText = `flex:1; overflow-x:auto`
  layout.appendChild(tableWrap)

  // AI insight panel
  const aiPanel = document.createElement('div')
  aiPanel.style.cssText = `width:220px; flex-shrink:0; border:1px solid #eee; border-radius:10px; padding:12px`
  aiPanel.appendChild(sectionHead(L.aiTitle))
  if (aiMatches.length === 0) {
    const noAi = document.createElement('div')
    noAi.style.cssText = `font-size:12px; color:#aaa; text-align:start`
    noAi.textContent = '—'
    aiPanel.appendChild(noAi)
  } else {
    aiMatches.slice(0, 3).forEach((m, i) => {
      const row = document.createElement('div')
      row.style.cssText = `padding:6px 0; border-bottom:1px solid #f5f5f5; font-size:12px`
      row.innerHTML = `<span style="font-weight:600;color:#111">#${i+1} ${m.display_name || m.worker_id}</span>
        <span style="display:block;color:#0066cc;font-size:11px;margin-top:2px">${Math.round((m.confidence||0)*100)}% confidence</span>
        ${m.rationale ? `<span style="display:block;color:#888;font-size:11px;margin-top:2px">${m.rationale}</span>` : ''}`
      aiPanel.appendChild(row)
    })
  }
  layout.appendChild(aiPanel)
  container.appendChild(layout)

  // ── Table renderer ────────────────────────────────────────────────────────────

  function renderTable(filteredWorkers) {
    tableWrap.innerHTML = ''
    if (filteredWorkers.length === 0) {
      const empty = document.createElement('div')
      empty.style.cssText = `padding:24px; text-align:center; color:#aaa; font-size:13px`
      empty.textContent = L.noResults
      tableWrap.appendChild(empty)
      return
    }

    const tbl = document.createElement('table')
    tbl.style.cssText = `width:100%; border-collapse:collapse; font-size:12px`

    // Header
    const thead = document.createElement('thead')
    const hr    = document.createElement('tr')
    const cols  = [L.colName, L.colType, L.colSkillMatch, L.colAvailability, L.colAllocation, L.colCompliance]
    cols.forEach(h => {
      const th = document.createElement('th')
      th.style.cssText = `text-align:start; padding:6px 10px; border-bottom:2px solid #eee;
        color:#888; font-weight:600; font-size:11px; white-space:nowrap`
      th.textContent = h
      hr.appendChild(th)
    })
    thead.appendChild(hr); tbl.appendChild(thead)

    const tbody = document.createElement('tbody')
    filteredWorkers.forEach(worker => {
      const tr = document.createElement('tr')
      tr.style.cssText = `cursor:pointer; border-bottom:1px solid #f5f5f5`
      tr.addEventListener('mouseenter', () => { tr.style.background = '#f8f9fb' })
      tr.addEventListener('mouseleave', () => { tr.style.background = '' })
      tr.addEventListener('click',      () => { if (typeof onSelect === 'function') onSelect(worker) })

      const hasConflict = worker.conflict && worker.conflict.conflict

      // Name cell
      const nameTd = document.createElement('td')
      nameTd.style.cssText = `padding:8px 10px; text-align:start`
      nameTd.appendChild(document.createTextNode(worker.display_name || worker.worker_id))
      if (hasConflict) nameTd.appendChild(conflictBadge(L.conflictBadge))
      tr.appendChild(nameTd)

      // Type cell — ALWAYS VISIBLE, never omitted
      const typeTd = document.createElement('td')
      typeTd.style.cssText = `padding:8px 10px`
      const typeLabel = worker.worker_type === 'FTE' ? L.typeFte : L.typeFreelancer
      typeTd.appendChild(typeBadge(worker.worker_type, typeLabel))
      tr.appendChild(typeTd)

      // Skill match
      const skillTd = document.createElement('td'); skillTd.style.cssText = `padding:8px 10px`
      const skillColor = worker.skill_match_pct >= 80 ? '#1a7f37' : worker.skill_match_pct >= 50 ? '#b08000' : '#b00020'
      skillTd.appendChild(pctBar(worker.skill_match_pct, skillColor))
      tr.appendChild(skillTd)

      // Availability
      const availTd = document.createElement('td'); availTd.style.cssText = `padding:8px 10px`
      const availColor = worker.availability_pct >= 50 ? '#1a7f37' : worker.availability_pct >= 20 ? '#b08000' : '#b00020'
      availTd.appendChild(pctBar(worker.availability_pct, availColor))
      tr.appendChild(availTd)

      // Allocation
      const allocTd = document.createElement('td'); allocTd.style.cssText = `padding:8px 10px`
      const allocColor = hasConflict ? '#b00020' : worker.utilization_pct >= 90 ? '#b08000' : '#1a7f37'
      allocTd.appendChild(pctBar(worker.utilization_pct, allocColor))
      tr.appendChild(allocTd)

      // Compliance
      const compTd = document.createElement('td'); compTd.style.cssText = `padding:8px 10px`
      const compStatus = worker.compliance_status || 'OK'
      const compColor  = COMPLIANCE_COLORS[compStatus] || '#888'
      const compEl = document.createElement('span')
      compEl.style.cssText = `font-size:11px; font-weight:600; color:${compColor}`
      compEl.textContent = compStatus === 'OK' ? L.complianceOk : compStatus === 'WARNING' ? L.complianceWarn : L.complianceRed
      compTd.appendChild(compEl)
      tr.appendChild(compTd)

      tbody.appendChild(tr)
    })
    tbl.appendChild(tbody)
    tableWrap.appendChild(tbl)
  }

  function applyFilters() {
    const typeVal  = typeFilter.value
    const availVal = availFilter.value
    const filtered = workers.filter(w => {
      if (typeVal !== 'ALL' && w.worker_type !== typeVal) return false
      if (availVal === 'FREE' && w.availability_pct < 20)  return false
      if (availVal === 'BUSY' && w.availability_pct >= 20) return false
      return true
    })
    renderTable(filtered)
  }

  typeFilter.addEventListener('change',  applyFilters)
  availFilter.addEventListener('change', applyFilters)

  renderTable(workers)

  return { destroy: () => { container.innerHTML = '' }, refresh: applyFilters }
}
