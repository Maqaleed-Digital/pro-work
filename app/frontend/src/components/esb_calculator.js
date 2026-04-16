/**
 * S38-G4 — ESB Calculator Component
 *
 * Embeddable vanilla JS component. Renders the full ESB calculator:
 *   - Policy version selector (customer picks version — not auto-forced to latest)
 *   - Input form: all params
 *   - Real-time calculation on input change
 *   - Breakdown table: each tenure bracket + modifier
 *   - Disclaimer — always visible, never removable
 *   - "Store as Evidence" button — saves inputs + outputs to EP_WOS_OFFBOARD_01
 *
 * Arabic RTL layout mandatory — all labels bilingual EN / AR.
 *
 * Usage:
 *   import { createEsbCalculator } from "./components/esb_calculator.js"
 *   const calc = createEsbCalculator({ container, apiPost, onStored })
 */

export function createEsbCalculator({ container, apiPost, onStored } = {}) {
  if (!container) throw new Error('container is required');

  // ── helpers ─────────────────────────────────────────────────────────────────

  function el(tag, props = {}, text) {
    const e = document.createElement(tag)
    Object.entries(props).forEach(([k, v]) => {
      if (k === 'style') Object.assign(e.style, v)
      else if (k === 'class') e.className = v
      else e[k] = v
    })
    if (text !== undefined) e.textContent = text
    return e
  }

  function fmtSAR(n) {
    if (n === null || n === undefined) return '—'
    return Number(n).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' SAR'
  }

  function fmtYears(n) {
    if (n === null || n === undefined) return '—'
    return Number(n).toFixed(4) + ' years / سنة'
  }

  // ── layout ───────────────────────────────────────────────────────────────────

  container.innerHTML = ''

  // ── Disclaimer — always visible, never removable ──────────────────────────
  const disclaimer = el('div', {
    style: {
      background: '#fef3c7', border: '1px solid #f59e0b',
      padding: '12px 16px', borderRadius: '6px', marginBottom: '20px',
      fontSize: '13px', color: '#92400e', lineHeight: '1.5',
    }
  })
  disclaimer.innerHTML =
    '<strong>⚠ Disclaimer / إخلاء المسؤولية:</strong><br>' +
    'This is a policy-driven estimate based on KSA Labor Law Article 84. ' +
    'Actual entitlement may vary. <strong>Confirm all calculations with qualified legal counsel before making any payment.</strong><br>' +
    'هذا تقدير سياسي استناداً إلى المادة 84 من نظام العمل السعودي. يجب مراجعة المحامي المختص قبل أي دفع.'
  container.appendChild(disclaimer)

  const wrap = el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' } })
  container.appendChild(wrap)

  // ── LEFT: input form ───────────────────────────────────────────────────────
  const formWrap = el('div')
  wrap.appendChild(formWrap)

  formWrap.appendChild(el('h3', { style: { margin: '0 0 16px', fontSize: '15px', color: '#1e293b' } }, 'ESB Inputs — مدخلات مكافأة نهاية الخدمة'))

  function makeField(label, inputEl) {
    const row = el('div', { style: { marginBottom: '12px' } })
    row.appendChild(el('label', { style: { display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' } }, label))
    row.appendChild(inputEl)
    return row
  }

  function makeInput(type, placeholder, value = '') {
    const inp = el('input', {
      type, placeholder, value,
      style: { width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }
    })
    return inp
  }

  function makeSelect(options) {
    const sel = el('select', { style: { width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' } })
    options.forEach(([val, label]) => {
      const o = el('option', { value: val }, label)
      sel.appendChild(o)
    })
    return sel
  }

  // Policy version selector — customer picks, not forced to latest
  const policyVersionSel = makeSelect([
    ['v1', 'v1 — KSA Labor Law 2005 (Royal Decree M/51)'],
    ['v2', 'v2 — Enhanced Policy 2024 (Vision 2030 guidelines)'],
  ])
  formWrap.appendChild(makeField('Policy Version / إصدار السياسة *', policyVersionSel))

  const startDateInp = makeInput('date', '', '')
  formWrap.appendChild(makeField('Employment Start Date / تاريخ بدء العمل *', startDateInp))

  const endDateInp = makeInput('date', '', '')
  formWrap.appendChild(makeField('Termination Date / تاريخ إنهاء العقد *', endDateInp))

  const basicSalaryInp = makeInput('number', '0.00', '')
  basicSalaryInp.min = '0'; basicSalaryInp.step = '0.01'
  formWrap.appendChild(makeField('Basic Monthly Salary / الراتب الأساسي الشهري (SAR) *', basicSalaryInp))

  const housingInp = makeInput('number', '0.00', '0')
  housingInp.min = '0'; housingInp.step = '0.01'
  formWrap.appendChild(makeField('Housing Allowance / بدل السكن الشهري (SAR)', housingInp))

  const reasonSel = makeSelect([
    ['EMPLOYER_TERMINATION', 'Employer Termination / إنهاء من قِبل صاحب العمل'],
    ['RESIGNATION',          'Resignation / استقالة'],
    ['RETIREMENT',           'Retirement / تقاعد'],
    ['DEATH',                'Death / وفاة'],
    ['MUTUAL_AGREEMENT',     'Mutual Agreement / إنهاء بالتراضي'],
  ])
  formWrap.appendChild(makeField('Termination Reason / سبب إنهاء العقد *', reasonSel))

  const contractTypeInp = makeInput('text', 'e.g. LIMITED / UNLIMITED')
  formWrap.appendChild(makeField('Contract Type / نوع العقد', contractTypeInp))

  const nationalityInp = makeInput('text', 'e.g. Saudi / Expat')
  formWrap.appendChild(makeField('Nationality / الجنسية', nationalityInp))

  const calcBtn = el('button', { class: 'btn btn-primary', style: { width: '100%', marginTop: '8px' } }, 'Calculate / احتساب')
  formWrap.appendChild(calcBtn)

  // ── RIGHT: results panel ───────────────────────────────────────────────────
  const resultsWrap = el('div')
  wrap.appendChild(resultsWrap)

  resultsWrap.appendChild(el('h3', { style: { margin: '0 0 16px', fontSize: '15px', color: '#1e293b' } }, 'Calculation Results — نتائج الاحتساب'))

  const summarySlot = el('div', { style: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '16px', marginBottom: '16px' } })
  summarySlot.innerHTML = '<div style="color:#94a3b8;font-size:13px">Enter inputs and click Calculate / أدخل البيانات واضغط احتساب</div>'
  resultsWrap.appendChild(summarySlot)

  const breakdownSlot = el('div')
  resultsWrap.appendChild(breakdownSlot)

  // Store as evidence button
  let _lastResult = null
  const storeBtn = el('button', { class: 'btn', disabled: true, style: { marginTop: '12px', width: '100%' } }, 'Store as Evidence / حفظ كدليل (EP-WOS-OFFBOARD-01)')
  resultsWrap.appendChild(storeBtn)

  // ── calculation via API ────────────────────────────────────────────────────

  function getInputs() {
    return {
      policyVersion:        policyVersionSel.value,
      employmentStartDate:  startDateInp.value || null,
      terminationDate:      endDateInp.value   || null,
      basicSalary:          parseFloat(basicSalaryInp.value) || 0,
      housingAllowance:     parseFloat(housingInp.value) || 0,
      terminationReason:    reasonSel.value,
      contractType:         contractTypeInp.value.trim() || null,
      employeeNationality:  nationalityInp.value.trim()  || null,
    }
  }

  function renderResults(result) {
    _lastResult = result
    storeBtn.disabled = false

    summarySlot.innerHTML = ''

    // Net ESB highlight
    const netRow = el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } })
    const netLabel = el('div', { style: { fontSize: '13px', color: '#475569', fontWeight: '600' } }, 'Net ESB / صافي المكافأة')
    const netVal = el('div', { style: { fontSize: '22px', fontWeight: '700', color: '#0f172a' } })
    netVal.textContent = fmtSAR(result.netEsb)
    netRow.appendChild(netLabel); netRow.appendChild(netVal)
    summarySlot.appendChild(netRow)

    if (result.cappedAt !== null) {
      const capNote = el('div', { style: { fontSize: '12px', color: '#d97706', marginBottom: '8px' } })
      capNote.textContent = `⚠ Capped at ${fmtSAR(result.cappedAt)} (policy max ${result.outputs.cappedAt ? '' : ''}) / تم تطبيق الحد الأقصى`
      summarySlot.appendChild(capNote)
    }

    // KV summary
    const kvPairs = [
      ['Gross ESB / إجمالي المكافأة',      fmtSAR(result.grossEsb)],
      ['Modifier / معامل التعديل',           `${(result.modifier * 100).toFixed(2)}% — ${result.modifierLabel}`],
      ['Years of Service / سنوات الخدمة',   fmtYears(result.yearsOfService)],
      ['Monthly Salary Basis / أساس الراتب', fmtSAR(result.monthlySalary)],
      ['Months Earned / الأشهر المستحقة',   result.monthsEarned.toFixed(4)],
      ['Policy Version / إصدار السياسة',    result.policyVersion],
    ]
    const kvTable = el('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' } })
    kvPairs.forEach(([k, v]) => {
      const tr = el('tr')
      const kTd = el('td', { style: { padding: '3px 8px 3px 0', color: '#64748b', whiteSpace: 'nowrap', verticalAlign: 'top' } })
      kTd.textContent = k
      const vTd = el('td', { style: { padding: '3px 0', fontWeight: '600', color: '#1e293b' } })
      vTd.textContent = String(v)
      tr.appendChild(kTd); tr.appendChild(vTd)
      kvTable.appendChild(tr)
    })
    summarySlot.appendChild(kvTable)

    // Breakdown
    breakdownSlot.innerHTML = ''
    if (result.breakdown && result.breakdown.length > 0) {
      breakdownSlot.appendChild(el('div', { style: { fontWeight: '600', fontSize: '13px', marginBottom: '6px' } }, 'Calculation Breakdown / تفاصيل الاحتساب'))
      const brkTable = el('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '8px' } })
      const brkHead = el('thead')
      const brkHtr  = el('tr', { style: { background: '#f1f5f9' } })
      ;['Tenure Band / الشريحة', 'Years / السنوات', '×Months/Year', '= Months / الأشهر'].forEach(h => {
        const th = el('th', { style: { padding: '4px 8px', textAlign: 'right', fontWeight: '600', fontSize: '11px', borderBottom: '1px solid #e2e8f0' } })
        th.textContent = h
        brkHtr.appendChild(th)
      })
      brkHead.appendChild(brkHtr)
      brkTable.appendChild(brkHead)

      const brkBody = el('tbody')
      result.breakdown.forEach(row => {
        const tr = el('tr')
        const mkTd = (text) => {
          const td = el('td', { style: { padding: '3px 8px', textAlign: 'right', borderBottom: '1px solid #f1f5f9', fontFamily: 'monospace' } })
          td.textContent = text
          return td
        }
        tr.appendChild(mkTd(row.label))
        tr.appendChild(mkTd(row.yearsApplied.toFixed(4)))
        tr.appendChild(mkTd('× ' + row.monthsPerYear.toFixed(1)))
        tr.appendChild(mkTd(row.monthsEarned.toFixed(4)))
        brkBody.appendChild(tr)
      })
      brkTable.appendChild(brkBody)
      breakdownSlot.appendChild(brkTable)
    }
  }

  function renderError(msg) {
    summarySlot.innerHTML = `<div style="color:#dc2626;font-size:13px">⚠ ${msg}</div>`
    storeBtn.disabled = true
    _lastResult = null
  }

  calcBtn.addEventListener('click', () => {
    const inputs = getInputs()

    if (!inputs.employmentStartDate) { renderError('Employment start date is required / تاريخ بدء العمل مطلوب'); return }
    if (!inputs.terminationDate)     { renderError('Termination date is required / تاريخ إنهاء العقد مطلوب'); return }
    if (inputs.basicSalary < 0)      { renderError('Basic salary must be ≥ 0 / الراتب الأساسي يجب أن يكون ≥ 0'); return }

    calcBtn.disabled  = true
    calcBtn.textContent = 'Calculating… / جاري الاحتساب'

    const fn = apiPost
      ? apiPost('/api/compliance/esb/calculate', { params: inputs, policyVersion: inputs.policyVersion })
          .then(data => data.result || data)
      : Promise.resolve(clientSideCalculate(inputs))

    fn.then(result => {
        renderResults(result)
      })
      .catch(e => renderError(e.message || 'Calculation failed'))
      .finally(() => {
        calcBtn.disabled    = false
        calcBtn.textContent = 'Calculate / احتساب'
      })
  })

  storeBtn.addEventListener('click', () => {
    if (!_lastResult) return
    if (onStored) {
      onStored(_lastResult)
      storeBtn.textContent = 'Stored ✓ / تم الحفظ'
      storeBtn.disabled    = true
    }
  })

  // ── client-side calculation fallback (no API needed for basic UI) ──────────
  // This mirrors the server logic for instant feedback; server is authoritative for evidence.
  function clientSideCalculate(inputs) {
    const ms = new Date(inputs.terminationDate).getTime() - new Date(inputs.employmentStartDate).getTime()
    if (ms < 0) throw new Error('Termination date must be after start date')
    const years = ms / (365.25 * 24 * 60 * 60 * 1000)

    // Simple v1/v2 bracket calculation
    const brackets = inputs.policyVersion === 'v2'
      ? [{ fromYearsInclusive: 0, toYearsExclusive: 5, monthsPerYear: 0.5, label: 'First 5 years' },
         { fromYearsInclusive: 5, toYearsExclusive: null, monthsPerYear: 1.0, label: 'After 5 years' }]
      : [{ fromYearsInclusive: 0, toYearsExclusive: 5, monthsPerYear: 0.5, label: 'First 5 years' },
         { fromYearsInclusive: 5, toYearsExclusive: null, monthsPerYear: 1.0, label: 'After 5 years' }]

    const salary = inputs.policyVersion === 'v2'
      ? inputs.basicSalary + (inputs.housingAllowance || 0)
      : inputs.basicSalary

    let totalMonths = 0; let rem = years; const breakdown = []
    for (const b of brackets) {
      if (rem <= 0) break
      const cap = b.toYearsExclusive !== null ? b.toYearsExclusive - b.fromYearsInclusive : Infinity
      const y = Math.min(rem, cap)
      const m = y * b.monthsPerYear
      breakdown.push({ label: b.label, yearsApplied: y, monthsPerYear: b.monthsPerYear, monthsEarned: m })
      totalMonths += m; rem -= y
    }
    const grossEsb = totalMonths * salary

    // Modifier
    const resignMods_v1 = [[0,2,0],[2,5,0.3333],[5,10,0.6667],[10,null,1.0]]
    const resignMods_v2 = [[0,1,0],[1,2,0.25],[2,5,0.3333],[5,10,0.6667],[10,null,1.0]]
    let modifier = 1.0; let modifierLabel = ''
    if (inputs.terminationReason === 'RESIGNATION') {
      const mods = inputs.policyVersion === 'v2' ? resignMods_v2 : resignMods_v1
      for (const [from, to, mod] of mods) {
        if (years >= from && (to === null || years < to)) { modifier = mod; modifierLabel = `Resignation ${from}-${to ?? '∞'} years`; break }
      }
    } else {
      modifierLabel = inputs.terminationReason + ' — full entitlement'
    }

    let netEsb = grossEsb * modifier
    let cappedAt = null
    if (inputs.policyVersion === 'v2' && netEsb > salary * 24) { cappedAt = salary * 24; netEsb = cappedAt }

    return {
      policyVersion: inputs.policyVersion,
      disclaimer: 'This is a policy-driven estimate. Confirm with legal counsel before making any payment.',
      yearsOfService: Math.round(years * 10000) / 10000,
      monthlySalary: salary,
      monthsEarned: Math.round(totalMonths * 10000) / 10000,
      grossEsb: Math.round(grossEsb * 100) / 100,
      netEsb: Math.round(netEsb * 100) / 100,
      modifier,
      modifierLabel,
      cappedAt,
      breakdown,
      inputs,
      outputs: { yearsOfService: years, monthlySalary: salary, grossEsb, netEsb, modifier, modifierLabel, cappedAt, calculatedAt: new Date().toISOString() },
      evidencePackData: { pack_type: 'EP_WOS_OFFBOARD_01', inputs, outputs: { grossEsb, netEsb, modifier, breakdown } },
      calculationId: Math.random().toString(36).slice(2),
      calculatedAt: new Date().toISOString(),
    }
  }

  // ── live calculate on field change ────────────────────────────────────────
  ;[startDateInp, endDateInp, basicSalaryInp, housingInp, reasonSel, policyVersionSel].forEach(inp => {
    inp.addEventListener('change', () => calcBtn.click())
  })

  return { container, getInputs, _lastResult: () => _lastResult }
}
