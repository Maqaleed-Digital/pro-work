/**
 * S38-G6 — Data Privacy Admin Page (/admin/data-privacy)
 *
 * Sections:
 *   A — DSR Portal: submit DSR + live DSR list with SLA countdown
 *   B — SLA Alerts: DSRs at/past day-25 threshold highlighted in amber/red
 *   C — Compliance Documents: DPIA / SCCs / DPO Appointment / Data Residency (downloadable)
 *   D — Lawful Basis Registry: full table of data categories mapped to lawful basis
 *
 * Coverage: KSA PDPL + UAE Federal PDPL (Law 45/2021)
 * Arabic RTL — all labels bilingual EN / AR
 */

import { apiGet, apiPost, getTenant } from "../api.js"

// ── helpers ───────────────────────────────────────────────────────────────────

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

function badge(text, color) {
  const b = el('span')
  b.textContent = text
  b.style.cssText = `display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;background:${color};color:#fff;font-weight:600`
  return b
}

function slaColor(sla) {
  if (!sla) return '#6b7280'
  if (sla.sla_breached) return '#dc2626'
  if (sla.sla_alert)    return '#d97706'
  return '#16a34a'
}

function statusColor(status) {
  if (status === 'COMPLETED')    return '#16a34a'
  if (status === 'REJECTED')     return '#6b7280'
  if (status === 'IN_REVIEW')    return '#2563eb'
  if (status === 'ACKNOWLEDGED') return '#7c3aed'
  return '#d97706'  // SUBMITTED
}

