/**
 * Probation Timeline — visual countdown with decision workflow.
 * Arabic RTL layout mandatory (logical CSS properties throughout).
 *
 * Status labels:
 *   ON_TRACK         — before Day 80
 *   EVIDENCE_READY   — Day 80+ or pack compiled
 *   DECISION_REQUIRED — Day 90+ / 180+
 *   DECIDED          — decision recorded
 */

const MILESTONES = [
  { day: 30,  key: 'FIRST_REVIEW',              labelEn: 'First Review',                 labelAr: 'المراجعة الأولى' },
  { day: 60,  key: 'MID_REVIEW',                labelEn: 'Mid Review',                   labelAr: 'المراجعة المتوسطة' },
  { day: 80,  key: 'EVIDENCE_PACK',             labelEn: 'Evidence Pack',                labelAr: 'حزمة الأدلة' },
  { day: 90,  key: 'DECISION_REQUIRED',         labelEn: 'Decision (90d)',               labelAr: 'القرار (90 يوم)' },
  { day: 180, key: 'EXTENDED_DECISION_REQUIRED',labelEn: 'Decision (180d)',              labelAr: 'القرار (180 يوم)' },
]

const LABELS_AR = {
  title:           'جدول فترة الاختبار',
  day:             'يوم',
  of:              'من',
  daysRemaining:   'يومًا متبقيًا',
  statusOnTrack:   'في المسار الصحيح',
  statusEvidence:  'الأدلة جاهزة',
  statusRequired:  'يتطلب قرارًا',
  statusDecided:   'تم اتخاذ القرار',
  decisionHeader:  'تسجيل القرار',
  confirmBtn:      'تأكيد',
  extendBtn:       'تمديد',
  terminateBtn:    'إنهاء',
  reasonCode:      'رمز السبب',
  freeText:        'ملاحظات',
  approverLabel:   'معرف المُوافِق',
  extDays:         'أيام التمديد',
  termCode:        'رمز إنهاء الخدمة',
  noticeDetails:   'تفاصيل الإشعار',
  settlement:      'قائمة التسوية',
  submitBtn:       'تأكيد القرار',
  errorLabel:      'خطأ',
  evidenceStatus:  'حزمة الأدلة',
  compiledAt:      'تم التجميع في',
}

const LABELS_EN = {
  title:           'Probation Timeline',
  day:             'Day',
  of:              'of',
  daysRemaining:   'days remaining',
  statusOnTrack:   'On Track',
  statusEvidence:  'Evidence Ready',
  statusRequired:  'Decision Required',
  statusDecided:   'Decided',
  decisionHeader:  'Record Decision',
  confirmBtn:      'Confirm',
  extendBtn:       'Extend',
  terminateBtn:    'Terminate',
  reasonCode:      'Reason Code',
  freeText:        'Notes',
  approverLabel:   'Approver ID',
  extDays:         'Extension Days',
  termCode:        'Termination Reason Code',
  noticeDetails:   'Notice Details',
  settlement:      'Settlement Checklist',
  submitBtn:       'Submit Decision',
  errorLabel:      'Error',
  evidenceStatus:  'Evidence Pack',
  compiledAt:      'Compiled at',
}

const STATUS_COLORS = {
  ON_TRACK:          '#0066cc',
  EVIDENCE_READY:    '#b08000',
  DECISION_REQUIRED: '#b00020',
  DECIDED:           '#1a7f37',
}

// ── style helpers (logical CSS — RTL-safe) ────────────────────────────────────

function statusBadge(key, label) {
  const el = document.createElement('span')
  const c  = STATUS_COLORS[key] || '#888'
  el.style.cssText = `
    display:inline-block; padding:3px 10px; border-radius:10px;
    font-size:11px; font-weight:700; letter-spacing:.03em;
    background:${c}22; color:${c}; text-transform:uppercase;
  `
  el.textContent = label
  return el
}

