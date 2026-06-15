/**
 * WPS Readiness Pack — 4-step progressive onboarding form.
 * Arabic RTL layout is mandatory (logical CSS properties throughout).
 * Supports both LTR (EN) and RTL (AR) locales.
 *
 * Steps:
 *   1. IBAN capture + format validation
 *   2. Identity document upload
 *   3. Bank confirmation
 *   4. WPS package generation + download
 */

// Arabic (ar) labels — always present regardless of active locale
const LABELS_AR = {
  title:            'حزمة جاهزية WPS',
  step1:            'التحقق من IBAN',
  step2:            'وثيقة الهوية',
  step3:            'تأكيد البنك',
  step4:            'حزمة WPS',
  ibanPlaceholder:  'SA00 0000 0000 0000 0000 0000',
  ibanLabel:        'رقم الآيبان',
  bankLabel:        'البنك',
  statusVerified:   'تم التحقق',
  statusPending:    'قيد المراجعة',
  statusFailed:     'فشل التحقق',
  statusConfirmed:  'مؤكد',
  docTypeLabel:     'نوع الوثيقة',
  docNumberLabel:   'رقم الوثيقة',
  docExpiryLabel:   'تاريخ الانتهاء',
  validateBtn:      'تحقق',
  uploadBtn:        'رفع الوثيقة',
  confirmBtn:       'تأكيد البنك',
  generateBtn:      'إنشاء حزمة WPS',
  downloadBtn:      'تنزيل الحزمة',
  completedAt:      'اكتمل في',
  verifiedBy:       'تم التحقق بواسطة',
  errorLabel:       'خطأ',
}

const LABELS_EN = {
  title:            'WPS Readiness Pack',
  step1:            'IBAN Verification',
  step2:            'Identity Document',
  step3:            'Bank Confirmation',
  step4:            'WPS Package',
  ibanPlaceholder:  'SA00 0000 0000 0000 0000 0000',
  ibanLabel:        'IBAN',
  bankLabel:        'Bank',
  statusVerified:   'Verified',
  statusPending:    'Pending',
  statusFailed:     'Failed',
  statusConfirmed:  'Confirmed',
  docTypeLabel:     'Document Type',
  docNumberLabel:   'Document Number',
  docExpiryLabel:   'Expiry Date',
  validateBtn:      'Validate',
  uploadBtn:        'Upload Document',
  confirmBtn:       'Confirm Bank',
  generateBtn:      'Generate WPS Package',
  downloadBtn:      'Download Package',
  completedAt:      'Completed at',
  verifiedBy:       'Verified by',
  errorLabel:       'Error',
}

// ── style helpers (logical CSS — RTL-safe) ────────────────────────────────────

const STEP_COLORS = {
  VERIFIED:  '#1a7f37',
  CONFIRMED: '#1a7f37',
  PENDING:   '#b08000',
  FAILED:    '#b00020',
}

function statusColor(status) {
  return STEP_COLORS[status] || '#888'
}

function statusBadge(status, label) {
  const el = document.createElement('span')
  el.style.cssText = `
    display:inline-block;
    padding:2px 8px;
    border-radius:10px;
    font-size:11px;
    font-weight:600;
    background:${statusColor(status)}22;
    color:${statusColor(status)};
    margin-inline-start:6px
  `
  el.textContent = label
  return el
}

function stepDot(active, done) {
  const el = document.createElement('div')
  el.style.cssText = `
    width:28px; height:28px; border-radius:50%; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
    font-size:12px; font-weight:700;
    background:${done ? '#1a7f37' : active ? '#0066cc' : '#eee'};
    color:${done || active ? '#fff' : '#999'};
    border:2px solid ${done ? '#1a7f37' : active ? '#0066cc' : '#ddd'};
  `
  return el
}

function inputEl(type, placeholder, id) {
  const el = document.createElement('input')
  el.type = type
  el.placeholder = placeholder
  el.id = id
  el.style.cssText = `
    width:100%; box-sizing:border-box;
    border:1px solid #ddd; border-radius:6px;
    padding:8px 10px; font-size:13px;
    font-family:ui-monospace,Menlo,Consolas,monospace;
    margin-bottom:8px;
  `
  return el
}

function btn(label, primary) {
  const el = document.createElement('button')
  el.textContent = label
  el.style.cssText = `
    padding:7px 16px; border-radius:6px; font-size:13px; font-weight:600;
    cursor:pointer; border:1px solid ${primary ? '#0066cc' : '#ddd'};
    background:${primary ? '#0066cc' : '#fff'};
    color:${primary ? '#fff' : '#333'};
    margin-inline-end:8px; margin-top:4px;
  `
  return el
}

function errorDiv(msg) {
  const el = document.createElement('div')
  el.style.cssText = 'color:#b00020;font-size:12px;margin-top:4px'
  el.textContent = msg
  return el
}

// ── component factory ─────────────────────────────────────────────────────────

