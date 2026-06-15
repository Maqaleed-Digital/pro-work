/**
 * S38-G5 — Offboarding Checklist Component
 *
 * Vanilla JS component. Renders the full offboarding workflow UI:
 *   - Checklist timeline: each item with status, assignee, category
 *   - Overdue items highlighted in red
 *   - Complete item button with evidence note input
 *   - Finalize button: ONLY enabled when all mandatory items COMPLETED + HR approver entered
 *   - EP-WOS-OFFBOARD-01 auto-generated on finalization
 *   - ESB section: shows ESB result if provided
 *
 * Arabic RTL layout — all labels bilingual EN / AR.
 *
 * Usage:
 *   import { createOffboardingChecklist } from "./components/offboarding_checklist.js"
 *   createOffboardingChecklist({ container, caseId, apiGet, apiPost, onFinalized })
 */

export function createOffboardingChecklist({ container, caseId, apiGet, apiPost, onFinalized } = {}) {
  if (!container) throw new Error('container is required');
  if (!caseId)    throw new Error('caseId is required');

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

  function badge(text, color) {
    const b = el('span', { class: 'mono' })
    b.textContent = text
    b.style.cssText = `display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;background:${color};color:#fff;font-weight:600`
    return b
  }

  function statusColor(status) {
    return status === 'COMPLETED' ? '#16a34a' : status === 'SKIPPED' ? '#6b7280' : '#d97706'
  }

  // ── state ───────────────────────────────────────────────────────────────────

  let _checklist = []
  let _caseData  = null
  let loading    = false

  // ── layout ──────────────────────────────────────────────────────────────────

  container.innerHTML = ''

  const header = el('div', { style: { marginBottom: '20px' } })
  const titleEl = el('h3', { style: { margin: '0 0 4px', fontSize: '15px', color: '#1e293b' } })
  titleEl.textContent = `Offboarding Checklist / قائمة مهام الإنهاء — ${caseId}`
  header.appendChild(titleEl)

  const caseStatusEl = el('div', { style: { fontSize: '12px', color: '#64748b' } })
  header.appendChild(caseStatusEl)
  container.appendChild(header)

  // Checklist timeline
  const timelineEl = el('div', { style: { marginBottom: '24px' } })
  container.appendChild(timelineEl)

  // ── HR Approver section (required for finalization) ──────────────────────
  const approverSection = el('div', {
    style: { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '16px', marginBottom: '16px' }
  })
  approverSection.appendChild(el('div', { style: { fontWeight: '600', fontSize: '13px', marginBottom: '10px' } },
    'HR Approval — موافقة الموارد البشرية (required for finalization / مطلوب للإنهاء)'))

  const approverIdInp = el('input', {
    placeholder: 'HR Approver ID / معرف المعتمد *',
    style: { padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', marginRight: '8px', width: '220px' }
  })
  const approverNameInp = el('input', {
    placeholder: 'HR Approver Name / اسم المعتمد',
    style: { padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', marginRight: '8px', width: '220px' }
  })
  const approverNotesInp = el('input', {
    placeholder: 'Notes / ملاحظات (optional)',
    style: { padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '13px', width: '220px' }
  })
  ;[approverIdInp, approverNameInp, approverNotesInp].forEach(i => {
    approverSection.appendChild(i)
    approverSection.appendChild(document.createTextNode(' '))
  })
  container.appendChild(approverSection)

  // ── Finalize button ──────────────────────────────────────────────────────
  const finalizeWrap = el('div', { style: { marginBottom: '12px' } })
  const finalizeBtn = el('button', {
    class: 'btn', disabled: true,
    style: { fontSize: '14px', fontWeight: '600', padding: '10px 20px', background: '#1e293b', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'not-allowed', opacity: '0.5' }
  }, 'Finalize Offboarding / إنهاء عملية المغادرة')
  const blockerNote = el('div', { style: { fontSize: '12px', color: '#dc2626', marginTop: '6px' } })
  finalizeWrap.appendChild(finalizeBtn)
  finalizeWrap.appendChild(blockerNote)
  container.appendChild(finalizeWrap)

  // ── EP result slot ────────────────────────────────────────────────────────
  const epSlot = el('div')
  container.appendChild(epSlot)

  // ── render logic ──────────────────────────────────────────────────────────

  function computeBlockers() {
    const blockers = []
    const incomplete = _checklist.filter(i => i.mandatory && i.status !== 'COMPLETED')
    incomplete.forEach(i => blockers.push(`${i.title} / ${i.title_ar}`))
    if (!approverIdInp.value.trim()) blockers.push('HR Approver ID is required / معرف المعتمد مطلوب')
    return blockers
  }

  function updateFinalizeBtn() {
    if (_caseData && _caseData.status === 'FINALIZED') {
      finalizeBtn.disabled = true
      finalizeBtn.style.opacity = '0.5'
      finalizeBtn.textContent = 'Already Finalized / تم الإنهاء'
      blockerNote.textContent = ''
      return
    }
    const blockers = computeBlockers()
    const canGo = blockers.length === 0
    finalizeBtn.disabled  = !canGo
    finalizeBtn.style.opacity = canGo ? '1' : '0.5'
    finalizeBtn.style.cursor  = canGo ? 'pointer' : 'not-allowed'
    blockerNote.textContent = canGo ? '' : `Blocked: ${blockers.join(' | ')}`
  }

  function renderTimeline() {
    timelineEl.innerHTML = ''

    if (_checklist.length === 0) {
      timelineEl.appendChild(el('div', { style: { color: '#94a3b8', fontSize: '13px' } }, 'No checklist items / لا توجد مهام'))
      return
    }

    _checklist.forEach(item => {
      const isOverdue = item.due_date && item.status !== 'COMPLETED' && new Date(item.due_date) < new Date()
      const row = el('div', {
        style: {
          display: 'flex', gap: '12px', alignItems: 'flex-start',
          padding: '10px 12px', borderRadius: '6px', marginBottom: '6px',
          background: isOverdue ? '#fef2f2' : '#f8fafc',
          border: `1px solid ${isOverdue ? '#fca5a5' : '#e2e8f0'}`,
        }
      })

      // Status indicator dot
      const dot = el('div', { style: {
        width: '10px', height: '10px', borderRadius: '50%', marginTop: '4px', flexShrink: '0',
        background: statusColor(item.status),
      }})
      row.appendChild(dot)

      // Content
      const content = el('div', { style: { flex: '1' } })

      const topRow = el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' } })
      const titleSpan = el('span', { style: { fontSize: '13px', fontWeight: item.mandatory ? '600' : '400', color: isOverdue ? '#dc2626' : '#1e293b' } })
      titleSpan.textContent = `${item.title} / ${item.title_ar}${item.mandatory ? ' *' : ' (optional)'}`
      topRow.appendChild(titleSpan)

      const statusBdg = badge(item.status, statusColor(item.status))
      topRow.appendChild(statusBdg)
      content.appendChild(topRow)

      // Category + completed info
      const meta = el('div', { style: { fontSize: '11px', color: '#64748b', marginBottom: '6px' } })
      meta.textContent = `Category: ${item.category}` +
        (item.completed_by ? ` | Completed by: ${item.completed_by}` : '') +
        (isOverdue ? ' | ⚠ OVERDUE' : '')
      content.appendChild(meta)

      // Completion controls (only for PENDING items)
      if (item.status === 'PENDING' && (_caseData && _caseData.status !== 'FINALIZED')) {
        const ctrlRow = el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } })

        const noteInp = el('input', {
          placeholder: item.requires_evidence ? 'Evidence note (required) / ملاحظة الدليل' : 'Evidence note (optional) / ملاحظة',
          style: { padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', flex: '1' }
        })
        const completedByInp = el('input', {
          placeholder: 'Completed by / أُنجز بواسطة',
          style: { padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', width: '140px' }
        })
        const completeBtn = el('button', { class: 'btn', style: { fontSize: '12px', padding: '3px 10px' } }, '✓ Complete')
        completeBtn.addEventListener('click', () => {
          const completedBy  = completedByInp.value.trim()
          const evidenceNote = noteInp.value.trim()
          if (!completedBy) { alert('Completed by is required / أُنجز بواسطة مطلوب'); return }
          if (item.requires_evidence && !evidenceNote) { alert('Evidence note is required for this item / ملاحظة الدليل مطلوبة'); return }
          completeItem(item.item_id, completedBy, evidenceNote)
        })
        ctrlRow.appendChild(completedByInp)
        ctrlRow.appendChild(noteInp)
        ctrlRow.appendChild(completeBtn)
        content.appendChild(ctrlRow)
      }

      if (item.status === 'COMPLETED' && item.evidence_note) {
        const evNote = el('div', { style: { fontSize: '11px', color: '#059669', marginTop: '2px' } })
        evNote.textContent = `Evidence: ${item.evidence_note}`
        content.appendChild(evNote)
      }

      row.appendChild(content)
      timelineEl.appendChild(row)
    })
  }

  function renderCaseStatus() {
    if (!_caseData) return
    caseStatusEl.textContent =
      `Status: ${_caseData.status} | Worker: ${_caseData.worker_id} | Reason: ${_caseData.termination_reason}` +
      (_caseData.finalized_at ? ` | Finalized: ${new Date(_caseData.finalized_at).toLocaleString()}` : '')
  }

  // ── API calls ─────────────────────────────────────────────────────────────

  function reload() {
    if (loading) return
    loading = true

    Promise.all([
      apiGet(`/api/offboarding/workflow/${caseId}`),
      apiGet(`/api/offboarding/workflow/${caseId}/checklist`),
    ]).then(([caseResp, clResp]) => {
      _caseData  = caseResp.data || caseResp
      _checklist = clResp.data  || clResp
      renderCaseStatus()
      renderTimeline()
      updateFinalizeBtn()
    }).catch(e => {
      timelineEl.innerHTML = `<div class="page-err">${e.message}</div>`
    }).finally(() => { loading = false })
  }

  function completeItem(itemId, completedBy, evidenceNote) {
    apiPost(`/api/offboarding/workflow/${caseId}/checklist/${itemId}/complete`, {
      completed_by:  completedBy,
      evidence_note: evidenceNote || null,
    }).then(() => reload())
      .catch(e => alert('Failed to complete item: ' + e.message))
  }

  finalizeBtn.addEventListener('click', () => {
    const approverId   = approverIdInp.value.trim()
    const approverName = approverNameInp.value.trim()
    const notes        = approverNotesInp.value.trim()

    if (!approverId) { blockerNote.textContent = 'HR Approver ID is required / معرف المعتمد مطلوب'; return }
    const blockers = computeBlockers()
    if (blockers.length > 0) { blockerNote.textContent = 'Blocked: ' + blockers.join(' | '); return }

    finalizeBtn.disabled    = true
    finalizeBtn.textContent = 'Finalizing… / جاري الإنهاء'

    apiPost(`/api/offboarding/workflow/${caseId}/finalize`, {
      hr_approver: { approver_id: approverId, approver_name: approverName || approverId, approver_role: 'HR', notes: notes || null },
    }).then(data => {
      const result = data.data || data
      epSlot.innerHTML = ''
      const banner = el('div', { style: { background: '#f0fdf4', border: '1px solid #86efac', padding: '14px 16px', borderRadius: '6px', marginTop: '12px' } })
      banner.innerHTML =
        `<strong style="color:#15803d">✓ Offboarding Finalized / تم إنهاء المغادرة</strong><br>` +
        `<span style="font-size:12px;color:#166534">Evidence Pack: ${result.evidence_pack_id || '—'}<br>` +
        `Finalized at: ${result.finalized_at ? new Date(result.finalized_at).toLocaleString() : '—'}</span>`
      epSlot.appendChild(banner)
      if (onFinalized) onFinalized(result)
      reload()
    }).catch(e => {
      finalizeBtn.disabled    = false
      finalizeBtn.textContent = 'Finalize Offboarding / إنهاء عملية المغادرة'
      blockerNote.textContent = 'Error: ' + e.message
    })
  })

  ;[approverIdInp, approverNameInp].forEach(i => i.addEventListener('input', () => updateFinalizeBtn()))

  // Initial load
  reload()

  return { reload, _checklist: () => _checklist }
}
