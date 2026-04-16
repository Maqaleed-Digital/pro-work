/**
 * Offer Builder — compensation breakdown enforced, real-time policy validation,
 * GOSI indicative calculator, pre-offer compliance preview.
 *
 * Constraints:
 * - GOSI disclaimer: always visible, never hidden
 * - Offer blocked if RED violations exist
 * - AMBER requires explicit HR acknowledgement checkbox
 * - base_salary + housing_allowance + transport_allowance breakdown enforced
 * - Arabic RTL layout (logical CSS throughout)
 */

const LABELS_AR = {
  title:            'منشئ العروض',
  baseSalary:       'الراتب الأساسي',
  housingAllowance: 'بدل السكن',
  transportAllowance:'بدل المواصلات',
  otherAllowances:  'بدلات أخرى',
  totalComp:        'إجمالي الراتب',
  roleCategory:     'فئة الدور',
  region:           'المنطقة',
  gosiTitle:        'مساهمات التأمينات الاجتماعية (تقديرية)',
  employerContrib:  'حصة صاحب العمل',
  employeeContrib:  'حصة الموظف',
  totalContrib:     'الإجمالي',
  previewTitle:     'مراجعة الامتثال',
  passed:           'مجتاز',
  warning:          'تحذير',
  violation:        'مخالفة',
  ackLabel:         'أقر بأن التحذيرات أعلاه قد تمت مراجعتها والموافقة عليها من قبل HR',
  sendBtn:          'إرسال العرض',
  blockedMsg:       'لا يمكن إرسال العرض — يُرجى معالجة المخالفات باللون الأحمر',
  sarLabel:         'ريال سعودي',
  capNote:          '(سقف التأمينات)',
}

const LABELS_EN = {
  title:            'Offer Builder',
  baseSalary:       'Base Salary',
  housingAllowance: 'Housing Allowance',
  transportAllowance:'Transport Allowance',
  otherAllowances:  'Other Allowances',
  totalComp:        'Total Compensation',
  roleCategory:     'Role Category',
  region:           'Region',
  gosiTitle:        'GOSI Indicative Contributions',
  employerContrib:  'Employer',
  employeeContrib:  'Employee',
  totalContrib:     'Total',
  previewTitle:     'Compliance Preview',
  passed:           'Passed',
  warning:          'Warning',
  violation:        'Violation',
  ackLabel:         'I acknowledge that the above warnings have been reviewed and approved by HR',
  sendBtn:          'Send Offer',
  blockedMsg:       'Cannot send — resolve red violations first',
  sarLabel:         'SAR',
  capNote:          '(capped)',
}

const SEVERITY_COLORS = { GREEN: '#1a7f37', AMBER: '#b08000', RED: '#b00020' }
const SEVERITY_ICONS  = { GREEN: '✓', AMBER: '⚠', RED: '✕' }

const ROLE_CATEGORIES = ['JUNIOR', 'MID', 'SENIOR', 'EXECUTIVE']
const REGIONS         = ['RIYADH', 'JEDDAH', 'OTHER']

// ── style helpers (logical CSS — RTL-safe) ────────────────────────────────────

function inputEl(type, id, placeholder) {
  const el = document.createElement('input')
  el.type = type || 'number'; el.id = id; el.placeholder = placeholder || ''
  el.min = '0'
  el.style.cssText = `width:100%;box-sizing:border-box;border:1px solid #ddd;border-radius:6px;
    padding:7px 10px;font-size:13px;margin-bottom:8px;font-family:ui-monospace,monospace`
  return el
}

function fieldRow(labelText, inputElement) {
  const wrap = document.createElement('div')
  wrap.style.cssText = `margin-bottom:4px`
  const lbl = document.createElement('label')
  lbl.htmlFor = inputElement.id
  lbl.style.cssText = `font-size:12px;color:#555;font-weight:600;display:block;margin-bottom:2px;text-align:start`
  lbl.textContent = labelText
  wrap.appendChild(lbl)
  wrap.appendChild(inputElement)
  return wrap
}

function selectEl(options, id) {
  const el = document.createElement('select')
  el.id = id
  el.style.cssText = `width:100%;padding:7px;border:1px solid #ddd;border-radius:6px;font-size:13px;margin-bottom:8px`
  options.forEach(o => { const opt = document.createElement('option'); opt.value = o; opt.textContent = o; el.appendChild(opt) })
  return el
}

function sectionHead(text) {
  const el = document.createElement('div')
  el.style.cssText = `font-size:11px;font-weight:700;text-transform:uppercase;color:#888;
    letter-spacing:.04em;margin:14px 0 6px;text-align:start`
  el.textContent = text
  return el
}