function progressBar(pct, color) {
  const wrap = document.createElement('div')
  wrap.style.cssText = `height:8px; background:#eee; border-radius:4px; overflow:hidden; margin:8px 0`
  const fill = document.createElement('div')
  fill.style.cssText = `height:100%; width:${Math.min(100, pct)}%; background:${color}; border-radius:4px; transition:width .3s`
  wrap.appendChild(fill)
  return wrap
}

function inputEl(type, placeholder, id) {
  const el = document.createElement('input')
  el.type = type; el.placeholder = placeholder; el.id = id
  el.style.cssText = `width:100%;box-sizing:border-box;border:1px solid #ddd;border-radius:6px;padding:7px 10px;font-size:13px;margin-bottom:8px`
  return el
}

function selectEl(options, id) {
  const el = document.createElement('select')
  el.id = id
  el.style.cssText = `width:100%;padding:7px;border:1px solid #ddd;border-radius:6px;font-size:13px;margin-bottom:8px`
  options.forEach(o => { const opt = document.createElement('option'); opt.value = o; opt.textContent = o; el.appendChild(opt) })
  return el
}

function decisionBtn(label, color) {
  const el = document.createElement('button')
  el.textContent = label
  el.style.cssText = `
    padding:7px 14px; border-radius:6px; font-size:13px; font-weight:600;
    cursor:pointer; border:1px solid ${color}; background:${color}22; color:${color};
    margin-inline-end:8px; margin-bottom:8px;
  `
  return el
}

function sectionHead(text) {
  const el = document.createElement('div')
  el.style.cssText = `font-size:11px; font-weight:700; text-transform:uppercase; color:#888; letter-spacing:.04em; margin:12px 0 6px; text-align:start`
  el.textContent = text
  return el
}

// ── component factory ─────────────────────────────────────────────────────────

/**
 * createProbationTimeline({ container, dir, status, policy, onDecision })
 *
 * @param container   — DOM element to render into
 * @param dir         — 'rtl' | 'ltr'
 * @param status      — object from governanceService.getStatus()
 * @param policy      — probation_policy_v1.json object (injected by caller)
 * @param onDecision  — async ({ decision, reasonCode, approverActorId, ...extras }) => void
 */
