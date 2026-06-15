/**
 * Compliance & Risk Screen — /compliance
 *
 * Sections:
 *   A — Compliance Score Widget (overall + drill-down)
 *   B — Nitaqat Zone Indicator
 *   C — WPS Readiness Table
 *   D — Probation Deadlines (with Day-80+ prominence)
 *   E — Document Expiry Alerts
 *
 * Arabic RTL layout — logical CSS throughout.
 * Red items always visible, never collapsed.
 */

const LABELS_AR = {
  title:               'لوحة الامتثال والمخاطر',
  overallScore:        'مؤشر الامتثال الكلي',
  scoreBreakdown:      'تفاصيل المؤشر',
  componentNitaqat:    'نطاق السعودة',
  componentWps:        'جاهزية الرواتب (WPS)',
  componentProbation:  'فترات التجربة',
  componentDocs:       'الوثائق',
  nitaqatZone:         'نطاق نطاقات',
  saudizationPct:      'نسبة السعودة',
  trend:               'الاتجاه',
  wpsTitle:            'جدول جاهزية WPS',
  colWorker:           'الموظف',
  colIban:             'IBAN',
  colIdentity:         'الهوية',
  colBank:             'البنك',
  colPack:             'الحزمة',
  colStatus:           'الحالة',
  statusComplete:      'مكتمل',
  statusFailed:        'فشل',
  statusPending:       'معلق',
  statusPendingStale:  'معلق (متأخر)',
  probationTitle:      'مواعيد فترات التجربة',
  daysLeft:            'يوم متبقٍ',
  decisionRequired:    'مطلوب قرار',
  evidenceReady:       '✅ حزمة الأدلة جاهزة — مطلوب قرار',
  docTitle:            'تنبيهات انتهاء صلاحية الوثائق',
  colDocType:          'نوع الوثيقة',
  colExpiry:           'تاريخ الانتهاء',
  colDaysLeft:         'الأيام المتبقية',
  expired:             'منتهية الصلاحية',
  expiringSoon:        'تنتهي قريباً',
  noAlerts:            'لا توجد تنبيهات',
  loading:             'جارٍ التحميل...',
  error:               'حدث خطأ في تحميل البيانات',
  redAlertsTitle:      '⚠ تنبيهات حرجة تستوجب الإجراء الفوري',
  viewDecision:        'انتقل إلى قرار التجربة',
  insufficientData:    'بيانات غير كافية',
}

const LABELS_EN = {
  title:               'Compliance & Risk Control',
  overallScore:        'Overall Compliance Score',
  scoreBreakdown:      'Score Breakdown',
  componentNitaqat:    'Nitaqat Zone',
  componentWps:        'WPS Readiness',
  componentProbation:  'Probation Status',
  componentDocs:       'Documentation',
  nitaqatZone:         'Nitaqat Zone',
  saudizationPct:      'Saudi Workforce %',
  trend:               'Trend',
  wpsTitle:            'WPS Readiness Table',
  colWorker:           'Worker',
  colIban:             'IBAN',
  colIdentity:         'Identity',
  colBank:             'Bank',
  colPack:             'Pack',
  colStatus:           'Status',
  statusComplete:      'Complete',
  statusFailed:        'Failed',
  statusPending:       'Pending',
  statusPendingStale:  'Pending (Stale)',
  probationTitle:      'Probation Deadlines',
  daysLeft:            'days left',
  decisionRequired:    'Decision Required',
  evidenceReady:       '✅ Evidence pack ready — decision required',
  docTitle:            'Document Expiry Alerts',
  colDocType:          'Document Type',
  colExpiry:           'Expiry Date',
  colDaysLeft:         'Days Left',
  expired:             'Expired',
  expiringSoon:        'Expiring Soon',
  noAlerts:            'No alerts',
  loading:             'Loading...',
  error:               'Error loading compliance data',
  redAlertsTitle:      '⚠ Critical alerts requiring immediate action',
  viewDecision:        'Go to probation decision',
  insufficientData:    'Insufficient data',
}

const SCORE_COLORS = { GREEN: '#1a7f37', AMBER: '#b08000', RED: '#b00020' }
const ZONE_COLORS  = { PLATINUM: '#0066cc', GREEN: '#1a7f37', YELLOW: '#b08000', RED: '#b00020', UNKNOWN: '#888' }

// ── style helpers (logical CSS) ───────────────────────────────────────────────

