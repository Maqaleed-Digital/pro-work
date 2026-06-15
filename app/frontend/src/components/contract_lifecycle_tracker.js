/**
 * Contract Lifecycle Tracker — visual state machine with Qiwa integration.
 * Bilingual AR/EN field labels. Arabic RTL layout (logical CSS throughout).
 *
 * States: DRAFT → REVIEW → SIGNED → ACTIVATED → AMENDED / TERMINATED
 */

const STATES = ['DRAFT', 'REVIEW', 'SIGNED', 'ACTIVATED', 'AMENDED', 'TERMINATED']

const VALID_FROM = {
  DRAFT:      ['REVIEW'],
  REVIEW:     ['DRAFT', 'SIGNED'],
  SIGNED:     ['ACTIVATED'],
  ACTIVATED:  ['AMENDED', 'TERMINATED'],
  AMENDED:    [],
  TERMINATED: [],
}

const STATE_LABELS = {
  DRAFT:      { en: 'Draft',      ar: 'مسودة' },
  REVIEW:     { en: 'Review',     ar: 'مراجعة' },
  SIGNED:     { en: 'Signed',     ar: 'موقّع' },
  ACTIVATED:  { en: 'Active',     ar: 'نشط' },
  AMENDED:    { en: 'Amended',    ar: 'معدَّل' },
  TERMINATED: { en: 'Terminated', ar: 'منتهٍ' },
}

const FIELD_LABELS = {
  role_title:               { en: 'Job Title',              ar: 'المسمى الوظيفي' },
  wage_base:                { en: 'Basic Wage',             ar: 'الأجر الأساسي' },
  housing_allowance:        { en: 'Housing Allowance',      ar: 'بدل السكن' },
  transport_allowance:      { en: 'Transport Allowance',    ar: 'بدل المواصلات' },
  probation_days:           { en: 'Probation Period (days)','ar': 'مدة التجربة (أيام)' },
  notice_days:              { en: 'Notice Period (days)',   ar: 'مدة الإشعار (أيام)' },
  work_location:            { en: 'Work Location',          ar: 'موقع العمل' },
  worker_national_id:       { en: 'National ID',            ar: 'رقم الهوية الوطنية' },
  employer_cr_number:       { en: 'Employer CR Number',     ar: 'رقم السجل التجاري' },
  contract_start_date:      { en: 'Start Date',             ar: 'تاريخ البدء' },
  occupation_code:          { en: 'Occupation Code',        ar: 'رمز المهنة' },
}

const QIWA_STATUS_LABEL = {
  en: { ok: 'Qiwa Ready', warn: 'Qiwa Incomplete' },
  ar: { ok: 'جاهز لقيوة', warn: 'بيانات قيوة ناقصة' },
}

const UI_LABELS_EN = {
  title:           'Contract Lifecycle',
  currentState:    'Current State',
  setBy:           'Set by',
  at:              'at',
  evidence:        'Evidence',
  history:         'History',
  transition:      'Transition To',
  reason:          'Reason',
  bothSigned:      'Both Parties Signed',
  activationDate:  'Activation Date',
  amendReason:     'Amendment Reason',
  amendedFields:   'Amended Fields (JSON)',
  termCode:        'Termination Code',
  noticeDetails:   'Notice Details',
  submitBtn:       'Apply Transition',
  errorLabel:      'Error',
  noHistory:       'No events yet',
}

const UI_LABELS_AR = {
  title:           'دورة حياة العقد',
  currentState:    'الحالة الحالية',
  setBy:           'بواسطة',
  at:              'في',
  evidence:        'الأدلة',
  history:         'السجل',
  transition:      'الانتقال إلى',
  reason:          'السبب',
  bothSigned:      'توقيع الطرفين',
  activationDate:  'تاريخ التفعيل',
  amendReason:     'سبب التعديل',
  amendedFields:   'الحقول المعدَّلة (JSON)',
  termCode:        'رمز الإنهاء',
  noticeDetails:   'تفاصيل الإشعار',
  submitBtn:       'تطبيق الانتقال',
  errorLabel:      'خطأ',
  noHistory:       'لا توجد أحداث بعد',
}

const STATE_COLORS = {
  DRAFT:      '#888',
  REVIEW:     '#0066cc',
  SIGNED:     '#b08000',
  ACTIVATED:  '#1a7f37',
  AMENDED:    '#5f2a82',
  TERMINATED: '#b00020',
}