export function createProbationTimeline({ container, dir = 'ltr', status, policy, onDecision }) {
  const isRtl = dir === 'rtl'
  const L = isRtl ? LABELS_AR : LABELS_EN

  container.dir = dir
  container.style.cssText = `font-size:13px; font-family:system-ui,sans-serif; max-width:600px`

  const periodDays = status.period_days || 90
  const currentDay = status.current_day || 0
  const pct        = Math.min(100, (currentDay / periodDays) * 100)
  const statusKey  = status.status_label || 'ON_TRACK'
  const color      = STATUS_COLORS[statusKey] || '#0066cc'

  // ── Title + badge ────────────────────────────────────────────────────────────
  const titleRow = document.createElement('div')
  titleRow.style.cssText = `display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap`
  const titleEl = document.createElement('div')
  titleEl.style.cssText = `font-size:16px; font-weight:700; color:#111; text-align:start`
  titleEl.textContent = L.title
  const statusLabels = { ON_TRACK: L.statusOnTrack, EVIDENCE_READY: L.statusEvidence, DECISION_REQUIRED: L.statusRequired, DECIDED: L.statusDecided }
  titleRow.appendChild(titleEl)
  titleRow.appendChild(statusBadge(statusKey, statusLabels[statusKey] || statusKey))
  container.appendChild(titleRow)

  // ── Day counter ──────────────────────────────────────────────────────────────
  const dayCounter = document.createElement('div')
  dayCounter.style.cssText = `font-size:24px; font-weight:700; color:${color}; margin-bottom:4px; text-align:start`
  dayCounter.textContent = `${L.day} ${currentDay} ${L.of} ${periodDays}`
  container.appendChild(dayCounter)

  const remaining = document.createElement('div')
  remaining.style.cssText = `font-size:12px; color:#888; margin-bottom:8px; text-align:start`
  remaining.textContent = `${status.days_remaining} ${L.daysRemaining}`
  container.appendChild(remaining)

  container.appendChild(progressBar(pct, color))

  // ── Milestones ───────────────────────────────────────────────────────────────
  const milestonesWrap = document.createElement('div')
  milestonesWrap.style.cssText = `display:flex; justify-content:space-between; margin:12px 0 16px; position:relative`

  // Only show milestones up to periodDays
  const activeMilestones = MILESTONES.filter(m => m.day <= Math.max(periodDays, 90))
  activeMilestones.forEach(m => {
    const reached = currentDay >= m.day
    const mWrap = document.createElement('div')
    mWrap.style.cssText = `display:flex; flex-direction:column; align-items:center; gap:3px; flex:1`
    const dot = document.createElement('div')
    dot.style.cssText = `
      width:10px; height:10px; border-radius:50%;
      background:${reached ? color : '#ccc'};
      border:2px solid ${reached ? color : '#ddd'};
    `
    const lbl = document.createElement('div')
    lbl.style.cssText = `font-size:9px; color:${reached ? color : '#aaa'}; text-align:center; font-weight:${reached ? '700' : '400'}`
    lbl.textContent = (isRtl ? m.labelAr : m.labelEn)
    const dayLbl = document.createElement('div')
    dayLbl.style.cssText = `font-size:9px; color:#999; text-align:center`
    dayLbl.textContent = `d${m.day}`
    mWrap.appendChild(dot); mWrap.appendChild(lbl); mWrap.appendChild(dayLbl)
    milestonesWrap.appendChild(mWrap)
  })
  container.appendChild(milestonesWrap)

  // ── Evidence pack status ─────────────────────────────────────────────────────
  if (status.evidence_pack_compiled_at) {
    const epRow = document.createElement('div')
    epRow.style.cssText = `font-size:12px; color:#1a7f37; margin-bottom:12px; text-align:start`
    epRow.textContent = `${L.evidenceStatus}: ✓  ${L.compiledAt} ${String(status.evidence_pack_compiled_at).slice(0, 19).replace('T', ' ')}`
    container.appendChild(epRow)
  }

  // ── Decision workflow (Day 80+, status not yet DECIDED) ──────────────────────
  if (['EVIDENCE_READY', 'DECISION_REQUIRED'].includes(statusKey) && statusKey !== 'DECIDED') {
    renderDecisionPanel()
  }

  // ── If already decided, show summary ────────────────────────────────────────
  if (statusKey === 'DECIDED' && status.decision) {
    const dRow = document.createElement('div')
    dRow.style.cssText = `font-size:13px; margin-top:8px; text-align:start; padding:10px; border:1px solid #eee; border-radius:8px`
    dRow.textContent = `Decision: ${status.decision} — by ${status.decision_made_by || '—'} at ${String(status.decision_at || '').slice(0, 19).replace('T', ' ')}`
    container.appendChild(dRow)
  }

  function renderDecisionPanel() {
    const panel = document.createElement('div')
    panel.style.cssText = `border:1px solid #eee; border-radius:10px; padding:16px; margin-top:12px; background:#fafafa`

    const hdr = document.createElement('div')
    hdr.style.cssText = `font-size:14px; font-weight:700; color:#111; margin-bottom:12px; text-align:start`
    hdr.textContent = L.decisionHeader
    panel.appendChild(hdr)

    // Decision buttons
    const btnRow = document.createElement('div')
    btnRow.style.cssText = `display:flex; flex-wrap:wrap; margin-bottom:8px`
    const confirmB   = decisionBtn(L.confirmBtn,   '#1a7f37')
    const extendB    = decisionBtn(L.extendBtn,    '#b08000')
    const terminateB = decisionBtn(L.terminateBtn, '#b00020')
    btnRow.appendChild(confirmB); btnRow.appendChild(extendB); btnRow.appendChild(terminateB)
    panel.appendChild(btnRow)

    const formArea = document.createElement('div')
    panel.appendChild(formArea)
    const errWrap = document.createElement('div')
    errWrap.style.cssText = 'color:#b00020;font-size:12px;margin-top:4px'
    panel.appendChild(errWrap)

    container.appendChild(panel)

    function renderDecisionForm(decision) {
      formArea.innerHTML = ''
      errWrap.textContent = ''

      formArea.appendChild(sectionHead(L.reasonCode))

      let reasonCodes
      if (decision === 'CONFIRM')   reasonCodes = policy.confirmReasonCodes
      if (decision === 'EXTEND')    reasonCodes = policy.extensionReasonCodes
      if (decision === 'TERMINATE') reasonCodes = policy.terminationReasonCodes
      const reasonSel = selectEl(reasonCodes || [], 'prob-reason-code')
      formArea.appendChild(reasonSel)

      const approverInput = inputEl('text', L.approverLabel, 'prob-approver-id')
      approverInput.setAttribute('aria-label', L.approverLabel)
      formArea.appendChild(approverInput)

      const notesInput = inputEl('text', L.freeText, 'prob-notes')
      formArea.appendChild(notesInput)

      // EXTEND: extra fields
      let extDaysInput
      if (decision === 'EXTEND') {
        formArea.appendChild(sectionHead(L.extDays))
        extDaysInput = inputEl('number', '1–90', 'prob-ext-days')
        extDaysInput.min = '1'
        extDaysInput.max = String(180 - periodDays)
        formArea.appendChild(extDaysInput)
      }

      // TERMINATE: extra fields
      let termCodeSel, noticeInput, settlementChecks
      if (decision === 'TERMINATE') {
        formArea.appendChild(sectionHead(L.termCode))
        termCodeSel = selectEl(policy.terminationReasonCodes || [], 'prob-term-code')
        formArea.appendChild(termCodeSel)

        formArea.appendChild(sectionHead(L.noticeDetails))
        noticeInput = inputEl('text', L.noticeDetails, 'prob-notice')
        formArea.appendChild(noticeInput)

        formArea.appendChild(sectionHead(L.settlement))
        settlementChecks = {}
        ;(policy.settlementChecklistItems || []).forEach(item => {
          const chkWrap = document.createElement('label')
          chkWrap.style.cssText = `display:flex; align-items:center; gap:6px; font-size:12px; margin-bottom:4px; text-align:start`
          const chk = document.createElement('input'); chk.type = 'checkbox'; chk.id = `stl-${item}`
          settlementChecks[item] = chk
          chkWrap.appendChild(chk)
          chkWrap.appendChild(document.createTextNode(item.replace(/_/g, ' ')))
          formArea.appendChild(chkWrap)
        })
      }

      const submitB = document.createElement('button')
      submitB.textContent = L.submitBtn
      submitB.style.cssText = `
        margin-top:10px; padding:8px 18px; border-radius:6px;
        background:#111; color:#fff; border:none; font-size:13px; font-weight:600; cursor:pointer
      `
      formArea.appendChild(submitB)

      submitB.addEventListener('click', async () => {
        errWrap.textContent = ''
        const approver = document.getElementById('prob-approver-id')?.value?.trim()
        if (!approver) { errWrap.textContent = `${L.approverLabel}: ${L.errorLabel}`; return }

        const payload = {
          decision,
          reason_code:  reasonSel.value,
          approver_id:  approver,
          notes:        notesInput.value.trim(),
        }

        if (decision === 'EXTEND') {
          payload.extension_days = parseInt(extDaysInput.value || '0', 10)
        }

        if (decision === 'TERMINATE') {
          payload.termination_reason_code = termCodeSel.value
          payload.notice_details          = { text: noticeInput.value.trim() }
          payload.settlement_checklist    = Object.entries(settlementChecks)
            .filter(([, el]) => el.checked)
            .map(([key]) => key)
        }

        submitB.disabled = true
        try {
          await onDecision(payload)
        } catch (e) {
          errWrap.textContent = e.message || L.errorLabel
          submitB.disabled = false
        }
      })
    }

    confirmB.addEventListener('click',   () => renderDecisionForm('CONFIRM'))
    extendB.addEventListener('click',    () => renderDecisionForm('EXTEND'))
    terminateB.addEventListener('click', () => renderDecisionForm('TERMINATE'))
  }

  return { destroy: () => { container.innerHTML = '' } }
}