function sectionWrap() {
  const el = document.createElement('div')
  el.style.cssText = `margin-bottom:20px; border:1px solid #eee; border-radius:10px; overflow:hidden`
  return el
}

function sectionHead(text, color) {
  const el = document.createElement('div')
  el.style.cssText = `padding:10px 14px; font-size:11px; font-weight:700; text-transform:uppercase;
    letter-spacing:.04em; color:${color || '#888'}; background:#fafafa; border-bottom:1px solid #eee;
    text-align:start`
  el.textContent = text
  return el
}

function sectionBody() {
  const el = document.createElement('div')
  el.style.cssText = `padding:12px 14px`
  return el
}

function badge(text, color) {
  const el = document.createElement('span')
  el.style.cssText = `display:inline-block; padding:2px 9px; border-radius:10px; font-size:11px;
    font-weight:700; text-transform:uppercase; background:${color}22; color:${color}`
  el.textContent = text
  return el
}

function alertRow(content, severity) {
  const c   = SCORE_COLORS[severity] || '#888'
  const el  = document.createElement('div')
  el.style.cssText = `display:flex; align-items:flex-start; gap:10px; padding:9px 14px;
    border-bottom:1px solid #f5f5f5; background:${c}0d; font-size:12px`
  const icon = document.createElement('span')
  icon.style.cssText = `color:${c}; font-weight:700; flex-shrink:0; margin-top:1px`
  icon.textContent   = severity === 'RED' ? '✕' : '⚠'
  const msg  = document.createElement('span')
  msg.style.cssText  = `color:#222; text-align:start; flex:1`
  msg.innerHTML      = content
  el.appendChild(icon); el.appendChild(msg)
  return el
}

function scoreGauge(score, color, label) {
  const wrap = document.createElement('div')
  wrap.style.cssText = `display:flex; align-items:center; gap:16px; margin-bottom:10px`
  const circle = document.createElement('div')
  circle.style.cssText = `width:72px; height:72px; border-radius:50%; border:4px solid ${color};
    display:flex; align-items:center; justify-content:center; flex-shrink:0`
  const num = document.createElement('span')
  num.style.cssText = `font-size:20px; font-weight:800; color:${color}`
  num.textContent   = score != null ? `${score}%` : '—'
  circle.appendChild(num)
  const lbl = document.createElement('div')
  lbl.style.cssText = `font-size:14px; font-weight:700; color:#222; text-align:start`
  lbl.textContent   = label
  wrap.appendChild(circle); wrap.appendChild(lbl)
  return wrap
}

function componentBar(label, score, color) {
  const wrap = document.createElement('div')
  wrap.style.cssText = `display:flex; align-items:center; gap:8px; margin-bottom:6px; font-size:12px`
  const lbl  = document.createElement('span')
  lbl.style.cssText = `min-width:120px; color:#555; text-align:start`
  lbl.textContent   = label
  const bar  = document.createElement('div')
  bar.style.cssText = `flex:1; height:6px; background:#eee; border-radius:3px; overflow:hidden`
  const fill = document.createElement('div')
  fill.style.cssText = `height:100%; width:${Math.min(100, score || 0)}%; background:${color}; border-radius:3px; transition:width .3s`
  bar.appendChild(fill)
  const num  = document.createElement('span')
  num.style.cssText = `font-size:11px; color:${color}; font-weight:700; min-width:38px; text-align:end`
  num.textContent   = score != null ? `${score}%` : '—'
  wrap.appendChild(lbl); wrap.appendChild(bar); wrap.appendChild(num)
  return wrap
}

function th(text) {
  const el = document.createElement('th')
  el.style.cssText = `text-align:start; padding:6px 10px; border-bottom:2px solid #eee;
    color:#888; font-weight:600; font-size:10px; text-transform:uppercase; white-space:nowrap`
  el.textContent = text
  return el
}

function td(content, color) {
  const el = document.createElement('td')
  el.style.cssText = `padding:7px 10px; font-size:12px; color:${color || '#333'}; text-align:start`
  if (typeof content === 'string' || typeof content === 'number') {
    el.textContent = content
  } else if (content) {
    el.appendChild(content)
  }
  return el
}

// ── component factory ─────────────────────────────────────────────────────────

/**
 * createComplianceRiskScreen({ container, dir, apiGet, onProbationDecision })
 *
 * @param container         — DOM element
 * @param dir               — 'rtl' | 'ltr'
 * @param apiGet            — async (url) => dashboard JSON (from /api/compliance/risk/dashboard)
 * @param tenantId          — string
 * @param onProbationDecision — (governanceCaseId) => void — navigate to probation decision
 */