// ── style helpers ─────────────────────────────────────────────────────────────

function stateBadge(state, label) {
  const el = document.createElement('span')
  const c  = STATE_COLORS[state] || '#888'
  el.style.cssText = `
    display:inline-block; padding:3px 10px; border-radius:10px;
    font-size:11px; font-weight:700; text-transform:uppercase;
    background:${c}22; color:${c}; margin-inline-end:6px;
  `
  el.textContent = label
  return el
}

function qiwaBadge(complete, lang) {
  const L  = lang === 'ar' ? QIWA_STATUS_LABEL.ar : QIWA_STATUS_LABEL.en
  const el = document.createElement('span')
  el.style.cssText = `
    display:inline-block; padding:2px 8px; border-radius:8px; font-size:11px; font-weight:600;
    background:${complete ? '#1a7f3722' : '#b0002022'}; color:${complete ? '#1a7f37' : '#b00020'};
  `
  el.textContent = complete ? L.ok : L.warn
  return el
}

function inputEl(type, placeholder, id) {
  const el = document.createElement('input')
  el.type = type; el.placeholder = placeholder; el.id = id
  el.style.cssText = `width:100%;box-sizing:border-box;border:1px solid #ddd;border-radius:6px;padding:7px 10px;font-size:13px;margin-bottom:8px`
  return el
}

function sectionHead(text) {
  const el = document.createElement('div')
  el.style.cssText = `font-size:11px; font-weight:700; text-transform:uppercase; color:#888; letter-spacing:.04em; margin:10px 0 4px; text-align:start`
  el.textContent = text
  return el
}

// ── component factory ─────────────────────────────────────────────────────────

/**
 * createContractLifecycleTracker({ container, dir, contract, lifecycleEvents, qiwaCompleteness, onTransition })
 *
 * @param container         — DOM element
 * @param dir               — 'rtl' | 'ltr'
 * @param contract          — current contract object from getContract()
 * @param lifecycleEvents   — array from getLifecycleEvents()
 * @param qiwaCompleteness  — result from validateQiwaCompleteness()
 * @param onTransition      — async (payload) => void
 */