function kvLine(label, value, color) {
  const el = document.createElement('div')
  el.style.cssText = `display:flex;justify-content:space-between;font-size:13px;padding:3px 0;text-align:start`
  el.innerHTML = `<span style="color:#555">${label}</span>
    <span style="font-family:monospace;font-weight:600;color:${color||'#111'}">${value}</span>`
  return el
}

// ── component factory ─────────────────────────────────────────────────────────

/**
 * createOfferBuilder({ container, dir, policyApi, onSend })
 *
 * @param container  — DOM element
 * @param dir        — 'rtl' | 'ltr'
 * @param policyApi  — { validateBreakdown, checkPolicyThresholds, calculateIndicativeGosi, generatePreOfferCompliancePreview }
 * @param onSend     — async (offer) => void — called when offer passes compliance
 */
export function createOfferBuilder({ container, dir = 'ltr', policyApi, onSend }) {
  const isRtl = dir === 'rtl'
  const L     = isRtl ? LABELS_AR : LABELS_EN

  container.dir = dir
  container.style.cssText = `font-size:13px;font-family:system-ui,sans-serif;max-width:520px`

  // Title
  const titleEl = document.createElement('div')
  titleEl.style.cssText = `font-size:16px;font-weight:700;color:#111;margin-bottom:16px;text-align:start`
  titleEl.textContent = L.title
  container.appendChild(titleEl)

  // ── Compensation breakdown fields ──────────────────────────────────────────
  container.appendChild(sectionHead(isRtl ? 'بنود الراتب' : 'Compensation Breakdown'))

  const baseInput      = inputEl('number', 'ob-base',      isRtl ? 'مثال: 10000' : 'e.g. 10000')
  const housingInput   = inputEl('number', 'ob-housing',   isRtl ? 'مثال: 2500'  : 'e.g. 2500')
  const transportInput = inputEl('number', 'ob-transport', isRtl ? 'مثال: 800'   : 'e.g. 800')
  const otherInput     = inputEl('number', 'ob-other',     '0')

  container.appendChild(fieldRow(L.baseSalary,        baseInput))
  container.appendChild(fieldRow(L.housingAllowance,  housingInput))
  container.appendChild(fieldRow(L.transportAllowance,transportInput))
  container.appendChild(fieldRow(L.otherAllowances,   otherInput))

  // Computed total (read-only display)
  const totalDisplay = document.createElement('div')
  totalDisplay.style.cssText = `font-size:14px;font-weight:700;color:#111;margin-bottom:12px;
    padding:8px;border:1px solid #eee;border-radius:6px;background:#f9f9f9;text-align:start`
  container.appendChild(totalDisplay)

  // ── Role / region ───────────────────────────────────────────────────────────
  container.appendChild(sectionHead(isRtl ? 'الفئة والمنطقة' : 'Role & Region'))
  const catSelect = selectEl(ROLE_CATEGORIES, 'ob-category')
  const regSelect = selectEl(REGIONS,         'ob-region')
  container.appendChild(fieldRow(L.roleCategory, catSelect))
  container.appendChild(fieldRow(L.region,       regSelect))

  // ── GOSI panel ──────────────────────────────────────────────────────────────
  container.appendChild(sectionHead(L.gosiTitle))

  // DISCLAIMER: always visible, never hidden — mandatory per constraints
  const disclaimer = document.createElement('div')
  disclaimer.id = 'ob-gosi-disclaimer'
  disclaimer.style.cssText = `font-size:11px;color:#b08000;background:#fff8e1;border:1px solid #f0c060;
    border-radius:6px;padding:8px 10px;margin-bottom:8px;text-align:start;line-height:1.5`
  disclaimer.textContent = isRtl ? LABELS_AR.title && '' : ''  // will be set on first calc
  container.appendChild(disclaimer)

  const gosiDisplay = document.createElement('div')
  gosiDisplay.style.cssText = `padding:8px;border:1px solid #eee;border-radius:6px;background:#fafafa;min-height:40px`
  container.appendChild(gosiDisplay)

  // ── Compliance preview panel ────────────────────────────────────────────────
  container.appendChild(sectionHead(L.previewTitle))
  const previewPanel = document.createElement('div')
  previewPanel.style.cssText = `border:1px solid #eee;border-radius:8px;overflow:hidden;margin-bottom:12px`
  container.appendChild(previewPanel)

  // Acknowledgement checkbox (hidden until AMBER warnings exist)
  const ackWrap = document.createElement('label')
  ackWrap.style.cssText = `display:none;align-items:flex-start;gap:8px;font-size:12px;
    color:#555;margin-bottom:10px;cursor:pointer;text-align:start`
  const ackChk = document.createElement('input'); ackChk.type = 'checkbox'; ackChk.id = 'ob-ack'
  ackWrap.appendChild(ackChk)
  ackWrap.appendChild(document.createTextNode(L.ackLabel))
  container.appendChild(ackWrap)

  // Send button
  const sendBtn = document.createElement('button')
  sendBtn.textContent = L.sendBtn
  sendBtn.style.cssText = `width:100%;padding:10px;border-radius:8px;font-size:14px;font-weight:700;
    cursor:pointer;border:none;background:#0066cc;color:#fff;margin-top:4px`
  container.appendChild(sendBtn)

  const blockedMsg = document.createElement('div')
  blockedMsg.style.cssText = `font-size:12px;color:#b00020;text-align:center;margin-top:6px;display:none`
  blockedMsg.textContent = L.blockedMsg
  container.appendChild(blockedMsg)

  // ── live update logic ────────────────────────────────────────────────────────

  function getOffer() {
    return {
      base_salary:         parseFloat(baseInput.value)      || 0,
      housing_allowance:   parseFloat(housingInput.value)   || 0,
      transport_allowance: parseFloat(transportInput.value) || 0,
      other_allowances:    parseFloat(otherInput.value)     || 0,
    }
  }

  function refreshAll() {
    const offer    = getOffer()
    const category = catSelect.value
    const region   = regSelect.value

    // Computed total
    const total = offer.base_salary + offer.housing_allowance + offer.transport_allowance + offer.other_allowances
    totalDisplay.textContent = `${L.totalComp}: ${total.toLocaleString()} ${L.sarLabel}`

    // GOSI (always update disclaimer — mandatory)
    if (offer.base_salary > 0 && policyApi) {
      const gosi = policyApi.calculateIndicativeGosi(offer)
      // Disclaimer always set — never removed
      disclaimer.textContent = isRtl ? gosi.disclaimer.ar : gosi.disclaimer.en
      gosiDisplay.innerHTML = ''
      gosiDisplay.appendChild(kvLine(L.employerContrib, `${gosi.employer_amount.toLocaleString()} ${L.sarLabel}${gosi.is_capped ? ' '+L.capNote : ''}`))
      gosiDisplay.appendChild(kvLine(L.employeeContrib, `${gosi.employee_amount.toLocaleString()} ${L.sarLabel}`))
      gosiDisplay.appendChild(kvLine(L.totalContrib,    `${gosi.total_amount.toLocaleString()} ${L.sarLabel}`, '#0066cc'))
    } else {
      disclaimer.textContent = isRtl ? LABELS_AR.gosiTitle : LABELS_EN.gosiTitle
    }

    // Compliance preview
    previewPanel.innerHTML = ''
    if (policyApi && offer.base_salary > 0) {
      const preview = policyApi.generatePreOfferCompliancePreview(offer, category, region)
      preview.items.forEach(item => {
        const row = document.createElement('div')
        const c   = SEVERITY_COLORS[item.severity] || '#888'
        row.style.cssText = `display:flex;align-items:flex-start;gap:8px;padding:7px 10px;
          border-bottom:1px solid #f5f5f5;font-size:12px;background:${c}0a`
        const icon = document.createElement('span')
        icon.style.cssText = `color:${c};font-weight:700;flex-shrink:0;margin-top:1px`
        icon.textContent = SEVERITY_ICONS[item.severity] || '·'
        const msg = document.createElement('span')
        msg.style.cssText = `color:#333;text-align:start`
        msg.textContent = item.message
        row.appendChild(icon); row.appendChild(msg)
        previewPanel.appendChild(row)
      })

      // Amber ack requirement
      if (preview.requires_acknowledgement) {
        ackWrap.style.display = 'flex'
      } else {
        ackWrap.style.display = 'none'
        ackChk.checked = false
      }

      // Send button state
      const canSend = preview.can_send && (!preview.requires_acknowledgement || ackChk.checked)
      sendBtn.disabled = !canSend
      sendBtn.style.background = canSend ? '#0066cc' : '#ccc'
      blockedMsg.style.display = preview.can_send ? 'none' : 'block'
    }
  }

  // Ack checkbox toggles send button
  ackChk.addEventListener('change', refreshAll)

  // All inputs trigger live refresh
  ;[baseInput, housingInput, transportInput, otherInput, catSelect, regSelect]
    .forEach(el => el.addEventListener('input', refreshAll))

  sendBtn.addEventListener('click', async () => {
    if (sendBtn.disabled) return
    const offer = getOffer()
    offer.role_category = catSelect.value
    offer.region        = regSelect.value
    sendBtn.disabled = true
    try {
      if (typeof onSend === 'function') await onSend(offer)
    } finally {
      sendBtn.disabled = false
    }
  })

  // Initial render
  refreshAll()

  return { destroy: () => { container.innerHTML = '' }, refresh: refreshAll }
}