export function createComplianceRiskScreen({ container, dir = 'ltr', apiGet, tenantId, onProbationDecision }) {
  const isRtl = dir === 'rtl'
  const L     = isRtl ? LABELS_AR : LABELS_EN

  container.dir = dir
  container.style.cssText = `font-size:13px; font-family:system-ui,sans-serif`

  // Title
  const titleEl = document.createElement('div')
  titleEl.style.cssText = `font-size:16px; font-weight:700; color:#111; margin-bottom:16px; text-align:start`
  titleEl.textContent = L.title
  container.appendChild(titleEl)

  // Loading / error placeholder
  const statusEl = document.createElement('div')
  statusEl.style.cssText = `padding:24px; text-align:center; color:#aaa; font-size:13px`
  statusEl.textContent = L.loading
  container.appendChild(statusEl)

  // ── render dashboard ──────────────────────────────────────────────────────────

  function renderDashboard(data) {
    container.innerHTML = ''
    container.appendChild(titleEl)

    const { overall, components, red_alerts } = data

    // ── Section A: Score + breakdown ───────────────────────────────────────────
    const scoreWrap = sectionWrap()
    scoreWrap.appendChild(sectionHead(L.overallScore))
    const scoreBody = sectionBody()
    const scoreColor = SCORE_COLORS[overall.color] || '#888'
    scoreBody.appendChild(scoreGauge(overall.score, scoreColor, L.overallScore))
    scoreBody.appendChild(sectionHead(L.scoreBreakdown))
    scoreBody.appendChild(componentBar(L.componentNitaqat,   components.nitaqat.score,       SCORE_COLORS[components.nitaqat.color]       || '#888'))
    scoreBody.appendChild(componentBar(L.componentWps,       components.wps.score,           SCORE_COLORS[components.wps.color]           || '#888'))
    scoreBody.appendChild(componentBar(L.componentProbation, components.probation.score,     SCORE_COLORS[components.probation.color]     || '#888'))
    scoreBody.appendChild(componentBar(L.componentDocs,      components.documentation.score, SCORE_COLORS[components.documentation.color] || '#888'))
    scoreWrap.appendChild(scoreBody)
    container.appendChild(scoreWrap)

    // ── Section RED ALERTS — always prominent, never collapsed ────────────────
    if (red_alerts && red_alerts.length > 0) {
      const alertsWrap = sectionWrap()
      alertsWrap.style.borderColor = '#b00020'
      alertsWrap.appendChild(sectionHead(L.redAlertsTitle, '#b00020'))
      red_alerts
        .filter(a => a.severity === 'RED')
        .forEach(alert => {
          let msg = ''
          if (alert.type === 'WPS_FAILED') {
            msg = isRtl
              ? `فشل WPS — الموظف: ${alert.worker_id}`
              : `WPS Failed — Worker: ${alert.worker_id}`
          } else if (alert.type === 'PROBATION_RED_DEADLINE') {
            msg = isRtl
              ? `قرار التجربة مطلوب — ${alert.days_remaining} يوم متبقٍ — ${alert.worker_id}`
              : `Probation decision required — ${alert.days_remaining} days left — ${alert.worker_id}`
          } else if (alert.type === 'DOCUMENT_EXPIRED') {
            msg = isRtl
              ? `الوثيقة منتهية الصلاحية — ${alert.document_type} — ${alert.worker_id}`
              : `Document expired — ${alert.document_type} — ${alert.worker_id}`
          }
          if (msg) alertsWrap.appendChild(alertRow(msg, 'RED'))
        })
      container.appendChild(alertsWrap)
    }

    // ── Section B: Nitaqat Zone ────────────────────────────────────────────────
    const nitaqat   = components.nitaqat
    const nitWrap   = sectionWrap()
    nitWrap.appendChild(sectionHead(L.nitaqatZone))
    const nitBody   = sectionBody()
    if (nitaqat.insufficient_data) {
      const nd = document.createElement('div')
      nd.style.cssText = `font-size:12px; color:#aaa; text-align:start`
      nd.textContent = L.insufficientData
      nitBody.appendChild(nd)
    } else {
      const zoneColor = ZONE_COLORS[nitaqat.zone] || '#888'
      const row = document.createElement('div')
      row.style.cssText = `display:flex; align-items:center; gap:12px; flex-wrap:wrap`
      row.appendChild(badge(nitaqat.zone, zoneColor))
      if (nitaqat.saudization_pct != null) {
        const pctEl = document.createElement('span')
        pctEl.style.cssText = `font-size:13px; color:#555`
        pctEl.textContent = `${L.saudizationPct}: ${nitaqat.saudization_pct}%`
        row.appendChild(pctEl)
      }
      if (nitaqat.trend) {
        const trendEl = document.createElement('span')
        trendEl.style.cssText = `font-size:12px; color:#888`
        trendEl.textContent = `${L.trend}: ${nitaqat.trend}`
        row.appendChild(trendEl)
      }
      nitBody.appendChild(row)
    }
    nitWrap.appendChild(nitBody)
    container.appendChild(nitWrap)

    // ── Section C: WPS Readiness Table ─────────────────────────────────────────
    const wps     = components.wps
    const wpsWrap = sectionWrap()
    wpsWrap.appendChild(sectionHead(L.wpsTitle))
    if (wps.total_packs === 0) {
      const nd = document.createElement('div')
      nd.style.cssText = `padding:12px 14px; font-size:12px; color:#aaa; text-align:start`
      nd.textContent = L.insufficientData
      wpsWrap.appendChild(nd)
    } else {
      const tbl   = document.createElement('table')
      tbl.style.cssText = `width:100%; border-collapse:collapse; font-size:12px`
      const thead = document.createElement('thead')
      const hrow  = document.createElement('tr')
      ;[L.colWorker, L.colIban, L.colIdentity, L.colBank, L.colPack, L.colStatus].forEach(h => hrow.appendChild(th(h)))
      thead.appendChild(hrow); tbl.appendChild(thead)
      const tbody = document.createElement('tbody')
      wps.rows.forEach(row => {
        const tr = document.createElement('tr')
        const rowBg = row.status === 'FAILED'       ? '#b0002008' :
                      row.status === 'PENDING_STALE' ? '#b0800008' : ''
        tr.style.cssText = `border-bottom:1px solid #f5f5f5; background:${rowBg}`
        const ibanColor   = row.iban_status === 'VERIFIED'   ? '#1a7f37' : row.iban_status === 'FAILED' ? '#b00020' : '#b08000'
        const identColor  = row.identity_verification_status === 'VERIFIED' ? '#1a7f37' : row.identity_verification_status === 'FAILED' ? '#b00020' : '#b08000'
        const bankColor   = row.bank_confirmation_status === 'CONFIRMED'    ? '#1a7f37' : row.bank_confirmation_status === 'FAILED'     ? '#b00020' : '#b08000'
        const packColor   = row.wps_package_valid ? '#1a7f37' : '#b08000'
        const statusLabel = row.status === 'COMPLETE' ? L.statusComplete : row.status === 'FAILED' ? L.statusFailed : row.status === 'PENDING_STALE' ? L.statusPendingStale : L.statusPending
        const statusColor = row.status === 'COMPLETE' ? '#1a7f37' : row.status === 'FAILED' ? '#b00020' : '#b08000'
        tr.appendChild(td(row.worker_id))
        tr.appendChild(td(row.iban_status,                  ibanColor))
        tr.appendChild(td(row.identity_verification_status, identColor))
        tr.appendChild(td(row.bank_confirmation_status,     bankColor))
        tr.appendChild(td(row.wps_package_valid ? '✓' : '—', packColor))
        tr.appendChild(td(badge(statusLabel, statusColor)))
        tbody.appendChild(tr)
      })
      tbl.appendChild(tbody)
      wpsWrap.appendChild(tbl)
    }
    container.appendChild(wpsWrap)

    // ── Section D: Probation Deadlines ─────────────────────────────────────────
    const prob     = components.probation
    const probWrap = sectionWrap()
    probWrap.appendChild(sectionHead(L.probationTitle))
    if (prob.active_cases === 0) {
      const nd = document.createElement('div')
      nd.style.cssText = `padding:12px 14px; font-size:12px; color:#aaa; text-align:start`
      nd.textContent = L.noAlerts
      probWrap.appendChild(nd)
    } else {
      prob.deadlines.forEach(d => {
        const urgencyColor = SCORE_COLORS[d.urgency] || '#888'
        const row = document.createElement('div')
        row.style.cssText = `display:flex; align-items:flex-start; gap:10px; padding:10px 14px;
          border-bottom:1px solid #f5f5f5; background:${urgencyColor}0d`

        const left = document.createElement('div')
        left.style.cssText = `flex:1; text-align:start`

        // Day-80+ evidence ready: ALWAYS PROMINENT — rendered first with strong styling
        if (d.evidence_ready) {
          const ev = document.createElement('div')
          ev.style.cssText = `font-size:12px; font-weight:700; color:#0066cc; margin-bottom:4px`
          ev.textContent = L.evidenceReady
          left.appendChild(ev)
        }

        const nameEl = document.createElement('div')
        nameEl.style.cssText = `font-size:12px; font-weight:600; color:#222`
        nameEl.textContent = d.worker_id
        left.appendChild(nameEl)

        const countdownEl = document.createElement('div')
        countdownEl.style.cssText = `font-size:11px; color:${urgencyColor}; font-weight:700; margin-top:2px`
        countdownEl.textContent = `${d.days_remaining} ${L.daysLeft}`
        left.appendChild(countdownEl)

        const right = document.createElement('div')
        right.style.cssText = `display:flex; flex-direction:column; align-items:flex-end; gap:4px; flex-shrink:0`
        right.appendChild(badge(d.urgency, urgencyColor))

        if (d.decision_required && typeof onProbationDecision === 'function') {
          const btn = document.createElement('button')
          btn.style.cssText = `font-size:10px; padding:3px 8px; border-radius:5px; border:1px solid #0066cc;
            color:#0066cc; background:transparent; cursor:pointer; margin-top:4px`
          btn.textContent = L.viewDecision
          btn.addEventListener('click', () => onProbationDecision(d.governance_case_id))
          right.appendChild(btn)
        }

        row.appendChild(left); row.appendChild(right)
        probWrap.appendChild(row)
      })
    }
    container.appendChild(probWrap)

    // ── Section E: Document Expiry Alerts ──────────────────────────────────────
    const docs     = components.documentation
    const docWrap  = sectionWrap()
    docWrap.appendChild(sectionHead(L.docTitle))
    if (docs.rows.length === 0) {
      const nd = document.createElement('div')
      nd.style.cssText = `padding:12px 14px; font-size:12px; color:#aaa; text-align:start`
      nd.textContent = L.noAlerts
      docWrap.appendChild(nd)
    } else {
      const tbl   = document.createElement('table')
      tbl.style.cssText = `width:100%; border-collapse:collapse; font-size:12px`
      const thead = document.createElement('thead')
      const hrow  = document.createElement('tr')
      ;[L.colWorker, L.colDocType, L.colExpiry, L.colDaysLeft, L.colStatus].forEach(h => hrow.appendChild(th(h)))
      thead.appendChild(hrow); tbl.appendChild(thead)
      const tbody = document.createElement('tbody')
      docs.rows.forEach(row => {
        const tr = document.createElement('tr')
        const isExpired = row.status === 'EXPIRED'
        tr.style.cssText = `border-bottom:1px solid #f5f5f5; background:${isExpired ? '#b0002008' : '#b0800008'}`
        const statusColor = isExpired ? '#b00020' : '#b08000'
        const statusLabel = isExpired ? L.expired : L.expiringSoon
        tr.appendChild(td(row.worker_id))
        tr.appendChild(td(row.document_type))
        tr.appendChild(td(row.expires_at ? row.expires_at.slice(0,10) : '—'))
        tr.appendChild(td(row.days_remaining, statusColor))
        tr.appendChild(td(badge(statusLabel, statusColor)))
        tbody.appendChild(tr)
      })
      tbl.appendChild(tbody)
      docWrap.appendChild(tbl)
    }
    container.appendChild(docWrap)
  }

  // ── fetch and render ──────────────────────────────────────────────────────────

  async function load() {
    try {
      const data = await apiGet(`/api/compliance/risk/dashboard?tenant_id=${encodeURIComponent(tenantId || '')}`)
      if (data && data.overall) {
        renderDashboard(data)
      } else {
        statusEl.textContent = L.error
        container.innerHTML = ''
        container.appendChild(titleEl)
        container.appendChild(statusEl)
      }
    } catch (e) {
      statusEl.textContent = L.error
      container.innerHTML = ''
      container.appendChild(titleEl)
      container.appendChild(statusEl)
    }
  }

  load()

  return {
    destroy:  () => { container.innerHTML = '' },
    refresh:  load,
    renderDashboard,   // exposed for direct use in tests
  }
}