export function createContractLifecycleTracker({ container, dir = 'ltr', contract, lifecycleEvents, qiwaCompleteness, onTransition }) {
  const isRtl = dir === 'rtl'
  const lang  = isRtl ? 'ar' : 'en'
  const L     = isRtl ? UI_LABELS_AR : UI_LABELS_EN

  container.dir = dir
  container.style.cssText = `font-size:13px; font-family:system-ui,sans-serif; max-width:640px`

  const currentState  = contract.status
  const validNext     = VALID_FROM[currentState] || []
  const isTerminal    = validNext.length === 0

  // ── Title + Qiwa badge ───────────────────────────────────────────────────────
  const titleRow = document.createElement('div')
  titleRow.style.cssText = `display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap`
  const titleEl = document.createElement('div')
  titleEl.style.cssText = `font-size:16px; font-weight:700; color:#111; text-align:start`
  titleEl.textContent = L.title
  titleRow.appendChild(titleEl)
  if (qiwaCompleteness) {
    titleRow.appendChild(qiwaBadge(qiwaCompleteness.complete, lang))
  }
  container.appendChild(titleRow)

  // ── State pipeline ───────────────────────────────────────────────────────────
  const pipelineWrap = document.createElement('div')
  pipelineWrap.style.cssText = `display:flex; gap:4px; flex-wrap:wrap; margin-bottom:16px; align-items:center`
  STATES.forEach((s, i) => {
    const isCurrent = s === currentState
    const isPast    = STATES.indexOf(currentState) > i
    const lbl       = isRtl ? STATE_LABELS[s].ar : STATE_LABELS[s].en
    const dot = document.createElement('div')
    dot.style.cssText = `
      padding:4px 10px; border-radius:10px; font-size:11px; font-weight:${isCurrent?'700':'500'};
      background:${isCurrent ? STATE_COLORS[s]+'22' : isPast ? '#f0f0f0' : '#f8f8f8'};
      color:${isCurrent ? STATE_COLORS[s] : isPast ? '#aaa' : '#ccc'};
      border:1px solid ${isCurrent ? STATE_COLORS[s]+'55' : '#eee'};
    `
    dot.textContent = lbl
    pipelineWrap.appendChild(dot)
    if (i < STATES.length - 1) {
      const arrow = document.createElement('div')
      arrow.style.cssText = `color:#ccc; font-size:11px; align-self:center`
      arrow.textContent = isRtl ? '←' : '→'
      pipelineWrap.appendChild(arrow)
    }
  })
  container.appendChild(pipelineWrap)

  // ── Current state info ───────────────────────────────────────────────────────
  const infoWrap = document.createElement('div')
  infoWrap.style.cssText = `margin-bottom:16px; padding:12px; border:1px solid #eee; border-radius:10px; background:#fafafa`
  const stateRow = document.createElement('div')
  stateRow.style.cssText = `display:flex; align-items:center; gap:8px; margin-bottom:6px`
  stateRow.appendChild(document.createTextNode(`${L.currentState}: `))
  stateRow.appendChild(stateBadge(currentState, isRtl ? STATE_LABELS[currentState].ar : STATE_LABELS[currentState].en))
  infoWrap.appendChild(stateRow)

  // Qiwa missing fields
  if (qiwaCompleteness && !qiwaCompleteness.complete) {
    const missing = document.createElement('div')
    missing.style.cssText = `font-size:11px; color:#b00020; margin-top:4px; text-align:start`
    missing.textContent = `Missing: ${qiwaCompleteness.missingFields.join(', ')}`
    infoWrap.appendChild(missing)
  }
  container.appendChild(infoWrap)

  // ── History ──────────────────────────────────────────────────────────────────
  container.appendChild(sectionHead(L.history))
  const histWrap = document.createElement('div')
  histWrap.style.cssText = `margin-bottom:16px; max-height:200px; overflow-y:auto; border:1px solid #eee; border-radius:8px`

  if (!lifecycleEvents || lifecycleEvents.length === 0) {
    const empty = document.createElement('div')
    empty.style.cssText = `padding:12px; font-size:12px; color:#aaa; text-align:center`
    empty.textContent = L.noHistory
    histWrap.appendChild(empty)
  } else {
    lifecycleEvents.slice().reverse().forEach(ev => {
      const row = document.createElement('div')
      row.style.cssText = `padding:8px 12px; border-bottom:1px solid #f5f5f5; font-size:12px`
      const fromLbl = ev.from_state ? (isRtl ? STATE_LABELS[ev.from_state]?.ar : STATE_LABELS[ev.from_state]?.en) || ev.from_state : '—'
      const toLbl   = isRtl ? STATE_LABELS[ev.to_state]?.ar : STATE_LABELS[ev.to_state]?.en
      const ts      = String(ev.occurred_at || '').slice(0, 19).replace('T', ' ')
      row.innerHTML = `<span style="color:${STATE_COLORS[ev.to_state]||'#888'};font-weight:600">${fromLbl} → ${toLbl}</span>
        <span style="color:#888;margin-inline-start:8px">${L.at} ${ts}</span>
        ${ev.reason ? `<span style="color:#555;margin-inline-start:6px">${ev.reason}</span>` : ''}`
      histWrap.appendChild(row)
    })
  }
  container.appendChild(histWrap)

  // ── Transition panel (only if valid transitions exist) ────────────────────────
  if (validNext.length > 0) {
    container.appendChild(sectionHead(L.transition))
    const transPanel = document.createElement('div')
    transPanel.style.cssText = `border:1px solid #eee; border-radius:10px; padding:14px; background:#fafafa`

    // Buttons — only valid transitions shown
    const btnRow = document.createElement('div')
    btnRow.style.cssText = `display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px`
    validNext.forEach(nextState => {
      const lbl = isRtl ? STATE_LABELS[nextState].ar : STATE_LABELS[nextState].en
      const b   = document.createElement('button')
      b.textContent = lbl
      const c = STATE_COLORS[nextState]
      b.style.cssText = `padding:6px 14px; border-radius:6px; border:1px solid ${c}; background:${c}22; color:${c}; font-size:13px; font-weight:600; cursor:pointer`
      b.addEventListener('click', () => renderTransitionForm(nextState, transPanel, formArea, errWrap, L, isRtl))
      btnRow.appendChild(b)
    })
    transPanel.appendChild(btnRow)

    const formArea = document.createElement('div')
    transPanel.appendChild(formArea)
    const errWrap = document.createElement('div')
    errWrap.style.cssText = `color:#b00020; font-size:12px; margin-top:4px`
    transPanel.appendChild(errWrap)

    container.appendChild(transPanel)
  }

  function renderTransitionForm(toState, panel, formArea, errWrap, L, isRtl) {
    formArea.innerHTML = ''
    errWrap.textContent = ''

    const reasonInput = inputEl('text', L.reason, 'ct-reason')
    formArea.appendChild(reasonInput)

    // State-specific extra fields
    let bothSignedChk, activationDateInput, amendReasonInput, amendFieldsInput, termCodeInput, noticeInput

    if (toState === 'SIGNED') {
      const chkWrap = document.createElement('label')
      chkWrap.style.cssText = `display:flex; align-items:center; gap:6px; font-size:13px; margin-bottom:8px; text-align:start`
      bothSignedChk = document.createElement('input'); bothSignedChk.type = 'checkbox'; bothSignedChk.id = 'ct-both-signed'
      chkWrap.appendChild(bothSignedChk)
      chkWrap.appendChild(document.createTextNode(L.bothSigned))
      formArea.appendChild(chkWrap)
    }

    if (toState === 'ACTIVATED') {
      formArea.appendChild(sectionHead(L.activationDate))
      activationDateInput = inputEl('date', '', 'ct-activation-date')
      formArea.appendChild(activationDateInput)
    }

    if (toState === 'AMENDED') {
      formArea.appendChild(sectionHead(L.amendReason))
      amendReasonInput = inputEl('text', L.amendReason, 'ct-amend-reason')
      formArea.appendChild(amendReasonInput)
      formArea.appendChild(sectionHead(L.amendedFields))
      amendFieldsInput = document.createElement('textarea')
      amendFieldsInput.placeholder = '{"wage_base": 15000}'
      amendFieldsInput.id = 'ct-amended-fields'
      amendFieldsInput.style.cssText = `width:100%;box-sizing:border-box;border:1px solid #ddd;border-radius:6px;padding:7px 10px;font-size:12px;font-family:monospace;margin-bottom:8px;height:60px`
      formArea.appendChild(amendFieldsInput)
    }

    if (toState === 'TERMINATED') {
      formArea.appendChild(sectionHead(L.termCode))
      termCodeInput = inputEl('text', L.termCode, 'ct-term-code')
      formArea.appendChild(termCodeInput)
      formArea.appendChild(sectionHead(L.noticeDetails))
      noticeInput = inputEl('text', L.noticeDetails, 'ct-notice')
      formArea.appendChild(noticeInput)
    }

    const submitB = document.createElement('button')
    submitB.textContent = L.submitBtn
    submitB.style.cssText = `margin-top:8px; padding:7px 16px; border-radius:6px; background:#111; color:#fff; border:none; font-size:13px; font-weight:600; cursor:pointer`
    formArea.appendChild(submitB)

    submitB.addEventListener('click', async () => {
      errWrap.textContent = ''
      const payload = {
        to_state:    toState,
        reason:      reasonInput.value.trim() || null,
        actor:       { actor_type: 'HUMAN', actor_id: 'current-user' },
        occurred_at: new Date().toISOString(),
      }

      if (toState === 'SIGNED') {
        payload.both_party_signatures = bothSignedChk?.checked || false
      }
      if (toState === 'ACTIVATED') {
        payload.activation_date = activationDateInput?.value || null
      }
      if (toState === 'AMENDED') {
        payload.amendment_reason = amendReasonInput?.value.trim()
        try {
          payload.amended_fields = JSON.parse(amendFieldsInput?.value || '{}')
        } catch {
          errWrap.textContent = 'amended_fields: invalid JSON'
          return
        }
      }
      if (toState === 'TERMINATED') {
        payload.termination_code = termCodeInput?.value.trim()
        payload.notice_details   = { text: noticeInput?.value.trim() }
      }

      submitB.disabled = true
      try {
        await onTransition(payload)
      } catch (e) {
        errWrap.textContent = e.message || L.errorLabel
        submitB.disabled = false
      }
    })
  }

  return { destroy: () => { container.innerHTML = '' } }
}