function sectionCard(title, titleAr) {
  const wrap = el('div', { style: { border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px', marginBottom: '20px' } })
  const hdr  = el('div', { style: { fontWeight: '700', fontSize: '14px', color: '#1e293b', marginBottom: '16px', paddingBottom: '10px', borderBottom: '1px solid #f1f5f9' } })
  hdr.textContent = `${title} / ${titleAr}`
  wrap.appendChild(hdr)
  return { wrap, body: wrap }
}

function apiPdplGet(path) {
  return apiGet(path)
}

function apiPdplPost(path, body) {
  return apiPost(path, body)
}

// ── DSR type options ──────────────────────────────────────────────────────────

const DSR_TYPE_OPTIONS = [
  { value: 'ACCESS',      label: 'Right to Access / حق الوصول' },
  { value: 'CORRECTION',  label: 'Right to Correction / حق التصحيح' },
  { value: 'DELETION',    label: 'Right to Deletion / حق الحذف' },
  { value: 'PORTABILITY', label: 'Right to Portability / حق نقل البيانات' },
  { value: 'OBJECTION',   label: 'Right to Object / حق الاعتراض' },
  { value: 'RESTRICTION', label: 'Right to Restriction / حق التقييد' },
]

const PROCESS_ACTIONS = [
  { value: 'ACKNOWLEDGED', label: 'Acknowledge' },
  { value: 'IN_REVIEW',    label: 'Mark In Review' },
  { value: 'COMPLETED',    label: 'Complete' },
  { value: 'REJECTED',     label: 'Reject' },
  { value: 'EXTENDED',     label: 'Extend (log only)' },
]

const LAWFUL_BASIS_COLORS = {
  CONTRACT:             '#2563eb',
  CONSENT:              '#16a34a',
  LEGITIMATE_INTEREST:  '#7c3aed',
}

// ── page export ───────────────────────────────────────────────────────────────

export default {
  render(container) {
    container.innerHTML = ''

    // Page title
    const title = el('div', { class: 'page-title' }, 'Data Privacy / خصوصية البيانات')
    container.appendChild(title)

    const subtitle = el('div', { style: { fontSize: '12px', color: '#64748b', marginBottom: '20px' } },
      'KSA PDPL + UAE Federal PDPL (Law 45/2021) — DSR Portal / بوابة طلبات حقوق البيانات')
    container.appendChild(subtitle)

    // ── Section A: DSR Submit Form ─────────────────────────────────────────────
    const { body: submitCard } = sectionCard('Submit Data Subject Request', 'تقديم طلب صاحب البيانات')
    container.appendChild(submitCard)

    const formRow = el('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '10px' } })

    const subjectInp = el('input', {
      placeholder: 'Data Subject ID / معرف صاحب البيانات *',
      style: { padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', width: '200px' }
    })
    const typeSelect = el('select', {
      style: { padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', width: '250px' }
    })
    DSR_TYPE_OPTIONS.forEach(opt => {
      const o = el('option', { value: opt.value }, opt.label)
      typeSelect.appendChild(o)
    })
    const descInp = el('input', {
      placeholder: 'Description / الوصف (optional)',
      style: { padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', width: '260px' }
    })
    const submitBtn = el('button', { class: 'btn', style: { fontSize: '13px', padding: '6px 16px' } }, 'Submit DSR / تقديم الطلب')
    const submitMsg = el('div', { style: { fontSize: '12px', marginTop: '6px' } })

    formRow.appendChild(subjectInp)
    formRow.appendChild(typeSelect)
    formRow.appendChild(descInp)
    formRow.appendChild(submitBtn)
    submitCard.appendChild(formRow)
    submitCard.appendChild(submitMsg)

    submitBtn.addEventListener('click', () => {
      const subjectId = subjectInp.value.trim()
      if (!subjectId) { submitMsg.style.color = '#dc2626'; submitMsg.textContent = 'Data Subject ID is required / معرف صاحب البيانات مطلوب'; return }
      submitMsg.textContent = 'Submitting…'
      submitMsg.style.color = '#64748b'
      const dsrId = 'dsr-' + Date.now()
      apiPdplPost('/api/compliance/pdpl/dsr', {
        dsr_id:          dsrId,
        tenant_id:       getTenant(),
        data_subject_id: subjectId,
        dsr_type:        typeSelect.value,
        description:     descInp.value.trim() || null,
      }).then(() => {
        submitMsg.style.color = '#16a34a'
        submitMsg.textContent = `DSR submitted: ${dsrId} — SLA: 30 days`
        subjectInp.value = ''
        descInp.value    = ''
        loadDsrList()
        loadSlaAlerts()
      }).catch(e => {
        submitMsg.style.color = '#dc2626'
        submitMsg.textContent = 'Error: ' + e.message
      })
    })

    // ── Section B: SLA Alerts ─────────────────────────────────────────────────
    const { body: alertCard } = sectionCard('SLA Alerts (Day 25+)', 'تنبيهات SLA (اليوم 25+)')
    container.appendChild(alertCard)
    const alertSlot = el('div')
    alertCard.appendChild(alertSlot)

    function loadSlaAlerts() {
      alertSlot.innerHTML = '<div style="color:#94a3b8;font-size:13px">Checking…</div>'
      apiPdplGet('/api/compliance/pdpl/dsr/sla-alerts')
        .then(data => {
          const alerts = data.data || data
          alertSlot.innerHTML = ''
          if (!Array.isArray(alerts) || alerts.length === 0) {
            alertSlot.appendChild(el('div', { style: { color: '#16a34a', fontSize: '13px' } },
              'No SLA alerts — all DSRs within threshold / لا تنبيهات — جميع الطلبات ضمن الحد المقبول'))
            return
          }
          alerts.forEach(dsr => {
            const row = el('div', { style: {
              display: 'flex', gap: '12px', alignItems: 'center',
              padding: '8px 12px', borderRadius: '6px', marginBottom: '6px',
              background: dsr.sla && dsr.sla.sla_breached ? '#fef2f2' : '#fffbeb',
              border: `1px solid ${dsr.sla && dsr.sla.sla_breached ? '#fca5a5' : '#fde68a'}`,
            }})
            row.appendChild(badge(dsr.sla && dsr.sla.sla_breached ? '⚠ BREACHED' : '⚠ ALERT', dsr.sla && dsr.sla.sla_breached ? '#dc2626' : '#d97706'))
            const info = el('span', { style: { fontSize: '13px', color: '#1e293b' } })
            info.textContent = `${dsr.dsr_id} | ${dsr.dsr_type} | Day ${dsr.sla ? dsr.sla.days_since_submission : '?'}`
            row.appendChild(info)
            const remaining = el('span', { style: { fontSize: '12px', color: '#64748b', marginLeft: 'auto' } })
            remaining.textContent = dsr.sla && dsr.sla.days_remaining != null
              ? `${dsr.sla.days_remaining} days remaining / يوم متبقٍ`
              : 'SLA breached'
            row.appendChild(remaining)
            alertSlot.appendChild(row)
          })
        })
        .catch(e => { alertSlot.innerHTML = `<div style="color:#dc2626;font-size:13px">Error: ${e.message}</div>` })
    }

    // ── Section C: DSR List ───────────────────────────────────────────────────
    const { body: listCard } = sectionCard('All DSR Requests', 'جميع طلبات حقوق البيانات')
    container.appendChild(listCard)
    const listSlot = el('div')
    listCard.appendChild(listSlot)

    function loadDsrList() {
      listSlot.innerHTML = '<div style="color:#94a3b8;font-size:13px">Loading…</div>'
      apiPdplGet('/api/compliance/pdpl/dsr')
        .then(data => {
          const dsrs = data.data || data
          listSlot.innerHTML = ''
          if (!Array.isArray(dsrs) || dsrs.length === 0) {
            listSlot.appendChild(el('div', { style: { color: '#94a3b8', fontSize: '13px' } }, 'No DSR requests yet / لا توجد طلبات بعد'))
            return
          }

          const tbl   = el('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' } })
          const thead = el('thead')
          const hrow  = el('tr')
          ;['DSR ID', 'Type / النوع', 'Subject', 'Status / الحالة', 'SLA Days Left', 'Actions / إجراءات'].forEach(h => {
            const th = el('th', { style: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: '600' } }, h)
            hrow.appendChild(th)
          })
          thead.appendChild(hrow)
          tbl.appendChild(thead)

          const tbody = el('tbody')
          dsrs.forEach(dsr => {
            const tr = el('tr', { style: { borderBottom: '1px solid #f1f5f9' } })

            // DSR ID
            const tdId = el('td', { style: { padding: '6px 8px', fontFamily: 'monospace', fontSize: '11px' } }, dsr.dsr_id)
            // Type
            const tdType = el('td', { style: { padding: '6px 8px' } }, dsr.dsr_type)
            // Subject
            const tdSubj = el('td', { style: { padding: '6px 8px' } }, dsr.data_subject_id)
            // Status badge
            const tdStatus = el('td', { style: { padding: '6px 8px' } })
            tdStatus.appendChild(badge(dsr.status, statusColor(dsr.status)))
            // SLA
            const tdSla = el('td', { style: { padding: '6px 8px' } })
            if (dsr.sla) {
              const color = slaColor(dsr.sla)
              const text  = dsr.sla.days_remaining != null ? `${dsr.sla.days_remaining}d` : (dsr.status === 'COMPLETED' ? '✓' : 'breached')
              tdSla.appendChild(badge(text, color))
            } else {
              tdSla.textContent = '—'
            }
            // Actions
            const tdAct = el('td', { style: { padding: '6px 8px' } })
            const isTerminal = dsr.status === 'COMPLETED' || dsr.status === 'REJECTED'
            if (!isTerminal) {
              const actionSel = el('select', { style: { fontSize: '11px', padding: '2px 4px', marginRight: '4px' } })
              PROCESS_ACTIONS.forEach(a => {
                actionSel.appendChild(el('option', { value: a.value }, a.label))
              })
              const actorInp = el('input', {
                placeholder: 'Actor ID',
                style: { fontSize: '11px', padding: '2px 6px', width: '90px', borderRadius: '3px', border: '1px solid #cbd5e1' }
              })
              const applyBtn = el('button', { class: 'btn', style: { fontSize: '11px', padding: '2px 8px' } }, 'Apply')
              applyBtn.addEventListener('click', () => {
                const actor = actorInp.value.trim()
                if (!actor) { alert('Actor ID required'); return }
                apiPdplPost(`/api/compliance/pdpl/dsr/${dsr.dsr_id}/process`, {
                  action_type: actionSel.value,
                  actor_id:    actor,
                }).then(() => { loadDsrList(); loadSlaAlerts() })
                  .catch(e => alert('Error: ' + e.message))
              })
              tdAct.appendChild(actionSel)
              tdAct.appendChild(actorInp)
              tdAct.appendChild(applyBtn)
            } else {
              tdAct.textContent = '—'
            }

            tr.appendChild(tdId)
            tr.appendChild(tdType)
            tr.appendChild(tdSubj)
            tr.appendChild(tdStatus)
            tr.appendChild(tdSla)
            tr.appendChild(tdAct)
            tbody.appendChild(tr)
          })
          tbl.appendChild(tbody)
          listSlot.appendChild(tbl)
        })
        .catch(e => { listSlot.innerHTML = `<div style="color:#dc2626;font-size:13px">Error: ${e.message}</div>` })
    }

    // ── Section D: Compliance Documents ──────────────────────────────────────
    const { body: docsCard } = sectionCard('Compliance Documents', 'وثائق الامتثال')
    container.appendChild(docsCard)

    const DOCS = [
      { type: 'DPIA',            label: 'Data Protection Impact Assessment / تقييم أثر حماية البيانات' },
      { type: 'SCC',             label: 'Standard Contractual Clauses / الشروط التعاقدية القياسية' },
      { type: 'DPO_APPOINTMENT', label: 'DPO Appointment / تعيين مسؤول حماية البيانات' },
      { type: 'DATA_RESIDENCY',  label: 'Data Residency Statement / بيان إقامة البيانات' },
    ]

    const docGrid = el('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } })
    DOCS.forEach(doc => {
      const btn = el('button', {
        class: 'btn',
        style: { fontSize: '12px', padding: '8px 14px', background: '#f8fafc', color: '#1e293b', border: '1px solid #e2e8f0', cursor: 'pointer', borderRadius: '6px' }
      }, `⬇ ${doc.label}`)
      btn.addEventListener('click', () => {
        // Download as text file via API
        fetch(`/api/compliance/pdpl/documents/${doc.type}`)
          .then(r => {
            if (!r.ok) throw new Error(`Failed to download ${doc.type}`)
            return r.blob()
          })
          .then(blob => {
            const url = URL.createObjectURL(blob)
            const a   = document.createElement('a')
            a.href  = url
            a.download = `${doc.type}_WorkCaptain_v1.txt`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
          })
          .catch(e => alert('Download failed: ' + e.message))
      })
      docGrid.appendChild(btn)
    })
    docsCard.appendChild(docGrid)

    // ── Section E: Lawful Basis Registry ─────────────────────────────────────
    const { body: lbrCard } = sectionCard('Lawful Basis Registry', 'سجل الأساس القانوني')
    container.appendChild(lbrCard)

    const lbrSlot = el('div')
    lbrCard.appendChild(lbrSlot)

    function loadLawfulBasis() {
      apiPdplGet('/api/compliance/pdpl/lawful-basis')
        .then(data => {
          const entries = data.data || data
          lbrSlot.innerHTML = ''
          if (!Array.isArray(entries) || entries.length === 0) {
            lbrSlot.appendChild(el('div', { style: { color: '#94a3b8', fontSize: '13px' } }, 'No entries found'))
            return
          }
          const tbl   = el('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' } })
          const thead = el('thead')
          const hrow  = el('tr')
          ;['ID', 'Category / الفئة', 'Lawful Basis / الأساس القانوني', 'Purpose / الغرض', 'Retention', 'Jurisdiction'].forEach(h => {
            const th = el('th', {
              style: { textAlign: 'left', padding: '6px 8px', borderBottom: '2px solid #e2e8f0', color: '#64748b', fontWeight: '600', fontSize: '11px' }
            }, h)
            hrow.appendChild(th)
          })
          thead.appendChild(hrow)
          tbl.appendChild(thead)

          const tbody = el('tbody')
          entries.forEach(entry => {
            const tr = el('tr', { style: { borderBottom: '1px solid #f1f5f9' } })
            const lbColor = LAWFUL_BASIS_COLORS[entry.lawful_basis] || '#6b7280'
            ;[
              el('td', { style: { padding: '6px 8px', fontFamily: 'monospace', fontSize: '11px', color: '#64748b' } }, entry.registry_id),
              (() => { const td = el('td', { style: { padding: '6px 8px', fontWeight: '500' } }); td.textContent = entry.data_category; return td })(),
              (() => { const td = el('td', { style: { padding: '6px 8px' } }); td.appendChild(badge(entry.lawful_basis, lbColor)); return td })(),
              el('td', { style: { padding: '6px 8px', color: '#475569', fontSize: '11px' } }, entry.processing_purpose),
              el('td', { style: { padding: '6px 8px', color: '#64748b' } }, entry.retention_period_days ? `${entry.retention_period_days}d` : '—'),
              el('td', { style: { padding: '6px 8px', color: '#64748b' } }, (entry.jurisdiction || []).join(', ')),
            ].forEach(td => tr.appendChild(td))
            tbody.appendChild(tr)
          })
          tbl.appendChild(tbody)
          lbrSlot.appendChild(tbl)

          // Legend
          const legend = el('div', { style: { marginTop: '10px', display: 'flex', gap: '10px', fontSize: '11px' } })
          Object.entries(LAWFUL_BASIS_COLORS).forEach(([basis, color]) => {
            const item = el('div', { style: { display: 'flex', alignItems: 'center', gap: '4px' } })
            item.appendChild(badge(basis, color))
            legend.appendChild(item)
          })
          lbrSlot.appendChild(legend)
        })
        .catch(e => { lbrSlot.innerHTML = `<div style="color:#dc2626;font-size:13px">Error: ${e.message}</div>` })
    }

    // ── Initial load ──────────────────────────────────────────────────────────
    loadDsrList()
    loadSlaAlerts()
    loadLawfulBasis()
  }
}