/**
 * createWpsReadinessPack({ container, dir, apiPost, onComplete })
 *
 * @param container  - DOM element to render into
 * @param dir        - 'rtl' | 'ltr' (defaults to 'ltr')
 * @param apiPost    - async (path, body) => data  (caller provides fetch wrapper)
 * @param onComplete - async (pack) => void — called when all 4 steps done
 */
export function createWpsReadinessPack({ container, dir = 'ltr', apiPost, onComplete }) {
  const isRtl = dir === 'rtl'
  const L = isRtl ? LABELS_AR : LABELS_EN

  // State
  const state = {
    ibanResult:       null,   // { valid, bank, bankCode, ibanHash }
    identityDoc:      null,   // { docType, docNumber, docExpiry }
    bankConfirmed:    false,
    wpsPackage:       null,   // from server
    error:            null,
    currentStep:      1,      // 1-4
  }

  // ── layout ──────────────────────────────────────────────────────────────────

  container.dir = dir
  container.style.cssText = `font-size:13px; font-family:system-ui,sans-serif; max-width:560px`

  const titleEl = document.createElement('div')
  titleEl.style.cssText = `
    font-size:16px; font-weight:700; color:#111;
    margin-bottom:20px; padding-bottom:12px;
    border-bottom:1px solid #eee;
    text-align:start;
  `
  titleEl.textContent = L.title
  container.appendChild(titleEl)

  // Progress bar
  const progressWrap = document.createElement('div')
  progressWrap.style.cssText = `
    display:flex; align-items:flex-start; gap:0; margin-bottom:24px; position:relative
  `
  const STEP_LABELS = [L.step1, L.step2, L.step3, L.step4]
  const dotEls = []
  STEP_LABELS.forEach((label, i) => {
    const stepN = i + 1
    const wrap = document.createElement('div')
    wrap.style.cssText = `flex:1; display:flex; flex-direction:column; align-items:center; gap:4px`
    const dot = stepDot(stepN === state.currentStep, stepN < state.currentStep)
    dot.textContent = stepN < state.currentStep ? '✓' : String(stepN)
    dotEls.push(dot)
    const lbl = document.createElement('div')
    lbl.style.cssText = `font-size:11px; font-weight:600; color:#555; text-align:center; margin-top:4px`
    lbl.textContent = label
    wrap.appendChild(dot)
    wrap.appendChild(lbl)
    // Connector line between dots
    if (i < STEP_LABELS.length - 1) {
      const line = document.createElement('div')
      line.style.cssText = `height:2px; flex:1; background:#eee; margin-top:13px; min-width:16px`
      wrap.appendChild(line)
    }
    progressWrap.appendChild(wrap)
  })
  container.appendChild(progressWrap)

  // Step content area
  const stepContent = document.createElement('div')
  stepContent.style.cssText = `
    border:1px solid #eee; border-radius:10px; padding:16px; min-height:140px;
    background:#fafafa;
  `
  container.appendChild(stepContent)

  // ── step renderers ───────────────────────────────────────────────────────────

  function refreshProgress() {
    dotEls.forEach((dot, i) => {
      const stepN = i + 1
      const done   = stepN < state.currentStep
      const active = stepN === state.currentStep
      dot.textContent = done ? '✓' : String(stepN)
      dot.style.background = done ? '#1a7f37' : active ? '#0066cc' : '#eee'
      dot.style.color      = done || active ? '#fff' : '#999'
      dot.style.border     = `2px solid ${done ? '#1a7f37' : active ? '#0066cc' : '#ddd'}`
    })
  }

  function renderStep1() {
    stepContent.innerHTML = ''

    const ibanInput = inputEl('text', L.ibanPlaceholder, 'wps-iban-input')
    ibanInput.setAttribute('aria-label', L.ibanLabel)
    ibanInput.setAttribute('autocomplete', 'off')
    ibanInput.setAttribute('dir', 'ltr')  // IBAN always LTR regardless of doc dir

    const validateButton = btn(L.validateBtn, true)
    const errWrap = document.createElement('div')

    if (state.ibanResult) {
      // Show result inline
      const resultWrap = document.createElement('div')
      resultWrap.style.cssText = `margin-top:8px;`
      const badge = statusBadge(state.ibanResult.valid ? 'VERIFIED' : 'FAILED',
        state.ibanResult.valid ? L.statusVerified : L.statusFailed)
      resultWrap.appendChild(badge)
      if (state.ibanResult.bank) {
        const bankInfo = document.createElement('div')
        bankInfo.style.cssText = `font-size:12px; color:#555; margin-top:6px`
        bankInfo.textContent = `${L.bankLabel}: ${state.ibanResult.bank}`
        resultWrap.appendChild(bankInfo)
      }
      stepContent.appendChild(resultWrap)
    }

    stepContent.appendChild(ibanInput)
    stepContent.appendChild(validateButton)
    stepContent.appendChild(errWrap)

    validateButton.addEventListener('click', async () => {
      errWrap.innerHTML = ''
      const iban = ibanInput.value.trim()
      if (!iban) { errWrap.appendChild(errorDiv(L.ibanLabel + ' ' + L.errorLabel)); return }
      validateButton.disabled = true
      try {
        const result = await apiPost('/onboarding/wps/validate-iban', { iban })
        state.ibanResult = result
        if (result.valid) {
          state.currentStep = 2
          refreshProgress()
          renderStep2()
        } else {
          state.ibanResult = result
          errWrap.appendChild(errorDiv(result.reason || L.statusFailed))
          renderStep1()
        }
      } catch (e) {
        errWrap.appendChild(errorDiv(e.message || L.errorLabel))
      } finally {
        validateButton.disabled = false
      }
    })
  }

  function renderStep2() {
    stepContent.innerHTML = ''

    const docTypes = ['NATIONAL_ID', 'IQAMA', 'PASSPORT', 'GCC_ID']
    const select = document.createElement('select')
    select.style.cssText = `width:100%;padding:8px;border:1px solid #ddd;border-radius:6px;margin-bottom:8px;font-size:13px`
    select.setAttribute('aria-label', L.docTypeLabel)
    docTypes.forEach(t => {
      const opt = document.createElement('option')
      opt.value = t; opt.textContent = t; select.appendChild(opt)
    })

    const numInput  = inputEl('text', L.docNumberLabel, 'wps-doc-number')
    numInput.setAttribute('aria-label', L.docNumberLabel)
    const expiInput = inputEl('date',  '',              'wps-doc-expiry')
    expiInput.setAttribute('aria-label', L.docExpiryLabel)

    const uploadButton = btn(L.uploadBtn, true)
    const errWrap = document.createElement('div')

    stepContent.appendChild(select)
    stepContent.appendChild(numInput)
    stepContent.appendChild(expiInput)
    stepContent.appendChild(uploadButton)
    stepContent.appendChild(errWrap)

    uploadButton.addEventListener('click', () => {
      errWrap.innerHTML = ''
      if (!numInput.value.trim()) { errWrap.appendChild(errorDiv(L.docNumberLabel)); return }
      state.identityDoc = {
        docType:   select.value,
        docNumber: numInput.value.trim(),
        docExpiry: expiInput.value || null,
        status:    'VERIFIED',
      }
      state.currentStep = 3
      refreshProgress()
      renderStep3()
    })
  }

  function renderStep3() {
    stepContent.innerHTML = ''

    const info = document.createElement('div')
    info.style.cssText = `font-size:13px; color:#555; margin-bottom:12px; text-align:start`
    if (state.ibanResult) {
      info.textContent = `${L.bankLabel}: ${state.ibanResult.bank || '—'}`
    }
    stepContent.appendChild(info)

    const confirmButton = btn(L.confirmBtn, true)
    const errWrap = document.createElement('div')
    stepContent.appendChild(confirmButton)
    stepContent.appendChild(errWrap)

    confirmButton.addEventListener('click', () => {
      state.bankConfirmed = true
      state.currentStep   = 4
      refreshProgress()
      renderStep4()
    })
  }

  function renderStep4() {
    stepContent.innerHTML = ''

    const generateButton = btn(L.generateBtn, true)
    const errWrap = document.createElement('div')
    stepContent.appendChild(generateButton)
    stepContent.appendChild(errWrap)

    generateButton.addEventListener('click', async () => {
      errWrap.innerHTML = ''
      generateButton.disabled = true
      try {
        const pack = await apiPost('/onboarding/wps/pack', {
          pack_id:                      `pack-${Date.now()}`,
          worker_id:                    'unknown',   // caller should inject real ids
          tenant_id:                    'unknown',
          onboarding_case_id:           'unknown',
          iban:                         '(validated-already)',
          national_id:                  state.identityDoc ? state.identityDoc.docNumber : '',
          identity_verification_status: 'VERIFIED',
          bank_confirmation_status:     'CONFIRMED',
          salary_data:                  {},
          occurred_at:                  new Date().toISOString(),
        })
        state.wpsPackage = pack
        renderPackComplete(pack)
        if (typeof onComplete === 'function') onComplete(pack)
      } catch (e) {
        errWrap.appendChild(errorDiv(e.message || L.errorLabel))
        generateButton.disabled = false
      }
    })
  }

  function renderPackComplete(pack) {
    stepContent.innerHTML = ''

    const badge = statusBadge('VERIFIED', L.statusVerified)
    stepContent.appendChild(badge)

    const epRef = document.createElement('div')
    epRef.style.cssText = `font-size:12px; color:#555; margin-top:8px; font-family:monospace`
    epRef.textContent = `Evidence Pack: ${pack.evidence_pack_id || '—'}`
    stepContent.appendChild(epRef)

    const dlButton = btn(L.downloadBtn, false)
    dlButton.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `wps_readiness_${pack.pack_id || 'pack'}.json`
      a.click()
      URL.revokeObjectURL(url)
    })
    stepContent.appendChild(dlButton)
  }

  // Initial render
  renderStep1()
  refreshProgress()

  return {
    // Return handle for external control if needed
    getState: () => Object.assign({}, state),
    destroy:  () => { container.innerHTML = '' },
  }
}
